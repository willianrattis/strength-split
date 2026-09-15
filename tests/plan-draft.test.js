import { describe, it, expect } from "vitest";
import {
  SPLITS, splitsForDays, defaultWeekdays, buildAgenda, cycleAgendaCell,
  agendaPattern, draftForSplit, validateDraft, suggestPlanName, draftToPlan,
} from "../src/domain/plan-draft.js";

describe("splitsForDays", () => {
  it("3 days → fullbody, ppl, custom", () => {
    expect(splitsForDays(3).map(s => s.key)).toEqual(["fullbody", "ppl", "custom"]);
  });
  it("5 days → group, custom", () => {
    expect(splitsForDays(5).map(s => s.key)).toEqual(["group", "custom"]);
  });
  it("7 days → custom only", () => {
    expect(splitsForDays(7).map(s => s.key)).toEqual(["custom"]);
  });
});

describe("defaultWeekdays", () => {
  it("returns the documented weekdays for 1..7", () => {
    expect(defaultWeekdays(1)).toEqual([0]);
    expect(defaultWeekdays(2)).toEqual([0, 3]);
    expect(defaultWeekdays(3)).toEqual([0, 2, 4]);
    expect(defaultWeekdays(4)).toEqual([0, 1, 3, 4]);
    expect(defaultWeekdays(5)).toEqual([0, 1, 2, 3, 4]);
    expect(defaultWeekdays(6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(defaultWeekdays(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("returns a fresh array each time", () => {
    const a = defaultWeekdays(3);
    a.push(99);
    expect(defaultWeekdays(3)).toEqual([0, 2, 4]);
  });
});

describe("buildAgenda", () => {
  it("6 days, 3 types cycles evenly", () => {
    expect(buildAgenda(6, 3)).toEqual([0, 1, 2, 0, 1, 2, null]);
  });
  it("4 days, 2 types", () => {
    expect(buildAgenda(4, 2)).toEqual([0, 1, null, 0, 1, null, null]);
  });
});

describe("cycleAgendaCell", () => {
  const schedule = [0, null, null, null, null, null, null];

  it("advances to the next type index", () => {
    expect(cycleAgendaCell(schedule, 0, 3)).toEqual([1, null, null, null, null, null, null]);
  });
  it("wraps the last type index to null (rest)", () => {
    expect(cycleAgendaCell([2, null, null, null, null, null, null], 0, 3))
      .toEqual([null, null, null, null, null, null, null]);
  });
  it("goes from null to 0", () => {
    expect(cycleAgendaCell(schedule, 1, 3)).toEqual([0, 0, null, null, null, null, null]);
  });
  it("does not mutate the input schedule", () => {
    const snapshot = [...schedule];
    cycleAgendaCell(schedule, 0, 3);
    expect(schedule).toEqual(snapshot);
  });
});

describe("agendaPattern", () => {
  it("renders letters and rest dashes", () => {
    expect(agendaPattern(buildAgenda(6, 3))).toBe("ABCABC–");
  });
});

describe("draftForSplit", () => {
  it("ppl for 6 days → 3 workouts A..C with split labels/focus", () => {
    const draft = draftForSplit(6, "ppl");
    expect(draft.days).toBe(6);
    expect(draft.splitKey).toBe("ppl");
    expect(draft.workouts.map(w => w.letter)).toEqual(["A", "B", "C"]);
    expect(draft.workouts.map(w => w.label)).toEqual(["Push", "Pull", "Legs"]);
    expect(draft.workouts[0].focus).toEqual(["peito", "ombro", "tríceps"]);
    expect(draft.workouts.every(w => w.exercises.length === 0)).toBe(true);
    expect(draft.schedule).toEqual(buildAgenda(6, 3));
    expect(draft.name).toBe("");
    expect(draft.activate).toBe(true);
  });

  it("custom defaults to min(n,3) workouts, clamped 1..n", () => {
    expect(draftForSplit(2, "custom").workouts.length).toBe(2); // min(2,3)=2
    expect(draftForSplit(6, "custom").workouts.length).toBe(3); // min(6,3)=3
    expect(draftForSplit(6, "custom", { customTypeCount: 10 }).workouts.length).toBe(6); // clamped to n
    expect(draftForSplit(6, "custom", { customTypeCount: 0 }).workouts.length).toBe(1); // clamped to 1
    expect(draftForSplit(6, "custom").workouts.every(w => w.label === "" && w.focus.length === 0)).toBe(true);
  });

  it("keeps prev exercises by index regardless of split change", () => {
    const prev = draftForSplit(6, "ppl");
    prev.workouts[0].exercises.push({ name: "Supino", muscle: "peito", reps: [8, 8, 8] });
    const next = draftForSplit(6, "ul", { prev });
    expect(next.workouts[0].exercises).toEqual([
      { name: "Supino", muscle: "peito", reps: [8, 8, 8], badges: [], grip: null, note: null, superset: null },
    ]);
  });

  it("keeps prev label/focus only when the split is unchanged", () => {
    const prev = draftForSplit(6, "ppl");
    prev.workouts[0].label = "Peito e Ombro";
    prev.workouts[0].focus = ["peito"];

    const sameSplit = draftForSplit(6, "ppl", { prev });
    expect(sameSplit.workouts[0].label).toBe("Peito e Ombro");
    expect(sameSplit.workouts[0].focus).toEqual(["peito"]);

    const changedSplit = draftForSplit(6, "ul", { prev });
    expect(changedSplit.workouts[0].label).toBe("Superior");
    expect(changedSplit.workouts[0].focus).toEqual(SPLITS.find(s => s.key === "ul").types[0].focus);
  });

  it("never mutates the prev draft", () => {
    const prev = draftForSplit(6, "ppl");
    prev.workouts[0].exercises.push({ name: "Supino", muscle: "peito", reps: [8, 8, 8] });
    const snapshot = JSON.stringify(prev);
    draftForSplit(6, "ppl", { prev });
    expect(JSON.stringify(prev)).toBe(snapshot);
  });
});

describe("validateDraft", () => {
  it("names the letter of an unused workout", () => {
    const draft = draftForSplit(6, "ppl");
    draft.schedule = draft.schedule.map(v => (v === 2 ? null : v)); // "Legs" (C) never scheduled
    expect(validateDraft(draft)).toBe("O treino C não está em nenhum dia.");
  });

  it("requires exercises on the first empty workout when requireExercises is true", () => {
    const draft = draftForSplit(6, "ppl");
    draft.workouts[0].exercises.push({ name: "Supino", muscle: "peito", reps: [8, 8, 8] });
    expect(validateDraft(draft, { requireExercises: true })).toBe("O treino B ainda não tem exercícios.");
  });

  it("returns null for a valid, fully-populated draft", () => {
    const draft = draftForSplit(6, "ppl");
    draft.workouts.forEach(w => w.exercises.push({ name: "Ex", muscle: w.focus[0], reps: [8, 8, 8] }));
    expect(validateDraft(draft, { requireExercises: true })).toBeNull();
  });
});

describe("suggestPlanName", () => {
  it("ppl → letters + split name", () => {
    expect(suggestPlanName(draftForSplit(6, "ppl"))).toBe("ABC · Push / Pull / Legs");
  });
  it("custom → 'Plano ' + letters", () => {
    expect(suggestPlanName(draftForSplit(2, "custom"))).toBe("Plano AB");
  });
});

describe("draftToPlan", () => {
  it("falls back to the suggested name and splits notes into trimmed non-empty lines", () => {
    const draft = draftForSplit(6, "ppl");
    draft.notes = "  Foco em técnica \n\n  Beber água  \n   ";
    const plan = draftToPlan(draft);
    expect(plan.name).toBe("ABC · Push / Pull / Legs");
    expect(plan.notes).toEqual(["Foco em técnica", "Beber água"]);
    expect(plan.source).toBe("custom");
  });

  it("uses the trimmed explicit name when given", () => {
    const draft = draftForSplit(6, "ppl");
    draft.name = "  Meu treino  ";
    expect(draftToPlan(draft).name).toBe("Meu treino");
  });

  it("assigns weekdays per workout from the schedule", () => {
    const draft = draftForSplit(6, "ppl");
    const plan = draftToPlan(draft);
    expect(plan.days[0].weekdays).toEqual([0, 3]);
    expect(plan.days[1].weekdays).toEqual([1, 4]);
    expect(plan.days[2].weekdays).toEqual([2, 5]);
  });

  it("falls back label: explicit label, then focus, then 'Treino <letter>'", () => {
    const draft = draftForSplit(6, "custom");
    draft.workouts[0].label = "Dia de peito";
    draft.workouts[1].focus = ["costas", "bíceps"];
    // workouts[2] has neither label nor focus
    const plan = draftToPlan(draft);
    expect(plan.days[0].label).toBe("Dia de peito");
    expect(plan.days[1].label).toBe("costas · bíceps");
    expect(plan.days[2].label).toBe(`Treino ${draft.workouts[2].letter}`);
  });

  it("maps focus keys through muscleLabels for the fallback label, when given", () => {
    const draft = draftForSplit(6, "custom");
    draft.workouts[1].focus = ["costas", "bíceps"];
    const plan = draftToPlan(draft, { muscleLabels: { costas: "Costas", "bíceps": "Bíceps" } });
    expect(plan.days[1].label).toBe("Costas · Bíceps");
  });

  it("copies exercises, not references — mutating the plan doesn't touch the draft", () => {
    const draft = draftForSplit(6, "ppl");
    draft.workouts[0].exercises.push({ name: "Supino", muscle: "peito", reps: [8, 8, 8], badges: [], grip: null, note: null, superset: null });
    const plan = draftToPlan(draft);
    plan.days[0].exercises[0].name = "Mutated";
    plan.days[0].exercises[0].reps.push(99);
    expect(draft.workouts[0].exercises[0].name).toBe("Supino");
    expect(draft.workouts[0].exercises[0].reps).toEqual([8, 8, 8]);
  });
});
