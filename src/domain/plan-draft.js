import { validateSchedule } from "./plan-schedule.js";
import { LETTERS } from "./program.js";
import { nameKey } from "./exercise-picker.js";

export { LETTERS };

/** Split presets. `days` = weekly day counts the split is offered for. */
export const SPLITS = [
  { key: "fullbody", name: "Full body", days: [2, 3],
    types: [{ label: "Full body", focus: ["peito", "costas", "perna", "ombro"] }] },
  { key: "ul", name: "Superior / Inferior", days: [2, 4, 6],
    types: [{ label: "Superior", focus: ["peito", "costas", "ombro", "bíceps", "tríceps"] },
            { label: "Inferior", focus: ["perna", "glúteo", "panturrilha", "abdômen"] }] },
  { key: "ppl", name: "Push / Pull / Legs", days: [3, 6],
    types: [{ label: "Push", focus: ["peito", "ombro", "tríceps"] },
            { label: "Pull", focus: ["costas", "bíceps", "trapézio"] },
            { label: "Legs", focus: ["perna", "glúteo", "panturrilha"] }] },
  { key: "group", name: "Divisão por grupo", days: [5],
    types: [{ label: "Peito", focus: ["peito"] }, { label: "Costas", focus: ["costas"] },
            { label: "Pernas", focus: ["perna", "glúteo", "panturrilha"] },
            { label: "Ombros", focus: ["ombro", "trapézio"] },
            { label: "Braços", focus: ["bíceps", "tríceps", "antebraço"] }] },
  { key: "custom", name: "Personalizado", days: [1, 2, 3, 4, 5, 6, 7], types: null },
];

const DEFAULT_WEEKDAYS = {
  1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
};

/** Splits offered for n days/week, in SPLITS order ("custom" always last). */
export function splitsForDays(n){
  return SPLITS.filter(s => s.days.includes(n));
}

/** Default training weekdays: 1→[0], 2→[0,3], 3→[0,2,4], 4→[0,1,3,4], 5→[0..4], 6→[0..5], 7→[0..6]. */
export function defaultWeekdays(n){
  return [...(DEFAULT_WEEKDAYS[n] || [])];
}

/** Length-7 schedule: defaultWeekdays(n) get type indexes cycling 0..typeCount-1; others null. */
export function buildAgenda(n, typeCount){
  const schedule = new Array(7).fill(null);
  if(!Number.isInteger(typeCount) || typeCount <= 0) return schedule;
  defaultWeekdays(n).forEach((wd, i) => { schedule[wd] = i % typeCount; });
  return schedule;
}

/** New schedule with `wd` advanced to the next type index; after the last type → null (rest); from null → 0. */
export function cycleAgendaCell(schedule, wd, typeCount){
  const next = [...(schedule || new Array(7).fill(null))];
  const cur = next[wd];
  next[wd] = (cur === null || cur === undefined) ? 0 : (cur + 1 >= typeCount ? null : cur + 1);
  return next;
}

/** Letters per weekday, "–" for rest: "ABCABC–". */
export function agendaPattern(schedule){
  return (schedule || []).map(idx => (idx === null || idx === undefined) ? "–" : (LETTERS[idx] || "–")).join("");
}

function copyExercise(e){
  return {
    name: e.name, muscle: e.muscle,
    reps: [...(e.reps || [])],
    badges: [...(e.badges || [])],
    grip: e.grip ?? null,
    note: e.note ?? null,
    superset: e.superset ? {
      name: e.superset.name, muscle: e.superset.muscle,
      reps: [...(e.superset.reps || [])],
      badges: [...(e.superset.badges || [])],
      grip: e.superset.grip ?? null,
      note: e.superset.note ?? null,
    } : null,
  };
}

/**
 * Fresh draft for (n, splitKey[, customTypeCount]).
 * Shape: { days:n, splitKey, schedule, name:"", notes:"", activate:true,
 *          workouts:[{ letter, label, focus:[], exercises:[] }] }
 * custom → customTypeCount (default min(n,3), clamped 1..n) workouts with label "" and focus [].
 * If `prev` draft is given, keep prev.workouts[i].exercises (and label/focus when splitKey is unchanged) by index.
 */
