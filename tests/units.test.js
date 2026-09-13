import { describe, it, expect } from "vitest";
import { convertWeight, LB_TO_KG } from "../src/domain/units.js";

describe("convertWeight", () => {
  it("returns the same value when from and to are identical", () => {
    expect(convertWeight(100, "kg", "kg")).toBe(100);
    expect(convertWeight(50, "lb", "lb")).toBe(50);
  });

  it("converts lb to kg", () => {
    expect(convertWeight(10, "lb", "kg")).toBeCloseTo(10 * LB_TO_KG, 10);
  });

  it("round-trips kg -> lb -> kg", () => {
    const kg = 82.5;
    const lb = convertWeight(kg, "kg", "lb");
    expect(convertWeight(lb, "lb", "kg")).toBeCloseTo(kg, 10);
  });

  it("returns null for any pairing involving placas", () => {
    expect(convertWeight(4, "placas", "kg")).toBeNull();
    expect(convertWeight(4, "kg", "placas")).toBeNull();
    expect(convertWeight(4, "placas", "lb")).toBeNull();
  });

  it("returns null for a non-numeric input", () => {
    expect(convertWeight(null, "kg", "lb")).toBeNull();
    expect(convertWeight(undefined, "kg", "lb")).toBeNull();
    expect(convertWeight(NaN, "kg", "lb")).toBeNull();
    expect(convertWeight("60", "kg", "lb")).toBeNull();
  });
});
