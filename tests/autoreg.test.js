import { describe, it, expect } from "vitest";
import { autoregCfg, snapLoad, projectLoad, orderFactor, AUTOREG_PRESETS } from "../src/domain/autoreg.js";

describe("autoregCfg", () => {
  it("returns the matching preset", () => {
    expect(autoregCfg("suave")).toEqual(AUTOREG_PRESETS.suave);
    expect(autoregCfg("mod")).toEqual(AUTOREG_PRESETS.mod);
    expect(autoregCfg("agr")).toEqual(AUTOREG_PRESETS.agr);
  });

  it("falls back to mod for unknown or undefined sensitivity", () => {
    expect(autoregCfg("bogus")).toEqual(AUTOREG_PRESETS.mod);
    expect(autoregCfg(undefined)).toEqual(AUTOREG_PRESETS.mod);
  });
});

describe("snapLoad — kg", () => {
  it("barra snaps to 2kg steps with a floor of 2", () => {
    expect(snapLoad("barra", "kg", 2.5, 53, false)).toBe(54);
    expect(snapLoad("barra", "kg", 2.5, 0.5, false)).toBe(2);
  });

  it("halter snaps to the dumbbell ladder below 40", () => {
    expect(snapLoad("halter", "kg", 2.5, 13, false)).toBe(12);
    expect(snapLoad("halter", "kg", 2.5, 13, true)).toBe(14);
  });

  it("halter snaps to 2kg steps above 40", () => {
    expect(snapLoad("halter", "kg", 2.5, 44.5, false)).toBe(44);
    expect(snapLoad("halter", "kg", 2.5, 44.5, true)).toBe(46);
  });

  it("outro snaps to 2.5kg steps", () => {
    expect(snapLoad("outro", "kg", 2.5, 13, false)).toBe(12.5);
    expect(snapLoad("outro", "kg", 2.5, 13, true)).toBe(15);
  });
});

describe("snapLoad — other units", () => {
  it("placas returns an integer with a floor of 1", () => {
    expect(snapLoad("outro", "placas", 1, 0.4, false)).toBe(1);
    expect(snapLoad("outro", "placas", 1, 2.6, false)).toBe(3);
  });

  it("lb uses the passed step", () => {
    expect(snapLoad("outro", "lb", 5, 12, false)).toBe(10);
    expect(snapLoad("outro", "lb", 5, 12, true)).toBe(15);
  });
});

describe("projectLoad", () => {
  const mod = autoregCfg("mod");

  it("returns w unchanged when within tol", () => {
    expect(projectLoad(60, 9, 10, "barra", "kg", 2.5, 0, mod)).toBe(60);
  });

  it("returns w unchanged when repsDone is null", () => {
    expect(projectLoad(60, null, 10, "barra", "kg", 2.5, 0, mod)).toBe(60);
  });

  it("returns null when w is not a number", () => {
    expect(projectLoad("60", 10, 10, "barra", "kg", 2.5, 0, mod)).toBeNull();
    expect(projectLoad(undefined, 10, 10, "barra", "kg", 2.5, 0, mod)).toBeNull();
  });

  it("increases when reps beat target", () => {
    const out = projectLoad(60, 12, 10, "barra", "kg", 2.5, 0, mod);
    expect(out).toBeGreaterThan(60);
  });

  it("decreases when reps miss target", () => {
    const out = projectLoad(60, 6, 10, "barra", "kg", 2.5, 0, mod);
    expect(out).toBeLessThan(60);
  });

  it("never drops below w when the fatigue guard applies", () => {
    // base (64.5) >= w (60), but heavy fatigue decay would otherwise push ideal under w.
    const out = projectLoad(60, 13, 10, "barra", "kg", 2.5, 10, mod);
    expect(out).toBeGreaterThanOrEqual(60);
    expect(out).toBe(60);
  });
});

describe("orderFactor", () => {
  const mod = autoregCfg("mod");

  it("is 1 for shift 0", () => {
    expect(orderFactor(0, mod)).toBe(1);
  });

  it("moves in opposite directions for negative vs positive shift", () => {
    expect(orderFactor(-1, mod)).toBeLessThan(1);
    expect(orderFactor(1, mod)).toBeGreaterThan(1);
  });
});
