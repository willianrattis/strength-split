import { describe, it, expect } from "vitest";
import { emptySession, reconcileSession } from "../src/domain/session.js";
import { makeDay, makeExercise, makeEntry, makeSession } from "./fixtures.js";

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

  it("discards unknown fields on the stored entry", () => {
    const day = makeDay({ ex: [makeExercise({ _id: "e1", name: "Supino", reps: [10] })] });
    const prev = makeSession({ exercises: [
      { ...makeEntry({ exId: "e1", name: "Supino", main: [{ done: true, reps: 10, weight: 60, repsDone: 10, doneAt: null, fromSug: false }] }), rir: 2 }
    ] });
    const fresh = reconcileSession(prev, 0, baseOpts({ day }));
    expect(fresh.exercises[0].rir).toBeUndefined();
  });
});
