import type { IncomingMessage, ServerResponse } from "http";
import { readConfig } from "../config";
import { computeHeader, computeEloSinceUpdate } from "../services/aiarena";
import { sendJson } from "../utils/http";

export async function eloSinceUpdateRoute(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const { aiarenaApiKey, botId } = readConfig();
  const header = await computeHeader(aiarenaApiKey, botId);
  const eloSinceUpdate = await computeEloSinceUpdate(
    aiarenaApiKey,
    botId,
    header.botUpdated,
    header.ranking?.elo ?? null
  );
  sendJson(res, 200, { eloSinceUpdate });
}
