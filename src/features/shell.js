import { state } from "../core/state.js";
import * as repo from "../core/repo.js";
import {
  $themeBtn, $settingsThemeToggle,
  $tabTreino, $tabExercicios, $tabEvolucao, $viewTreino, $viewExercicios, $viewEvolucao,
  $bnTreino, $bnExercicios, $bnEvolucao,
  $modeCompact, $modeLoad, $sync,
} from "../core/dom.js";
import { renderEvolucao, initEvolucao } from "./evolution.js";
import { renderDay } from "./day/render.js";

const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z"/></svg>';

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

export function effectiveTheme(){
  return state.theme || (prefersDark.matches ? "dark" : "light");
}
export function applyTheme(){
  const t = effectiveTheme();
  document.documentElement.setAttribute("data-theme", t);
  $themeBtn.innerHTML = t === "dark" ? ICON_SUN : ICON_MOON;
  $themeBtn.title = t === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro";
  if($settingsThemeToggle){
    $settingsThemeToggle.innerHTML = (t === "dark" ? ICON_SUN : ICON_MOON) +
      `<span>${t === "dark" ? "Tema claro" : "Tema escuro"}</span>`;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", t === "dark" ? "#0E0F12" : "#F4F5F7");
  try{
    if(state.theme) localStorage.setItem("ss_theme", state.theme);
    else localStorage.removeItem("ss_theme");
  }catch(_){}
}

export function toggleTheme(){
  state.theme = effectiveTheme() === "dark" ? "light" : "dark";
  applyTheme();
  savePref();
  if(state.evoChart && $viewEvolucao.style.display !== "none") renderEvolucao();
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

export function applyModeButtons(){
  $modeCompact.classList.toggle("active", state.viewMode === "compact");
  $modeLoad.classList.toggle("active", state.viewMode === "load");
}

export function setMode(m){
  state.viewMode = m;
  applyModeButtons();
  renderDay();
  savePref();
}

export function setSync(status, txt){
  $sync.className = "sync-status " + status;
  $sync.querySelector(".txt").textContent = txt;
}

export function showTab(which){
  if(which !== "treino" && state.trainMode && window._exitTrainMode) window._exitTrainMode();
  $tabTreino.classList.toggle("active", which === "treino");
  $tabExercicios.classList.toggle("active", which === "exercicios");
  $tabEvolucao.classList.toggle("active", which === "evolucao");
  $viewTreino.style.display = which === "treino" ? "" : "none";
  $viewExercicios.style.display = which === "exercicios" ? "" : "none";
  $viewEvolucao.style.display = which === "evolucao" ? "" : "none";
  syncBottomNav(which);
  if(window._updateCondensed) window._updateCondensed();
  if(which === "evolucao") initEvolucao();
  if(which === "exercicios" && window._renderExercicios) window._renderExercicios();
}

function syncBottomNav(which){
  $bnTreino.setAttribute("aria-selected", which === "treino");
  $bnExercicios.setAttribute("aria-selected", which === "exercicios");
  $bnEvolucao.setAttribute("aria-selected", which === "evolucao");
}

export function init(){
  $themeBtn.addEventListener("click", toggleTheme);
  prefersDark.addEventListener("change", () => { if(!state.theme) applyTheme(); });

  $tabTreino.addEventListener("click", () => showTab("treino"));
  $tabExercicios.addEventListener("click", () => showTab("exercicios"));
  $tabEvolucao.addEventListener("click", () => showTab("evolucao"));

  $bnTreino.addEventListener("click", () => showTab("treino"));
  $bnExercicios.addEventListener("click", () => showTab("exercicios"));
  $bnEvolucao.addEventListener("click", () => showTab("evolucao"));

  $modeCompact.addEventListener("click", () => setMode("compact"));
  $modeLoad.addEventListener("click", () => setMode("load"));
}
