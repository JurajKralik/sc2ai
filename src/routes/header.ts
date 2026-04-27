import type { IncomingMessage, ServerResponse } from "http";
import { readConfig } from "../config";
import { computeHeader } from "../services/aiarena";
import { sendJson } from "../utils/http";

export async function headerRoute(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const { aiarenaApiKey, botId } = readConfig();
  const header = await computeHeader(aiarenaApiKey, botId);
  sendJson(res, 200, header);
}
