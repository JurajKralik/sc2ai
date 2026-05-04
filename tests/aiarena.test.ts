import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// Mock https before any imports that use it
vi.mock("https", () => ({
  default: { get: vi.fn() },
}));

// Mock cache to control hit/miss per test
vi.mock("../src/cache", () => ({
  getCachedHeader: vi.fn(),
  setCachedHeader: vi.fn(),
  getCachedRace: vi.fn(),
  setCachedRace: vi.fn(),
  getCachedEloSinceUpdate: vi.fn(),
  setCachedEloSinceUpdate: vi.fn(),
}));

import https from "https";
import * as cache from "../src/cache";
import {
  fetchRaw,
  fetchJson,
  fetchBotRaceMap,
  computeHeader,
  computeEloSinceUpdate,
} from "../src/services/aiarena";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FakeResp = EventEmitter & { statusCode: number; headers: Record<string, string> };

/** Queue one https.get call that responds with the given statusCode + body */
function queueResponse(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {}
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (https.get as any).mockImplementationOnce(
    (_url: string, _opts: object, callback: (resp: FakeResp) => void) => {
      const resp = Object.assign(new EventEmitter(), {
        statusCode,
        headers,
      }) as FakeResp;
      callback(resp);
      setImmediate(() => {
        resp.emit("data", Buffer.from(body));
        resp.emit("end");
      });
      return new EventEmitter(); // fake ClientRequest
    }
  );
}

/** Queue one https.get call that fires a transport-level error */
function queueNetworkError(err: Error): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (https.get as any).mockImplementationOnce(
    (_url: string, _opts: object, _callback: unknown) => {
      const req = new EventEmitter();
      setImmediate(() => req.emit("error", err));
      return req;
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: every cache lookup is a miss so computation always runs
  vi.mocked(cache.getCachedHeader).mockReturnValue(null);
  vi.mocked(cache.getCachedRace).mockReturnValue(null);
  // undefined ≠ null: makes the `!== undefined` guard in aiarena.ts pass through
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(cache.getCachedEloSinceUpdate).mockReturnValue(undefined as any);
});

// ---------------------------------------------------------------------------
// fetchRaw
// ---------------------------------------------------------------------------

describe("fetchRaw", () => {
  it("resolves with body buffer and response headers on 200", async () => {
    queueResponse(200, "hello world", { "content-type": "text/plain" });

    const result = await fetchRaw("https://aiarena.net/api/", "tok");

    expect(result.body.toString("utf8")).toBe("hello world");
    expect(result.headers["content-type"]).toBe("text/plain");
  });

  it("rejects with status code message on non-2xx response", async () => {
    queueResponse(404, "not found");

    await expect(fetchRaw("https://aiarena.net/api/missing", "tok")).rejects.toThrow(
      "404"
    );
  });

  it("rejects on network-level error", async () => {
    queueNetworkError(new Error("ECONNREFUSED"));

    await expect(fetchRaw("https://aiarena.net/api/", "tok")).rejects.toThrow(
      "ECONNREFUSED"
    );
  });
});

// ---------------------------------------------------------------------------
// fetchJson
// ---------------------------------------------------------------------------

describe("fetchJson", () => {
  it("parses response body as JSON", async () => {
    queueResponse(200, JSON.stringify({ result: 42 }));

    const data = await fetchJson<{ result: number }>("https://aiarena.net/api/", "tok");

    expect(data).toEqual({ result: 42 });
  });

  it("sends Authorization header with token", async () => {
    let capturedOpts: Record<string, unknown> | undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (https.get as any).mockImplementationOnce(
      (url: string, opts: Record<string, unknown>, callback: (r: FakeResp) => void) => {
        capturedOpts = opts;
        const resp = Object.assign(new EventEmitter(), {
          statusCode: 200,
          headers: {},
        }) as FakeResp;
        callback(resp);
        setImmediate(() => {
          resp.emit("data", Buffer.from("{}"));
          resp.emit("end");
        });
        return new EventEmitter();
      }
    );

    await fetchJson("https://aiarena.net/api/", "mytoken");

    expect((capturedOpts?.headers as Record<string, string>)?.Authorization).toBe(
      "Token mytoken"
    );
  });
});

// ---------------------------------------------------------------------------
// fetchBotRaceMap
// ---------------------------------------------------------------------------

