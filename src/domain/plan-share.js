// Shape/version for shared-plan links (Phase 7.1/7.2). serializePlan is the
// outbound whitelist; parseSharedPlan is the trust boundary for whatever comes
// back in through a URL fragment, so it must reject anything malformed rather
// than coerce it — an attacker fully controls the input to parseSharedPlan.
export const SHARE_VERSION = 1;

const MAX_NAME_LEN = 80;
const MAX_LABEL_LEN = 40;
const MAX_TYPE_LEN = 8;
const MAX_MUSCLE_LEN = 30;
const MAX_NOTE_LEN = 300;
const MAX_BADGE_LEN = 30;
const MAX_DAYS = 10;
const MAX_EXERCISES = 30;
const MAX_REPS = 12;
const MAX_BADGES = 8;
// grip has a closed set of valid values (unlike badges, which are free strings
// with no closed-set assumption — see CLAUDE.md). Kept local rather than
// imported from data/labels.js: domain/ imports nothing outside domain/.
const GRIP_KEYS = new Set(["supinada", "pronada", "neutra"]);

export function serializePlan(plan){
  return {
    v: SHARE_VERSION,
    name: plan.name,
    days: (plan.days || []).map(d => ({
      type: d.type,
      label: d.label,
      exercises: (d.exercises || []).map(serializeExercise),
    })),
  };
}

function serializeExercise(e){
  return {
    name: e.name,
    muscle: e.muscle,
    reps: (e.reps || []).slice(),
    badges: (e.badges || []).slice(),
    grip: e.grip ?? null,
    note: e.note ?? null,
    superset: e.superset ? serializeExercise(e.superset) : null,
  };
}

export function parseSharedPlan(raw){
  if(!raw || typeof raw !== "object") return null;
  if(raw.v !== SHARE_VERSION) return null;

  const name = normStr(raw.name, MAX_NAME_LEN);
  if(!name) return null;

  if(!Array.isArray(raw.days) || !raw.days.length || raw.days.length > MAX_DAYS) return null;
  const days = [];
  for(const d of raw.days){
    const day = parseDay(d);
    if(!day) return null;
    days.push(day);
  }

  return { v: SHARE_VERSION, name, days };
}

function parseDay(d){
  if(!d || typeof d !== "object") return null;
  const type = normStr(d.type, MAX_TYPE_LEN);
  if(!type) return null;
  const label = normStr(d.label, MAX_LABEL_LEN, true) ?? "";

  if(!Array.isArray(d.exercises) || !d.exercises.length || d.exercises.length > MAX_EXERCISES) return null;
  const exercises = [];
  for(const e of d.exercises){
    const ex = parseExercise(e, true);
    if(!ex) return null;
    exercises.push(ex);
  }

  return { type, label, exercises };
}

function parseExercise(e, allowSuperset){
  if(!e || typeof e !== "object") return null;

  const name = normStr(e.name, MAX_NAME_LEN);
  if(!name) return null;

  let muscle = null;
  if(e.muscle != null){
    muscle = normStr(e.muscle, MAX_MUSCLE_LEN, true);
    if(muscle == null) return null;
  }

  const reps = parseReps(e.reps);
  if(!reps) return null;

  let badges = [];
  if(e.badges != null){
    if(!Array.isArray(e.badges) || e.badges.length > MAX_BADGES) return null;
    badges = [];
    for(const b of e.badges){
      const nb = normStr(b, MAX_BADGE_LEN);
      if(!nb) return null;
      badges.push(nb);
    }
  }

  // grip is display-only and low-stakes, so an unrecognized/malformed value is
  // coerced to null rather than rejecting the whole exercise (unlike the
  // stricter reject-on-invalid fields above).
  const grip = (typeof e.grip === "string" && GRIP_KEYS.has(e.grip)) ? e.grip : null;

  let note = null;
  if(e.note != null){
    note = normStr(e.note, MAX_NOTE_LEN, true);
    if(note == null) return null;
  }

  let superset = null;
  if(allowSuperset && e.superset != null){
    superset = parseExercise(e.superset, false);
    if(!superset) return null;
  }

  return { name, muscle, reps, badges, grip, note, superset };
}

function parseReps(reps){
  if(!Array.isArray(reps) || !reps.length || reps.length > MAX_REPS) return null;
  const out = [];
  for(const n of reps){
    if(typeof n !== "number" || !Number.isFinite(n)) return null;
    out.push(Math.max(1, Math.round(n)));
  }
  return out;
}

function normStr(v, maxLen, allowEmpty){
  if(typeof v !== "string") return null;
  const t = v.trim();
  if(!allowEmpty && !t) return null;
  return t.slice(0, maxLen);
}
