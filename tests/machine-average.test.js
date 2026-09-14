import { describe, it, expect } from "vitest";
import { avgAcrossMachines } from "../src/domain/machine-average.js";
import { makeEntry, makeSession, makeSet } from "./fixtures.js";

describe("avgAcrossMachines", () => {
  it("returns null for null/empty sessions", () => {
    expect(avgAcrossMachines(null, "Supino")).toBeNull();
    expect(avgAcrossMachines([], "Supino")).toBeNull();
  });

  it("returns null when the exercise history never had a machine tagged", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", machine: null, main: [makeSet({ weight: 60 })] })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Supino", machine: "", main: [makeSet({ weight: 60 })] })] })
    ];
    expect(avgAcrossMachines(sessions, "Supino")).toBeNull();
  });

  it("with one machine only, returns that machine's most recent session unchanged", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", machine: "Hammer", main: [makeSet({ weight: 40, reps: 10, repsDone: 10 })] })] }),
      makeSession({ date: "2026-01-10", exercises: [makeEntry({ name: "Supino", machine: "Hammer", main: [makeSet({ weight: 50, reps: 8, repsDone: 8 })] })] })
    ];
    const res = avgAcrossMachines(sessions, "Supino");
    expect(res.machines).toEqual(["Hammer"]);
    expect(res.perSet).toEqual([{ weight: 50, reps: 8, repsDone: 8 }]);
    expect(res.unit).toBe("kg");
  });

  it("averages two machines with the same unit, snapped to the unit step", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", machine: "Hammer", main: [makeSet({ weight: 40, reps: 10, repsDone: 10 })] })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Supino", machine: "Life Fitness", main: [makeSet({ weight: 45, reps: 8, repsDone: 6 })] })] })
    ];
    const res = avgAcrossMachines(sessions, "Supino");
    // (40+45)/2 = 42.5, already a multiple of the half-kg display step
    expect(res.perSet).toEqual([{ weight: 42.5, reps: 9, repsDone: 8 }]);
    // most-recently-used machine first
    expect(res.machines).toEqual(["Life Fitness", "Hammer"]);
  });

  it("converts across units before averaging", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", machine: "Hammer", unit: "lb", main: [makeSet({ weight: 95, reps: 10, repsDone: 10 })] })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Supino", machine: "Life Fitness", unit: "kg", main: [makeSet({ weight: 50, reps: 10, repsDone: 10 })] })] })
    ];
    const res = avgAcrossMachines(sessions, "Supino", { targetUnit: "kg" });
    // 95 lb -> ~43.09 kg, averaged with 50 kg -> ~46.55 kg, rounded to the nearest half kg.
    expect(res.perSet[0].weight).toBe(46.5);
    expect(res.unit).toBe("kg");
  });

  it("converts across units before averaging, targetUnit lb", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", machine: "Hammer", unit: "lb", main: [makeSet({ weight: 95, reps: 10, repsDone: 10 })] })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Supino", machine: "Life Fitness", unit: "kg", main: [makeSet({ weight: 50, reps: 10, repsDone: 10 })] })] })
    ];
    const res = avgAcrossMachines(sessions, "Supino", { targetUnit: "lb" });
    expect(res.perSet[0].weight).toBe(102.5);
    expect(res.unit).toBe("lb");
  });

  it("converts a placas entry into the average when targetUnit is kg", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Leg press", machine: "Hammer", unit: "kg", main: [makeSet({ weight: 40 })] })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Leg press", machine: "Cybex", unit: "placas", main: [makeSet({ weight: 5 })] })] })
    ];
    const res = avgAcrossMachines(sessions, "Leg press", { targetUnit: "kg" });
    // Hammer 40 kg + Cybex 5 placas (= 25 kg) -> mean 32.5 kg
    expect(res.machines.slice().sort()).toEqual(["Cybex", "Hammer"]);
    expect(res.perSet).toEqual([{ weight: 32.5, reps: 10, repsDone: null }]);
  });

  it("converts a kg entry into the average when targetUnit is placas", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Leg press", machine: "Hammer", unit: "kg", main: [makeSet({ weight: 40 })] })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Leg press", machine: "Cybex", unit: "placas", main: [makeSet({ weight: 5 })] })] })
    ];
    const res = avgAcrossMachines(sessions, "Leg press", { targetUnit: "placas" });
    // Hammer 40 kg = 8 placas, Cybex 5 placas -> mean 6.5 -> 7
    expect(res.machines.slice().sort()).toEqual(["Cybex", "Hammer"]);
    expect(res.perSet).toEqual([{ weight: 7, reps: 10, repsDone: null }]);
    expect(res.unit).toBe("placas");
  });

  it("treats a legacy entry with no unit as targetUnit", () => {
    const legacyEntry = { ...makeEntry({ name: "Supino", machine: "Hammer", main: [makeSet({ weight: 50, reps: 10, repsDone: 10 })] }), unit: undefined };
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [legacyEntry] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Supino", machine: "Life Fitness", unit: "kg", main: [makeSet({ weight: 60, reps: 10, repsDone: 10 })] })] })
    ];
    const res = avgAcrossMachines(sessions, "Supino", { targetUnit: "kg" });
    expect(res.perSet[0].weight).toBe(55); // (50+60)/2, already a step multiple
  });

  it("averages differing set counts per machine independently, per index", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", machine: "Hammer", main: [makeSet({ weight: 40 }), makeSet({ weight: 40 }), makeSet({ weight: 40 })] })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Supino", machine: "Life Fitness", main: [makeSet({ weight: 50 }), makeSet({ weight: 50 }), makeSet({ weight: 50 }), makeSet({ weight: 50 })] })] })
    ];
    const res = avgAcrossMachines(sessions, "Supino");
    expect(res.perSet).toHaveLength(4);
    expect(res.perSet[0].weight).toBe(45); // (40+50)/2
    expect(res.perSet[3].weight).toBe(50); // only Life Fitness has a 4th set
  });

  it("excludes the session matching currentKey", () => {
    const sessions = [
      makeSession({ date: "2026-01-05", dayKey: 0, exercises: [makeEntry({ name: "Supino", machine: "Hammer", main: [makeSet({ weight: 60 })] })] })
    ];
    expect(avgAcrossMachines(sessions, "Supino", { currentKey: "2026-01-05_0" })).toBeNull();
  });

  it("picks the most recent session per machine by date, not array position", () => {
    // Deliberately out of date order: oldest, newest, middle.
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Leg press", machine: "Hammer", main: [makeSet({ weight: 30 })] })] }),
      makeSession({ date: "2026-01-10", exercises: [makeEntry({ name: "Leg press", machine: "Hammer", main: [makeSet({ weight: 50 })] })] }),
      makeSession({ date: "2026-01-05", exercises: [makeEntry({ name: "Leg press", machine: "Hammer", main: [makeSet({ weight: 40 })] })] })
    ];
    const res = avgAcrossMachines(sessions, "Leg press");
    expect(res.perSet[0].weight).toBe(50);
  });

  it("isSup:true reads supName/supSubName/supMachine/supUnit/sup", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({
        supName: "Crucifixo", supSubName: "Voador", supMachine: "Technogym", supUnit: "kg",
        sup: [makeSet({ weight: 20, reps: 12, repsDone: 12 })]
      })] })
    ];
    const res = avgAcrossMachines(sessions, "Voador", { isSup: true });
    expect(res.machines).toEqual(["Technogym"]);
    expect(res.perSet).toEqual([{ weight: 20, reps: 12, repsDone: 12 }]);
    // subName-style override means matching by the base supName no longer finds it
    expect(avgAcrossMachines(sessions, "Crucifixo", { isSup: true })).toBeNull();
  });
});
