import { describe, it, expect } from "vitest";
import {
  setStamps,
  validGaps,
  median,
  sessionPace,
  historicPace,
  dayCounts,
  livePace,
  blendedPace,
  estimateMs,
  remainingMs,
  etaAt,
} from "../src/domain/day-plan.js";

function iso(ms){ return new Date(ms).toISOString(); }

// Builds a one-exercise session whose doneAt stamps start at a fixed base time and
// accumulate the given gaps (ms) in order — n gaps produce n+1 stamps.
function sessionFromGaps(gaps, { date = "2026-01-01", dayKey = "A" } = {}){
  let t = Date.parse("2026-01-01T10:00:00.000Z");
  const stamps = [t];
  for(const g of gaps){ t += g; stamps.push(t); }
  return {
    date,
    dayKey,
    exercises: [{
      main: stamps.map(ts => ({ done: true, doneAt: iso(ts), weight: 50, repsDone: 8 })),
      sup: null,
    }],
  };
}

describe("setStamps", () => {
  it("collects every doneAt across main and sup, sorted ascending", () => {
    const session = {
      exercises: [
        {
          main: [{ done: true, doneAt: "2026-01-01T10:02:00.000Z" }],
          sup: [{ done: true, doneAt: "2026-01-01T10:00:00.000Z" }],
        },
        {
          main: [{ done: false, doneAt: null }, { done: true, doneAt: "2026-01-01T10:01:00.000Z" }],
          sup: null,
        },
      ],
    };
    expect(setStamps(session)).toEqual([
      Date.parse("2026-01-01T10:00:00.000Z"),
      Date.parse("2026-01-01T10:01:00.000Z"),
      Date.parse("2026-01-01T10:02:00.000Z"),
    ]);
  });

  it("returns an empty array for a session with no exercises, or no session", () => {
    expect(setStamps({ exercises: [] })).toEqual([]);
    expect(setStamps(null)).toEqual([]);
  });
});

describe("validGaps", () => {
  it("drops a gap below GAP_MIN_MS and one above GAP_MAX_MS, keeps one inside", () => {
    const t0 = 0;
    const stamps = [t0, t0 + 5000, t0 + 5000 + 90000, t0 + 5000 + 90000 + 25 * 60000];
    expect(validGaps(stamps)).toEqual([90000]);
  });

  it("returns an empty array for fewer than two stamps", () => {
    expect(validGaps([])).toEqual([]);
    expect(validGaps([100])).toEqual([]);
  });
});

