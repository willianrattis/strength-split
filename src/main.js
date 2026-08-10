import { onAuthStateChanged } from "firebase/auth";

import { todayStr } from "./domain/dates.js";
import { state } from "./core/state.js";
import { $authBox, $appContent, $gateWrap, $strip, $panel, $viewTreino } from "./core/dom.js";
import { auth } from "./core/firebase.js";
import { teardownFeatureFlags, isFeatureEnabled } from "./core/flags.js";
import * as modal from "./core/ui/modal.js";
import * as stickyHeader from "./core/ui/sticky-header.js";
import * as authModule from "./core/auth.js";
import { initWithTimeout, renderInitError } from "./core/auth.js";
import { applyTheme, applyModeButtons, savePref, setSync } from "./features/shell.js";
import * as shell from "./features/shell.js";
import {
  applyPrevLayoutState, syncPrevLayoutToggle, syncPeriodToggle, syncMachinesToggle,
  syncProfileToggle, syncAutoregToggle, syncExecOrderToggle, syncGamificationToggle, syncAutoregSensToggle,
} from "./features/settings.js";
import * as settings from "./features/settings.js";
import * as profileModal from "./features/profile-modal.js";
import { renderGamifChip, refreshGamification } from "./features/gamification.js";
import * as gamification from "./features/gamification.js";
import * as wrapped from "./features/wrapped.js";
import * as evolution from "./features/evolution.js";
import * as exportData from "./features/export.js";
import * as sharePdf from "./features/share-pdf.js";
import { renderDay, renderStrip, skeletonStrip, skeletonPanel } from "./features/day/render.js";
import * as dayRender from "./features/day/render.js";
import * as substitutionModal from "./features/day/substitution-modal.js";
import * as machineModal from "./features/day/machine-modal.js";
import * as train from "./features/train/index.js";
import * as exercisesList from "./features/exercises/list.js";

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
function setGamifChipLoading(on){
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
function bindFlagsUpdatedListener(){
  window.addEventListener("flagsUpdated", () => {
    applyPeriodizationState();
    applyMachinesState();
    applyProfileState();
    applyAutoregState();
    applyExecOrderState();
    applyGamificationState();
  });
}

// ========= Settings bottom-sheet (mobile): flag toggles that need renderDay/apply*State, still resident here =========
// settings.js owns openSettings/closeSettings/the sync*Toggle definitions and the
// listeners that don't need renderDay or the apply*State functions below.
document.getElementById("prevLayoutToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-prevlayout]");
  if(!btn) return;
  state.prevLayout = btn.dataset.prevlayout === "panel" ? "panel" : "column";
  syncPrevLayoutToggle();
  savePref();
  applyPrevLayoutState();
  // renderDay is required, not optional: seriesHTML branches on the layout in JS.
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("periodToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-period]");
  if(!btn) return;
  state.periodizationEnabled = btn.dataset.period === "on";
  syncPeriodToggle();
  savePref();
  applyPeriodizationState();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("machinesToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-mach]");
  if(!btn) return;
  state.machinesEnabled = btn.dataset.mach === "on";
  syncMachinesToggle();
  savePref();
  applyMachinesState();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("profileToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-prof]");
  if(!btn) return;
  state.profileEnabled = btn.dataset.prof === "on";
  syncProfileToggle();
  savePref();
  applyProfileState();
});
document.getElementById("autoregToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-autoreg]");
  if(!btn) return;
  state.autoregEnabled = btn.dataset.autoreg === "on";
  syncAutoregToggle();
  savePref();
  applyAutoregState();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("autoregSensToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-sens]");
  if(!btn) return;
  state.autoregSensitivity = btn.dataset.sens;
  syncAutoregSensToggle();
  savePref();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("execOrderToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-execorder]");
  if(!btn) return;
  state.execOrderEnabled = btn.dataset.execorder === "on";
  syncExecOrderToggle();
  savePref();
  applyExecOrderState();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("gamificationToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-gamif]");
  if(!btn) return;
  state.gamificationEnabled = btn.dataset.gamif === "on";
  if(state.gamificationEnabled && !state.gamifStartDate) state.gamifStartDate = todayStr();
  syncGamificationToggle();
  savePref();
  refreshGamification();
  applyGamificationState();
});

// ========= Auth (loginBtn/logout/online-offline wiring + initApp/initWithTimeout/renderInitError live in core/auth.js) =========
onAuthStateChanged(auth, async u => {
  state.user = u;
  state.allSessions = null;
  state.allSessionsTruncated = false;
  state.allSessionsError = false;
  state.allSessionsPromise = null;
  state.gamification = null;
  state.gamificationEnabled = false;
  state.gamifStartDate = null;
  setGamifChipLoading(true);
  if(u){
    $authBox.textContent = (u.displayName||u.email||"").split(" ")[0];
    $gateWrap.style.display = "none";
    $appContent.style.display = "";
    $strip.innerHTML = skeletonStrip();
    $panel.innerHTML = skeletonPanel();
    setSync("live", "sincronizado");
    if(window.SSSplash) window.SSSplash.ready();
    try {
      await initWithTimeout(u);
    } catch(e) {
      console.error("init:", e);
      renderInitError();
    }
  } else {
    $authBox.textContent = "";
    $gateWrap.style.display = "block";
    $appContent.style.display = "none";
    setSync("", "aguardando login");
    if(window.SSSplash) window.SSSplash.ready();
    state.exercisesCatalog.clear();
    state.userDays = null;
    state.dayCustomizations = {};
    state.plansCache.clear();
    state.currentPlanName = null;
    state.currentPlanId = null;
    state.currentPlanKey = null;
    teardownFeatureFlags();
  }
});

// ========= Bootstrap =========
modal.init();
stickyHeader.init();
authModule.init();
shell.init();
settings.init();
profileModal.init();
gamification.init();
wrapped.init();
evolution.init();
exportData.init();
sharePdf.init();
dayRender.init();
substitutionModal.init();
machineModal.init();
train.init();
exercisesList.init();

bindFlagsUpdatedListener();

applyTheme();
applyModeButtons();
renderStrip();
