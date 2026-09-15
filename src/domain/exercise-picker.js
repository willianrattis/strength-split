import { stripDiacritics } from "./text.js";

/** Lowercased, diacritic-free, trimmed, single-spaced name key. */
export function nameKey(name){
  return stripDiacritics(String(name || "")).trim().replace(/\s+/g, " ");
}

/**
 * Picker groups. library = [{name, muscle, type:"comp"|"iso"}] (EXERCISE_CATALOG);
 * userCatalog = iterable [id, ex]; inWorkoutNames = names already in the target workout.
 * opts: { query="", muscles=[] (empty = all), muscleOrder=[], muscleLabels={} }
 * Returns [{ muscle, items:[{ key, name, muscle, type, userId, inWorkout }] }]
 */
export function pickerResults(library, userCatalog, inWorkoutNames, opts = {}){
  const { query = "", muscles = [], muscleOrder = [], muscleLabels = {} } = opts;

  const merged = new Map();
  (library || []).forEach(item => {
    if(!item || !item.name) return;
    const key = nameKey(item.name);
    merged.set(key, { key, name: item.name, muscle: item.muscle, type: item.type || "iso", userId: null });
  });
  for(const [id, ex] of userCatalog){
    if(!ex || !ex.name) continue;
    const key = nameKey(ex.name);
    const existing = merged.get(key);
    merged.set(key, {
      key, name: ex.name, muscle: ex.muscle,
      type: existing ? existing.type : "iso",
      userId: id,
    });
  }

  const inWorkoutKeys = new Set([...(inWorkoutNames || [])].map(n => nameKey(n)));
  let items = [...merged.values()].map(it => ({ ...it, inWorkout: inWorkoutKeys.has(it.key) }));

  if(muscles.length) items = items.filter(it => muscles.includes(it.muscle));
  const q = nameKey(query);
  if(q){
    items = items.filter(it =>
      nameKey(it.name).includes(q) || nameKey(muscleLabels[it.muscle] || "").includes(q));
  }

  const groups = new Map();
  items.forEach(it => {
    if(!groups.has(it.muscle)) groups.set(it.muscle, []);
    groups.get(it.muscle).push(it);
  });

  const rank = new Map(muscleOrder.map((m, i) => [m, i]));
  const muscleKeys = [...groups.keys()].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a) : Infinity;
    const rb = rank.has(b) ? rank.get(b) : Infinity;
    return ra !== rb ? ra - rb : a.localeCompare(b, "pt-BR");
  });

  return muscleKeys
    .map(muscle => ({
      muscle,
      items: groups.get(muscle).slice().sort((a, b) =>
        (a.type === "comp" ? 0 : 1) - (b.type === "comp" ? 0 : 1) ||
        a.name.localeCompare(b.name, "pt-BR")),
    }))
    .filter(g => g.items.length > 0);
}

/** Existing user doc id whose nameKey matches, preferring an active doc; else null. */
export function findUserDocByName(userCatalog, name){
  const key = nameKey(name);
  let fallback = null;
  for(const [id, ex] of userCatalog){
    if(!ex || !ex.name || nameKey(ex.name) !== key) continue;
    if(ex.active !== false) return id;
    if(fallback === null) fallback = id;
  }
  return fallback;
}

/** Default reps for a picked name: library type "comp" → [8,8,8,8], otherwise [12,12,12]. Fresh array. */
export function defaultRepsFor(library, name){
  const key = nameKey(name);
  const entry = (library || []).find(it => it && nameKey(it.name) === key);
  return entry && entry.type === "comp" ? [8, 8, 8, 8] : [12, 12, 12];
}
