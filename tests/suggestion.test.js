import { describe, it, expect } from "vitest";
import { suggestLoads } from "../src/domain/suggestion.js";
import { autoregCfg, projectLoad, orderFactor, snapLoad } from "../src/domain/autoreg.js";
import { makeEntry, makeSession } from "./fixtures.js";

const mod = autoregCfg("mod");

describe("suggestLoads", () => {
  it("returns null with no sessions", () => {
    expect(suggestLoads([], "Supino", "kg", undefined, { cfg: mod })).toBeNull();
  });

  it("returns null with no matching history", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Agachamento", main: [{ weight: 100, reps: 10 }] })] })];
    expect(suggestLoads(sessions, "Supino", "kg", undefined, { cfg: mod })).toBeNull();
  });

  it("happy path: projects the last session's loads forward", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [{ weight: 60, reps: 10, repsDone: 12, done: true }] })
    ] })];
    const r = suggestLoads(sessions, "Supino", "kg", undefined, { cfg: mod });
    expect(r.date).toBe("2026-01-01");
    const expected = projectLoad(60, 12, 10, "outro", "kg", 2.5, 0, mod);
    expect(r.loads).toEqual([expected]);
    expect(["↑", "↓", "↕", "→"]).toContain(r.dir);
  });

  it("dir: all-up -> ↑, all-down -> ↓, mixed -> ↕, all-hold -> →", () => {
    const up = suggestLoads(
      [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [{ weight: 60, reps: 10, repsDone: 12, done: true }] })] })],
      "Supino", "kg", undefined, { cfg: mod }
    );
    expect(up.dir).toBe("↑");

    const down = suggestLoads(
      [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [{ weight: 60, reps: 10, repsDone: 6, done: true }] })] })],
      "Supino", "kg", undefined, { cfg: mod }
    );
    expect(down.dir).toBe("↓");

    const mixed = suggestLoads(
      [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [
        { weight: 60, reps: 10, repsDone: 12, done: true },
        { weight: 60, reps: 10, repsDone: 6, done: true }
      ] })] })],
      "Supino", "kg", undefined, { cfg: mod }
    );
    expect(mixed.dir).toBe("↕");

    const hold = suggestLoads(
      [makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Supino", main: [{ weight: 60, reps: 10, repsDone: 10, done: true }] })] })],
      "Supino", "kg", undefined, { cfg: mod }
    );
    expect(hold.dir).toBe("→");
  });

  it("injury gate: holds loads verbatim with dir:'→' and limited:true", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Desenvolvimento", main: [{ weight: 40, reps: 10, repsDone: 12, done: true }] })
    ] })];
    const r = suggestLoads(sessions, "Desenvolvimento", "kg", undefined, {
      cfg: mod, muscle: "ombro", profileActive: true, profile: { injuries: { ombro: true } }
    });
    expect(r).toEqual({ loads: [40], dir: "→", date: "2026-01-01", limited: true });
  });

  it("injury gate is inert when profileActive:false", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Desenvolvimento", main: [{ weight: 40, reps: 10, repsDone: 12, done: true }] })
    ] })];
    const r = suggestLoads(sessions, "Desenvolvimento", "kg", undefined, {
      cfg: mod, muscle: "ombro", profileActive: false, profile: { injuries: { ombro: true } }
    });
    expect(r.limited).toBeUndefined();
    expect(r.loads[0]).not.toBe(40);
  });

  it("injury gate is inert when muscle is not passed", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Desenvolvimento", main: [{ weight: 40, reps: 10, repsDone: 12, done: true }] })
    ] })];
    const r = suggestLoads(sessions, "Desenvolvimento", "kg", undefined, {
      cfg: mod, profileActive: true, profile: { injuries: { ombro: true } }
    });
    expect(r.limited).toBeUndefined();
  });

  it("advanced gate: freezes every load when any numeric set missed target", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [
        { weight: 60, reps: 10, repsDone: 10, done: true },
        { weight: 70, reps: 8, repsDone: 6, done: true }
      ] })
    ] })];
    const r = suggestLoads(sessions, "Supino", "kg", undefined, {
      cfg: mod, profileActive: true, profile: { experience: "adv", injuries: {} }
    });
    expect(r.loads).toEqual([60, 70]);
    expect(r.dir).toBe("→");
  });

  it("advanced gate: normal projection applies when all sets hit target", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [{ weight: 60, reps: 10, repsDone: 12, done: true }] })
    ] })];
    const r = suggestLoads(sessions, "Supino", "kg", undefined, {
      cfg: mod, profileActive: true, profile: { experience: "adv", injuries: {} }
    });
    expect(r.dir).toBe("↑");
    expect(r.loads[0]).not.toBe(60);
  });

  it("machineFilter selects the matching variant", () => {
    const sessions = [
      makeSession({ date: "2026-01-01", exercises: [makeEntry({ name: "Leg press", machine: "Hammer", main: [{ weight: 80, reps: 10, repsDone: 10 }] })] }),
      makeSession({ date: "2026-01-02", exercises: [makeEntry({ name: "Leg press", machine: "Technogym", main: [{ weight: 90, reps: 10, repsDone: 10 }] })] })
    ];
    const filtered = suggestLoads(sessions, "Leg press", "kg", "Hammer", { cfg: mod, machineFilter: true });
    expect(filtered.date).toBe("2026-01-01");

    const unfiltered = suggestLoads(sessions, "Leg press", "kg", "Hammer", { cfg: mod, machineFilter: false });
    expect(unfiltered.date).toBe("2026-01-02");
  });

  it("order-aware baseline: an in-order session within 35 days becomes the baseline, unnormalized", () => {
    const sessions = [
      makeSession({ date: "2026-02-10", exercises: [
        makeEntry({ name: "Agachamento", firstSetAt: "2026-02-10T09:05:00", main: [{ weight: 100, reps: 10, repsDone: 10 }] }),
        makeEntry({ name: "Supino", firstSetAt: "2026-02-10T09:00:00", main: [{ weight: 60, reps: 10, repsDone: 10 }] })
      ] }),
      makeSession({ date: "2026-01-20", exercises: [
        makeEntry({ name: "Supino", firstSetAt: "2026-01-20T09:00:00", main: [{ weight: 55, reps: 10, repsDone: 10 }] })
      ] })
    ];
    const r = suggestLoads(sessions, "Supino", "kg", undefined, { cfg: mod, execOrder: true });
    expect(r.date).toBe("2026-01-20");
    expect(r.loads).toEqual([55]);
  });

  it("order-aware baseline: beyond 35 days, the out-of-order session is used with normalization", () => {
    const sessions = [
      makeSession({ date: "2026-02-10", exercises: [
        makeEntry({ name: "Agachamento", firstSetAt: "2026-02-10T09:05:00", main: [{ weight: 100, reps: 10, repsDone: 10 }] }),
        makeEntry({ name: "Supino", firstSetAt: "2026-02-10T09:00:00", main: [{ weight: 60, reps: 10, repsDone: 10 }] })
      ] }),
      makeSession({ date: "2025-12-01", exercises: [
        makeEntry({ name: "Supino", firstSetAt: "2025-12-01T09:00:00", main: [{ weight: 55, reps: 10, repsDone: 10 }] })
      ] })
    ];
    const r = suggestLoads(sessions, "Supino", "kg", undefined, { cfg: mod, execOrder: true });
    expect(r.date).toBe("2026-02-10");
    // shift for the Supino entry (executed first) is -1
    const oFactor = orderFactor(-1, mod);
    const baseW = 60 * oFactor;
    const raw = projectLoad(baseW, 10, 10, "outro", "kg", 2.5, 0, mod);
    const expected = snapLoad("outro", "kg", 2.5, raw, false);
    expect(r.loads).toEqual([expected]);
    expect(r.loads[0]).not.toBe(60);
  });

  it("preserves index alignment, mapping non-numeric weights to null", () => {
    const sessions = [makeSession({ date: "2026-01-01", exercises: [
      makeEntry({ name: "Supino", main: [
        { weight: 60, reps: 10, repsDone: 10, done: true },
        { weight: null, reps: 10, repsDone: null, done: false }
      ] })
    ] })];
    const r = suggestLoads(sessions, "Supino", "kg", undefined, { cfg: mod });
    expect(r.loads).toHaveLength(2);
    expect(r.loads[1]).toBeNull();
  });
});
