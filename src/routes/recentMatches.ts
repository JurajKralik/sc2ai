import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { PORT } from "../config";
import { readConfig } from "../config";
import { fetchJson, fetchBotRaceMap } from "../services/aiarena";
import { sendJson } from "../utils/http";

interface MatchResult {
  bot1_name?: string;
  bot2_name?: string;
}

interface Match {
  result?: MatchResult;
}

interface MatchesPage {
  results?: Match[];
  next?: string | null;
  previous?: string | null;
  count?: number;
}

interface Participation {
  match: number;
  starting_elo: number | null;
  resultant_elo: number | null;
  elo_change: number | null;
}

interface ParticipationsPage {
  results?: Participation[];
}

export async function recentMatchesRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const parsed = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const limit = Number(parsed.searchParams.get("limit") ?? 100);
  const offset = Number(parsed.searchParams.get("offset") ?? 0);

  const { aiarenaApiKey, botId } = readConfig();

  const matches = await fetchJson<MatchesPage>(
    `https://aiarena.net/api/matches/?bot=${botId}&limit=${limit}&offset=${offset}&ordering=-created`,
    aiarenaApiKey
  );

  const names: string[] = [];
  for (const match of matches.results ?? []) {
    if (match.result?.bot1_name) names.push(match.result.bot1_name);
    if (match.result?.bot2_name) names.push(match.result.bot2_name);
  }

  const raceMap = await fetchBotRaceMap(aiarenaApiKey, names);

  const participations = await fetchJson<ParticipationsPage>(
    `https://aiarena.net/api/match-participations/?bot=${botId}&limit=${limit}&offset=${offset}&ordering=-id`,
    aiarenaApiKey
  );

  const participationMap: Record<
    number,
    { startingElo: number | null; resultantElo: number | null; eloChange: number | null }
  > = {};
  for (const p of participations.results ?? []) {
    participationMap[p.match] = {
      startingElo: p.starting_elo,
      resultantElo: p.resultant_elo,
      eloChange: p.elo_change,
    };
  }

  sendJson(res, 200, {
    matches,
    raceMap,
    participationMap,
    paging: {
      limit,
      offset,
      next: matches.next ?? null,
      previous: matches.previous ?? null,
      count: matches.count ?? 0,
    },
  });
}
