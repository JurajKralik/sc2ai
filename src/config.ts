import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");

export interface AppConfig {
  aiarenaApiKey: string;
  botId: string;
}

export function readConfig(): AppConfig {
  const content = fs.readFileSync(ENV_PATH, "utf8");
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return {
    aiarenaApiKey: env.AIARENA_API_KEY ?? "",
    botId: env.BOT_ID ?? "",
  };
}

export const PORT: number = Number(process.env.PORT) || 8080;
export const HOST: string = process.env.HOST ?? "0.0.0.0";
export const SERVE_DIR: string = process.env.SERVE_DIR ?? "webapp";
export const ROOT_DIR: string = ROOT;
