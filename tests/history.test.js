import { describe, it, expect } from "vitest";
import { pickSets, execShiftMap, prevLoadData, exerciseTopHistory, isStalled, bestWeightEver, buildSessionsByName } from "../src/domain/history.js";
import { suggestLoads } from "../src/domain/suggestion.js";
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

describe("buildSessionsByName", () => {
  it("buckets a session under its main entry name", () => {
    const sess = makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [{ weight: 60 }] })] });
    const map = buildSessionsByName([sess]);
    expect(map.get("Supino")).toEqual([sess]);
  });

  it("buckets a session under its superset entry name too", () => {
    const sess = makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Agachamento", main: [{ weight: 100 }], supName: "Remada", sup: [{ weight: 40 }] })
    ] });
    const map = buildSessionsByName([sess]);
    expect(map.get("Agachamento")).toEqual([sess]);
    expect(map.get("Remada")).toEqual([sess]);
  });

  it("keys by subName/supSubName when present, not the base name", () => {
    const sess = makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Old", subName: "New", main: [{ weight: 60 }], supName: "SupOld", supSubName: "SupNew", sup: [{ weight: 30 }] })
    ] });
    const map = buildSessionsByName([sess]);
    expect(map.get("New")).toEqual([sess]);
    expect(map.get("SupNew")).toEqual([sess]);
    expect(map.has("Old")).toBe(false);
    expect(map.has("SupOld")).toBe(false);
  });

  it("dedupes: a session appears at most once per name even with two entries sharing it", () => {
    const sess = makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [{ weight: 60 }] }),
      makeEntry({ name: "Agachamento", main: [{ weight: 100 }], supName: "Supino", sup: [{ weight: 40 }] })
    ] });
    const map = buildSessionsByName([sess]);
    expect(map.get("Supino")).toEqual([sess]);
  });

  it("preserves the input order of sessions within a bucket", () => {
    const s1 = makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [{ weight: 50 }] })] });
    const s2 = makeSession({ date: "2026-01-03", exercises: [makeEntry({ name: "Supino", main: [{ weight: 60 }] })] });
    const s3 = makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Supino", main: [{ weight: 55 }] })] });
    const map = buildSessionsByName([s2, s3, s1]);
    expect(map.get("Supino")).toEqual([s2, s3, s1]);
  });

  it("returns an empty map for null/empty input", () => {
    expect(buildSessionsByName(null).size).toBe(0);
    expect(buildSessionsByName([]).size).toBe(0);
  });

  it("skips sessions with no exercises", () => {
    const sess = makeSession({ date: "2026-01-01", exercises: [] });
    expect(buildSessionsByName([sess]).size).toBe(0);
  });
});

describe("sessionsByName equivalence (proof that indexing preserves behavior)", () => {
  // A mixed fixture: "Supino" shows up as a main name in one session, and as a
  // superset partner (via supSubName) in another, alongside unrelated exercises
  // and a session sharing currentKey — exercising every pickSets matching path.
  const sessions = [
    makeSession({ date: "2026-01-01", dayKey: 0, exercises: [
      makeEntry({ name: "Supino", machine: "A", main: [{ weight: 50, reps: 10, repsDone: 10 }] })
    ] }),
    makeSession({ date: "2026-01-03", dayKey: 0, exercises: [
      makeEntry({ name: "Agachamento", main: [{ weight: 100, reps: 10, repsDone: 10 }], supName: "Supino Old", supSubName: "Supino", supMachine: "B", sup: [{ weight: 45, reps: 10, repsDone: 10 }] }),
      makeEntry({ name: "Remada", main: [{ weight: 80, reps: 10, repsDone: 10 }] })
    ] }),
    makeSession({ date: "2026-01-05", dayKey: 0, exercises: [
      makeEntry({ name: "Supino", machine: "A", main: [{ weight: 999, reps: 10, repsDone: 10 }] })
    ] }),
    makeSession({ date: "2026-01-02", dayKey: 1, exercises: [
      makeEntry({ name: "Levantamento Terra", main: [{ weight: 120 }] })
    ] })
  ];
  const bucket = buildSessionsByName(sessions).get("Supino");
  const cfg = autoregCfg("mod");

  it("prevLoadData is identical whether given the full array or the name bucket", () => {
    for(const opts of [{}, { currentKey: "2026-01-05_0" }, { machineFilter: true }, { machineFilter: false }]){
      expect(prevLoadData(bucket, "Supino", "A", opts)).toEqual(prevLoadData(sessions, "Supino", "A", opts));
    }
  });

  it("exerciseTopHistory is identical whether given the full array or the name bucket", () => {
    for(const opts of [{}, { since: "2026-01-03" }, { machineFilter: true }, { execOrder: true, cfg }]){
      expect(exerciseTopHistory(bucket, "Supino", opts)).toEqual(exerciseTopHistory(sessions, "Supino", opts));
    }
  });

  it("bestWeightEver is identical whether given the full array or the name bucket", () => {
    for(const opts of [{}, { currentKey: "2026-01-05_0" }, { machineFilter: true }]){
      expect(bestWeightEver(bucket, "Supino", "A", opts)).toEqual(bestWeightEver(sessions, "Supino", "A", opts));
    }
  });

  it("suggestLoads is identical whether given the full array or the name bucket", () => {
    for(const opts of [{ cfg }, { cfg, currentKey: "2026-01-05_0" }, { cfg, machineFilter: true }]){
      expect(suggestLoads(bucket, "Supino", "kg", "A", opts)).toEqual(suggestLoads(sessions, "Supino", "kg", "A", opts));
    }
  });

  it("also holds for a name with no matches at all (empty bucket)", () => {
    const emptyBucket = buildSessionsByName(sessions).get("Nonexistent") || [];
    expect(prevLoadData(emptyBucket, "Nonexistent", undefined, {})).toEqual(prevLoadData(sessions, "Nonexistent", undefined, {}));
    expect(bestWeightEver(emptyBucket, "Nonexistent", undefined, {})).toEqual(bestWeightEver(sessions, "Nonexistent", undefined, {}));
    expect(exerciseTopHistory(emptyBucket, "Nonexistent", {})).toEqual(exerciseTopHistory(sessions, "Nonexistent", {}));
    expect(suggestLoads(emptyBucket, "Nonexistent", "kg", undefined, { cfg })).toEqual(suggestLoads(sessions, "Nonexistent", "kg", undefined, { cfg }));
  });
});
