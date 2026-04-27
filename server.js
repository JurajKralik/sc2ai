const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const zlib = require("zlib");

const ROOT = __dirname;
const WEBAPP = path.join(ROOT, "webapp");
const ENV_PATH = path.join(ROOT, ".env");
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const CACHE_TTL_MS = 60 * 1000;

const cache = {
  header: null,
  races: new Map(),
  eloSinceUpdate: null
};

function readEnv() {
  const content = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function sendJson(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
}

function isFresh(entry) {
  return !!entry && (Date.now() - entry.ts) < CACHE_TTL_MS;
}

function fetchRaw(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Authorization: `Token ${token}`
      },
      rejectUnauthorized: false
    }, (resp) => {
      const chunks = [];
      resp.on("data", (chunk) => chunks.push(chunk));
      resp.on("end", () => {
        const body = Buffer.concat(chunks);
        if (resp.statusCode < 200 || resp.statusCode >= 300) {
          reject(new Error(`Remote API failed: ${resp.statusCode} ${body.toString("utf8")}`));
          return;
        }
        resolve({ body, headers: resp.headers });
      });
    });
    req.on("error", reject);
  });
}

async function fetchJson(url, token) {
  const { body } = await fetchRaw(url, token);
  return JSON.parse(body.toString("utf8"));
}

async function fetchRaceForName(token, name) {
  if (!name) return "R";
  const cached = cache.races.get(name);
  if (isFresh(cached)) {
    return cached.value;
  }
  try {
    const data = await fetchJson(`https://aiarena.net/api/bots/?name=${encodeURIComponent(name)}`, token);
    const bot = (data.results || []).find((item) => item.name === name) || (data.results || [])[0];
    const value = bot && bot.plays_race ? bot.plays_race.label : "R";
    cache.races.set(name, { ts: Date.now(), value });
    return value;
  } catch {
    cache.races.set(name, { ts: Date.now(), value: "R" });
    return "R";
  }
}

async function fetchBotRaceMap(token, names) {
  const unique = [...new Set(names.filter(Boolean))];
  const pairs = await Promise.all(unique.map(async (name) => [name, await fetchRaceForName(token, name)]));
  return Object.fromEntries(pairs);
}

function decodeZipEntries(buffer) {
  const entries = {};
  const signature = 0x04034b50;
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== signature) break;
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const fileName = buffer.slice(fileNameStart, fileNameEnd).toString("utf8");
    const dataStart = fileNameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    const fileData = buffer.slice(dataStart, dataEnd);
    if (!fileName.endsWith("/")) {
      let content = fileData;
      if (compression === 8) {
        content = zlib.inflateRawSync(fileData);
      }
      entries[fileName] = content.toString("utf8", 0, content.length);
    }
    offset = dataEnd;
  }
  return entries;
}

