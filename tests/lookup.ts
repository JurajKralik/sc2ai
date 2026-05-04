/**
 * tests/lookup.ts — Inspect live aiarena API responses in the console.
 *
 * Usage:
 *   tsx tests/lookup.ts                      list all endpoints
 *   tsx tests/lookup.ts <endpoint>           fetch and print response
 *   tsx tests/lookup.ts matches 25           pass an optional extra arg (e.g. limit)
 *
 * Requires a .env file with AIARENA_API_KEY and BOT_ID set.
 */

import { readConfig } from "../src/config";
import { fetchJson } from "../src/services/aiarena";

const BASE = "https://aiarena.net/api";

interface EndpointDef {
  description: string;
  /** Which part of the app reads this data */
  usedBy: string;
  /** Fields the app actually consumes */
  fieldsUsed: string;
  url: (botId: string, extra?: string) => string;
}

const ENDPOINTS: Record<string, EndpointDef> = {
  // ── used by computeHeader / headerRoute ───────────────────────────────────
  bot: {
    description: "Single bot details",
    usedBy: "computeHeader → /api/header",
    fieldsUsed: "id, bot_zip_updated, name, plays_race",
    url: (botId) => `${BASE}/bots/${botId}/`,
  },
  participations: {
    description: "Competition participations for the bot",
    usedBy: "computeHeader → /api/header",
    fieldsUsed: "active, competition, division_num, bot, elo",
    url: (botId) => `${BASE}/competition-participations/?bot=${botId}`,
  },
  "competition-leaderboard": {
    description: "All active bots in the bot's current competition (for ranking)",
    usedBy: "computeHeader → /api/header (ranking calculation)",
    fieldsUsed: "active, in_placements, division_num, bot, elo",
    url: (botId, competitionId = "") => {
      if (!competitionId) {
        return `${BASE}/competition-participations/?limit=1&bot=${botId}`;
      }
      return `${BASE}/competition-participations/?competition=${competitionId}&limit=500&ordering=-elo`;
    },
  },

  // ── used by computeEloSinceUpdate / eloSinceUpdateRoute ───────────────────
  "match-participations": {
    description: "Per-match ELO data for the bot",
    usedBy: "computeEloSinceUpdate → /api/elo-since-update, recentMatchesRoute → /api/recent-matches",
    fieldsUsed: "match, starting_elo, resultant_elo, elo_change",
    url: (botId, limit = "20") =>
      `${BASE}/match-participations/?bot=${botId}&limit=${limit}&ordering=-id`,
  },
  match: {
    description: "Single match details (start time needed for ELO baseline)",
    usedBy: "computeEloSinceUpdate → /api/elo-since-update",
    fieldsUsed: "started, created",
    url: (_botId, matchId = "") => `${BASE}/matches/${matchId}/`,
  },

  // ── used by recentMatchesRoute ─────────────────────────────────────────────
  matches: {
    description: "Recent matches the bot played",
    usedBy: "recentMatchesRoute → /api/recent-matches",
    fieldsUsed: "result.bot1_name, result.bot2_name, id, created",
    url: (botId, limit = "10") =>
      `${BASE}/matches/?bot=${botId}&limit=${limit}&ordering=-created`,
  },

  // ── used by matchLogRoute ──────────────────────────────────────────────────
  "match-participation-by-match": {
    description: "Participations for a specific match (to find bot's log URL)",
    usedBy: "matchLogRoute → /api/match-log",
    fieldsUsed: "bot, match_log, id",
    url: (_botId, matchId = "") =>
      `${BASE}/match-participations/?match=${encodeURIComponent(matchId)}`,
  },

  // ── used by fetchBotRaceMap ────────────────────────────────────────────────
  "bots-search": {
    description: "Search for bots by name (race lookup for opponent display)",
    usedBy: "fetchBotRaceMap (called from recentMatchesRoute)",
    fieldsUsed: "results[].name, results[].plays_race.label",
    url: (_botId, name = "") =>
      `${BASE}/bots/?name=${encodeURIComponent(name)}`,
  },

  // ── reference / exploratory endpoints ─────────────────────────────────────
  competitions: {
    description: "Active competitions list",
    usedBy: "Not directly used — useful for finding a competition ID",
    fieldsUsed: "id, name, status",
    url: () => `${BASE}/competitions/?status=open`,
  },
  maps: {
    description: "Available maps",
    usedBy: "Not currently used in routes",
    fieldsUsed: "id, name, file",
    url: () => `${BASE}/maps/?limit=30`,
  },
  "map-pools": {
    description: "Active map pools",
    usedBy: "Not currently used in routes",
    fieldsUsed: "id, maps",
    url: () => `${BASE}/map-pools/`,
  },
  results: {
    description: "Recent match results (win/loss/crash details)",
    usedBy: "Not currently used — matches endpoint is used instead",
    fieldsUsed: "bot1, bot2, winner, type, created",
    url: (botId, limit = "10") =>
      `${BASE}/results/?bot=${botId}&limit=${limit}`,
  },
};

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const [, , endpoint, extra] = process.argv;

  if (!endpoint) {
    printHelp();
    process.exit(0);
  }

  if (!ENDPOINTS[endpoint]) {
    console.error(`Unknown endpoint: "${endpoint}"\n`);
    printHelp();
    process.exit(1);
  }

  const { aiarenaApiKey, botId } = readConfig();

  if (!aiarenaApiKey) {
    console.error("Error: AIARENA_API_KEY is not set in .env");
    process.exit(1);
  }
  if (!botId) {
    console.error("Error: BOT_ID is not set in .env");
    process.exit(1);
  }

  const def = ENDPOINTS[endpoint];
  const url = def.url(botId, extra);

  console.log();
  console.log(`Endpoint  : ${endpoint}`);
  console.log(`URL       : ${url}`);
  console.log(`Used by   : ${def.usedBy}`);
  console.log(`Fields    : ${def.fieldsUsed}`);
  console.log("─".repeat(70));

  try {
    const data = await fetchJson(url, aiarenaApiKey);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("\nError:", (err as Error).message);
    process.exit(1);
  }
}

function printHelp() {
  console.log("\naiarena API Lookup Tool");
  console.log("═══════════════════════");
  console.log("Usage: tsx tests/lookup.ts <endpoint> [extra]\n");
  console.log("  The 'extra' argument sets limit for list endpoints, or an ID for single-item endpoints.\n");

  const maxLen = Math.max(...Object.keys(ENDPOINTS).map((k) => k.length));

  // Group by usedBy context
  const groups: Record<string, [string, EndpointDef][]> = {};
  for (const [name, def] of Object.entries(ENDPOINTS)) {
    const group = def.usedBy.split("→")[1]?.trim() ?? "Other";
    if (!groups[group]) groups[group] = [];
    groups[group].push([name, def]);
  }

  for (const [group, entries] of Object.entries(groups)) {
    console.log(`  ── ${group}`);
    for (const [name, def] of entries) {
      console.log(`    ${name.padEnd(maxLen + 2)} ${def.description}`);
    }
    console.log();
  }

  console.log("Examples:");
  console.log("  tsx tests/lookup.ts bot");
  console.log("  tsx tests/lookup.ts matches 25              # limit=25");
  console.log("  tsx tests/lookup.ts match 123456            # matchId=123456");
  console.log("  tsx tests/lookup.ts bots-search Eris        # search by name");
  console.log("  tsx tests/lookup.ts competition-leaderboard 99  # competitionId=99");
  console.log();
}

main();
