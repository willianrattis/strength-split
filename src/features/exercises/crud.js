import { serverTimestamp } from "firebase/firestore";
import { orderForDay, cmpExOrder } from "../../domain/order.js";
import { state } from "../../core/state.js";
import * as repo from "../../core/repo.js";
import { WEEKDAYS } from "../../data/days.js";
import { buildExerciseList } from "../evolution.js";

// Build userDays from exercisesCatalog
export function rebuildUserDays(){
  const base = WEEKDAYS.map(d => ({...d, tag:"", focus:""}));
  base.forEach((d,i) => {
    d.ex = [];
    const custom = state.dayCustomizations[i];
    if(custom){
      if(custom.tag) d.tag = custom.tag;
      if(custom.focus) d.focus = custom.focus;
    }
  });
  state.exercisesCatalog.forEach((ex, id) => {
    if(!ex.active) return;
    (ex.days || []).forEach(dk => {
      if(dk < 0 || dk > 6) return;
      const order = orderForDay(ex, dk);
      const sup = ex.superset ? {...ex.superset, unit: ex.superset.unit || "kg"} : null;
      base[dk].ex.push({
        _id: id,
        _order: order,
        name: ex.name,
        muscle: ex.muscle,
        reps: ex.reps || [12,10,8],
        badges: ex.badges || [],
        note: ex.note || null,
        unit: ex.unit || "kg",
        superset: sup,
      });
    });
  });
  base.forEach(d => d.ex.sort((a,b) =>
    cmpExOrder(a._order, a.name, a._id, b._order, b.name, b._id)));
  state.userDays = base;
  state.EXERCISES = buildExerciseList();
  state.evoInitialized = false;
}
// Exposed so features/day/render.js's unit-toggle handler can rebuild the plan after an
// exercise-doc edit without importing this exercises-cluster code — day/render.js isn't
// touched in this phase, so the window hook mechanism from 0.d-3a/3b stays.
window._rebuildUserDays = rebuildUserDays;

// Load exercises from Firestore. An empty catalog on a first login is left empty —
// the onboarding picker (features/onboarding.js) is responsible for seeding it.
export async function loadExercises(uid){
  if(!state.user && !uid) return;
  uid = uid || state.user.uid;
  let docs;
  try { docs = await repo.fetchExercises(uid); }
  catch(e){ console.warn("loadExercises:", e.message); return; }
  state.exercisesCatalog.clear();
  state.needsOnboarding = docs.length === 0;
  if(docs.length){
    docs.forEach(({id, data}) => state.exercisesCatalog.set(id, data));
  }
}

// Save exercise doc
export async function saveExerciseDoc(docId, data){
  if(!state.user) return null;
  data.updatedAt = serverTimestamp();
  if(docId){
    await repo.putExercise(state.user.uid, docId, data);
    return docId;
  } else {
    data.createdAt = serverTimestamp();
    return await repo.addExercise(state.user.uid, data);
  }
}
// Exposed for the same reason as window._rebuildUserDays above.
window._saveExerciseDoc = saveExerciseDoc;

// Delete exercise doc
export async function deleteExerciseDoc(docId){
  if(!state.user) return;
  await repo.deleteExercise(state.user.uid, docId);
}
