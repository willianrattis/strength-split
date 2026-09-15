import { orderForDay, cmpExOrder, ORDER_UNSET } from "./order.js";

/** Schema version stamped on every derived program. */
export const PROGRAM_VERSION = 1;
/** Workout letters in assignment order, one per possible weekday group. */
export const LETTERS = ["A","B","C","D","E","F","G"];

/** Ids of active exercises scheduled on `weekday`, ordered like `rebuildUserDays`. */
export function weekdayExerciseIds(catalog, weekday){
  const rows = [];
  for(const [id, ex] of catalog){
    if(!ex || !ex.active) continue;
    if(!Array.isArray(ex.days) || !ex.days.includes(weekday)) continue;
    rows.push([id, ex]);
  }
  rows.sort(([ia, a], [ib, b]) =>
    cmpExOrder(orderForDay(a, weekday), a.name, ia, orderForDay(b, weekday), b.name, ib));
  return rows.map(([id]) => id);
}

/** Groups weekdays that share an identical ordered exercise list into lettered workouts. */
export function deriveProgram(catalog, { dayCustomizations = {}, previous = null } = {}){
  const catalogMap = new Map(catalog);
  const groups = [];
  const byKey = new Map();
  for(let wd = 0; wd <= 6; wd++){
    const ids = weekdayExerciseIds(catalogMap, wd);
    if(ids.length === 0) continue;
    const key = ids.join("|");
    let g = byKey.get(key);
    if(!g){
      g = { ids, weekdays: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.weekdays.push(wd);
  }
  groups.sort((a, b) => a.weekdays[0] - b.weekdays[0]);
  const workouts = groups.slice(0, LETTERS.length).map((g, i) => {
    const weekdays = [...g.weekdays].sort((a, b) => a - b);
    const firstWeekday = weekdays[0];
    const exercises = g.ids.map(id => catalogMap.get(id)).filter(Boolean);
    const focus = [];
    for(const ex of exercises){
      if(ex.muscle && !focus.includes(ex.muscle)) focus.push(ex.muscle);
    }
    let label = "";
    const prevWorkout = previous?.workouts?.find(w =>
      Array.isArray(w.weekdays) && w.weekdays.includes(firstWeekday));
    if(prevWorkout && typeof prevWorkout.label === "string" && prevWorkout.label.trim()){
      label = prevWorkout.label;
    }else{
      const tag = dayCustomizations?.[firstWeekday]?.tag;
      if(typeof tag === "string" && tag.trim()) label = tag.trim();
    }
    return { letter: LETTERS[i], label, focus, weekdays };
  });
  return { version: PROGRAM_VERSION, workouts };
}

/** The workout scheduled on `weekday`, or null on a rest day. */
export function workoutForWeekday(program, weekday){
  return (program?.workouts || []).find(w =>
    Array.isArray(w.weekdays) && w.weekdays.includes(weekday)) || null;
}

/** Ascending weekdays (0-6) not covered by any workout. */
export function restWeekdays(program){
  const used = new Set();
  (program?.workouts || []).forEach(w => (w.weekdays || []).forEach(wd => used.add(wd)));
  const rest = [];
  for(let wd = 0; wd <= 6; wd++) if(!used.has(wd)) rest.push(wd);
  return rest;
}

/** True when `program` is well-formed and matches the catalog's current weekday grouping. */
export function isProgramConsistent(program, catalog){
  if(!program || program.version !== PROGRAM_VERSION || !Array.isArray(program.workouts)) return false;
  const catalogMap = new Map(catalog);
  const seenLetters = new Set();
  const seenWeekdays = new Set();
  const coveredWeekdays = new Set();
  for(const w of program.workouts){
    if(!w || typeof w.letter !== "string" || !LETTERS.includes(w.letter)) return false;
    if(seenLetters.has(w.letter)) return false;
    seenLetters.add(w.letter);
    if(!Array.isArray(w.weekdays) || w.weekdays.length === 0) return false;
    let refKey = null;
    for(const wd of w.weekdays){
      if(!Number.isInteger(wd) || wd < 0 || wd > 6) return false;
      if(seenWeekdays.has(wd)) return false;
      seenWeekdays.add(wd);
      const ids = weekdayExerciseIds(catalogMap, wd);
      if(ids.length === 0) return false;
      const key = ids.join("|");
      if(refKey === null) refKey = key;
      else if(refKey !== key) return false;
      coveredWeekdays.add(wd);
    }
  }
  for(let wd = 0; wd <= 6; wd++){
    if(weekdayExerciseIds(catalogMap, wd).length > 0 && !coveredWeekdays.has(wd)) return false;
  }
  return true;
}

/** 7-char string, the workout letter per weekday or "–" for rest. */
export function weekPattern(program){
  const chars = new Array(7).fill("–");
  (program?.workouts || []).forEach(w => {
    (w.weekdays || []).forEach(wd => { if(wd >= 0 && wd <= 6) chars[wd] = w.letter; });
  });
  return chars.join("");
}

/** Stored program if still consistent, else re-derived keeping labels from it. `changed` = must persist. */
export function reconcileProgram(stored, catalog, dayCustomizations = {}){
  if(isProgramConsistent(stored, catalog)) return { program: stored, changed: false };
  return { program: deriveProgram(catalog, { dayCustomizations, previous: stored }), changed: true };
}

/** Workout with this letter, or null. */
export function workoutByLetter(program, letter){
  return (program?.workouts || []).find(w => w.letter === letter) || null;
}

/** Weekdays that share `weekday`'s workout; [weekday] when none. */
export function siblingWeekdays(program, weekday){
  const workout = workoutForWeekday(program, weekday);
  if(!workout) return [weekday];
  return [...workout.weekdays].sort((a, b) => a - b);
}

/** For each id in orderedIds: next orderByDay with index i set on every sibling weekday of `weekday`. Returns Map<id, orderByDay>. Ids missing from catalog are skipped. */
export function orderPatches(catalog, program, weekday, orderedIds){
  const catalogMap = new Map(catalog);
  const siblings = siblingWeekdays(program, weekday);
  const patches = new Map();
  orderedIds.forEach((id, i) => {
    const ex = catalogMap.get(id);
    if(!ex) return;
    const orderByDay = { ...(ex.orderByDay || {}) };
    siblings.forEach(wd => { orderByDay[wd] = i; });
    patches.set(id, orderByDay);
  });
  return patches;
}

/** {days, orderByDay} appending `id` at the end of every weekday in `weekdays` it isn't on yet (end = 1 + max existing order there, ignoring ORDER_UNSET; 0 if none); null if already on all. */
export function appendToWeekdaysPatch(catalog, weekdays, id){
  const catalogMap = new Map(catalog);
  const ex = catalogMap.get(id);
  const currentDays = new Set(ex && Array.isArray(ex.days) ? ex.days : []);
  const missing = weekdays.filter(wd => !currentDays.has(wd));
  if(missing.length === 0) return null;
  const days = [...new Set([...currentDays, ...weekdays])].sort((a, b) => a - b);
  const orderByDay = { ...(ex && ex.orderByDay || {}) };
  missing.forEach(wd => {
    let maxOrder = -1;
    weekdayExerciseIds(catalogMap, wd).forEach(otherId => {
      if(otherId === id) return;
      const o = orderForDay(catalogMap.get(otherId), wd);
      if(o < ORDER_UNSET && o > maxOrder) maxOrder = o;
    });
    orderByDay[wd] = maxOrder + 1;
  });
  return { days, orderByDay };
}

/** {days, orderByDay} adding exercise `id` at the end of workout `letter` on all its weekdays; null if the workout doesn't exist or it's already on all of them. End index per weekday = 1 + the highest existing order on that weekday (0 when none), so gaps left by removals don't collide. */
export function addToWorkoutPatch(catalog, program, letter, id){
  const workout = workoutByLetter(program, letter);
  if(!workout) return null;
  return appendToWeekdaysPatch(catalog, workout.weekdays, id);
}

/** {days, orderByDay} removing exercise `id` from all weekdays of workout `letter` (days filtered, those orderByDay keys dropped); null if not on any of them. Caller decides what to do when days becomes []. */
export function removeFromWorkoutPatch(catalog, program, letter, id){
  const workout = workoutByLetter(program, letter);
  if(!workout) return null;
  const catalogMap = new Map(catalog);
  const ex = catalogMap.get(id);
  const currentDays = Array.isArray(ex && ex.days) ? ex.days : [];
  const toRemove = new Set(workout.weekdays.filter(wd => currentDays.includes(wd)));
  if(toRemove.size === 0) return null;
  const days = [...new Set(currentDays)].filter(wd => !toRemove.has(wd)).sort((a, b) => a - b);
  const orderByDay = { ...(ex && ex.orderByDay || {}) };
  toRemove.forEach(wd => { delete orderByDay[wd]; });
  return { days, orderByDay };
}

function cloneWorkingEntry(catalogMap, working, id){
  if(working.has(id)) return working.get(id);
  const ex = catalogMap.get(id);
  const clone = {
    days: new Set(ex && Array.isArray(ex.days) ? ex.days : []),
    orderByDay: { ...(ex && ex.orderByDay || {}) },
  };
  working.set(id, clone);
  return clone;
}

function sortedUnique(arr){
  return [...new Set(Array.isArray(arr) ? arr : [])].sort((a, b) => a - b);
}

/** Reassigns workout `letter` to `nextWeekdays`, moving exercises on/off the affected weekdays. Returns {patches: Map<id, {days, orderByDay}>, program} or null if the letter is unknown or `nextWeekdays` (after filtering to unique ints 0-6) is empty. */
export function setWorkoutWeekdays(catalog, program, letter, nextWeekdays){
  const W = workoutByLetter(program, letter);
  if(!W) return null;
  const next = sortedUnique((nextWeekdays || []).filter(wd => Number.isInteger(wd) && wd >= 0 && wd <= 6));
  if(next.length === 0) return null;

  const catalogMap = new Map(catalog);
  const cur = sortedUnique(W.weekdays);
  const refWd = cur[0];
  const refIds = weekdayExerciseIds(catalogMap, refWd);

  const working = new Map();

  const removedWeekdays = cur.filter(wd => !next.includes(wd));
  removedWeekdays.forEach(wd => {
    refIds.forEach(id => {
      const clone = cloneWorkingEntry(catalogMap, working, id);
      clone.days.delete(wd);
      delete clone.orderByDay[wd];
    });
  });

  const addedWeekdays = next.filter(wd => !cur.includes(wd));
  addedWeekdays.forEach(wd => {
    // 4a — strip whoever currently owns `wd` (computed from the untouched catalog).
    weekdayExerciseIds(catalogMap, wd).forEach(id => {
      const clone = cloneWorkingEntry(catalogMap, working, id);
      clone.days.delete(wd);
      delete clone.orderByDay[wd];
    });
    // 4b — give `wd` to W's own exercises, in W's reference order. Runs after 4a on
    // the same clones, so an exercise shared by both workouts lands on `wd` once.
    refIds.forEach((id, i) => {
      const clone = cloneWorkingEntry(catalogMap, working, id);
      clone.days.add(wd);
      const origOrder = orderForDay(catalogMap.get(id), refWd);
      clone.orderByDay[wd] = origOrder < ORDER_UNSET ? origOrder : i;
    });
  });

  const patches = new Map();
  working.forEach((clone, id) => {
    const orig = catalogMap.get(id);
    const origDays = sortedUnique(orig && orig.days);
    const origOrderByDay = (orig && orig.orderByDay) || {};
    const newDays = sortedUnique([...clone.days]);
    if(JSON.stringify(origDays) === JSON.stringify(newDays) &&
       JSON.stringify(origOrderByDay) === JSON.stringify(clone.orderByDay)) return;
    patches.set(id, { days: newDays, orderByDay: clone.orderByDay });
  });

  const nextSet = new Set(next);
  const workouts = program.workouts
    .map(w => w.letter === letter
      ? { ...w, weekdays: next }
      : { ...w, weekdays: w.weekdays.filter(wd => !nextSet.has(wd)) })
    .filter(w => w.weekdays.length > 0);

  return { patches, program: { version: program.version, workouts } };
}

/** Combined {days, orderByDay} moving exercise `id` from workout `fromLetter` to `toLetter` (lands last there); null if either letter is missing, they're equal, or `id` isn't on `fromLetter`'s weekdays. */
export function movePatch(catalog, program, fromLetter, toLetter, id){
  if(fromLetter === toLetter) return null;
  if(!workoutByLetter(program, fromLetter) || !workoutByLetter(program, toLetter)) return null;
  const catalogMap = new Map(catalog);
  const removePatch = removeFromWorkoutPatch(catalogMap, program, fromLetter, id);
  if(!removePatch) return null;
  const ex = catalogMap.get(id);
  const afterRemoveCatalog = new Map(catalogMap);
  afterRemoveCatalog.set(id, { ...ex, days: removePatch.days, orderByDay: removePatch.orderByDay });
  const addPatch = addToWorkoutPatch(afterRemoveCatalog, program, toLetter, id);
  return addPatch || removePatch;
}

/** Total planned sets for a userDays day's `ex` list: reps.length + superset.reps.length per exercise. */
export function planSetCount(dayEx){
  if(!Array.isArray(dayEx)) return 0;
  let total = 0;
  for(const e of dayEx){
    if(!e) continue;
    total += Array.isArray(e.reps) ? e.reps.length : 0;
    if(e.superset && Array.isArray(e.superset.reps)) total += e.superset.reps.length;
  }
  return total;
}

/** Map<id, patch>: `oldId` leaves workout `letter`, `newId` takes its orderByDay index on each of its weekdays. null if letter missing, ids equal, oldId not on the workout, or newId missing from catalog. If newId is already on some of those weekdays it's moved to oldId's index there. */
export function replaceInWorkoutPatches(catalog, program, letter, oldId, newId){
  if(oldId === newId) return null;
  const workout = workoutByLetter(program, letter);
  if(!workout) return null;
  const catalogMap = new Map(catalog);
  const oldEx = catalogMap.get(oldId);
  const oldDays = Array.isArray(oldEx && oldEx.days) ? oldEx.days : [];
  const toReplace = workout.weekdays.filter(wd => oldDays.includes(wd));
  if(toReplace.length === 0) return null;
  const newEx = catalogMap.get(newId);
  if(!newEx) return null;

  const oldDaysSet = new Set(oldDays);
  const oldOrderByDay = { ...(oldEx.orderByDay || {}) };
  const newDaysSet = new Set(Array.isArray(newEx.days) ? newEx.days : []);
  const newOrderByDay = { ...(newEx.orderByDay || {}) };

  toReplace.forEach(wd => {
    const idx = orderForDay(oldEx, wd);
    oldDaysSet.delete(wd);
    delete oldOrderByDay[wd];
    newDaysSet.add(wd);
    newOrderByDay[wd] = idx;
  });

  const patches = new Map();
  patches.set(oldId, { days: [...oldDaysSet].sort((a, b) => a - b), orderByDay: oldOrderByDay });
  patches.set(newId, { days: [...newDaysSet].sort((a, b) => a - b), orderByDay: newOrderByDay });
  return patches;
}

/** First unused letter of LETTERS, or null. */
export function nextLetter(program){
  const used = new Set((program?.workouts || []).map(w => w.letter));
  return LETTERS.find(l => !used.has(l)) || null;
}

/** New program with an added workout {letter: nextLetter, label, focus, weekdays}; null if no letter left, weekdays empty/invalid, or any weekday already belongs to a workout. Inputs untouched. */
export function addWorkout(program, { label = "", focus = [], weekdays } = {}){
  const letter = nextLetter(program);
  if(!letter) return null;
  const next = sortedUnique((weekdays || []).filter(wd => Number.isInteger(wd) && wd >= 0 && wd <= 6));
  if(next.length === 0) return null;
  const claimed = new Set();
  (program?.workouts || []).forEach(w => w.weekdays.forEach(wd => claimed.add(wd)));
  if(next.some(wd => claimed.has(wd))) return null;
  const workouts = [...(program?.workouts || []), { letter, label, focus: [...focus], weekdays: next }];
  return { version: program?.version ?? PROGRAM_VERSION, workouts };
}

/** Default catalog doc for a picked exercise (no id): {name, muscle, reps, badges:[], grip:null, note:null, active:true, days:[], orderByDay:{}, superset:null}; reps default [10,10,10]. */
export function newExerciseDoc({ name, muscle, reps } = {}){
  return {
    name, muscle,
    reps: reps ? [...reps] : [10, 10, 10],
    badges: [],
    grip: null,
    note: null,
    active: true,
    days: [],
    orderByDay: {},
    superset: null,
  };
}
