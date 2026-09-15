import { nameKey } from "./exercise-picker.js";

/** Movement family: first two words of nameKey(name) ("supino reto com barra" → "supino reto"). */
export function movementFamily(name){
  return nameKey(name).split(" ").filter(Boolean).slice(0, 2).join(" ");
}

function rotateLeft(list, offset){
  if(list.length === 0) return [];
  const n = ((offset % list.length) + list.length) % list.length;
  return [...list.slice(n), ...list.slice(0, n)];
}

function toSuggested(item){
  return {
    name: item.name,
    muscle: item.muscle,
    type: item.type,
    reps: item.type === "comp" ? [8, 8, 8, 8] : [12, 12, 12],
  };
}

/**
 * Suggested exercises for a workout focus.
 * library: [{name, muscle, type:"comp"|"iso"}] (EXERCISE_CATALOG order = authored priority)
 * focus: muscle keys in priority order
 * opts: { exclude = [] (names already in the workout), offset = 0 (per-muscle rotation for "Sugerir" again) }
 * Returns [{ name, muscle, type, reps }] in focus order, comps before isos within each muscle.
 */
export function suggestExercises(library, focus, opts = {}){
  if(!Array.isArray(focus) || focus.length === 0) return [];
  const uniqueFocus = [...new Set(focus)];
  const perMuscle = uniqueFocus.length === 1 ? 5 : uniqueFocus.length === 2 ? 3 : 2;
  const { exclude = [], offset = 0 } = opts;
  const excludeKeys = new Set(exclude.map(n => nameKey(n)));
  const chosenKeys = new Set();
  const chosenFamilies = new Set(exclude.map(n => movementFamily(n)));

  function takeFrom(list, cursor, count){
    const picked = [];
    while(picked.length < count && cursor.i < list.length){
      const item = list[cursor.i];
      cursor.i++;
      const key = nameKey(item.name);
      if(excludeKeys.has(key) || chosenKeys.has(key)) continue;
      const fam = movementFamily(item.name);
      if(chosenFamilies.has(fam)) continue;
      chosenKeys.add(key);
      chosenFamilies.add(fam);
      picked.push(item);
    }
    return picked;
  }

  const result = [];
  uniqueFocus.forEach(muscle => {
    const candidates = (library || []).filter(it => it && it.muscle === muscle);
    const comps = rotateLeft(candidates.filter(it => it.type === "comp"), offset);
    const isos = rotateLeft(candidates.filter(it => it.type !== "comp"), offset);

    const targetComps = Math.ceil(perMuscle / 2);
    const targetIsos = perMuscle - targetComps;
    const compCursor = { i: 0 };
    const isoCursor = { i: 0 };

    let picked = [
      ...takeFrom(comps, compCursor, targetComps),
      ...takeFrom(isos, isoCursor, targetIsos),
    ];

    // Either type ran short (or both) — keep pulling one at a time from
    // whichever pool still has unexamined items until the target is met.
    while(picked.length < perMuscle){
      const before = picked.length;
      picked = picked.concat(takeFrom(comps, compCursor, 1));
      if(picked.length < perMuscle) picked = picked.concat(takeFrom(isos, isoCursor, 1));
      if(picked.length === before) break;
    }

    const compsFinal = picked.filter(it => it.type === "comp");
    const isosFinal = picked.filter(it => it.type !== "comp");
    result.push(...compsFinal.map(toSuggested), ...isosFinal.map(toSuggested));
  });

  return result;
}