export function draftForSplit(n, splitKey, opts = {}){
  const { customTypeCount, prev } = opts;
  const split = SPLITS.find(s => s.key === splitKey) || SPLITS[SPLITS.length - 1];

  let types;
  if(!split.types){
    const clamp = v => Math.min(Math.max(v, 1), n);
    const count = clamp(Number.isInteger(customTypeCount) ? customTypeCount : Math.min(n, 3));
    types = Array.from({ length: count }, () => ({ label: "", focus: [] }));
  } else {
    types = split.types;
  }

  const schedule = buildAgenda(n, types.length);
  const sameSplit = !!(prev && prev.splitKey === splitKey);

  const workouts = types.map((t, i) => {
    const prevW = prev && prev.workouts && prev.workouts[i];
    return {
      letter: LETTERS[i] || String(i),
      label: sameSplit && prevW ? prevW.label : (t.label || ""),
      focus: sameSplit && prevW ? [...prevW.focus] : [...(t.focus || [])],
      exercises: prevW ? prevW.exercises.map(copyExercise) : [],
    };
  });

  return { days: n, splitKey, schedule, name: "", notes: "", activate: true, workouts };
}

/** Null if valid; else pt-BR message: schedule must use every workout (reuse validateSchedule with letters), and each workout needs ≥1 exercise when `requireExercises` is true → "O treino B ainda não tem exercícios." */
export function validateDraft(draft, opts = {}){
  const { requireExercises = false } = opts;
  const types = draft.workouts.map(w => w.letter);
  const scheduleErr = validateSchedule(draft.schedule, types);
  if(scheduleErr) return scheduleErr;

  if(requireExercises){
    for(const w of draft.workouts){
      if(!w.exercises || w.exercises.length === 0) return `O treino ${w.letter} ainda não tem exercícios.`;
    }
  }
  return null;
}

/** Suggested plan name: split name prefixed by letters, e.g. "ABC · Push / Pull / Legs"; custom → "Plano " + letters ("Plano AB"). */
export function suggestPlanName(draft){
  const letters = draft.workouts.map(w => w.letter).join("");
  if(draft.splitKey === "custom") return `Plano ${letters}`;
  const split = SPLITS.find(s => s.key === draft.splitKey);
  return split ? `${letters} · ${split.name}` : `Plano ${letters}`;
}

/** Plan doc from draft: { name: draft.name.trim() || suggestPlanName(draft), source:"custom", notes: lines of draft.notes (trimmed, non-empty), days:[{ type: letter, label: label || focus-based fallback "Treino A", exercises: copies, weekdays }] }. `muscleLabels` maps a focus muscle key to its human label, for the focus-based fallback tier. */
export function draftToPlan(draft, { muscleLabels = {} } = {}){
  const name = (draft.name || "").trim() || suggestPlanName(draft);
  const notes = (draft.notes || "").split("\n").map(s => s.trim()).filter(Boolean);
  const schedule = draft.schedule || [];

  const days = draft.workouts.map((w, i) => {
    const weekdays = [];
    schedule.forEach((idx, wd) => { if(idx === i) weekdays.push(wd); });
    const focusLabel = w.focus && w.focus.length ? w.focus.map(k => muscleLabels[k] || k).join(" · ") : "";
    const label = w.label || focusLabel || `Treino ${w.letter}`;
    return {
      type: w.letter,
      label,
      exercises: w.exercises.map(copyExercise),
      weekdays,
    };
  });

  return { name, source: "custom", notes, days };
}

/** base if unused (nameKey-insensitive via ./exercise-picker.js nameKey), else "base (2)", "base (3)"… */
export function uniquePlanName(base, existingNames){
  const keys = new Set((existingNames || []).map(n => nameKey(n)));
  if(!keys.has(nameKey(base))) return base;
  let i = 2;
  while(keys.has(nameKey(`${base} (${i})`))) i++;
  return `${base} (${i})`;
}
