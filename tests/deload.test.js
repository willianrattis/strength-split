import { describe, it, expect } from "vitest";
import { isDeloadActive, deloadDue } from "../src/domain/deload.js";
import { autoregCfg } from "../src/domain/autoreg.js";
import { makeDay, makeExercise, makeEntry, makeSession } from "./fixtures.js";

const mod = autoregCfg("mod");

describe("isDeloadActive", () => {
  it("is false with lastDeloadDate null", () => {
    expect(isDeloadActive(null, "2026-01-05")).toBe(false);
  });

  it("is true inside 7 days", () => {
    expect(isDeloadActive("2026-01-01", "2026-01-05")).toBe(true);
  });

  it("is false at exactly 7 days and beyond", () => {
    expect(isDeloadActive("2026-01-01", "2026-01-08")).toBe(false);
    expect(isDeloadActive("2026-01-01", "2026-01-10")).toBe(false);
  });
});

function paddedSessions(n, dateFn) {
  return Array.from({ length: n }, (_, i) => makeSession({ date: dateFn(i), exercises: [] }));
}

describe("deloadDue", () => {
  it("returns {due:false} below MIN_TOTAL_SESSIONS (8)", () => {
    const sessions = paddedSessions(7, i => `2026-01-0${i + 1}`);
    const r = deloadDue(sessions, { today: "2026-01-10", days: [], lastDeloadDate: "2026-01-01", cfg: mod });
    expect(r).toEqual({ due: false });
  });

  it("weeks path: fires with the exact Portuguese reason string", () => {
    const sessions = paddedSessions(8, i => `2026-01-0${i + 1}`);
    const r = deloadDue(sessions, { today: "2026-02-10", days: [], lastDeloadDate: "2026-01-01", cfg: mod });
    expect(r).toEqual({ due: true, reason: "5 semanas sem descarga" });
  });

  it("age modulation: null->5, 42->4, 60->3 weeks threshold", () => {
    // weeksSince fixed at 4 (28 days after cycleStart); tracked:0 keeps the stalled path inert.
    const sessions = paddedSessions(8, i => `2026-01-0${i + 1}`);
    const opts = (age) => ({ today: "2026-01-29", days: [], lastDeloadDate: "2026-01-01", cfg: mod, age });

    expect(deloadDue(sessions, opts(null))).toEqual({ due: false });
    expect(deloadDue(sessions, opts(42))).toEqual({ due: true, reason: "4 semanas sem descarga" });
    expect(deloadDue(sessions, opts(60))).toEqual({ due: true, reason: "4 semanas sem descarga" });
  });

  it("stalled path: fires with the exact Portuguese reason string", () => {
    const days = [makeDay({ ex: [
      makeExercise({ name: "Ex1" }), makeExercise({ name: "Ex2" }), makeExercise({ name: "Ex3" })
    ] })];
    // Ex1, Ex2 stall (recent-3 max does not exceed the earlier-2 max); Ex3 improves.
    const weights = {
      "2026-01-01": { Ex1: 100, Ex2: 100, Ex3: 90 },
      "2026-01-02": { Ex1: 100, Ex2: 100, Ex3: 90 },
      "2026-01-03": { Ex1: 90, Ex2: 90, Ex3: 100 },
      "2026-01-04": { Ex1: 90, Ex2: 90, Ex3: 100 },
      "2026-01-05": { Ex1: 90, Ex2: 90, Ex3: 100 }
    };
    const patternSessions = Object.entries(weights).map(([date, w]) => makeSession({
      date,
      exercises: ["Ex1", "Ex2", "Ex3"].map(name => makeEntry({ name, main: [{ weight: w[name], reps: 10, repsDone: 10 }] }))
    }));
    const sessions = [...patternSessions, ...paddedSessions(3, i => `2025-12-0${i + 1}`)];
    const r = deloadDue(sessions, { today: "2026-01-06", days, lastDeloadDate: "2026-01-01", cfg: mod });
    expect(r).toEqual({ due: true, reason: "2 de 3 exercícios estagnados" });
  });

  it("weeks path takes precedence over the stalled path when both would fire", () => {
    const days = [makeDay({ ex: [
      makeExercise({ name: "Ex1" }), makeExercise({ name: "Ex2" }), makeExercise({ name: "Ex3" })
    ] })];
    const weights = {
      "2026-01-01": { Ex1: 100, Ex2: 100, Ex3: 90 },
      "2026-01-02": { Ex1: 100, Ex2: 100, Ex3: 90 },
      "2026-01-03": { Ex1: 90, Ex2: 90, Ex3: 100 },
      "2026-01-04": { Ex1: 90, Ex2: 90, Ex3: 100 },
      "2026-01-05": { Ex1: 90, Ex2: 90, Ex3: 100 }
    };
    const patternSessions = Object.entries(weights).map(([date, w]) => makeSession({
      date,
      exercises: ["Ex1", "Ex2", "Ex3"].map(name => makeEntry({ name, main: [{ weight: w[name], reps: 10, repsDone: 10 }] }))
    }));
    const sessions = [...patternSessions, ...paddedSessions(3, i => `2025-12-0${i + 1}`)];
    // today far enough past cycleStart that the weeks path also qualifies.
    const r = deloadDue(sessions, { today: "2026-03-01", days, lastDeloadDate: "2026-01-01", cfg: mod });
    expect(r.reason).toMatch(/semanas sem descarga/);
    expect(r.reason).not.toMatch(/estagnados/);
  });
});
