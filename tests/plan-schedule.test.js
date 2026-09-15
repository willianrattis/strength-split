import { describe, it, expect } from "vitest";
import {
  suggestedWeekdays, scheduleFromPlan, scheduleToMapping,
  validateSchedule, applyScheduleToPlan, planWeekPattern,
} from "../src/domain/plan-schedule.js";

function dayType(type, exercises = [{ name:"Ex", reps:[10] }]){
  return { type, label: "", exercises };
}

describe("suggestedWeekdays", () => {
  it("1 type → 3x/week", () => {
    expect(suggestedWeekdays(1)).toEqual([[0,2,4]]);
  });
  it("2 types → alternating Mon/Thu, Tue/Fri", () => {
    expect(suggestedWeekdays(2)).toEqual([[0,3],[1,4]]);
  });
  it("3 types → alternating across 6 days", () => {
    expect(suggestedWeekdays(3)).toEqual([[0,3],[1,4],[2,5]]);
  });
  it("4 types → one weekday each, skipping Wed", () => {
    expect(suggestedWeekdays(4)).toEqual([[0],[1],[3],[4]]);
  });
  it("5 types → one weekday each, Mon-Fri", () => {
    expect(suggestedWeekdays(5)).toEqual([[0],[1],[2],[3],[4]]);
  });
  it("8 types → first 7 get one weekday each, the 8th gets none", () => {
    expect(suggestedWeekdays(8)).toEqual([[0],[1],[2],[3],[4],[5],[6],[]]);
  });
});

describe("scheduleFromPlan", () => {
  it("builds the schedule from plan.days[i].weekdays when present", () => {
    const plan = { days: [
      { ...dayType("A"), weekdays:[0,3] },
      { ...dayType("B"), weekdays:[1,4] },
    ] };
    expect(scheduleFromPlan(plan)).toEqual([0,1,null,0,1,null,null]);
  });

  it("falls back to suggestedWeekdays when no day carries weekdays", () => {
    // 4 types → suggestedWeekdays(4) = [[0],[1],[3],[4]], skipping Wed (2).
    const plan = { days: [dayType("A"), dayType("B"), dayType("C"), dayType("D")] };
    expect(scheduleFromPlan(plan)).toEqual([0,1,null,2,3,null,null]);
  });

  it("ignores invalid ints in a weekdays array", () => {
    const plan = { days: [
      { ...dayType("A"), weekdays:[0, -1, 7, 3.5, "2", 3] },
    ] };
    expect(scheduleFromPlan(plan)).toEqual([0,null,null,0,null,null,null]);
  });

  it("keeps the first type when a weekday is claimed twice", () => {
    const plan = { days: [
      { ...dayType("A"), weekdays:[0] },
      { ...dayType("B"), weekdays:[0] },
    ] };
    expect(scheduleFromPlan(plan)).toEqual([0,null,null,null,null,null,null]);
  });
});

describe("scheduleToMapping", () => {
  it("orders ascending by weekday and skips rest days", () => {
    const schedule = [0,1,null,0,1,null,null];
    expect(scheduleToMapping(schedule)).toEqual([
      { dayTypeIdx:0, weekday:0 },
      { dayTypeIdx:1, weekday:1 },
      { dayTypeIdx:0, weekday:3 },
      { dayTypeIdx:1, weekday:4 },
    ]);
  });

  it("returns [] for an all-rest schedule", () => {
    expect(scheduleToMapping(new Array(7).fill(null))).toEqual([]);
  });
});

describe("validateSchedule", () => {
  const types = ["A","B","C"];

  it("accepts a valid ABC schedule", () => {
    expect(validateSchedule([0,1,2,0,1,2,null], types)).toBeNull();
  });

  it("names the letter of a type missing from the schedule", () => {
    expect(validateSchedule([0,1,null,0,1,null,null], types)).toBe("O treino C não está em nenhum dia.");
  });

  it("rejects an out-of-range type index", () => {
    expect(validateSchedule([0,1,2,3,null,null,null], types)).toBe("A agenda tem um treino inválido.");
  });

  it("rejects a schedule that isn't length 7", () => {
    expect(validateSchedule([0,1,2], types)).toBe("A agenda precisa cobrir os 7 dias da semana.");
  });
});

describe("applyScheduleToPlan", () => {
  it("assigns ascending weekdays per day type, including empty for unused types", () => {
    const plan = { days: [dayType("A"), dayType("B"), dayType("C")] };
    const schedule = [0,1,2,0,1,null,null];
    const result = applyScheduleToPlan(plan, schedule);
    expect(result.days[0].weekdays).toEqual([0,3]);
    expect(result.days[1].weekdays).toEqual([1,4]);
    expect(result.days[2].weekdays).toEqual([2]);
  });

  it("does not mutate its inputs", () => {
    const plan = { days: [dayType("A"), dayType("B")] };
    const planSnapshot = JSON.stringify(plan);
    const schedule = [0,1,null,0,1,null,null];
    const scheduleSnapshot = JSON.stringify(schedule);
    applyScheduleToPlan(plan, schedule);
    expect(JSON.stringify(plan)).toBe(planSnapshot);
    expect(JSON.stringify(schedule)).toBe(scheduleSnapshot);
  });

  it("round-trips through scheduleFromPlan when every type has a weekday", () => {
    const plan = { days: [dayType("A"), dayType("B"), dayType("C")] };
    const schedule = [0,1,2,0,1,2,null];
    const applied = applyScheduleToPlan(plan, schedule);
    expect(scheduleFromPlan(applied)).toEqual(schedule);
  });
});

describe("planWeekPattern", () => {
  it("ABC plan without explicit weekdays uses the suggested schedule", () => {
    const plan = { days: [dayType("A"), dayType("B"), dayType("C")] };
    expect(planWeekPattern(plan)).toBe("ABCABC–");
  });

  it("AB plan with explicit weekdays", () => {
    const plan = { days: [
      { ...dayType("A"), weekdays:[0,2,4] },
      { ...dayType("B"), weekdays:[1,3,5] },
    ] };
    expect(planWeekPattern(plan)).toBe("ABABAB–");
  });

  it("empty plan is all rest", () => {
    expect(planWeekPattern({ days: [] })).toBe("–––––––");
  });

  it("uses only the first character of a multi-char type", () => {
    const plan = { days: [{ ...dayType("A1"), weekdays:[0,2,4] }] };
    expect(planWeekPattern(plan)).toBe("A–A–A––");
  });
});
