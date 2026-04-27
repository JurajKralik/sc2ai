import fs from "fs";
import path from "path";
import type { ServerResponse } from "http";
import { sendJson } from "./utils/http";
import { ROOT_DIR, SERVE_DIR } from "./config";

const STATIC_ROOT = path.join(ROOT_DIR, SERVE_DIR);

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function serveStaticFile(reqPath: string, res: ServerResponse): void {
  const relative = reqPath === "/" ? "index.html" : reqPath.replace(/^\//, "");
  const filePath = path.join(STATIC_ROOT, relative);

  // Path-traversal guard
  if (!filePath.startsWith(STATIC_ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const mimeType =
      MIME_TYPES[path.extname(filePath)] ?? "text/plain; charset=utf-8";
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(data);
  });
}
