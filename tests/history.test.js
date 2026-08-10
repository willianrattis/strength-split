import { describe, it, expect } from "vitest";
import { pickSets, execShiftMap, prevLoadData, exerciseTopHistory, isStalled, bestWeightEver } from "../src/domain/history.js";
import { autoregCfg, orderFactor } from "../src/domain/autoreg.js";
import { makeEntry, makeSession } from "./fixtures.js";

describe("pickSets", () => {
  it("matches the main branch before the superset branch", () => {
    const entry = makeEntry({ name: "X", main: ["MAIN"], supName: "X", sup: ["SUP"] });
    expect(pickSets(entry, "X", undefined, false)).toEqual(["MAIN"]);
  });

  it("subName overrides name", () => {
    const entry = makeEntry({ name: "X", subName: "Y", main: ["MAIN"] });
    expect(pickSets(entry, "Y", undefined, false)).toEqual(["MAIN"]);
    expect(pickSets(entry, "X", undefined, false)).toBeNull();
  });

  it("supSubName overrides supName", () => {
    const entry = makeEntry({ supName: "X", supSubName: "Y", sup: ["SUP"] });
    expect(pickSets(entry, "Y", undefined, false)).toEqual(["SUP"]);
    expect(pickSets(entry, "X", undefined, false)).toBeNull();
  });

  it("returns null on no match", () => {
    const entry = makeEntry({ name: "X", main: ["MAIN"] });
    expect(pickSets(entry, "Z", undefined, false)).toBeNull();
  });

  it("machineFilter:false matches even with a machine mismatch", () => {
    const entry = makeEntry({ name: "X", machine: "A", main: ["MAIN"] });
    expect(pickSets(entry, "X", "B", false)).toEqual(["MAIN"]);
  });

  it("machineFilter:true does not match on a machine mismatch", () => {
    const entry = makeEntry({ name: "X", machine: "A", main: ["MAIN"] });
    expect(pickSets(entry, "X", "B", true)).toBeNull();
  });

  it("machine===undefined bypasses the filter even when machineFilter:true", () => {
    const entry = makeEntry({ name: "X", machine: "A", main: ["MAIN"] });
    expect(pickSets(entry, "X", undefined, true)).toEqual(["MAIN"]);
  });
});

describe("execShiftMap", () => {
  it("is empty for a session with no firstSetAt", () => {
    const sess = makeSession({ exercises: [makeEntry({}), makeEntry({})] });
    expect(execShiftMap(sess).size).toBe(0);
  });

  it("yields shift 0 for every entry executed in plan order", () => {
    const sess = makeSession({ exercises: [
      makeEntry({ firstSetAt: "2026-01-03T09:00:00" }),
      makeEntry({ firstSetAt: "2026-01-03T09:05:00" }),
      makeEntry({ firstSetAt: "2026-01-03T09:10:00" })
    ] });
    const map = execShiftMap(sess);
    expect(map.get(0)).toBe(0);
    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(0);
  });

  it("swapping two exercises' execution timestamps yields +1/-1", () => {
    const sess = makeSession({ exercises: [
      makeEntry({ firstSetAt: "2026-01-03T09:05:00" }), // index 0, executed second
      makeEntry({ firstSetAt: "2026-01-03T09:00:00" })  // index 1, executed first
    ] });
    const map = execShiftMap(sess);
    expect(map.get(0)).toBe(1);
    expect(map.get(1)).toBe(-1);
  });

  it("clamps the shift to ±3", () => {
    const sess = makeSession({ exercises: [
      makeEntry({ firstSetAt: "2026-01-03T09:01:00" }),
      makeEntry({ firstSetAt: "2026-01-03T09:02:00" }),
      makeEntry({ firstSetAt: "2026-01-03T09:03:00" }),
      makeEntry({ firstSetAt: "2026-01-03T09:04:00" }),
      makeEntry({ firstSetAt: "2026-01-03T09:00:00" }) // index 4, executed first of all
    ] });
    const map = execShiftMap(sess);
    expect(map.get(4)).toBe(-3);
  });
});

describe("prevLoadData", () => {
  it("picks the most recent session with a numeric weight", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", dayKey: 0, exercises: [makeEntry({ name: "Supino", main: [{ weight: 50, reps: 10, repsDone: 10 }] })] }),
      makeSession({ date: "2026-01-03", dayKey: 0, exercises: [makeEntry({ name: "Supino", main: [{ weight: 60, reps: 10, repsDone: 10 }] })] })
    ];
    const r = prevLoadData(sessions, "Supino", undefined, {});
    expect(r.date).toBe("2026-01-03");
    expect(r.perSet[0].weight).toBe(60);
  });

  it("skips the session matching currentKey", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", dayKey: 0, exercises: [makeEntry({ name: "Supino", main: [{ weight: 50, reps: 10, repsDone: 10 }] })] }),
      makeSession({ date: "2026-01-05", dayKey: 0, exercises: [makeEntry({ name: "Supino", main: [{ weight: 999, reps: 10, repsDone: 10 }] })] })
    ];
    const r = prevLoadData(sessions, "Supino", undefined, { currentKey: "2026-01-05_0" });
    expect(r.date).toBe("2026-01-01");
    expect(r.perSet[0].weight).toBe(50);
  });

  it("perSet is index-aligned, preserving null for empty sets", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [
        { weight: 60, reps: 10, repsDone: 10 },
        { weight: null, reps: 10, repsDone: null },
        { weight: 70, reps: 10, repsDone: 8 }
      ] })
    ] })];
    const r = prevLoadData(sessions, "Supino", undefined, {});
    expect(r.perSet).toHaveLength(3);
    expect(r.perSet[0].weight).toBe(60);
    expect(r.perSet[1].weight).toBeNull();
    expect(r.perSet[2].weight).toBe(70);
  });

  it("returns null when no history has a numeric weight", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [{ weight: null, reps: 10, repsDone: null }] })
    ] })];
    expect(prevLoadData(sessions, "Supino", undefined, {})).toBeNull();
  });

  it("execRank is null when execOrder:false, even if the entry ran out of order", () => {
    const sessions = [makeSession({ date: "2026-01-03", exercises: [
      makeEntry({ name: "Agachamento", firstSetAt: "2026-01-03T09:05:00", main: [{ weight: 100, reps: 10, repsDone: 10 }] }),
      makeEntry({ name: "Supino", firstSetAt: "2026-01-03T09:00:00", main: [{ weight: 60, reps: 10, repsDone: 10 }] })
    ] })];
    const r = prevLoadData(sessions, "Supino", undefined, { execOrder: false });
    expect(r.execRank).toBeNull();
  });

  it("execRank is a 1-based rank when the entry ran out of order", () => {
    const sessions = [makeSession({ date: "2026-01-03", exercises: [
      makeEntry({ name: "Agachamento", firstSetAt: "2026-01-03T09:05:00", main: [{ weight: 100, reps: 10, repsDone: 10 }] }),
      makeEntry({ name: "Supino", firstSetAt: "2026-01-03T09:00:00", main: [{ weight: 60, reps: 10, repsDone: 10 }] })
    ] })];
    const r = prevLoadData(sessions, "Supino", undefined, { execOrder: true });
    expect(r.execRank).toBe(1);
  });
});

