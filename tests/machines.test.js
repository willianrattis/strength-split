import { describe, it, expect } from "vitest";
import { lastMachineFor, usedMachinesRanked } from "../src/domain/machines.js";
import { makeEntry, makeSession } from "./fixtures.js";

describe("lastMachineFor", () => {
  it("returns null for null/empty sessions", () => {
    expect(lastMachineFor(null, "X")).toBeNull();
    expect(lastMachineFor([], "X")).toBeNull();
  });

  it("picks the most recent session by date, not array position", () => {
    // Deliberately out of date order: oldest, newest, middle.
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Leg press", machine: "Old" })] }),
      makeSession({ date: "2026-01-10", exercises: [makeEntry({ name: "Leg press", machine: "New" })] }),
      makeSession({ date: "2026-01-05", exercises: [makeEntry({ name: "Leg press", machine: "Middle" })] })
    ];
    expect(lastMachineFor(sessions, "Leg press")).toBe("New");
  });

  it("skips a null machine and falls through to an older session that has one", () => {
    const sessions = [
      makeSession({ date: "2026-01-10", exercises: [makeEntry({ name: "Leg press", machine: null })] }),
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Leg press", machine: "Old" })] })
    ];
    expect(lastMachineFor(sessions, "Leg press")).toBe("Old");
  });

  it("subName overrides name for matching", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "X", subName: "Y", machine: "M1" })
    ] })];
    expect(lastMachineFor(sessions, "Y")).toBe("M1");
    expect(lastMachineFor(sessions, "X")).toBeNull();
  });

  it("isSup:true matches via supSubName over supName and returns supMachine", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ supName: "A", supSubName: "B", supMachine: "M1" })
    ] })];
    expect(lastMachineFor(sessions, "B", true)).toBe("M1");
    expect(lastMachineFor(sessions, "A", true)).toBeNull();
  });

  it("returns null with no match", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "X", machine: "M1" })] })];
    expect(lastMachineFor(sessions, "Z")).toBeNull();
  });
});

describe("usedMachinesRanked", () => {
  it("returns [] for null/empty sessions", () => {
    expect(usedMachinesRanked(null)).toEqual([]);
    expect(usedMachinesRanked([])).toEqual([]);
  });

  it("ranks by frequency descending", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ machine: "A" })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ machine: "A" })] }),
      makeSession({ date: "2026-01-03", exercises: [makeEntry({ machine: "A" })] }),
      makeSession({ date: "2026-01-04", exercises: [makeEntry({ machine: "B" })] })
    ];
    expect(usedMachinesRanked(sessions)).toEqual(["A", "B"]);
  });

  it("dedupes via normMachine, keeping the display form of the first one seen", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ machine: "Máquina 3" })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ machine: " maquina 3 " })] })
    ];
    const ranked = usedMachinesRanked(sessions);
    expect(ranked).toEqual(["Máquina 3"]);
  });

  it("counts both machine and supMachine", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ machine: "A", supMachine: "A" })
    ] })];
    // Same normalized machine used on both sides of one entry -> counted twice.
    const ranked = usedMachinesRanked(sessions);
    expect(ranked).toEqual(["A"]);
  });

  it("skips null/empty machines", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ machine: null, supMachine: "" })
    ] })];
    expect(usedMachinesRanked(sessions)).toEqual([]);
  });
});
