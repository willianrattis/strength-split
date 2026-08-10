import { describe, it, expect } from "vitest";
import { profileAge } from "../src/domain/profile.js";

describe("profileAge", () => {
  it("returns null for null/empty/malformed birthDate", () => {
    expect(profileAge(null, new Date(2026, 5, 15))).toBeNull();
    expect(profileAge("", new Date(2026, 5, 15))).toBeNull();
    expect(profileAge("abc", new Date(2026, 5, 15))).toBeNull();
    expect(profileAge("2000", new Date(2026, 5, 15))).toBeNull();
  });

  it("birthday already passed this year: age is the plain year diff", () => {
    // now = 2026-06-15, birthday 2000-01-01 already happened this year
    expect(profileAge("2000-01-01", new Date(2026, 5, 15))).toBe(26);
  });

  it("birthday later this year: age is year diff minus 1", () => {
    // now = 2026-06-15, birthday 2000-12-25 hasn't happened yet
    expect(profileAge("2000-12-25", new Date(2026, 5, 15))).toBe(25);
  });

  it("birthday exactly today counts as already passed", () => {
    // now = 2026-06-15, birthday 2000-06-15 (today) -> full year counted, no decrement
    expect(profileAge("2000-06-15", new Date(2026, 5, 15))).toBe(26);
  });

  it("birthday tomorrow: one year less", () => {
    // now = 2026-06-15, birthday 2000-06-16 (tomorrow)
    expect(profileAge("2000-06-16", new Date(2026, 5, 15))).toBe(25);
  });

  it("returns null when the result is below 10", () => {
    expect(profileAge("2020-01-01", new Date(2026, 0, 1))).toBeNull(); // age 6
  });

  it("returns null when the result is above 99", () => {
    expect(profileAge("1900-01-01", new Date(2026, 0, 1))).toBeNull(); // age 126
  });
});
