import { esc } from "../../domain/text.js";
import { findUserDocByName, defaultRepsFor } from "../../domain/exercise-picker.js";
import { newExerciseDoc } from "../../domain/program.js";
import { EXERCISE_CATALOG } from "../../data/exercise-catalog.js";
import { state } from "../../core/state.js";
import { reconcileSession } from "../../core/adapters.js";
import { saveExerciseDoc, rebuildUserDays } from "../exercises/crud.js";
import { scheduleSave } from "../day/session-io.js";
import { renderDay, renderStrip } from "../day/render.js";

/** Applies Map<id,{days,orderByDay}> or [id, patch] pairs to catalog + Firestore. */
export async function applyCatalogPatches(patches){
  const entries = patches instanceof Map ? [...patches] : patches;
  entries.forEach(([id, patch]) => {
    const ex = state.exercisesCatalog.get(id);
    if(ex) Object.assign(ex, patch);
  });
  await Promise.all(entries.map(([id, patch]) => saveExerciseDoc(id, patch)));
}

// Resolve a pick to a catalog id: explicit userId → same-name doc → new doc.
export async function resolvePick(pick, template){
  let id = pick.userId || findUserDocByName(state.exercisesCatalog, pick.name);
  if(id) return id;
  const data = pick.doc
    ? { ...newExerciseDoc({ name: pick.doc.name, muscle: pick.doc.muscle, reps: pick.doc.reps }), badges: pick.doc.badges || [], grip: pick.doc.grip ?? null, note: pick.doc.note ?? null, superset: pick.doc.superset ?? null }
    : newExerciseDoc({ name: pick.name, muscle: pick.muscle, reps: template?.reps || defaultRepsFor(EXERCISE_CATALOG, pick.name) });
  id = await saveExerciseDoc(null, data);
  state.exercisesCatalog.set(id, data);
  return id;
}

/** rebuildUserDays; if state.session is loaded and state.current is in `weekdays`: reconcileSession → scheduleSave → renderDay; then renderStrip. */
export function refreshAfterPlanEdit(weekdays){
  rebuildUserDays();
  const touched = weekdays instanceof Set ? weekdays : new Set(weekdays);
  if(state.session && touched.has(state.current)){
    state.session = reconcileSession(state.session, state.current);
    scheduleSave();
    renderDay();
  }
  renderStrip();
}

let _toastTimer = null;

function ensureToastEl(){
  let $t = document.getElementById("planToast");
  if(!$t){
    $t = document.createElement("div");
    $t.id = "planToast";
    $t.className = "gamif-toast pw-toast";
    document.body.appendChild($t);
  }
  return $t;
}

function showToast($t, ms){
  $t.classList.remove("show");
  void $t.offsetWidth; // reflow, restarts the CSS transition on rapid re-shows
  $t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => $t.classList.remove("show"), ms);
}

/** Undo toast: message + "Desfazer" button, 5s, one at a time. */
export function showUndoToast(msg, onUndo){
  const $t = ensureToastEl();
  $t.innerHTML = `<span>${esc(msg)}</span><button class="pw-toast-undo" type="button">Desfazer</button>`;
  showToast($t, 5000);
  $t.querySelector(".pw-toast-undo").addEventListener("click", () => {
    clearTimeout(_toastTimer);
    $t.classList.remove("show");
    onUndo();
  }, { once: true });
}

/** Plain toast, 2.5s (reuses the same element, without the undo button). */
export function showInfoToast(msg){
  const $t = ensureToastEl();
  $t.innerHTML = `<span>${esc(msg)}</span>`;
  showToast($t, 2500);
}
