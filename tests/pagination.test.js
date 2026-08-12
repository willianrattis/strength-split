import { describe, it, expect, vi } from "vitest";
import { collectAllPages } from "../src/core/pagination.js";

describe("collectAllPages", () => {
  it("concatenates multiple pages in order and drives the cursor through each fetch", async () => {
    const calls = [];
    const fetchPage = vi.fn(async cursor => {
      calls.push(cursor);
      if(cursor === null) return { sessions: ["s1", "s2", "s3"], cursor: "2026-01-03", done: false };
      if(cursor === "2026-01-03") return { sessions: ["s4", "s5", "s6"], cursor: "2026-01-06", done: false };
      if(cursor === "2026-01-06") return { sessions: ["s7"], cursor: "2026-01-07", done: true };
      throw new Error("unexpected cursor " + cursor);
    });

    const result = await collectAllPages(fetchPage);

    expect(result).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
    expect(calls).toEqual([null, "2026-01-03", "2026-01-06"]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("returns a single page's sessions when the first fetch is already done", async () => {
    const fetchPage = vi.fn(async () => ({ sessions: ["s1", "s2"], cursor: "2026-01-02", done: true }));

    const result = await collectAllPages(fetchPage);

    expect(result).toEqual(["s1", "s2"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(null);
  });

  it("returns an empty array for an account with no sessions", async () => {
    const fetchPage = vi.fn(async () => ({ sessions: [], cursor: null, done: true }));

    const result = await collectAllPages(fetchPage);

    expect(result).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("breaks and warns instead of looping forever when the cursor doesn't advance", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // First call advances the cursor normally; second call reports the SAME cursor
    // back while still claiming it isn't done — the stuck case the guard exists for.
    const fetchPage = vi.fn(async cursor => {
      if(cursor === null) return { sessions: ["s1"], cursor: "X", done: false };
      return { sessions: ["s2"], cursor: "X", done: false };
    });

    const result = await collectAllPages(fetchPage);

    expect(result).toEqual(["s1", "s2"]); // still collects what it fetched before detecting the stall
    expect(fetchPage).toHaveBeenCalledTimes(2); // stops instead of looping forever
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });
});