describe("exerciseTopHistory", () => {
  it("keeps one entry per date, at the max weight", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [{ weight: 50 }, { weight: 70 }, { weight: 60 }] })
    ] })];
    const hist = exerciseTopHistory(sessions, "Supino", {});
    expect(hist).toEqual([{ date: "2026-01-01", top: 70 }]);
  });

  it("sorts ascending by date", () => {
    const sessions = [
      makeSession({ date: "2026-01-03", exercises: [makeEntry({ name: "Supino", main: [{ weight: 60 }] })] }),
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [{ weight: 50 }] })] })
    ];
    const hist = exerciseTopHistory(sessions, "Supino", {});
    expect(hist.map(h => h.date)).toEqual(["2026-01-01", "2026-01-03"]);
  });

  it("since filters inclusively", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [{ weight: 50 }] })] }),
      makeSession({ date: "2026-01-03", exercises: [makeEntry({ name: "Supino", main: [{ weight: 60 }] })] })
    ];
    const hist = exerciseTopHistory(sessions, "Supino", { since: "2026-01-03" });
    expect(hist.map(h => h.date)).toEqual(["2026-01-03"]);
  });

  it("scales a shifted entry's top by orderFactor when execOrder:true", () => {
    const cfg = autoregCfg("mod");
    const sessions = [makeSession({ date: "2026-01-03", exercises: [
      makeEntry({ name: "Agachamento", firstSetAt: "2026-01-03T09:05:00", main: [{ weight: 100 }] }),
      makeEntry({ name: "Supino", firstSetAt: "2026-01-03T09:00:00", main: [{ weight: 60 }] })
    ] })];
    const hist = exerciseTopHistory(sessions, "Supino", { execOrder: true, cfg });
    // index 1 (Supino) executed before index 0 -> shift -1
    expect(hist[0].top).toBeCloseTo(60 * orderFactor(-1, cfg));
  });
});

describe("isStalled", () => {
  it("is false when history length <= STALL_SESSIONS (3)", () => {
    const sessions = ["2026-01-01", "2026-01-02", "2026-01-03"].map(date =>
      makeSession({ date, exercises: [makeEntry({ name: "Supino", main: [{ weight: 60 }] })] })
    );
    expect(isStalled(sessions, "Supino", {})).toBe(false);
  });

  it("is true when the last 3 sessions' max does not exceed the earlier max", () => {
    const tops = [100, 100, 90, 90, 90];
    const sessions = tops.map((w, i) =>
      makeSession({ date: `2026-01-0${i + 1}`, exercises: [makeEntry({ name: "Supino", main: [{ weight: w }] })] })
    );
    expect(isStalled(sessions, "Supino", {})).toBe(true);
  });

  it("is false when the recent window exceeds the earlier max", () => {
    const tops = [90, 90, 100, 100, 100];
    const sessions = tops.map((w, i) =>
      makeSession({ date: `2026-01-0${i + 1}`, exercises: [makeEntry({ name: "Supino", main: [{ weight: w }] })] })
    );
    expect(isStalled(sessions, "Supino", {})).toBe(false);
  });

  it("boundary: equal window/before max counts as stalled", () => {
    const tops = [100, 100, 100, 100, 100];
    const sessions = tops.map((w, i) =>
      makeSession({ date: `2026-01-0${i + 1}`, exercises: [makeEntry({ name: "Supino", main: [{ weight: w }] })] })
    );
    expect(isStalled(sessions, "Supino", {})).toBe(true);
  });
});

describe("bestWeightEver", () => {
  it("returns the all-time max, excluding currentKey", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", dayKey: 0, exercises: [makeEntry({ name: "Supino", main: [{ weight: 60 }] })] }),
      makeSession({ date: "2026-01-05", dayKey: 0, exercises: [makeEntry({ name: "Supino", main: [{ weight: 999 }] })] })
    ];
    const r = bestWeightEver(sessions, "Supino", undefined, { currentKey: "2026-01-05_0" });
    expect(r).toBe(60);
  });

  it("returns null with no numeric weights", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [{ weight: null }] })] })];
    expect(bestWeightEver(sessions, "Supino", undefined, {})).toBeNull();
  });
});
