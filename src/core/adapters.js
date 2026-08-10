import { state } from "./state.js";
import { DAYS } from "../data/days.js";
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
  bestWeightEver as domainBestWeightEver
} from "../domain/history.js";
import { suggestLoads as domainSuggestLoads } from "../domain/suggestion.js";
import { isDeloadActive as domainIsDeloadActive, deloadDue as domainDeloadDue } from "../domain/deload.js";
import { buildMuscleIndex as domainBuildMuscleIndex } from "../domain/muscles.js";
import { computeWrapped as domainComputeWrapped } from "../domain/wrapped.js";

export function activeDays(){ return state.userDays || DAYS; }

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

export const prevLoadData = (name, machine) => domainPrevLoadData(state.allSessions, name, machine, histCtx());
export const exerciseTopHistory = (name, since = null, machine) => domainExerciseTopHistory(state.allSessions, name, { ...histCtx(), since, machine });
export const bestWeightEver = (name, machine) => domainBestWeightEver(state.allSessions, name, machine, histCtx());

export const suggestLoads = (name, unit, machine, opts) => domainSuggestLoads(state.allSessions, name, unit, machine, {
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
  days: DAYS,
  templates: PLAN_TEMPLATES,
  catalog: EXERCISE_CATALOG
}));
