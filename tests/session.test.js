import { describe, it, expect } from "vitest";
import { emptySession, reconcileSession, convertSetWeights } from "../src/domain/session.js";
import { makeDay, makeExercise, makeEntry, makeSession, makeSet } from "./fixtures.js";

const baseOpts = (overrides = {}) => ({
  day: makeDay({ ex: [] }),
  date: "2026-01-05",
  sessions: null,
  machinesActive: false,
  ...overrides
});

describe("emptySession", () => {
  it("returns an empty exercises array when the day has no exercises", () => {
    const opts = baseOpts();
    expect(emptySession(0, opts)).toEqual({
      date: "2026-01-05", dayKey: 0, dayName: "Segunda", exercises: []
    });
  });

  it("builds set cells with the documented defaults", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino reto", reps: [10, 8, 6] })] });
    const s = emptySession(0, baseOpts({ day }));
    expect(s.exercises).toHaveLength(1);
    expect(s.exercises[0].main).toHaveLength(3);
    for (const cell of s.exercises[0].main) {
      expect(cell).toEqual({ done: false, reps: cell.reps, weight: null, repsDone: null, doneAt: null, fromSug: false });
    }
    expect(s.exercises[0].main.map(c => c.reps)).toEqual([10, 8, 6]);
  });

  it("sup is null with no superset, and matches superset rep count when present", () => {
    const day = makeDay({ ex: [
      makeExercise({ _id: "e1", name: "Supino", reps: [10, 10] }),
      makeExercise({ _id: "e2", name: "Crucifixo", reps: [12, 12], superset: { name: "Voador", reps: [15, 15, 15] } })
    ] });
    const s = emptySession(0, baseOpts({ day }));
    expect(s.exercises[0].sup).toBeNull();
    expect(s.exercises[1].sup).toHaveLength(3);
    expect(s.exercises[1].supName).toBe("Voador");
  });

  it("machinesActive:false leaves machine/supMachine null even with matching history", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Leg press", reps: [10] })] });
    const sessions = [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Leg press", machine: "Hammer 3" })] })];
    const s = emptySession(0, baseOpts({ day, sessions, machinesActive: false }));
    expect(s.exercises[0].machine).toBeNull();
  });

  it("stamps unit from the plan exercise, defaulting to kg when absent", () => {
    const day = makeDay({ ex: [
      makeExercise({ _id: "e1", name: "Supino", reps: [10], unit: "lb" }),
      { _id: "e2", name: "Agachamento", reps: [10], superset: null }
    ] });
    const s = emptySession(0, baseOpts({ day }));
    expect(s.exercises[0].unit).toBe("lb");
    expect(s.exercises[1].unit).toBe("kg");
  });

  it("sets supUnit to null when there is no superset", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const s = emptySession(0, baseOpts({ day }));
    expect(s.exercises[0].supUnit).toBeNull();
  });

  it("machinesActive:true fills machine/supMachine from the most recent logged machine", () => {
    const day = makeDay({ ex: [
      makeExercise({ _id: "e1", name: "Leg press", reps: [10], superset: { name: "Cadeira extensora", reps: [12] } })
    ] });
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Leg press", machine: "Hammer 3", supName: "Cadeira extensora", supMachine: "Technogym 1" })] })
    ];
    const s = emptySession(0, baseOpts({ day, sessions, machinesActive: true }));
    expect(s.exercises[0].machine).toBe("Hammer 3");
    expect(s.exercises[0].supMachine).toBe("Technogym 1");
  });

  it("machinesActive:true seeds the unit from the seeded machine's own history, even when the plan says otherwise", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10], unit: "kg" })] });
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", machine: "Life Fitness", unit: "lb" })
    ] })];
    const s = emptySession(0, baseOpts({ day, sessions, machinesActive: true }));
    expect(s.exercises[0].machine).toBe("Life Fitness");
    expect(s.exercises[0].unit).toBe("lb");
  });

  it("machinesActive:false falls back to the plan unit even with matching history", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10], unit: "kg" })] });
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", machine: "Life Fitness", unit: "lb" })
    ] })];
    const s = emptySession(0, baseOpts({ day, sessions, machinesActive: false }));
    expect(s.exercises[0].unit).toBe("kg");
  });

  it("no history for the seeded machine falls back to the plan unit", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10], unit: "kg" })] });
    // Machine is seeded from history (legacy entry, tagged before units existed), but no
    // entry on that machine ever carried a unit — lastUnitFor has nothing to return.
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      { ...makeEntry({ name: "Supino", machine: "Life Fitness" }), unit: undefined }
    ] })];
    const s = emptySession(0, baseOpts({ day, sessions, machinesActive: true }));
    expect(s.exercises[0].machine).toBe("Life Fitness");
    expect(s.exercises[0].unit).toBe("kg");
  });
});