describe("fetchBotRaceMap", () => {
  it("returns an empty object for an empty names array", async () => {
    const result = await fetchBotRaceMap("tok", []);
    expect(result).toEqual({});
    expect(https.get).not.toHaveBeenCalled();
  });

  it("returns the race label from the API response", async () => {
    queueResponse(
      200,
      JSON.stringify({
        results: [{ name: "MyBot", plays_race: { label: "Terran" } }],
      })
    );

    const result = await fetchBotRaceMap("tok", ["MyBot"]);

    expect(result).toEqual({ MyBot: "Terran" });
    expect(cache.setCachedRace).toHaveBeenCalledWith("MyBot", "Terran");
  });

  it("falls back to 'R' when the API call fails", async () => {
    queueNetworkError(new Error("timeout"));

    const result = await fetchBotRaceMap("tok", ["BrokenBot"]);

    expect(result).toEqual({ BrokenBot: "R" });
    expect(cache.setCachedRace).toHaveBeenCalledWith("BrokenBot", "R");
  });

  it("uses the cached race without calling the API", async () => {
    vi.mocked(cache.getCachedRace).mockReturnValue("Zerg");

    const result = await fetchBotRaceMap("tok", ["CachedBot"]);

    expect(result).toEqual({ CachedBot: "Zerg" });
    expect(https.get).not.toHaveBeenCalled();
  });

  it("deduplicates bot names so the API is called only once per unique name", async () => {
    queueResponse(
      200,
      JSON.stringify({
        results: [{ name: "BotA", plays_race: { label: "Protoss" } }],
      })
    );

    const result = await fetchBotRaceMap("tok", ["BotA", "BotA", "BotA"]);

    expect(result).toEqual({ BotA: "Protoss" });
    expect(https.get).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// computeHeader
// ---------------------------------------------------------------------------

describe("computeHeader", () => {
  it("returns the cached header without hitting the API", async () => {
    const cached = { bot: { id: 1 }, botUpdated: null, ranking: null };
    vi.mocked(cache.getCachedHeader).mockReturnValue(cached);

    const result = await computeHeader("tok", "1");

    expect(result).toBe(cached);
    expect(https.get).not.toHaveBeenCalled();
  });

  it("builds header with null ranking when no participation is active", async () => {
    // 1: bot info
    queueResponse(200, JSON.stringify({ id: 42, bot_zip_updated: "2024-06-01T00:00:00" }));
    // 2: participations — none active
    queueResponse(
      200,
      JSON.stringify({
        results: [
          { active: false, competition: 1, division_num: 1, bot: 42, elo: 1500 },
        ],
      })
    );

    const result = await computeHeader("tok", "42");

    expect(result.botUpdated).toBe("2024-06-01T00:00:00");
    expect(result.ranking).toBeNull();
    expect(cache.setCachedHeader).toHaveBeenCalledWith(result);
  });

  it("builds header with full ranking data when an active participation exists", async () => {
    // 1: bot info
    queueResponse(200, JSON.stringify({ id: 42, bot_zip_updated: "2024-06-01T00:00:00" }));
    // 2: bot's participations — one active in competition 99, division 2
    queueResponse(
      200,
      JSON.stringify({
        results: [{ active: true, competition: 99, division_num: 2, bot: 42, elo: 1600 }],
      })
    );
    // 3: all active participations in competition 99 (ordered -elo)
    queueResponse(
      200,
      JSON.stringify({
        results: [
          { active: true, in_placements: false, division_num: 2, bot: 1,  elo: 1800 },
          { active: true, in_placements: false, division_num: 2, bot: 42, elo: 1600 },
          { active: true, in_placements: false, division_num: 3, bot: 2,  elo: 1500 },
          // excluded: still in placements
          { active: true, in_placements: true,  division_num: 2, bot: 3,  elo: 1400 },
        ],
      })
    );

    const result = await computeHeader("tok", "42");

    expect(result.ranking).toMatchObject({
      competitionId: 99,
      elo: 1600,
      division: 2,
      overallRank: 2,   // rank 2 of 3 non-placement active bots
      overallTotal: 3,
      divisionRank: 2,  // rank 2 of 2 active bots in division 2
      divisionTotal: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// computeEloSinceUpdate
// ---------------------------------------------------------------------------

describe("computeEloSinceUpdate", () => {
  it("returns null immediately when botUpdated is null", async () => {
    const result = await computeEloSinceUpdate("tok", "42", null, 1500);
    expect(result).toBeNull();
    expect(https.get).not.toHaveBeenCalled();
  });

  it("returns null immediately when currentElo is null", async () => {
    const result = await computeEloSinceUpdate("tok", "42", "2024-01-01T00:00:00", null);
    expect(result).toBeNull();
    expect(https.get).not.toHaveBeenCalled();
  });

  it("returns null when no participations fall after the update date", async () => {
    // match-participations list
    queueResponse(
      200,
      JSON.stringify({ results: [{ match: 101, starting_elo: 1400 }] })
    );
    // match 101 detail — played BEFORE the update date
    queueResponse(200, JSON.stringify({ started: "2023-12-15T12:00:00" }));

    const result = await computeEloSinceUpdate(
      "tok",
      "42",
      "2024-01-01T00:00:00",
      1500
    );

    expect(result).toBeNull();
  });

  it("computes baseline, current, and delta from participations after the update date", async () => {
    // Two participations after the update date
    queueResponse(
      200,
      JSON.stringify({
        results: [
          { match: 201, starting_elo: 1480 }, // later match
          { match: 202, starting_elo: 1450 }, // earlier match (becomes baseline)
        ],
      })
    );
    // match 201 detail (later)
    queueResponse(200, JSON.stringify({ started: "2024-02-10T12:00:00" }));
    // match 202 detail (earlier)
    queueResponse(200, JSON.stringify({ started: "2024-01-20T12:00:00" }));

    const result = await computeEloSinceUpdate(
      "tok",
      "42",
      "2024-01-01T00:00:00",
      1520
    );

    // baseline = starting_elo of the earliest match after update (match 202 = 1450)
    expect(result).not.toBeNull();
    expect(result!.baseline).toBe(1450);
    expect(result!.current).toBe(1520);
    expect(result!.delta).toBe(70);
    expect(cache.setCachedEloSinceUpdate).toHaveBeenCalled();
  });

  it("returns the cached value without calling the API", async () => {
    const cachedValue = { baseline: 1400, current: 1500, delta: 100 };
    vi.mocked(cache.getCachedEloSinceUpdate).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cachedValue as any
    );

    const result = await computeEloSinceUpdate("tok", "42", "2024-01-01", 1500);

    expect(result).toBe(cachedValue);
    expect(https.get).not.toHaveBeenCalled();
  });
});
