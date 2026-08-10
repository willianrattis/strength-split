import { describe, it, expect } from "vitest";
import { computeGamification, gamifTitle, gamifXpForLevel, BADGE_IDS } from "../src/domain/gamification.js";
import { makeEntry, makeSession } from "./fixtures.js";

const set = (over = {}) => ({ done: false, reps: 10, weight: null, repsDone: null, ...over });

describe("computeGamification — empty input", () => {
  it("no sessions -> level 1, Novato, 0 XP, all badges unearned in BADGE_IDS order", () => {
    const g = computeGamification([], null, new Date(2026, 0, 5));
    expect(g.level).toBe(1);
    expect(g.title).toBe("Novato");
    expect(g.totalXP).toBe(0);
    expect(g.badges.map(b => b.id)).toEqual(BADGE_IDS);
    expect(g.badges.every(b => b.earned === false)).toBe(true);
  });

  it("sessions with no date/exercises are skipped without throwing", () => {
    const sessions = [{ foo: "bar" }, { date: "2026-01-01" /* no exercises */ }];
    expect(() => computeGamification(sessions, null, new Date(2026, 0, 5))).not.toThrow();
    const g = computeGamification(sessions, null, new Date(2026, 0, 5));
    expect(g.level).toBe(1);
  });
});

describe("computeGamification — daily scoring", () => {
  it("a fully completed day scores 100 + 25", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [set({ done: true })] })
    ] })];
    const g = computeGamification(sessions, "2026-01-01", new Date(2026, 0, 1));
    expect(g.totalXP).toBe(125);
    expect(g.trainedDays).toBe(1);
    expect(g.missedDays).toBe(0);
  });

  it("a half-completed day scores round(100*ratio) with no bonus", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [set({ done: true }), set({ done: false }), set({ done: false }), set({ done: false }) ] })
    ] })];
    const g = computeGamification(sessions, "2026-01-01", new Date(2026, 0, 1));
    expect(g.totalXP).toBe(25); // round(100 * 1/4)
  });

  it("a day with zero done sets applies -20", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [set({ done: false })] })
    ] })];
    const g = computeGamification(sessions, "2026-01-01", new Date(2026, 0, 1));
    expect(g.totalXP).toBe(0); // max(0, 0 - 20)
    expect(g.missedDays).toBe(1);
  });

  it("a day with no entry at all also applies -20, and totalXP never drops below 0", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [set({ done: true })] })
    ] })];
    // Walk 2026-01-01 (full day, +125) through 2026-01-02 (no session at all, -20).
    const g = computeGamification(sessions, "2026-01-01", new Date(2026, 0, 2));
    expect(g.totalXP).toBe(105);
    expect(g.trainedDays).toBe(1);
    expect(g.missedDays).toBe(1);
  });
});

describe("computeGamification — level/title", () => {
  it("gamifXpForLevel matches the formula", () => {
    expect(gamifXpForLevel(2)).toBe(Math.round(100 * Math.pow(2, 1.5)));
    expect(gamifXpForLevel(10)).toBe(Math.round(100 * Math.pow(10, 1.5)));
  });

  it("level derivation caps at 50, and xpForNextLevel is 0 at the cap", () => {
    // 300 consecutive fully-completed days comfortably clears level 50's XP requirement.
    const sessions = Array.from({ length: 300 }, (_, i) => {
      const d = new Date(2026, 0, 1 + i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return makeSession({ date, exercises: [makeEntry({ name: "Supino", main: [set({ done: true })] })] });
    });
    const today = new Date(2026, 0, 300);
    const g = computeGamification(sessions, "2026-01-01", today);
    expect(g.level).toBe(50);
    expect(g.xpForNextLevel).toBe(0);
  });

  it("gamifTitle boundaries", () => {
    expect(gamifTitle(5)).toBe("Novato");
    expect(gamifTitle(6)).toBe("Iniciante");
    expect(gamifTitle(46)).toBe("Elite");
  });
});

describe("computeGamification — startDate window", () => {
  it("a valid startDate restricts the walk", () => {
    const sessions = ["01", "02", "03", "04", "05"].map(d => makeSession({
      date: `2026-01-${d}`, exercises: [makeEntry({ name: "Supino", main: [set({ done: true })] })]
    }));
    const g = computeGamification(sessions, "2026-01-03", new Date(2026, 0, 5));
    expect(g.trainedDays).toBe(3); // only 01-03, 01-04, 01-05
  });

  it("an invalid startDate falls back to the earliest session date", () => {
    const sessions = ["01", "02", "03", "04", "05"].map(d => makeSession({
      date: `2026-01-${d}`, exercises: [makeEntry({ name: "Supino", main: [set({ done: true })] })]
    }));
    const g = computeGamification(sessions, "not-a-date", new Date(2026, 0, 5));
    expect(g.trainedDays).toBe(5);
  });
});

describe("computeGamification — badges", () => {
  it("7 consecutive trained days earns consistencia, dated on the 7th day", () => {
    const dates = ["01", "02", "03", "04", "05", "06", "07"];
    const sessions = dates.map(d => makeSession({
      date: `2026-01-${d}`, exercises: [makeEntry({ name: "Supino", main: [set({ done: true })] })]
    }));
    const g = computeGamification(sessions, "2026-01-01", new Date(2026, 0, 7));
    const badge = g.badges.find(b => b.id === "consistencia");
    expect(badge).toEqual({ id: "consistencia", earned: true, earnedDate: "2026-01-07" });
  });

  it("a day with volume >= 1000 earns levantador, using repsDone when present", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [set({ done: true, weight: 100, repsDone: 10, reps: 8 })] })
    ] })];
    const g = computeGamification(sessions, "2026-01-01", new Date(2026, 0, 1));
    const badge = g.badges.find(b => b.id === "levantador");
    expect(badge.earned).toBe(true);
  });

  it("volume falls back to reps when repsDone is absent", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [set({ done: true, weight: 100, repsDone: null, reps: 10 })] })
    ] })];
    const g = computeGamification(sessions, "2026-01-01", new Date(2026, 0, 1));
    const badge = g.badges.find(b => b.id === "levantador");
    expect(badge.earned).toBe(true);
  });

  it("firstSetAt before 06:00 local earns madrugador", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", firstSetAt: "2026-01-01T05:00:00", main: [set({ done: true })] })
    ] })];
    const g = computeGamification(sessions, "2026-01-01", new Date(2026, 0, 1));
    const badge = g.badges.find(b => b.id === "madrugador");
    expect(badge).toEqual({ id: "madrugador", earned: true, earnedDate: "2026-01-01" });
  });

  it("day keys are local: a late-evening firstSetAt does not earn madrugador", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", firstSetAt: "2026-01-01T23:30:00", main: [set({ done: true })] })
    ] })];
    const g = computeGamification(sessions, "2026-01-01", new Date(2026, 0, 1));
    const badge = g.badges.find(b => b.id === "madrugador");
    expect(badge.earned).toBe(false);
  });
});
