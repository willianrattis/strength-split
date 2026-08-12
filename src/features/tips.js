import { state } from "../core/state.js";
import { savePref } from "./prefs.js";

export function hasSeenTip(id){
  return state.tipsSeen.has(id);
}

export function markTipSeen(id){
  if(!state.tipsSeen.has(id)){
    state.tipsSeen.add(id);
    savePref();
  }
}
