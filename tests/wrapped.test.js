import { describe, it, expect } from "vitest";
import { buildMuscleIndex, muscleHeuristic } from "../src/domain/muscles.js";
import { computeWrapped } from "../src/domain/wrapped.js";
import { stripDiacritics } from "../src/domain/text.js";
import { makeEntry, makeSession } from "./fixtures.js";

const set = (over = {}) => ({ done: false, reps: 10, weight: null, repsDone: null, ...over });

describe("buildMuscleIndex", () => {
  it("plan's muscle wins over catalog's for the same name (first write wins)", () => {
    const plans = [{ days: [{ exercises: [{ name: "Shared", muscle: "peito" }] }] }];
    const catalog = [{ name: "Shared", muscle: "costas" }];
    const idx = buildMuscleIndex({ plans, catalog });
    expect(idx.get(stripDiacritics("Shared"))).toBe("peito");
  });

  it("covers all four layers and their supersets", () => {
    const plans = [{ days: [{ exercises: [{ name: "PlanEx", muscle: "peito", superset: { name: "PlanSup", muscle: "triceps" } }] }] }];
    const days = [{ ex: [{ name: "DayEx", muscle: "costas", superset: { name: "DaySup", muscle: "biceps" } }] }];
    const templates = [{ days: [{ exercises: [{ name: "TplEx", muscle: "perna", superset: { name: "TplSup", muscle: "panturrilha" } }] }] }];
    const catalog = [{ name: "CatEx", muscle: "ombro" }];
    const idx = buildMuscleIndex({ plans, days, templates, catalog });
    expect(idx.get(stripDiacritics("PlanEx"))).toBe("peito");
    expect(idx.get(stripDiacritics("PlanSup"))).toBe("triceps");
    expect(idx.get(stripDiacritics("DayEx"))).toBe("costas");
    expect(idx.get(stripDiacritics("DaySup"))).toBe("biceps");
    expect(idx.get(stripDiacritics("TplEx"))).toBe("perna");
    expect(idx.get(stripDiacritics("TplSup"))).toBe("panturrilha");
    expect(idx.get(stripDiacritics("CatEx"))).toBe("ombro");
  });

  it("returns an empty Map without throwing when called with no args", () => {
    const idx = buildMuscleIndex({});
    expect(idx.size).toBe(0);
  });
});

describe("muscleHeuristic", () => {
  it("'rosca punho' resolves to antebraço, not bíceps", () => {
    expect(muscleHeuristic("rosca punho")).toBe("antebraço");
  });

  it("'levantamento terra' resolves to costas", () => {
    expect(muscleHeuristic("levantamento terra")).toBe("costas");
  });

  it("'terra romeno' and 'stiff' resolve to perna, not costas", () => {
    expect(muscleHeuristic("terra romeno")).toBe("perna");
    expect(muscleHeuristic("stiff")).toBe("perna");
  });

  it("'barra fixa' resolves to costas", () => {
    expect(muscleHeuristic("barra fixa")).toBe("costas");
  });

  it("returns null for an unknown keyword", () => {
    expect(muscleHeuristic("corrida")).toBeNull();
  });
});

describe("computeWrapped", () => {
  const emptyIdx = new Map();

  it("returns null with no sessions", () => {
    expect(computeWrapped([], 2026, emptyIdx)).toBeNull();
  });

  it("returns null when no set in the year is done", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "X", main: [set({ done: false })] })] })];
    expect(computeWrapped(sessions, 2026, emptyIdx)).toBeNull();
  });

  it("year filter: only sessions whose date starts with the year string are counted", () => {
    const sessions = [
      makeSession({ date: "2025-12-31", exercises: [makeEntry({ name: "X", main: [set({ done: true, weight: 50, reps: 10, repsDone: 10 })] })] }),
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "X", main: [set({ done: true, weight: 60, reps: 10, repsDone: 10 })] })] })
    ];
    const r = computeWrapped(sessions, 2026, emptyIdx);
    expect(r.sessionsCount).toBe(1);
    expect(r.totalVolume).toBe(600);
  });

  it("only done sets contribute; volume requires a numeric weight and reps > 0", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "X", main: [
      set({ done: true, weight: 60, reps: 10, repsDone: 10 }),
      set({ done: false, weight: 100, reps: 10, repsDone: 10 }),
      set({ done: true, weight: null, reps: 10, repsDone: 10 })
    ] })] })];
    const r = computeWrapped(sessions, 2026, emptyIdx);
    expect(r.totalSets).toBe(2);
    expect(r.totalReps).toBe(20);
    expect(r.totalVolume).toBe(600);
  });

  it("topMuscle is decided by sets, tie-broken by reps", () => {
    const idx = new Map([
      [stripDiacritics("ExPeito"), "peito"],
      [stripDiacritics("ExCostas"), "costas"],
      [stripDiacritics("ExPerna"), "perna"]
    ]);
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "ExPeito", main: [set({ done: true, reps: 10, repsDone: 10 }), set({ done: true, reps: 10, repsDone: 10 })] }),
      makeEntry({ name: "ExCostas", main: [set({ done: true, reps: 5, repsDone: 5 }), set({ done: true, reps: 5, repsDone: 5 })] }),
      makeEntry({ name: "ExPerna", main: [set({ done: true, reps: 100, repsDone: 100 })] })
    ] })];
    const r = computeWrapped(sessions, 2026, idx);
    expect(r.topMuscle).toBe("peito");
  });

  it("mostProgressed requires a positive delta and different dates", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [set({ done: true, weight: 60, reps: 10, repsDone: 10 })] })] }),
      makeSession({ date: "2026-01-10", exercises: [makeEntry({ name: "Supino", main: [set({ done: true, weight: 70, reps: 10, repsDone: 10 })] })] })
    ];
    const r = computeWrapped(sessions, 2026, emptyIdx);
    expect(r.mostProgressed).toEqual({ exercise: "Supino", from: 60, to: 70, delta: 10 });
  });

  it("same-date-only history yields mostProgressed:null", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [set({ done: true, weight: 60, reps: 10, repsDone: 10 })] })] })];
    const r = computeWrapped(sessions, 2026, emptyIdx);
    expect(r.mostProgressed).toBeNull();
  });

  it("same-date tie-break keeps the higher weight for firstTop/lastTop", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [set({ done: true, weight: 40, reps: 10, repsDone: 10 })] })] }),
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [set({ done: true, weight: 90, reps: 10, repsDone: 10 })] })] })
    ];
    const r = computeWrapped(sessions, 2026, emptyIdx);
    expect(r.heaviest).toEqual({ exercise: "Supino", weight: 90, date: "2026-01-01" });
  });

  it("topExercisesByReps is capped at 3 and sorted desc", () => {
    const reps = { A: 100, B: 90, C: 80, D: 70 };
    const sessions = [makeSession({ date: "2026-01-01", exercises:
      Object.entries(reps).map(([name, r]) => makeEntry({ name, main: [set({ done: true, reps: r, repsDone: r })] }))
    })];
    const r = computeWrapped(sessions, 2026, emptyIdx);
    expect(r.topExercisesByReps).toEqual([
      { name: "A", reps: 100 }, { name: "B", reps: 90 }, { name: "C", reps: 80 }
    ]);
  });

  it("aggregates a substituted exercise under the performed name, not the planned one", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Planned Name", subName: "Substituted Name", main: [set({ done: true, reps: 10, repsDone: 10 })] })
    ] })];
    const r = computeWrapped(sessions, 2026, emptyIdx);
    expect(r.topExercisesByReps).toEqual([{ name: "Substituted Name", reps: 10 }]);
  });
});
