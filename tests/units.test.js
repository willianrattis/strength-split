import { describe, it, expect } from "vitest";
import { convertWeight, roundForDisplay, LB_TO_KG, PLATE_KG } from "../src/domain/units.js";

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

  it("round-trips across all three units", () => {
    const kg = 60;
    const lb = convertWeight(kg, "kg", "lb");
    expect(lb).toBeCloseTo(kg / LB_TO_KG, 10);
    expect(convertWeight(lb, "lb", "kg")).toBeCloseTo(kg, 10);

    const placas = convertWeight(kg, "kg", "placas");
    expect(placas).toBeCloseTo(kg / PLATE_KG, 10);
    expect(convertWeight(placas, "placas", "kg")).toBeCloseTo(kg, 10);

    const placasToLb = convertWeight(placas, "placas", "lb");
    expect(placasToLb).toBeCloseTo(placas * PLATE_KG / LB_TO_KG, 10);
    expect(convertWeight(placasToLb, "lb", "placas")).toBeCloseTo(placas, 10);
  });

  it("returns null for a non-numeric input", () => {
    expect(convertWeight(null, "kg", "lb")).toBeNull();
    expect(convertWeight(undefined, "kg", "lb")).toBeNull();
    expect(convertWeight(NaN, "kg", "lb")).toBeNull();
    expect(convertWeight("60", "kg", "lb")).toBeNull();
  });

  it("returns null for an unknown unit string", () => {
    expect(convertWeight(60, "stones", "kg")).toBeNull();
    expect(convertWeight(60, "kg", "stones")).toBeNull();
  });
});

describe("roundForDisplay", () => {
  it("snaps kg/lb to the nearest half unit", () => {
    expect(roundForDisplay(46.5456, "kg")).toBe(46.5);
    expect(roundForDisplay(102.6156, "lb")).toBe(102.5);
  });

  it("snaps placas to the nearest whole plate", () => {
    expect(roundForDisplay(6.5, "placas")).toBe(7);
  });

  it("returns null for a non-finite input", () => {
    expect(roundForDisplay(null, "kg")).toBeNull();
    expect(roundForDisplay(NaN, "kg")).toBeNull();
    expect(roundForDisplay(Infinity, "kg")).toBeNull();
  });
});
