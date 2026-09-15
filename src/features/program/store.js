import { serverTimestamp } from "firebase/firestore";
import { state } from "../../core/state.js";
import * as repo from "../../core/repo.js";
import { reconcileProgram } from "../../domain/program.js";

export async function loadProgram(uid){
  try{ state.program = await repo.fetchProgram(uid); state.programLoaded = true; }
  catch(e){ console.warn("loadProgram:", e.message); }
}

/** Reconciles state.program with the catalog; persists only when it changed. */
export function syncProgram(){
  if(!state.user || !state.programLoaded || !state.catalogLoaded) return;
  const { program, changed } = reconcileProgram(state.program, state.exercisesCatalog, state.dayCustomizations);
  state.program = program;
  if(!changed) return;
  repo.putProgram(state.user.uid, { ...program, updatedAt: serverTimestamp() })
    .catch(e => console.warn("syncProgram:", e.message));
}

/** Replaces state.program and persists it (fire-and-forget). Call BEFORE rebuildUserDays(). */
export function saveProgram(program){
  state.program = program;
  if(!state.user || !state.programLoaded) return;
  repo.putProgram(state.user.uid, { ...program, updatedAt: serverTimestamp() })
    .catch(e => console.warn("saveProgram:", e.message));
}
