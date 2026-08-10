import { serverTimestamp } from "firebase/firestore";
import { dateForDay, sessionId } from "../../domain/dates.js";
import { state } from "../../core/state.js";
import * as repo from "../../core/repo.js";
import { SESSIONS_FETCH_LIMIT } from "../../core/config.js";
import { emptySession, reconcileSession } from "../../core/adapters.js";
import { setSync } from "../shell.js";
import { refreshGamification } from "../gamification.js";
import { renderDay } from "./render.js";

// Loads (and caches) the user's full session history. Called both from loadDay
// below and from evolution.js's renderEvolucao.
export async function loadAllSessions(){
  if(state.allSessions || !state.user) return;
  if(state.allSessionsPromise) return state.allSessionsPromise;
  state.allSessionsPromise = (async () => {
    try{
      const { sessions, truncated } = await repo.fetchSessions(state.user.uid, SESSIONS_FETCH_LIMIT);
      state.allSessions = sessions;
      state.allSessionsTruncated = truncated;
      state.allSessionsError = false;
      if(state.allSessionsTruncated) console.warn("allSessions truncated at", SESSIONS_FETCH_LIMIT);
    }catch(e){
      console.error("loadAllSessions failed:", e);
      state.allSessionsError = true;
      state.allSessions = null;   // leave unset so the next navigation retries
    } finally {
      state.allSessionsPromise = null;
      refreshGamification();
    }
  })();
  return state.allSessionsPromise;
}

export function findPrevSession(dayKey, beforeDate){
  if(!state.allSessions) return null;
  return state.allSessions
    .filter(s => s.dayKey === dayKey && s.date < beforeDate)
    .sort((a,b) => b.date.localeCompare(a.date))[0] || null;
}

export async function loadDay(dayKey){
  if(!state.user) return;
  const token = ++state.loadDayToken;
  const date = dateForDay(dayKey, state.weekOffset);
  try{
    const data = await repo.getSessionDoc(state.user.uid, sessionId(date, dayKey));
    if(token !== state.loadDayToken) return;
    state.session = reconcileSession(data, dayKey);
  }catch(e){
    if(token !== state.loadDayToken) return;
    console.warn("loadDay:", e);
    state.session = emptySession(dayKey);
  }
  state.prevSession = findPrevSession(dayKey, date);
  renderDay();
  if(!state.allSessions){
    await loadAllSessions();
    if(token !== state.loadDayToken) return;
    state.prevSession = findPrevSession(dayKey, date);
    renderDay();
  }
}

export function scheduleSave(){
  if(!state.user) return;
  setSync("saving","salvando…");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNow, 500);
}
export async function saveNow(){
  if(!state.user || !state.session) return;
  try{
    await repo.putSessionDoc(state.user.uid, sessionId(state.session.date, state.session.dayKey), { ...state.session, updatedAt: serverTimestamp() });
    setSync(navigator.onLine ? "live" : "offline", navigator.onLine ? "sincronizado" : "offline — salvando local");
    if(state.allSessions){
      const idx = state.allSessions.findIndex(s => s.date === state.session.date && s.dayKey === state.session.dayKey);
      if(idx >= 0) state.allSessions[idx] = { ...state.session };
      else state.allSessions.push({ ...state.session });
      refreshGamification();
    }
  }catch(e){
    setSync("offline","erro ao salvar");
    console.error(e);
  }
}
