import { todayStr } from "../domain/dates.js";
import { MUSCLE_ORDER } from "../data/labels.js";
import { state } from "../core/state.js";
import * as repo from "../core/repo.js";
import { applyTheme, applyModeButtons } from "./shell.js";
import { applyPrevLayoutState } from "./settings.js";
import {
  applyPeriodizationState, applyMachinesState, applyProfileState,
  applyAutoregState, applyExecOrderState, applyGamificationState,
} from "./flag-state.js";

export async function loadPref(){
  if(!state.user) return;
  try{
    const d = await repo.getPrefs(state.user.uid);
    if(d){
      if(d.viewMode) state.viewMode = d.viewMode;
      if(d.theme === "dark" || d.theme === "light") state.theme = d.theme;
      if(d.currentPlanName) state.currentPlanName = d.currentPlanName;
      if(d.currentPlanId) state.currentPlanId = d.currentPlanId;
      if(d.currentPlanKey) state.currentPlanKey = d.currentPlanKey;
      if(d.lastDeloadDate) state.lastDeloadDate = d.lastDeloadDate;
      if(d.prevLayout === "panel" || d.prevLayout === "column") state.prevLayout = d.prevLayout;
      if(typeof d.periodizationEnabled === "boolean") state.periodizationEnabled = d.periodizationEnabled;
      if(typeof d.machinesEnabled === "boolean") state.machinesEnabled = d.machinesEnabled;
      if(typeof d.profileEnabled === "boolean") state.profileEnabled = d.profileEnabled;
      if(typeof d.autoregEnabled === "boolean") state.autoregEnabled = d.autoregEnabled;
      if(["suave","mod","agr"].includes(d.autoregSensitivity)) state.autoregSensitivity = d.autoregSensitivity;
      if(typeof d.execOrderEnabled === "boolean") state.execOrderEnabled = d.execOrderEnabled;
      if(typeof d.gamificationEnabled === "boolean") state.gamificationEnabled = d.gamificationEnabled;
      if(typeof d.gamifStartDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.gamifStartDate)) state.gamifStartDate = d.gamifStartDate;
      if(typeof d.firstRunHintSeen === "boolean") state.firstRunHintSeen = d.firstRunHintSeen;
    }
  }catch(e){ console.warn("loadPref:", e.message); }
  // Migrate: gamification already ON but no start date → anchor to today (fresh window)
  if(state.gamificationEnabled && !state.gamifStartDate){ state.gamifStartDate = todayStr(); savePref(); }
  // load profile doc
  try{
    const p = await repo.getProfileDoc(state.user.uid);
    if(p){
      state.profile.birthDate = (typeof p.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)) ? p.birthDate : null;
      if(p.sex === "m" || p.sex === "f") state.profile.sex = p.sex; else state.profile.sex = null;
      if(typeof p.bodyweight === "number" && p.bodyweight > 0) state.profile.bodyweight = p.bodyweight; else state.profile.bodyweight = null;
      if(p.experience === "beg" || p.experience === "int" || p.experience === "adv") state.profile.experience = p.experience; else state.profile.experience = null;
      if(p.injuries && typeof p.injuries === "object"){
        state.profile.injuries = {};
        MUSCLE_ORDER.forEach(k => { if(p.injuries[k] === true) state.profile.injuries[k] = true; });
      } else { state.profile.injuries = {}; }
    }
  }catch(e){ console.warn("loadProfile:", e.message); }
  applyModeButtons();
  applyTheme();
  applyPrevLayoutState();
  applyPeriodizationState();
  applyMachinesState();
  applyProfileState();
  applyAutoregState();
  applyExecOrderState();
  applyGamificationState();
}

export async function savePref(){
  if(!state.user) return;
  try{
    await repo.setPrefs(state.user.uid, {
      viewMode: state.viewMode, theme: state.theme || null,
      currentPlanName: state.currentPlanName || null,
      currentPlanId: state.currentPlanId || null,
      currentPlanKey: state.currentPlanKey || null,
      prevLayout: state.prevLayout,
      periodizationEnabled: state.periodizationEnabled,
      machinesEnabled: state.machinesEnabled,
      profileEnabled: state.profileEnabled,
      autoregEnabled: state.autoregEnabled,
      autoregSensitivity: state.autoregSensitivity,
      execOrderEnabled: state.execOrderEnabled,
      gamificationEnabled: state.gamificationEnabled,
      gamifStartDate: state.gamifStartDate || null,
      firstRunHintSeen: state.firstRunHintSeen,
    });
  }catch(e){ console.warn("savePref:", e.message); }
}

export async function saveDeloadDate(){
  if(!state.user) return;
  try{
    await repo.setPrefs(state.user.uid, { lastDeloadDate: state.lastDeloadDate });
  }catch(e){ console.warn("saveDeloadDate:", e.message); }
}
