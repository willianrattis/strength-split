import { describe, it, expect } from "vitest";
import {
  REST_MAX_SEC,
  parseRest,
  formatRest,
  effectiveRestSec,
  restUnitComplete,
  remainingSec,
} from "../src/domain/rest-timer.js";

describe("parseRest", () => {
  it("parses M:SS / MM:SS", () => {
    expect(parseRest("2:00")).toBe(120);
    expect(parseRest("0:45")).toBe(45);
  });

  it("parses a bare integer as seconds", () => {
    expect(parseRest("90")).toBe(90);
    expect(parseRest(90)).toBe(90);
  });

  it("clamps an over-max value", () => {
    expect(parseRest("10:00")).toBe(REST_MAX_SEC);
  });

  it("returns null for empty/nullish input", () => {
    expect(parseRest("")).toBeNull();
    expect(parseRest(null)).toBeNull();
    expect(parseRest(undefined)).toBeNull();
  });

  it("returns null for unparseable or invalid input", () => {
    expect(parseRest("abc")).toBeNull();
    expect(parseRest("-5")).toBeNull();
    expect(parseRest("1:60")).toBeNull();
    expect(parseRest("1:5")).toBeNull();
    expect(parseRest("1:2:3")).toBeNull();
  });
});

describe("formatRest", () => {
  it("round-trips every parseRest case that produced a number", () => {
    expect(formatRest(parseRest("2:00"))).toBe("2:00");
    expect(formatRest(parseRest("0:45"))).toBe("0:45");
    expect(formatRest(parseRest("90"))).toBe("1:30");
    expect(formatRest(parseRest(90))).toBe("1:30");
    expect(formatRest(parseRest("10:00"))).toBe("9:59");
  });

  it("formats zero-padded seconds with no leading zero on minutes", () => {
    expect(formatRest(0)).toBe("0:00");
    expect(formatRest(5)).toBe("0:05");
    expect(formatRest(90)).toBe("1:30");
    expect(formatRest(599)).toBe("9:59");
  });

  it("returns 0:00 for non-finite or negative input", () => {
    expect(formatRest(NaN)).toBe("0:00");
    expect(formatRest(-1)).toBe("0:00");
  });
});

describe("effectiveRestSec", () => {
  it("uses the per-exercise override when present", () => {
    expect(effectiveRestSec({ restSec: 45 }, 90)).toBe(45);
  });

  it("an explicit 0 override beats a non-zero default", () => {
    expect(effectiveRestSec({ restSec: 0 }, 90)).toBe(0);
  });

  it("falls back to the default when there is no override", () => {
    expect(effectiveRestSec({}, 90)).toBe(90);
    expect(effectiveRestSec(null, 90)).toBe(90);
  });

  it("returns 0 when neither override nor default is usable", () => {
    expect(effectiveRestSec({}, undefined)).toBe(0);
    expect(effectiveRestSec(null, null)).toBe(0);
  });

  it("clamps an over-max override", () => {
    expect(effectiveRestSec({ restSec: 9999 }, 90)).toBe(REST_MAX_SEC);
  });
});

describe("restUnitComplete", () => {
  it("main-only: true when the set is done", () => {
    expect(restUnitComplete({ main: [{ done: true }] }, 0)).toBe(true);
  });

  it("main-only: false when the set is not done", () => {
    expect(restUnitComplete({ main: [{ done: false }] }, 0)).toBe(false);
  });

  it("superset with only main done is FALSE — rest waits for the pair", () => {
    expect(
      restUnitComplete({ main: [{ done: true }], sup: [{ done: false }] }, 0)
    ).toBe(false);
  });

  it("superset with both done is true", () => {
    expect(
      restUnitComplete({ main: [{ done: true }], sup: [{ done: true }] }, 0)
    ).toBe(true);
  });

  it("falls back to main-only when the sup array is shorter at that index", () => {
    expect(
      restUnitComplete({ main: [{ done: true }, { done: true }], sup: [{ done: true }] }, 1)
    ).toBe(true);
  });

  it("returns false without throwing for null ex, null main, or an out-of-range index", () => {
    expect(restUnitComplete(null, 0)).toBe(false);
    expect(restUnitComplete({ main: null }, 0)).toBe(false);
    expect(restUnitComplete({ main: [{ done: true }] }, 5)).toBe(false);
  });
});

describe("remainingSec", () => {
  it("returns the exact whole-second difference", () => {
    expect(remainingSec(10000, 5000)).toBe(5);
  });

  it("ceils a mid-second remainder up", () => {
    expect(remainingSec(10500, 9000)).toBe(2);
  });

  it("floors at 0 once the deadline has passed", () => {
    expect(remainingSec(1000, 5000)).toBe(0);
  });

  it("returns 0 for non-finite input", () => {
    expect(remainingSec(NaN, 1000)).toBe(0);
    expect(remainingSec(1000, NaN)).toBe(0);
    expect(remainingSec(Infinity, 1000)).toBe(0);
  });
});