describe("reconcileSession", () => {
  it("matches by exId, not by index (Phase 1.1)", () => {
    const day = makeDay({ ex: [
      makeExercise({ _id: "e1", name: "Supino", reps: [10] }),
      makeExercise({ _id: "e2", name: "Agachamento", reps: [10] })
    ] });
    // stored entries in reversed order relative to the plan
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e2", name: "Agachamento", main: [{ done: true, reps: 10, weight: 100, repsDone: 10, doneAt: null, fromSug: false }] }),
      makeEntry({ exId: "e1", name: "Supino", main: [{ done: true, reps: 10, weight: 60, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].main[0].weight).toBe(60);  // Supino (e1)
    expect(fresh.exercises[1].main[0].weight).toBe(100); // Agachamento (e2)
  });

  it("falls back to name matching for legacy sessions with no exId", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const prev = makeSession({ exercises: [
      makeEntry({ exId: null, name: "Supino", main: [{ done: true, reps: 10, weight: 70, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].main[0].weight).toBe(70);
  });

  it("prefers exId match over a name match on a different entry", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const prev = makeSession({ exercises: [
      makeEntry({ exId: null, name: "Supino", main: [{ done: false, reps: 10, weight: 999, repsDone: null, doneAt: null, fromSug: false }] }),
      makeEntry({ exId: "e1", name: "Nome antigo", main: [{ done: true, reps: 10, weight: 55, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].main[0].weight).toBe(55);
  });

  it("consumes one stored entry per duplicate-name plan exercise", () => {
    const day = makeDay({ ex: [
      makeExercise({ _id: null, name: "Rosca direta", reps: [10] }),
      makeExercise({ _id: null, name: "Rosca direta", reps: [10] })
    ] });
    const prev = makeSession({ exercises: [
      makeEntry({ exId: null, name: "Rosca direta", main: [{ done: true, reps: 10, weight: 10, repsDone: 10, doneAt: null, fromSug: false }] }),
      makeEntry({ exId: null, name: "Rosca direta", main: [{ done: true, reps: 10, weight: 20, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].main[0].weight).toBe(10);
    expect(fresh.exercises[1].main[0].weight).toBe(20);
  });

  it("carries doneAt through reconciliation", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e1", name: "Supino", main: [{ done: true, reps: 10, weight: 60, repsDone: 10, doneAt: "2026-01-04T18:30:00", fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].main[0].doneAt).toBe("2026-01-04T18:30:00");
  });

  it("gives an unmatched plan exercise fresh empty cells, not undefined", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const prev = makeSession({ exercises: [] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].main[0]).toEqual({ done: false, reps: 10, weight: null, repsDone: null, doneAt: null, fromSug: false });
  });

  it("silently discards a stored entry with no counterpart in the plan", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e1", name: "Supino", main: [{ done: true, reps: 10, weight: 60, repsDone: 10, doneAt: null, fromSug: false }] }),
      makeEntry({ exId: "e-removed", name: "Exercício removido", main: [{ done: true, reps: 10, weight: 1, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises).toHaveLength(1);
  });

  it("carries over the first N sets when the plan grows, and adds fresh cells after", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10, 10, 10, 10] })] });
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e1", name: "Supino", main: [
        { done: true, reps: 10, weight: 60, repsDone: 10, doneAt: null, fromSug: false },
        { done: true, reps: 10, weight: 65, repsDone: 10, doneAt: null, fromSug: false },
        { done: true, reps: 10, weight: 70, repsDone: 10, doneAt: null, fromSug: false }
      ] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].main.map(c => c.weight)).toEqual([60, 65, 70, null]);
    expect(fresh.exercises[0].main[3]).toEqual({ done: false, reps: 10, weight: null, repsDone: null, doneAt: null, fromSug: false });
  });

  it("drops the extra stored set when the plan shrinks", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10, 10, 10] })] });
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e1", name: "Supino", main: [
        { done: true, reps: 10, weight: 60, repsDone: 10, doneAt: null, fromSug: false },
        { done: true, reps: 10, weight: 65, repsDone: 10, doneAt: null, fromSug: false },
        { done: true, reps: 10, weight: 70, repsDone: 10, doneAt: null, fromSug: false },
        { done: true, reps: 10, weight: 75, repsDone: 10, doneAt: null, fromSug: false }
      ] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].main).toHaveLength(3);
    expect(fresh.exercises[0].main.map(c => c.weight)).toEqual([60, 65, 70]);
  });

  it("merges sup cells independently of main", () => {
    const day = makeDay({ ex: [
      makeExercise({ _id: "e1", name: "Supino", reps: [10], superset: { name: "Crucifixo", reps: [12] } })
    ] });
    const prev = makeSession({ exercises: [
      makeEntry({
        exId: "e1", name: "Supino", supName: "Crucifixo",
        main: [{ done: true, reps: 10, weight: 60, repsDone: 10, doneAt: null, fromSug: false }],
        sup: [{ done: true, reps: 12, weight: 15, repsDone: 12, doneAt: null, fromSug: false }]
      })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].main[0].weight).toBe(60);
    expect(fresh.exercises[0].sup[0].weight).toBe(15);
  });

  it("prev === null returns the same result as emptySession", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const opts = baseOpts({ day });
    expect(reconcileSession(null, 0, opts)).toEqual(emptySession(0, opts));
  });

  it("prev.exercises not an array returns the same result as emptySession", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const opts = baseOpts({ day });
    expect(reconcileSession({ exercises: "not-an-array" }, 0, opts)).toEqual(emptySession(0, opts));
  });

  it("preserves the old unit even when the plan unit changed since", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10], unit: "kg" })] });
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e1", name: "Supino", unit: "lb", main: [{ done: true, reps: 10, weight: 100, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].unit).toBe("lb");
  });

  it("falls back to the plan unit when the old entry has no unit (legacy doc)", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10], unit: "lb" })] });
    const prev = makeSession({ exercises: [
      { ...makeEntry({ exId: "e1", name: "Supino", main: [{ done: true, reps: 10, weight: 60, repsDone: 10, doneAt: null, fromSug: false }] }), unit: undefined }
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].unit).toBe("lb");
  });

  it("preserves old.unit over both the plan unit and a machine-seeded history unit (regression guard)", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10], unit: "kg" })] });
    // History says this machine was last used in lb, but the live session already has its
    // own stamped unit (kg) — that stamp must win over both the plan and the history seed.
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", machine: "Life Fitness", unit: "lb" })
    ] })];
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e1", name: "Supino", machine: "Life Fitness", unit: "kg", main: [{ done: true, reps: 10, weight: 60, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day, sessions, machinesActive: true }));
    expect(fresh.exercises[0].unit).toBe("kg");
  });

  it("inherits the history-seeded machine when the old entry has machine:null (main and sup)", () => {
    const day = makeDay({ ex: [
      makeExercise({ _id: "e1", name: "Leg press", reps: [10], superset: { name: "Cadeira extensora", reps: [12] } })
    ] });
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Leg press", machine: "Life Fitness", supName: "Cadeira extensora", supMachine: "Technogym" })
    ] })];
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e1", name: "Leg press", machine: null, supName: "Cadeira extensora", supMachine: null, main: [{ done: true, reps: 10, weight: 100, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day, sessions, machinesActive: true }));
    expect(fresh.exercises[0].machine).toBe("Life Fitness");
    expect(fresh.exercises[0].supMachine).toBe("Technogym");
  });

  it("keeps an intentionally cleared machine (\"\") and does not re-inherit (main and sup)", () => {
    const day = makeDay({ ex: [
      makeExercise({ _id: "e1", name: "Leg press", reps: [10], superset: { name: "Cadeira extensora", reps: [12] } })
    ] });
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Leg press", machine: "Life Fitness", supName: "Cadeira extensora", supMachine: "Technogym" })
    ] })];
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e1", name: "Leg press", machine: "", supName: "Cadeira extensora", supMachine: "", main: [{ done: true, reps: 10, weight: 100, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day, sessions, machinesActive: true }));
    expect(fresh.exercises[0].machine).toBe("");
    expect(fresh.exercises[0].supMachine).toBe("");
  });

  it("keeps an explicit old machine over the history-seeded value (main and sup)", () => {
    const day = makeDay({ ex: [
      makeExercise({ _id: "e1", name: "Leg press", reps: [10], superset: { name: "Cadeira extensora", reps: [12] } })
    ] });
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Leg press", machine: "Life Fitness", supName: "Cadeira extensora", supMachine: "Technogym" })
    ] })];
    const prev = makeSession({ exercises: [
      makeEntry({ exId: "e1", name: "Leg press", machine: "Hammer", supName: "Cadeira extensora", supMachine: "Cybex", main: [{ done: true, reps: 10, weight: 100, repsDone: 10, doneAt: null, fromSug: false }] })
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day, sessions, machinesActive: true }));
    expect(fresh.exercises[0].machine).toBe("Hammer");
    expect(fresh.exercises[0].supMachine).toBe("Cybex");
  });

  it("discards unknown fields on the stored entry", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const prev = makeSession({ exercises: [
      { ...makeEntry({ exId: "e1", name: "Supino", main: [{ done: true, reps: 10, weight: 60, repsDone: 10, doneAt: null, fromSug: false }] }), rir: 2 }
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].rir).toBeUndefined();
  });
});

