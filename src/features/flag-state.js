import { state } from "../core/state.js";
import { isFeatureEnabled } from "../core/flags.js";
import { renderGamifChip } from "./gamification.js";

export function applyPeriodizationState(){
  const available = isFeatureEnabled("periodization");
  const active = available && state.periodizationEnabled;
  document.body.classList.toggle("flag-periodization-available", available);
  document.body.classList.toggle("flag-periodization", active);
}
export function applyMachinesState(){
  const available = isFeatureEnabled("machines");
  const active = available && state.machinesEnabled;
  document.body.classList.toggle("flag-machines-available", available);
  document.body.classList.toggle("flag-machines", active);
}
export function applyProfileState(){
  const available = isFeatureEnabled("profile");
  const active = available && state.profileEnabled;
  document.body.classList.toggle("flag-profile-available", available);
  document.body.classList.toggle("flag-profile", active);
}
export function applyAutoregState(){
  const available = isFeatureEnabled("autoreg");
  const active = available && state.autoregEnabled;
  document.body.classList.toggle("flag-autoreg-available", available);
  document.body.classList.toggle("flag-autoreg", active);
}
export function applyExecOrderState(){
  const available = isFeatureEnabled("execOrder");
  const active = available && state.execOrderEnabled;
  document.body.classList.toggle("flag-exec-order-available", available);
  document.body.classList.toggle("flag-exec-order", active);
}
export function setGamifChipLoading(on){
  const $chip = document.getElementById("gamifChip");
  if($chip) $chip.classList.toggle("loading", !!on);
}
export function applyGamificationState(){
  const available = isFeatureEnabled("gamification");
  const active = available && state.gamificationEnabled;
  document.body.classList.toggle("flag-gamification-available", available);
  document.body.classList.toggle("flag-gamification", active);
  if(active){
    if(state.gamification) renderGamifChip();
    else setGamifChipLoading(true);
  }
}

export function init(){
  window.addEventListener("flagsUpdated", () => {
    applyPeriodizationState();
    applyMachinesState();
    applyProfileState();
    applyAutoregState();
    applyExecOrderState();
    applyGamificationState();
  });
}