describe("median", () => {
  it("returns null for an empty array", () => {
    expect(median([])).toBeNull();
  });

  it("returns the middle value for an odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values for an even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("sessionPace", () => {
  it("returns null with only 2 valid gaps", () => {
    expect(sessionPace(sessionFromGaps([90000, 90000]))).toBeNull();
  });

  it("returns the median gap with 3+ valid gaps", () => {
    expect(sessionPace(sessionFromGaps([60000, 90000, 120000]))).toBe(90000);
  });

  it("ignores gaps outside the valid window when counting toward minGaps", () => {
    // 4 raw gaps, only 2 fall inside [GAP_MIN_MS, GAP_MAX_MS] -> below default minGaps
    expect(sessionPace(sessionFromGaps([5000, 90000, 100000, 25 * 60000]))).toBeNull();
  });
});

describe("historicPace", () => {
  const goodGaps = [60000, 90000, 120000]; // 4 stamps, 3 valid gaps -> usable pace, median 90000

  it("prefers sessions matching dayKey when enough are usable", () => {
    const sessions = [
      sessionFromGaps(goodGaps, { date: "2026-01-05", dayKey: "A" }),
      sessionFromGaps(goodGaps, { date: "2026-01-04", dayKey: "A" }),
      sessionFromGaps(goodGaps, { date: "2026-01-03", dayKey: "A" }),
      sessionFromGaps([60000, 60000, 60000], { date: "2026-01-02", dayKey: "B" }),
    ];
    expect(historicPace(sessions, "A")).toBe(90000);
  });

  it("falls back to every session when the weekday has fewer than minSessions usable sessions", () => {
    const sessions = [
      sessionFromGaps(goodGaps, { date: "2026-01-05", dayKey: "A" }),
      sessionFromGaps(goodGaps, { date: "2026-01-04", dayKey: "A" }),
      sessionFromGaps(goodGaps, { date: "2026-01-03", dayKey: "B" }),
      sessionFromGaps(goodGaps, { date: "2026-01-02", dayKey: "B" }),
      sessionFromGaps(goodGaps, { date: "2026-01-01", dayKey: "B" }),
    ];
    // only 2 usable "A" sessions -> falls back to the global pool (5 usable)
    expect(historicPace(sessions, "A")).toBe(90000);
  });

  it("returns null when neither weekday nor global reaches minSessions", () => {
    const sessions = [
      sessionFromGaps(goodGaps, { date: "2026-01-05", dayKey: "A" }),
      sessionFromGaps(goodGaps, { date: "2026-01-04", dayKey: "B" }),
    ];
    expect(historicPace(sessions, "A")).toBeNull();
  });

  it("honours limit = 5: a 6th, much slower session must not move the median", () => {
    const sessions = [];
    for(let i = 0; i < 5; i++){
      sessions.push(sessionFromGaps(goodGaps, { date: `2026-01-0${i + 1}`, dayKey: "A" }));
    }
    sessions.push(sessionFromGaps([7 * 60000, 7 * 60000, 7 * 60000], { date: "2025-12-01", dayKey: "A" }));
    expect(historicPace(sessions, "A", { limit: 5 })).toBe(90000);
  });
});

describe("dayCounts", () => {
  it("counts planned and completed sets from a session, including a superset", () => {
    const session = {
      exercises: [
        {
          main: [{ done: true }, { done: true }, { done: false }],
          sup: [{ done: true }, { done: false }, { done: false }],
        },
        {
          main: [{ done: true }, { done: true }],
          sup: null,
        },
      ],
    };
    expect(dayCounts({ ex: [] }, session)).toEqual({ exCount: 2, setCount: 8, doneEx: 1, doneSets: 5 });
  });

  it("falls back to the plan day's own shape when there is no session", () => {
    const day = {
      ex: [
        { sets: [1, 2, 3], superset: { sets: [1, 2] } },
        { sets: [1, 2] },
      ],
    };
    expect(dayCounts(day, null)).toEqual({ exCount: 2, setCount: 7, doneEx: 0, doneSets: 0 });
  });
});

describe("livePace", () => {
  it("returns null with fewer than 2 valid gaps", () => {
    expect(livePace(sessionFromGaps([90000]))).toBeNull();
  });

  it("returns the median with 2+ valid gaps", () => {
    expect(livePace(sessionFromGaps([60000, 120000]))).toBe(90000);
  });
});

describe("blendedPace", () => {
  it("averages historic and live when both exist", () => {
    expect(blendedPace(100, 200)).toBe(150);
  });

  it("returns historic when live is null", () => {
    expect(blendedPace(100, null)).toBe(100);
  });

  it("returns live when historic is null", () => {
    expect(blendedPace(null, 200)).toBe(200);
  });

  it("returns null when neither exists", () => {
    expect(blendedPace(null, null)).toBeNull();
  });
});

describe("estimateMs", () => {
  it("multiplies setCount by pace", () => {
    expect(estimateMs(8, 60000)).toBe(480000);
  });

  it("returns null when pace is null", () => {
    expect(estimateMs(8, null)).toBeNull();
  });
});

describe("remainingMs", () => {
  it("multiplies remaining sets by pace", () => {
    expect(remainingMs({ setCount: 10, doneSets: 4 }, 60000)).toBe(360000);
  });

  it("clamps to 0 when doneSets exceeds setCount (a set added then removed)", () => {
    expect(remainingMs({ setCount: 5, doneSets: 8 }, 60000)).toBe(0);
  });

  it("returns null when pace is null", () => {
    expect(remainingMs({ setCount: 10, doneSets: 4 }, null)).toBeNull();
  });
});

describe("etaAt", () => {
  it("adds ms to a fixed now", () => {
    const now = Date.parse("2026-01-01T10:00:00.000Z");
    expect(etaAt(now, 5 * 60000)).toEqual(new Date(now + 5 * 60000));
  });

  it("returns null when ms is null", () => {
    expect(etaAt(Date.now(), null)).toBeNull();
  });
});