describe("convertSetWeights", () => {
  it("returns the input untouched when from === to", () => {
    const sets = [makeSet({ weight: 60 })];
    expect(convertSetWeights(sets, "kg", "kg")).toBe(sets);
  });

  it("returns the input untouched when a unit is missing", () => {
    const sets = [makeSet({ weight: 60 })];
    expect(convertSetWeights(sets, null, "kg")).toBe(sets);
    expect(convertSetWeights(sets, "kg", null)).toBe(sets);
  });

  it("converts lb to kg, rounded to the nearest 0.5", () => {
    const sets = [makeSet({ weight: 110 })];
    const out = convertSetWeights(sets, "lb", "kg");
    expect(out[0].weight).toBe(50);
  });

  it("converts kg to placas via PLATE_KG, rounded to the nearest whole plate", () => {
    const sets = [makeSet({ weight: 22 })];
    const out = convertSetWeights(sets, "kg", "placas");
    expect(out[0].weight).toBe(4);
  });

  it("round-trips lb -> kg -> lb back to the original value at 0.5 granularity", () => {
    const sets = [makeSet({ weight: 110 })];
    const kg = convertSetWeights(sets, "lb", "kg");
    const back = convertSetWeights(kg, "kg", "lb");
    expect(back[0].weight).toBe(110);
  });

  it("passes through a set with a null weight unchanged", () => {
    const sets = [makeSet({ weight: null })];
    const out = convertSetWeights(sets, "lb", "kg");
    expect(out[0].weight).toBeNull();
  });

  it("carries every non-weight field through untouched (known trap #1 shape)", () => {
    const sets = [makeSet({ done: true, reps: 8, weight: 110, repsDone: 6, doneAt: "2026-01-04T18:30:00", fromSug: true })];
    const out = convertSetWeights(sets, "lb", "kg");
    expect(out[0].done).toBe(true);
    expect(out[0].reps).toBe(8);
    expect(out[0].repsDone).toBe(6);
    expect(out[0].doneAt).toBe("2026-01-04T18:30:00");
    expect(out[0].fromSug).toBe(true);
  });

  it("returns a null or non-array sets input without throwing", () => {
    expect(convertSetWeights(null, "lb", "kg")).toBeNull();
    expect(convertSetWeights(undefined, "lb", "kg")).toBeUndefined();
  });
});
