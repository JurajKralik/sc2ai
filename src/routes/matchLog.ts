import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { PORT, readConfig } from "../config";
import { fetchJson, fetchRaw } from "../services/aiarena";
import { decodeZipEntries } from "../utils/zip";
import { sendJson } from "../utils/http";

interface Participation {
  id: number;
  bot: number;
  match: number;
  match_log?: string;
}

interface ParticipationsPage {
  results?: Participation[];
}

export async function matchLogRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const parsed = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const matchId = parsed.searchParams.get("matchId");

  if (!matchId) {
    sendJson(res, 400, { error: "matchId is required" });
    return;
  }

  const { aiarenaApiKey, botId } = readConfig();

  const participations = await fetchJson<ParticipationsPage>(
    `https://aiarena.net/api/match-participations/?match=${encodeURIComponent(matchId)}`,
    aiarenaApiKey
  );

  const ownParticipation = (participations.results ?? []).find(
    (item) => String(item.bot) === botId
  );

  if (!ownParticipation?.match_log) {
    sendJson(res, 404, { error: "Bot match log not available for this match" });
    return;
  }

  const zipResponse = await fetchRaw(ownParticipation.match_log, aiarenaApiKey);
  const entries = decodeZipEntries(zipResponse.body);

  sendJson(res, 200, {
    participationId: ownParticipation.id,
    stdout: entries["stdout.log"] ?? "",
    stderr: entries["stderr.log"] ?? "",
  });
}
