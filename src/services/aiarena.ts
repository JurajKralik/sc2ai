import https from "https";
import {
  getCachedHeader,
  setCachedHeader,
  getCachedRace,
  setCachedRace,
  getCachedEloSinceUpdate,
  setCachedEloSinceUpdate,
} from "../cache";

// ---- Types ----------------------------------------------------------------

export interface BotRanking {
  competitionId: number;
  elo: number;
  division: number;
  overallRank: number;
  overallTotal: number;
  divisionRank: number;
  divisionTotal: number;
}

export interface HeaderData {
  bot: unknown;
  botUpdated: string | null;
  ranking: BotRanking | null;
}

export interface EloSinceUpdate {
  baseline: number;
  current: number;
  delta: number;
}

interface FetchResult {
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

// ---- Low-level fetch ------------------------------------------------------

export function fetchRaw(url: string, token: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { Authorization: `Token ${token}` }, rejectUnauthorized: false },
      (resp) => {
        const chunks: Buffer[] = [];
        resp.on("data", (chunk: Buffer) => chunks.push(chunk));
        resp.on("end", () => {
          const body = Buffer.concat(chunks);
          if (resp.statusCode == null || resp.statusCode < 200 || resp.statusCode >= 300) {
            reject(
              new Error(
                `Remote API failed: ${resp.statusCode} ${body.toString("utf8")}`
              )
            );
            return;
          }
          resolve({ body, headers: resp.headers as Record<string, string | string[] | undefined> });
        });
      }
    );
    req.on("error", reject);
  });
}

export async function fetchJson<T = unknown>(url: string, token: string): Promise<T> {
  const { body } = await fetchRaw(url, token);
  return JSON.parse(body.toString("utf8")) as T;
}

// ---- Bot race lookup -------------------------------------------------------

async function fetchRaceForName(token: string, name: string): Promise<string> {
  const cached = getCachedRace(name);
  if (cached !== null) return cached;

  try {
    const data = await fetchJson<{ results?: Array<{ name: string; plays_race?: { label: string } }> }>(
      `https://aiarena.net/api/bots/?name=${encodeURIComponent(name)}`,
      token
    );
    const bot =
      (data.results ?? []).find((item) => item.name === name) ??
      (data.results ?? [])[0];
    const value = bot?.plays_race?.label ?? "R";
    setCachedRace(name, value);
    return value;
  } catch {
    setCachedRace(name, "R");
    return "R";
  }
}

export async function fetchBotRaceMap(
  token: string,
  names: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(names.filter(Boolean))];
  const pairs = await Promise.all(
    unique.map(async (name) => [name, await fetchRaceForName(token, name)] as const)
  );
  return Object.fromEntries(pairs);
}

// ---- Header / ranking data -------------------------------------------------

export async function computeHeader(token: string, botId: string): Promise<HeaderData> {
  const cached = getCachedHeader<HeaderData>();
  if (cached !== null) return cached;

  const bot = await fetchJson<Record<string, unknown>>(
    `https://aiarena.net/api/bots/${botId}/`,
    token
  );

  const participationList = await fetchJson<{ results?: Array<{ active: boolean; competition: number; division_num: number; bot: number; elo: number }> }>(
    `https://aiarena.net/api/competition-participations/?bot=${botId}`,
    token
  );

  const activeParticipation =
    (participationList.results ?? []).find((item) => item.active) ?? null;

  let ranking: BotRanking | null = null;

  if (activeParticipation) {
    const allInCompetition = await fetchJson<{ results?: Array<{ active: boolean; in_placements: boolean; division_num: number; bot: number; elo: number }> }>(
      `https://aiarena.net/api/competition-participations/?competition=${activeParticipation.competition}&limit=500&ordering=-elo`,
      token
    );

    const rankedResults = (allInCompetition.results ?? []).filter(
      (item) => item.active && !item.in_placements
    );
    const overallRank =
      rankedResults.findIndex((item) => item.bot === Number(botId)) + 1;

    const divisionResults = rankedResults.filter(
      (item) => item.division_num === activeParticipation.division_num
    );
    const divisionRank =
      divisionResults.findIndex((item) => item.bot === Number(botId)) + 1;

    ranking = {
      competitionId: activeParticipation.competition,
      elo: activeParticipation.elo,
      division: activeParticipation.division_num,
      overallRank,
      overallTotal: rankedResults.length,
      divisionRank,
      divisionTotal: divisionResults.length,
    };
  }

  const value: HeaderData = {
    bot,
    botUpdated: (bot.bot_zip_updated as string) ?? null,
    ranking,
  };

  setCachedHeader(value);
  return value;
}

// ---- Elo since last bot update ---------------------------------------------

export async function computeEloSinceUpdate(
  token: string,
  botId: string,
  botUpdated: string | null,
  currentElo: number | null
): Promise<EloSinceUpdate | null> {
  const cacheKey = `${botId}:${botUpdated}:${currentElo}`;
  const cached = getCachedEloSinceUpdate<EloSinceUpdate | null>(cacheKey);
  if (cached !== undefined) return cached;

  if (!botUpdated || currentElo == null) return null;

  const cutoff = new Date(botUpdated).getTime();

  const participations = await fetchJson<{ results?: Array<{ match: number; starting_elo: number | null }> }>(
    `https://aiarena.net/api/match-participations/?bot=${botId}&limit=500&ordering=-id`,
    token
  );

  const relatedMatchRows = await Promise.all(
    (participations.results ?? []).map(async (participation) => {
      try {
        const match = await fetchJson<{ started?: string; created?: string }>(
          `https://aiarena.net/api/matches/${participation.match}/`,
          token
        );
        return { participation, when: match.started ?? match.created ?? null };
      } catch {
        return { participation, when: null };
      }
    })
  );

  const relevantParticipations = relatedMatchRows
    .filter(
      (row) =>
        row.when &&
        !isNaN(new Date(row.when).getTime()) &&
        new Date(row.when).getTime() >= cutoff &&
        row.participation.starting_elo !== null
    )
    .sort(
      (a, b) =>
        new Date(a.when!).getTime() - new Date(b.when!).getTime()
    );

  let value: EloSinceUpdate | null = null;

  if (relevantParticipations.length > 0) {
    const baseline = relevantParticipations[0].participation.starting_elo!;
    value = { baseline, current: currentElo, delta: currentElo - baseline };
  }

  setCachedEloSinceUpdate(cacheKey, value);
  return value;
}
