import type { IncomingMessage, ServerResponse } from "http";
import { readConfig } from "../config";
import { computeDivision } from "../services/aiarena";
import { sendJson } from "../utils/http";

export async function divisionRoute(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const { aiarenaApiKey, botId } = readConfig();
  const division = await computeDivision(aiarenaApiKey, botId);
  sendJson(res, 200, { division });
}
