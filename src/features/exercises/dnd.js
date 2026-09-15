import { state } from "../../core/state.js";
import { activeDays } from "../../core/adapters.js";
import { orderPatches } from "../../domain/program.js";
import { saveExerciseDoc, rebuildUserDays } from "./crud.js";

// Recomputes and persists orderByDay for every exercise in `ordered` (fromId
// already moved to its new index), for every sibling weekday of dk's workout.
async function persistDayOrder(dk, ordered){
  const patches = orderPatches(state.exercisesCatalog, state.program, dk, ordered);
  const promises = [];
  patches.forEach((orderByDay, id) => {
    const ex = state.exercisesCatalog.get(id);
    if(!ex) return;
    ex.orderByDay = orderByDay;
    promises.push(saveExerciseDoc(id, { orderByDay }));
  });
  await Promise.all(promises);
}

function reinsert(ordered, fromId, toId, before){
  const fromIdx = ordered.indexOf(fromId);
  if(fromIdx >= 0) ordered.splice(fromIdx, 1);
  let toIdx = ordered.indexOf(toId);
  if(!before) toIdx++;
  ordered.splice(toIdx, 0, fromId);
}

// Reorder driven by the in-memory day plan — for callers (day/quick-edit.js,
// features/program/workout.js) reordering a given weekday's exercise list.
export async function reorderExerciseInDay(dk, fromId, toId, before){
  const ordered = activeDays()[dk].ex.map(e => e._id);
  reinsert(ordered, fromId, toId, before);
  await persistDayOrder(dk, ordered);
  rebuildUserDays();
}