function serveFile(reqPath, res) {
  let filePath = path.join(WEBAPP, reqPath === "/" ? "index.html" : reqPath.replace(/^\//, ""));
  if (!filePath.startsWith(WEBAPP)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const ext = path.extname(filePath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".xml": "application/xml; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml"
    }[ext] || "text/plain; charset=utf-8";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

async function computeHeader(token, botId) {
  if (isFresh(cache.header)) {
    return cache.header.value;
  }
  const bot = await fetchJson(`https://aiarena.net/api/bots/${botId}/`, token);
  const participationList = await fetchJson(`https://aiarena.net/api/competition-participations/?bot=${botId}`, token);
  const activeParticipation = (participationList.results || []).find((item) => item.active) || null;
  let ranking = null;
  if (activeParticipation) {
    const allInCompetition = await fetchJson(`https://aiarena.net/api/competition-participations/?competition=${activeParticipation.competition}&limit=500&ordering=-elo`, token);
    const rankedResults = (allInCompetition.results || []).filter((item) => item.active && !item.in_placements);
    const overallRank = rankedResults.findIndex((item) => item.bot === Number(botId)) + 1;
    const divisionResults = rankedResults.filter((item) => item.division_num === activeParticipation.division_num);
    const divisionRank = divisionResults.findIndex((item) => item.bot === Number(botId)) + 1;
    ranking = {
      competitionId: activeParticipation.competition,
      elo: activeParticipation.elo,
      division: activeParticipation.division_num,
      overallRank,
      overallTotal: rankedResults.length,
      divisionRank,
      divisionTotal: divisionResults.length
    };
  }
  const value = {
    bot,
    botUpdated: bot.bot_zip_updated || null,
    ranking
  };
  cache.header = { ts: Date.now(), value };
  return value;
}

async function computeEloSinceUpdate(token, botId, botUpdated, currentElo) {
  const cacheKey = `${botId}:${botUpdated}:${currentElo}`;
  if (isFresh(cache.eloSinceUpdate) && cache.eloSinceUpdate.key === cacheKey) {
    return cache.eloSinceUpdate.value;
  }
  if (!botUpdated || currentElo == null) {
    return null;
  }
  const cutoff = new Date(botUpdated).getTime();
  const participations = await fetchJson(`https://aiarena.net/api/match-participations/?bot=${botId}&limit=500&ordering=-id`, token);
  const participationRows = participations.results || [];
  const relatedMatchRows = await Promise.all(
    participationRows.map(async (participation) => {
      try {
        const match = await fetchJson(`https://aiarena.net/api/matches/${participation.match}/`, token);
        return {
          participation,
          when: match.started || match.created || null
        };
      } catch {
        return { participation, when: null };
      }
    })
  );
  const relevantParticipations = relatedMatchRows
    .filter((row) => row.when && !isNaN(new Date(row.when).getTime()) && new Date(row.when).getTime() >= cutoff && row.participation.starting_elo !== null)
    .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
  let value = null;
  if (relevantParticipations.length > 0) {
    const baseline = relevantParticipations[0].participation.starting_elo;
    value = {
      baseline,
      current: currentElo,
      delta: currentElo - baseline
    };
  }
  cache.eloSinceUpdate = { ts: Date.now(), key: cacheKey, value };
  return value;
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);

  if (parsed.pathname === "/api/header") {
    try {
      const env = readEnv();
      const token = env.AIARENA_API_KEY;
      const botId = env.BOT_ID;
      const header = await computeHeader(token, botId);
      sendJson(res, 200, header);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (parsed.pathname === "/api/elo-since-update") {
    try {
      const env = readEnv();
      const token = env.AIARENA_API_KEY;
      const botId = env.BOT_ID;
      const header = await computeHeader(token, botId);
      const eloSinceUpdate = await computeEloSinceUpdate(token, botId, header.botUpdated, header.ranking ? header.ranking.elo : null);
      sendJson(res, 200, { eloSinceUpdate });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (parsed.pathname === "/api/recent-matches") {
    try {
      const env = readEnv();
      const token = env.AIARENA_API_KEY;
      const botId = env.BOT_ID;
      const limit = Number(parsed.searchParams.get("limit") || 100);
      const offset = Number(parsed.searchParams.get("offset") || 0);
      const matches = await fetchJson(`https://aiarena.net/api/matches/?bot=${botId}&limit=${limit}&offset=${offset}&ordering=-created`, token);
      const names = [];
      for (const match of matches.results || []) {
        const result = match.result || {};
        if (result.bot1_name) names.push(result.bot1_name);
        if (result.bot2_name) names.push(result.bot2_name);
      }
      const raceMap = await fetchBotRaceMap(token, names);
      const participationMap = {};
      const participations = await fetchJson(`https://aiarena.net/api/match-participations/?bot=${botId}&limit=${limit}&offset=${offset}&ordering=-id`, token);
      for (const participation of participations.results || []) {
        participationMap[participation.match] = {
          startingElo: participation.starting_elo,
          resultantElo: participation.resultant_elo,
          eloChange: participation.elo_change
        };
      }
      sendJson(res, 200, {
        matches,
        raceMap,
        participationMap,
        paging: {
          limit,
          offset,
          next: matches.next || null,
          previous: matches.previous || null,
          count: matches.count || 0
        }
      });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (parsed.pathname === "/api/match-log") {
    try {
      const matchId = parsed.searchParams.get("matchId");
      if (!matchId) {
        sendJson(res, 400, { error: "matchId is required" });
        return;
      }
      const env = readEnv();
      const token = env.AIARENA_API_KEY;
      const botId = String(env.BOT_ID);
      const participations = await fetchJson(`https://aiarena.net/api/match-participations/?match=${encodeURIComponent(matchId)}`, token);
      const ownParticipation = (participations.results || []).find((item) => String(item.bot) === botId);
      if (!ownParticipation || !ownParticipation.match_log) {
        sendJson(res, 404, { error: "Bot match log not available for this match" });
        return;
      }
      const zipResponse = await fetchRaw(ownParticipation.match_log, token);
      const entries = decodeZipEntries(zipResponse.body);
      sendJson(res, 200, {
        participationId: ownParticipation.id,
        stdout: entries["stdout.log"] || "",
        stderr: entries["stderr.log"] || ""
      });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  serveFile(parsed.pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log(`SC2AI local server running at http://${HOST}:${PORT}`);
});