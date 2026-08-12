// Phase 5.2 verification: proves the day view's recent-window cache produces the
// same domain outputs as the old full-history cache for exercises whose relevant
// history falls inside RECENT_WINDOW_DAYS, and documents (rather than hides) the
// accepted tradeoff for exercises whose only history predates the window.
//
// This mirrors features/day/session-io.js's own boundary exactly: repo.fetchSessionsSince
// uses `date >= cutoff`, and recentCutoff() computes cutoff = today - RECENT_WINDOW_DAYS
// days via the same formatDate() used here.
import { describe, it, expect } from "vitest";
import { prevLoadData, exerciseTopHistory, bestWeightEver, buildSessionsByName } from "../src/domain/history.js";
import { suggestLoads } from "../src/domain/suggestion.js";
import { autoregCfg } from "../src/domain/autoreg.js";
import { formatDate } from "../src/domain/dates.js";
import { RECENT_WINDOW_DAYS } from "../src/core/config.js";
import { makeSet, makeEntry, makeSession } from "./fixtures.js";

function daysAgo(n){
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

const CUTOFF = daysAgo(RECENT_WINDOW_DAYS);
const cfg = autoregCfg("mod");
const ctx = { currentKey: null, machineFilter: false, execOrder: false, cfg };
const suggestOpts = { ...ctx, muscle: null, profileActive: false, profile: null };

function sessionsFor(sessions, name){
  return buildSessionsByName(sessions).get(name) || [];
}

describe("Phase 5.2 — recent window vs full-history parity", () => {
  // Fully inside the window: last trained recently, and its ONLY history is recent.
  const agachRecent = makeSession({
    date: daysAgo(30), dayKey: 0,
    exercises: [makeEntry({ name: "Agachamento", main: [makeSet({ done: true, weight: 100, repsDone: 5 })] })]
  });
  // Exactly on the cutoff boundary — fetchSessionsSince's `>=` means this must be included.
  const agachOnBoundary = makeSession({
    date: CUTOFF, dayKey: 1,
    exercises: [makeEntry({ name: "Agachamento", main: [makeSet({ done: true, weight: 95, repsDone: 6 })] })]
  });
  // Shares its date with a different exercise's session (different dayKey) — makeup-session case.
  const agachSharedDate = makeSession({
    date: daysAgo(2), dayKey: 4,
    exercises: [makeEntry({ name: "Agachamento", main: [makeSet({ done: true, weight: 102, repsDone: 5 })] })]
  });

  // A superset name, fully inside the window.
  const supersetInWindow = makeSession({
    date: daysAgo(10), dayKey: 2,
    exercises: [makeEntry({
      name: "Supino Reto", main: [makeSet({ done: true, weight: 82, repsDone: 8 })],
      supName: "Tríceps Testa", sup: [makeSet({ done: true, weight: 25, repsDone: 12 })]
    })]
  });

  // A machine variant, fully inside the window.
  const machineInWindow = makeSession({
    date: daysAgo(5), dayKey: 3,
    exercises: [makeEntry({ name: "Leg Press", machine: "Máquina A", main: [makeSet({ done: true, weight: 160, repsDone: 6 })] })]
  });

  // Shares its date with agachSharedDate (different dayKey, different exercise).
  const supinoSharedDate = makeSession({
    date: daysAgo(2), dayKey: 5,
    exercises: [makeEntry({ name: "Supino Reto", main: [makeSet({ done: true, weight: 83, repsDone: 8 })] })]
  });

  // "Supino Reto" also has an all-time PR that predates the window entirely —
  // this is the exercise used to prove bestWeightEver needs ensureSessionsLoaded("ALL").
  const supinoOldPR = makeSession({
    date: daysAgo(RECENT_WINDOW_DAYS + 200), dayKey: 0,
    exercises: [makeEntry({ name: "Supino Reto", main: [makeSet({ done: true, weight: 120, repsDone: 5 })] })]
  });

  // "Leg Press" on a different, untagged machine, trained only just outside the window.
  const legPressJustOutside = makeSession({
    date: daysAgo(RECENT_WINDOW_DAYS + 1), dayKey: 6,
    exercises: [makeEntry({ name: "Leg Press", machine: "Máquina B", main: [makeSet({ done: true, weight: 170, repsDone: 5 })] })]
  });

  const fullHistory = [
    agachRecent, agachOnBoundary, agachSharedDate,
    supersetInWindow, machineInWindow, supinoSharedDate,
    supinoOldPR, legPressJustOutside
  ];
  // What repo.fetchSessionsSince(uid, CUTOFF) actually returns: date >= CUTOFF.
  const recentWindow = fullHistory.filter(s => s.date >= CUTOFF);

  it("the recent-window subset excludes exactly the two out-of-window sessions", () => {
    expect(recentWindow).not.toContain(supinoOldPR);
    expect(recentWindow).not.toContain(legPressJustOutside);
    expect(recentWindow).toContain(agachOnBoundary); // boundary date itself is included (>=)
    expect(recentWindow.length).toBe(fullHistory.length - 2);
  });

  describe("in-window exercises: full array vs recent-window subset are identical", () => {
    it("prevLoadData — Agachamento", () => {
      const full = prevLoadData(sessionsFor(fullHistory, "Agachamento"), "Agachamento", undefined, ctx);
      const win = prevLoadData(sessionsFor(recentWindow, "Agachamento"), "Agachamento", undefined, ctx);
      expect(win).toEqual(full);
      expect(full).not.toBeNull();
    });

    it("prevLoadData — superset name (Tríceps Testa)", () => {
      const full = prevLoadData(sessionsFor(fullHistory, "Tríceps Testa"), "Tríceps Testa", undefined, ctx);
      const win = prevLoadData(sessionsFor(recentWindow, "Tríceps Testa"), "Tríceps Testa", undefined, ctx);
      expect(win).toEqual(full);
      expect(full).not.toBeNull();
    });

    it("prevLoadData — machine variant (Leg Press @ Máquina A, filtered)", () => {
      const mCtx = { ...ctx, machineFilter: true };
      const full = prevLoadData(sessionsFor(fullHistory, "Leg Press"), "Leg Press", "Máquina A", mCtx);
      const win = prevLoadData(sessionsFor(recentWindow, "Leg Press"), "Leg Press", "Máquina A", mCtx);
      expect(win).toEqual(full);
      expect(full).not.toBeNull();
    });

    it("suggestLoads — Agachamento", () => {
      const full = suggestLoads(sessionsFor(fullHistory, "Agachamento"), "Agachamento", "kg", undefined, suggestOpts);
      const win = suggestLoads(sessionsFor(recentWindow, "Agachamento"), "Agachamento", "kg", undefined, suggestOpts);
      expect(win).toEqual(full);
      expect(full).not.toBeNull();
    });

    it("exerciseTopHistory — Agachamento, including the boundary-date point", () => {
      const full = exerciseTopHistory(sessionsFor(fullHistory, "Agachamento"), "Agachamento", ctx);
      const win = exerciseTopHistory(sessionsFor(recentWindow, "Agachamento"), "Agachamento", ctx);
      expect(win).toEqual(full);
      expect(full.some(h => h.date === CUTOFF)).toBe(true);
    });

    it("bestWeightEver — Agachamento (its true PR is inside the window)", () => {
      const full = bestWeightEver(sessionsFor(fullHistory, "Agachamento"), "Agachamento", undefined, ctx);
      const win = bestWeightEver(sessionsFor(recentWindow, "Agachamento"), "Agachamento", undefined, ctx);
      expect(win).toBe(full);
      expect(full).toBe(102);
    });

    it("shared-date sessions (same date, different dayKey/exercise) don't collide", () => {
      const agachHist = exerciseTopHistory(sessionsFor(fullHistory, "Agachamento"), "Agachamento", ctx);
      const supinoHist = exerciseTopHistory(sessionsFor(fullHistory, "Supino Reto"), "Supino Reto", ctx);
      expect(agachHist.find(h => h.date === daysAgo(2))?.top).toBe(102);
      expect(supinoHist.find(h => h.date === daysAgo(2))?.top).toBe(83);
    });
  });

  describe("the accepted tradeoff: bestWeightEver needs ensureSessionsLoaded(\"ALL\")", () => {
    it("full history finds the true all-time PR for Supino Reto (120, logged before the window)", () => {
      const full = bestWeightEver(sessionsFor(fullHistory, "Supino Reto"), "Supino Reto", undefined, ctx);
      expect(full).toBe(120);
    });

    it("the recent window alone gets it WRONG, proving why the widen is required", () => {
      const windowOnly = bestWeightEver(sessionsFor(recentWindow, "Supino Reto"), "Supino Reto", undefined, ctx);
      const full = bestWeightEver(sessionsFor(fullHistory, "Supino Reto"), "Supino Reto", undefined, ctx);
      expect(windowOnly).not.toBe(full);
      expect(windowOnly).toBe(83); // best found within the window (supersetInWindow's sibling weight is irrelevant; this is supinoSharedDate)
    });
  });

  describe("just-outside-window exercise: the accepted self-healing tradeoff", () => {
    it("prevLoadData/suggestLoads over the window alone are empty for a machine variant trained only just outside it", () => {
      const mCtx = { ...ctx, machineFilter: true };
      const fullPrev = prevLoadData(sessionsFor(fullHistory, "Leg Press"), "Leg Press", "Máquina B", mCtx);
      const winPrev = prevLoadData(sessionsFor(recentWindow, "Leg Press"), "Leg Press", "Máquina B", mCtx);
      expect(fullPrev).not.toBeNull(); // full history still finds it...
      expect(winPrev).toBeNull();      // ...but the window alone comes back empty (self-heals once retrained)

      const fullSug = suggestLoads(sessionsFor(fullHistory, "Leg Press"), "Leg Press", "kg", "Máquina B", { ...suggestOpts, ...mCtx });
      const winSug = suggestLoads(sessionsFor(recentWindow, "Leg Press"), "Leg Press", "kg", "Máquina B", { ...suggestOpts, ...mCtx });
      expect(fullSug).not.toBeNull();
      expect(winSug).toBeNull();
    });
  });
});
