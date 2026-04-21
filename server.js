const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const WEBAPP = path.join(ROOT, "webapp");
const ENV_PATH = path.join(ROOT, ".env");
const PORT = process.env.PORT || 8080;

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

function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Authorization: `Token ${token}`
      }
    }, (resp) => {
      let body = "";
      resp.on("data", (chunk) => { body += chunk; });
      resp.on("end", () => {
        if (resp.statusCode < 200 || resp.statusCode >= 300) {
          reject(new Error(`Remote API failed: ${resp.statusCode} ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
  });
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
      ".css": "text/css; charset=utf-8"
    }[ext] || "text/plain; charset=utf-8";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);

  if (parsed.pathname === "/api/recent-matches") {
    try {
      const env = readEnv();
      const token = env.AIARENA_API_KEY;
      const botId = env.BOT_ID;
      const limit = Number(parsed.searchParams.get("limit") || 100);
      const offset = Number(parsed.searchParams.get("offset") || 0);
      const bot = await fetchJson(`https://aiarena.net/api/bots/${botId}/`, token);
      const matches = await fetchJson(`https://aiarena.net/api/matches/?bot=${botId}&limit=${limit}&offset=${offset}&ordering=-created`, token);
      sendJson(res, 200, {
        bot,
        matches,
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

  serveFile(parsed.pathname, res);
});

server.listen(PORT, () => {
  console.log(`SC2AI local server running at http://localhost:${PORT}`);
});
