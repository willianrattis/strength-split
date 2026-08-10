import { state } from "../core/state.js";
import { $settingsModal, $settingsThemeToggle, $bnConfig } from "../core/dom.js";
import { toggleTheme } from "./shell.js";
import { openProfileModal } from "./profile-modal.js";
import { exportUserData } from "./export.js";

export function applyPrevLayoutState(){
  document.body.classList.toggle("layout-prev-column", state.prevLayout === "column" && !state.trainMode);
}
export function syncPrevLayoutToggle(){
  document.querySelectorAll('#prevLayoutToggle [data-prevlayout]').forEach(b =>
    b.classList.toggle("active", b.dataset.prevlayout === state.prevLayout));
}

export function syncPeriodToggle(){
  const $on = document.querySelector('#periodToggle [data-period="on"]');
  const $off = document.querySelector('#periodToggle [data-period="off"]');
  $on.classList.toggle("active", state.periodizationEnabled);
  $off.classList.toggle("active", !state.periodizationEnabled);
}
export function syncMachinesToggle(){
  const $on = document.querySelector('#machinesToggle [data-mach="on"]');
  const $off = document.querySelector('#machinesToggle [data-mach="off"]');
  $on.classList.toggle("active", state.machinesEnabled);
  $off.classList.toggle("active", !state.machinesEnabled);
}
export function syncProfileToggle(){
  const $on = document.querySelector('#profileToggle [data-prof="on"]');
  const $off = document.querySelector('#profileToggle [data-prof="off"]');
  $on.classList.toggle("active", state.profileEnabled);
  $off.classList.toggle("active", !state.profileEnabled);
}
export function syncAutoregToggle(){
  const $on = document.querySelector('#autoregToggle [data-autoreg="on"]');
  const $off = document.querySelector('#autoregToggle [data-autoreg="off"]');
  $on.classList.toggle("active", state.autoregEnabled);
  $off.classList.toggle("active", !state.autoregEnabled);
}
export function syncExecOrderToggle(){
  const $on = document.querySelector('#execOrderToggle [data-execorder="on"]');
  const $off = document.querySelector('#execOrderToggle [data-execorder="off"]');
  $on.classList.toggle("active", state.execOrderEnabled);
  $off.classList.toggle("active", !state.execOrderEnabled);
}
export function syncGamificationToggle(){
  const $on = document.querySelector('#gamificationToggle [data-gamif="on"]');
  const $off = document.querySelector('#gamificationToggle [data-gamif="off"]');
  $on.classList.toggle("active", state.gamificationEnabled);
  $off.classList.toggle("active", !state.gamificationEnabled);
}
export function syncAutoregSensToggle(){
  document.querySelectorAll('#autoregSensToggle [data-sens]').forEach(b =>
    b.classList.toggle("active", b.dataset.sens === state.autoregSensitivity));
  const desc = document.getElementById("autoregSensDesc");
  if(desc) desc.textContent = ({
    suave: "Só sugere mudança em desvios grandes; prioriza estabilidade.",
    mod:   "Equilíbrio entre reagir ao desempenho e respeitar a fadiga.",
    agr:   "Sobe a carga assim que você supera a meta, mesmo cansado.",
  })[state.autoregSensitivity] || "";
}
export function openSettings(){
  syncPrevLayoutToggle();
  syncPeriodToggle();
  syncMachinesToggle();
  syncProfileToggle();
  syncAutoregToggle();
  syncAutoregSensToggle();
  syncExecOrderToggle();
  syncGamificationToggle();
  $settingsModal.classList.add("open");
}
export function closeSettings(){ $settingsModal.classList.remove("open"); }

export function init(){
  applyPrevLayoutState(); // default before any prefs load

  $bnConfig.addEventListener("click", openSettings);
  $settingsModal.addEventListener("click", e => { if(e.target === $settingsModal) closeSettings(); });
  $settingsThemeToggle.addEventListener("click", toggleTheme);
  document.getElementById("settingsSubTabs").addEventListener("click", e => {
    const b = e.target.closest("[data-settingstab]"); if(!b) return;
    const tab = b.dataset.settingstab;
    document.querySelectorAll("#settingsSubTabs [data-settingstab]").forEach(x =>
      x.classList.toggle("active", x.dataset.settingstab === tab));
    document.querySelectorAll('#settingsModalInner [data-settingspanel]').forEach(p =>
      p.classList.toggle("active", p.dataset.settingspanel === tab));
  });
  document.getElementById("settingsProfileEditRow").addEventListener("click", () => {
    closeSettings();
    openProfileModal();
  });
  document.getElementById("settingsExportRow").addEventListener("click", exportUserData);
  document.getElementById("settingsBtnDesktop").addEventListener("click", openSettings);
}
