import { describe, it, expect, afterEach, vi } from "vitest";
import { formatDate, getWeekMonday, dateForDay, sessionId, shortDate, todayStr, fmtDateBR, todayWeekdayIdx } from "../src/domain/dates.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatDate", () => {
  it("zero-pads month and day", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDate(new Date(2026, 10, 3))).toBe("2026-11-03");
  });
});

describe("getWeekMonday", () => {
  it("returns the Monday of the current week for a mid-week date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12)); // Monday 2026-01-05
    expect(formatDate(getWeekMonday(0))).toBe("2026-01-05");
  });

  it("Sunday maps back to the previous Monday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 4, 12)); // Sunday 2026-01-04
    expect(formatDate(getWeekMonday(0))).toBe("2025-12-29");
  });

  it("offsets -1 and +1 shift by exactly 7 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12)); // Monday 2026-01-05
    expect(formatDate(getWeekMonday(-1))).toBe("2025-12-29");
    expect(formatDate(getWeekMonday(1))).toBe("2026-01-12");
  });
});

describe("dateForDay", () => {
  it("returns Monday..Friday of the current week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12)); // Monday 2026-01-05
    expect(dateForDay(0, 0)).toBe("2026-01-05");
    expect(dateForDay(1, 0)).toBe("2026-01-06");
    expect(dateForDay(2, 0)).toBe("2026-01-07");
    expect(dateForDay(3, 0)).toBe("2026-01-08");
    expect(dateForDay(4, 0)).toBe("2026-01-09");
  });

  it("handles a week straddling a year boundary (31 Dec -> 1 Jan)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 11, 31, 12)); // Wednesday 2025-12-31, week Mon 2025-12-29 .. Fri 2026-01-02
    expect(dateForDay(0, 0)).toBe("2025-12-29");
    expect(dateForDay(4, 0)).toBe("2026-01-02");
  });

  it("handles a week straddling a month boundary (30 Apr -> 1 May)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 29, 12)); // Wednesday 2026-04-29, week Mon 2026-04-27 .. Fri 2026-05-01
    expect(dateForDay(0, 0)).toBe("2026-04-27");
    expect(dateForDay(4, 0)).toBe("2026-05-01");
  });
});

describe("sessionId", () => {
  it("joins date and dayKey with an underscore", () => {
    expect(sessionId("2026-08-10", 0)).toBe("2026-08-10_0");
  });
});

describe("shortDate", () => {
  it("omits the year for the current year", () => {
    expect(shortDate("2026-03-15", new Date(2026, 0, 1))).toBe("15/03");
  });

  it("includes a 2-digit year for a different year", () => {
    expect(shortDate("2025-03-15", new Date(2026, 0, 1))).toBe("15/03/25");
  });
});

describe("todayStr", () => {
  it("returns YYYY-MM-DD with zero padding, matching formatDate(new Date())", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 5, 9)); // 2026-03-05
    expect(todayStr()).toBe("2026-03-05");
    expect(todayStr()).toBe(formatDate(new Date()));
  });
});

describe("todayWeekdayIdx", () => {
  it("maps Monday to 0", () => {
    expect(todayWeekdayIdx(new Date(2026, 0, 5))).toBe(0); // Monday 2026-01-05
  });

  it("maps Saturday to 5", () => {
    expect(todayWeekdayIdx(new Date(2026, 0, 10))).toBe(5); // Saturday 2026-01-10
  });

  it("maps Sunday to 6", () => {
    expect(todayWeekdayIdx(new Date(2026, 0, 4))).toBe(6); // Sunday 2026-01-04
  });
});

describe("fmtDateBR", () => {
  it("rewrites an ISO date as D/M (no re-padding of its own)", () => {
    expect(fmtDateBR("2026-08-05")).toBe("05/08");
  });

  it("passes single-digit day/month straight through, un-padded", () => {
    expect(fmtDateBR("2026-8-5")).toBe("5/8");
  });

  it("current behaviour on malformed/empty input: \"undefined/undefined\"", () => {
    expect(fmtDateBR("")).toBe("undefined/undefined");
    expect(fmtDateBR("20260805")).toBe("undefined/undefined");
  });
});
