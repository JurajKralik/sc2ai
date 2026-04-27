import http from "http";
import { URL } from "url";
import { PORT, HOST } from "./config";
import { sendJson } from "./utils/http";
import { serveStaticFile } from "./static";
import { headerRoute } from "./routes/header";
import { eloSinceUpdateRoute } from "./routes/eloSinceUpdate";
import { recentMatchesRoute } from "./routes/recentMatches";
import { matchLogRoute } from "./routes/matchLog";

type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => Promise<void>;

const API_ROUTES: Record<string, RouteHandler> = {
  "/api/header": headerRoute,
  "/api/elo-since-update": eloSinceUpdateRoute,
  "/api/recent-matches": recentMatchesRoute,
  "/api/match-log": matchLogRoute,
};

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const handler = API_ROUTES[parsed.pathname];

  if (handler) {
    try {
      await handler(req, res);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  serveStaticFile(parsed.pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log(`SC2AI server running at http://${HOST}:${PORT}`);
});
