import { serverTimestamp } from "firebase/firestore";
import { dateForDay, sessionId, formatDate } from "../../domain/dates.js";
import { state } from "../../core/state.js";
import * as repo from "../../core/repo.js";
import { SESSIONS_PAGE_SIZE, RECENT_WINDOW_DAYS } from "../../core/config.js";
import { collectAllPages } from "../../core/pagination.js";
import { emptySession, reconcileSession } from "../../core/adapters.js";
import { setSync } from "../shell.js";
import { refreshGamification } from "../gamification.js";
import { renderDay } from "./render.js";

// Drives collectAllPages with the Firestore-backed page fetcher. Pages come back
// date-desc (see repo.fetchSessionsPage), so straight concatenation stays
// newest-first — the order the rest of this module already assumes.
//
// Cursor note: the cursor is the last page's `date`. A session id is
// `{date}_{dayKey}` and the user logs at most one workout per calendar date per day
// slot, so `date` is effectively unique per session here — startAfter(date) can't
// skip a same-date sibling in this schema. A docId-based cursor would be strictly
// safer in general, but is out of scope for this phase.
export function fetchAllSessions(uid){
  return collectAllPages(cursor => repo.fetchSessionsPage(uid, { limit: SESSIONS_PAGE_SIZE, startAfterDate: cursor }));
}

// The day view's own lookback horizon — see RECENT_WINDOW_DAYS in core/config.js.
export function recentCutoff(){
  const d = new Date();
  d.setDate(d.getDate() - RECENT_WINDOW_DAYS);
  return formatDate(d);
}

function coversNeed(need){
  if(state.sessionsLoadedSince === "ALL") return true;
  if(need === "ALL") return false;
  return state.sessionsLoadedSince !== null && state.sessionsLoadedSince <= need;
}

// Loads (and caches) a recent window of session history — enough for the day view
// (prevLoad, suggestions, deload checks, machine info). Called from loadDay below.
export async function loadRecentSessions(){
  if(state.allSessions || !state.user) return;
  if(state.allSessionsPromise) return state.allSessionsPromise;
  const cutoff = recentCutoff();
  state.allSessionsPromise = (async () => {
    try{
      state.allSessions = await repo.fetchSessionsSince(state.user.uid, cutoff);
      state.sessionsLoadedSince = cutoff;
      state.allSessionsError = false;
    }catch(e){
      console.error("loadRecentSessions failed:", e);
      state.allSessionsError = true;
      state.allSessions = null;   // leave unset so the next navigation retries
      state.sessionsLoadedSince = null;
    } finally {
      state.allSessionsPromise = null;
      refreshGamification();
    }
  })();
  return state.allSessionsPromise;
}

// Widens the session cache to cover `need` — a "YYYY-MM-DD" cutoff, or "ALL" for
// full history — if the current coverage doesn't already satisfy it. Consumers that
// need more than the day view's recent window (Evolução, Wrapped, Gamificação,
// train-mode summary) call this before reading state.allSessions. The 4.3
// sessionsFor() memo in core/adapters.js invalidates automatically on the
// state.allSessions reference change, so no extra cache-busting is needed here.
export async function ensureSessionsLoaded(need){
  if(!state.user) return;
  if(state.allSessionsPromise) await state.allSessionsPromise;
  if(coversNeed(need)) return;
  state.allSessionsPromise = (async () => {
    try{
      state.allSessions = need === "ALL"
        ? await fetchAllSessions(state.user.uid)
        : await repo.fetchSessionsSince(state.user.uid, need);
      state.sessionsLoadedSince = need;
      state.allSessionsError = false;
    }catch(e){
      console.error("ensureSessionsLoaded failed:", e);
      state.allSessionsError = true;
      // Keep whatever coverage was already loaded rather than discarding it — the
      // next call with the same `need` will simply retry the widen.
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
    await loadRecentSessions();
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
      state.allSessions = idx >= 0
        ? state.allSessions.map((s, i) => i === idx ? { ...state.session } : s)
        : [...state.allSessions, { ...state.session }];
      refreshGamification();
    }
  }catch(e){
    setSync("offline","erro ao salvar");
    console.error(e);
  }
}
