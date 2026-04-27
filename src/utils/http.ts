import type { ServerResponse } from "http";

export function sendJson(res: ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}
