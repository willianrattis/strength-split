import { state } from "./state.js";
import { WEEKDAYS } from "../data/days.js";
import { PLAN_TEMPLATES } from "../data/plan-templates.js";
import { EXERCISE_CATALOG } from "../data/exercise-catalog.js";
import { formatDate, dateForDay } from "../domain/dates.js";
import {
  lastMachineFor as domainLastMachineFor, usedMachinesRanked as domainUsedMachinesRanked,
  matchVariant as domainMatchVariant
} from "../domain/machines.js";
import { emptySession as domainEmptySession, reconcileSession as domainReconcileSession } from "../domain/session.js";
import { autoregCfg as domainAutoregCfg, projectLoad as domainProjectLoad } from "../domain/autoreg.js";
import { profileAge as domainProfileAge } from "../domain/profile.js";
import {
  prevLoadData as domainPrevLoadData, exerciseTopHistory as domainExerciseTopHistory,
  bestWeightEver as domainBestWeightEver, buildSessionsByName
} from "../domain/history.js";
import { suggestLoads as domainSuggestLoads } from "../domain/suggestion.js";
import { isDeloadActive as domainIsDeloadActive, deloadDue as domainDeloadDue } from "../domain/deload.js";
import { buildMuscleIndex as domainBuildMuscleIndex } from "../domain/muscles.js";
import { computeWrapped as domainComputeWrapped } from "../domain/wrapped.js";

// Fallback before rebuildUserDays has ever run — neutral scaffold, no author content.
function neutralDays(){ return WEEKDAYS.map(d => ({...d, tag:"", focus:"", ex:[]})); }
export function activeDays(){ return state.userDays || neutralDays(); }

export const machineFilterActive = () => document.body.classList.contains("flag-machines");
export const profileActive = () => document.body.classList.contains("flag-profile");
export const execOrderActive = () => document.body.classList.contains("flag-exec-order");

export const lastMachineFor = (name, isSup = false) => domainLastMachineFor(state.allSessions, name, isSup);
export const usedMachinesRanked = () => domainUsedMachinesRanked(state.allSessions);
export const matchVariant = (entryMachine, machine) => domainMatchVariant(entryMachine, machine, machineFilterActive());

export const sessionOpts = dayKey => ({
  day: activeDays()[dayKey],
  date: dateForDay(dayKey, state.weekOffset),
  sessions: state.allSessions,
  machinesActive: document.body.classList.contains("flag-machines")
});
export const emptySession = dayKey => domainEmptySession(dayKey, sessionOpts(dayKey));
export const reconcileSession = (prev, dayKey) => domainReconcileSession(prev, dayKey, sessionOpts(dayKey));

export const autoregCfg = () => domainAutoregCfg(state.autoregSensitivity);
export const profileAge = () => domainProfileAge(state.profile.birthDate);
export const projectLoad = (w, repsDone, target, equip, u, step, fatigueSteps) =>
  domainProjectLoad(w, repsDone, target, equip, u, step, fatigueSteps, autoregCfg());

export const histCtx = () => ({
  currentKey: state.session ? (state.session.date + "_" + state.session.dayKey) : null,
  machineFilter: machineFilterActive(),
  execOrder: execOrderActive(),
  cfg: autoregCfg()
});

// Memoized on state.allSessions identity — allSessions is only ever replaced,
// never mutated in place (see saveNow in day/session-io.js), so this stays valid.
let _sbnRef = null, _sbn = null;
function sessionsFor(name){
  if(state.allSessions !== _sbnRef){
    _sbnRef = state.allSessions;
    _sbn = state.allSessions ? buildSessionsByName(state.allSessions) : new Map();
  }
  return _sbn.get(name) || [];
}

export const prevLoadData = (name, machine) => domainPrevLoadData(sessionsFor(name), name, machine, histCtx());
export const exerciseTopHistory = (name, since = null, machine) => domainExerciseTopHistory(sessionsFor(name), name, { ...histCtx(), since, machine });
export const bestWeightEver = (name, machine) => domainBestWeightEver(sessionsFor(name), name, machine, histCtx());

export const suggestLoads = (name, unit, machine, opts) => domainSuggestLoads(sessionsFor(name), name, unit, machine, {
  ...histCtx(),
  muscle: opts && opts.muscle,
  profileActive: profileActive(),
  profile: state.profile
});

export const isDeloadActive = () => domainIsDeloadActive(state.lastDeloadDate, formatDate(new Date()));
export const deloadDue = () => domainDeloadDue(state.allSessions, {
  ...histCtx(),
  lastDeloadDate: state.lastDeloadDate,
  today: formatDate(new Date()),
  days: activeDays(),
  age: profileActive() ? profileAge() : null
});

export const computeWrapped = (sessions, year) => domainComputeWrapped(sessions, year, domainBuildMuscleIndex({
  plans: state.plansCache ? [...state.plansCache.values()] : [],
  days: state.userDays || [],
  templates: PLAN_TEMPLATES,
  catalog: EXERCISE_CATALOG
}));
