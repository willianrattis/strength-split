import { onAuthStateChanged } from "firebase/auth";
import { serverTimestamp } from "firebase/firestore";

import { stripDiacritics, esc, normMachine } from "./domain/text.js";
import { formatDate, todayStr, getWeekMonday, dateForDay, sessionId, shortDate } from "./domain/dates.js";
import { equipmentOf } from "./domain/equipment.js";
import { orderForDay, cmpExOrder } from "./domain/order.js";
import { UNIT_CYCLE, UNIT_ABBR, UNIT_BTN, UNIT_STEP } from "./domain/units.js";
import { state } from "./core/state.js";
import {
  $authBox, $appContent, $gateWrap, $strip, $panel, $weekPrev, $weekNext, $weekLabel,
  $modeCompact, $modeLoad, $viewTreino,
  $dayCustomSection, $exFilterBar, $exList, $exModal, $exModalInner, $plansSection, $planModal,
  $planModalInner, $applyPlanModal, $applyPlanModalInner, $dayEditModal, $dayEditModalBody,
  $trainSegs, $trainCount, $trainFocus,
  $subModal, $subModalInner, $machineModal, $machineModalInner,
} from "./core/dom.js";
import { DAYS, DAY_NAMES_SHORT } from "./data/days.js";
import { PLAN_TEMPLATES } from "./data/plan-templates.js";
import { EXERCISE_CATALOG } from "./data/exercise-catalog.js";
import { MUSCLE_ORDER, MUSCLE_LABEL, BADGE_LABEL } from "./data/labels.js";
import { GAP_MIN_MS, GAP_MAX_MS, DELOAD_FACTOR } from "./core/config.js";
import { auth } from "./core/firebase.js";
import * as repo from "./core/repo.js";
import { initializeFeatureFlags, teardownFeatureFlags, isFeatureEnabled } from "./core/flags.js";
import {
  activeDays, machineFilterActive,
  usedMachinesRanked, matchVariant,
  emptySession, reconcileSession,
  projectLoad,
  prevLoadData, exerciseTopHistory, bestWeightEver,
  suggestLoads, isDeloadActive, deloadDue,
} from "./core/adapters.js";
import { centerActiveDay } from "./core/ui/sticky-header.js";
import * as modal from "./core/ui/modal.js";
import * as stickyHeader from "./core/ui/sticky-header.js";
import * as authModule from "./core/auth.js";
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
import { loadAllSessions, openEvolucaoFor, buildExerciseList } from "./features/evolution.js";
import * as evolution from "./features/evolution.js";
import * as exportData from "./features/export.js";
import * as sharePdf from "./features/share-pdf.js";

function applyPeriodizationState(){
  const available = isFeatureEnabled("periodization");
  const active = available && state.periodizationEnabled;
  document.body.classList.toggle("flag-periodization-available", available);
  document.body.classList.toggle("flag-periodization", active);
}
function applyMachinesState(){
  const available = isFeatureEnabled("machines");
  const active = available && state.machinesEnabled;
  document.body.classList.toggle("flag-machines-available", available);
  document.body.classList.toggle("flag-machines", active);
}
function applyProfileState(){
  const available = isFeatureEnabled("profile");
  const active = available && state.profileEnabled;
  document.body.classList.toggle("flag-profile-available", available);
  document.body.classList.toggle("flag-profile", active);
}
function applyAutoregState(){
  const available = isFeatureEnabled("autoreg");
  const active = available && state.autoregEnabled;
  document.body.classList.toggle("flag-autoreg-available", available);
  document.body.classList.toggle("flag-autoreg", active);
}
function applyExecOrderState(){
  const available = isFeatureEnabled("execOrder");
  const active = available && state.execOrderEnabled;
  document.body.classList.toggle("flag-exec-order-available", available);
  document.body.classList.toggle("flag-exec-order", active);
}
function setGamifChipLoading(on){
  const $chip = document.getElementById("gamifChip");
  if($chip) $chip.classList.toggle("loading", !!on);
}
function applyGamificationState(){
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

const MACHINE_CATALOG = ["Hammer","Life Fitness","Technogym","Matrix Fitness","Cybex","Nautilus","Movement","Cimerian","Ipiranga","Righetto"];

// ========= Estado em memória =========

const todayIdx = (()=>{ const g=new Date().getDay(); return g===0?6:g-1; })();
state.current = todayIdx;

// ========= DOM =========
const ICON_TREND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>';

// ========= Abas principais (shell.js owns showTab; kept here: exercises subtab wiring) =========
document.getElementById("exSubTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-subtab]"); if(!b) return;
  state.exSubTab = b.dataset.subtab; renderExercicios();
});

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
// ========= Profile modal — moved to features/profile-modal.js =========
// ========= Sticky header — moved to core/ui/sticky-header.js =========
// ========= Modal scroll lock + drag-to-dismiss — moved to core/ui/modal.js =========

// mode buttons: applyModeButtons lives in shell.js; setMode stays here because it
// calls renderDay(), which is day-view code not extracted in this phase.
function setMode(m){
  state.viewMode = m;
  applyModeButtons();
  renderDay();
  savePref();
}
$modeCompact.addEventListener("click", () => setMode("compact"));
$modeLoad.addEventListener("click", () => setMode("load"));

// ========= Auth (loginBtn/logout/online-offline wiring lives in core/auth.js) =========
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

async function initApp(u){
  await Promise.all([
    initializeFeatureFlags(),
    loadPref(),
    loadDayCustomizations(),
    loadExercises(u.uid),
    loadPlans(),
  ]);
  rebuildUserDays();
  renderStrip();
  await loadDay(state.current);
}
function initWithTimeout(u, ms = 15000){
  return Promise.race([
    initApp(u),
    new Promise((_, rej) => setTimeout(() => rej(new Error("init timeout")), ms)),
  ]);
}
function renderInitError(){
  $panel.innerHTML = `<div class="evo-empty">
    <span class="big">Não foi possível carregar</span>
    <p style="color:var(--muted);font-size:13px;margin:8px 0 14px">Verifique sua conexão e tente novamente.</p>
    <button class="ex-new-btn" id="initRetryBtn">Tentar novamente</button></div>`;
  document.getElementById("initRetryBtn").addEventListener("click", () => {
    $strip.innerHTML = skeletonStrip();
    $panel.innerHTML = skeletonPanel();
    initWithTimeout(state.user).catch(e => { console.error(e); renderInitError(); });
  });
}

// ========= Firestore =========

async function loadPref(){
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
// savePref lives in shell.js; scheduleProfileSave/saveProfileDoc live in profile-modal.js;
// loadAllSessions lives in evolution.js (imported above).
async function saveDeloadDate(){
  if(!state.user) return;
  try{
    await repo.setPrefs(state.user.uid, { lastDeloadDate: state.lastDeloadDate });
  }catch(e){ console.warn("saveDeloadDate:", e.message); }
}

function findPrevSession(dayKey, beforeDate){
  if(!state.allSessions) return null;
  return state.allSessions
    .filter(s => s.dayKey === dayKey && s.date < beforeDate)
    .sort((a,b) => b.date.localeCompare(a.date))[0] || null;
}

async function loadDay(dayKey){
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

function scheduleSave(){
  if(!state.user) return;
  setSync("saving","salvando…");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNow, 500);
}
async function saveNow(){
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

// ========= Gamificação — moved to features/gamification.js =========
// ========= Wrapped overlay logic — moved to features/wrapped.js =========

// ========= Render =========
function exDone(ex){
  const mainOk = ex.main.every(s => s.done);
  const supOk  = !ex.sup || ex.sup.every(s => s.done);
  return mainOk && supOk;
}
function countDone(){ return state.session.exercises.filter(exDone).length; }

function setPct(){
  let done = 0, total = 0;
  for(const ex of state.session.exercises){
    total += ex.main.length;
    done  += ex.main.filter(s => s.done).length;
    if(ex.sup){ total += ex.sup.length; done += ex.sup.filter(s => s.done).length; }
  }
  return total ? Math.round(done / total * 100) : 0;
}

// Legacy single-line renderer. Output is intentionally unchanged; stage B replaces it.
// Shared meta row + variant-1 panel. `prev` / `sug` are precomputed by renderDay so the
// history scan and the suggestion engine each run once per exercise.
// "×N" for the reps actually completed on that set last time. Accented when the user beat that
// session's target — the cue that the load is ready to go up. Empty when no repsDone was recorded.
function prevRepsHTML(ps){
  if(!ps || ps.repsDone == null) return "";
  const over = (ps.reps != null && ps.repsDone > ps.reps) ? " over" : "";
  return `<span class="pv-reps${over}">×${ps.repsDone}</span>`;
}

function prevBlockHTML(prev, sug, unit, exIdx, isSup){
  if(!prev && !sug) return "";
  const u = unit || "kg";
  const ua = UNIT_ABBR[u];
  const n = Math.max(prev ? prev.perSet.length : 0, sug ? sug.loads.length : 0);
  if(!n) return "";

  const rank = (prev && prev.execRank != null) ? ` · ${prev.execRank}º` : "";
  const dateTxt = prev
    ? `Último treino <b>${shortDate(prev.date)}</b>${rank}`
    : `Sem histórico`;
  const applyBtn = sug
    ? `<button class="suggest-apply" data-ex="${exIdx}" ${isSup?'data-sup="1"':""}>aplicar sugestão ${sug.dir}</button>`
    : "";

  let html = `<div class="prev-block">`;
  html += `<div class="prev-meta"><span class="pm-date">${dateTxt}</span>${applyBtn}</div>`;
  html += `<div class="prev-panel" style="--pp-cols:${n}">`;
  html += `<div class="pp-row pp-head"><span class="pp-lbl pp-unit">${ua}</span>`;
  for(let i = 0; i < n; i++) html += `<span class="pp-val">${i+1}ª</span>`;
  html += `</div>`;

  if(prev){
    html += `<div class="pp-row pp-prev"><span class="pp-lbl">ÚLTIMA</span>`;
    for(let i = 0; i < n; i++){
      const ps = prev.perSet[i] || null;
      const w = ps ? ps.weight : null;
      html += w != null
        ? `<span class="pp-val"><span class="pv-w">${w}</span>${prevRepsHTML(ps)}</span>`
        : `<span class="pp-val">—</span>`;
    }
    html += `</div>`;
  }
  if(sug){
    html += `<div class="pp-row pp-sug"><span class="pp-lbl">SUGESTÃO</span>`;
    for(let i = 0; i < n; i++){
      const v = sug.loads[i];
      const w = prev && prev.perSet[i] ? prev.perSet[i].weight : null;
      const chg = (v != null && w != null && v !== w) ? " chg" : "";
      html += `<span class="pp-val${chg}">${v != null ? v : "—"}</span>`;
    }
    html += `</div>`;
    if(sug.limited) html += `<div class="pp-note">limitação</div>`;
  }
  html += `</div></div>`;
  return html;
}

// Suggestion payload, or null. Gating that used to live in `.flag-periodization .suggest`
// now lives here so the panel row, the apply button and the input placeholders agree.
function suggestData(name, unit, isSup, exIdx){
  if(!document.body.classList.contains("flag-periodization")) return null;
  if(!state.session || !state.session.exercises[exIdx]) return null;
  const ex = state.session.exercises[exIdx];
  const sets = isSup ? ex.sup : ex.main;
  if(sets && sets.some(s => typeof s.weight === "number")) return null;
  const machine = machineFilterActive() ? (isSup ? ex.supMachine : ex.machine) : undefined;
  const planEx = activeDays()[state.current] && activeDays()[state.current].ex[exIdx];
  const muscle = planEx ? (isSup ? (ex.supSubMuscle || (planEx.superset && planEx.superset.muscle) || planEx.muscle) : (ex.subMuscle || planEx.muscle)) : undefined;
  return suggestLoads(name, unit, machine, {muscle}) || null;
}

function seriesHTML(sets, exIdx, isSup, unit, name, prev, sug){
  const u = unit || "kg";
  const step = UNIT_STEP[u] || 2.5;
  const equip = name ? equipmentOf(name) : null;
  const autoreg = document.body.classList.contains("flag-autoreg");
  // In panel layout the SUGESTÃO row already carries these values; echoing them as
  // placeholders reads like pre-filled data. Column layout has no such row, so it keeps them.
  // Train mode is the exception: it shows the panel AND the placeholder — the panel is a
  // stable reference across sets, the placeholder is the field the user is about to type in.
  const colLayout = document.body.classList.contains("layout-prev-column")
                 || document.body.classList.contains("mode-train");
  let html = `<div class="series-table" data-ex="${exIdx}" ${isSup?'data-sup="1"':""}>`;
  html += `<span class="compact-reps-lbl">Reps</span>`;
  html += `<div class="series-grid series-head">
    <span>Série</span><span class="h-prev">Anterior</span><span class="h-reps">Reps</span><span class="h-load">Carga</span>
  </div>`;
  sets.forEach((s, si) => {
    const cls = "chip" + (s.done ? " set-done" : "");
    const filled = (s.weight != null && s.weight !== "") ? " filled" : "";
    const fromSug = (filled && s.fromSug) ? " from-sug" : "";
    const ps = (prev && prev.perSet[si]) ? prev.perSet[si] : null;
    const pw = ps ? ps.weight : null;
    const prevCell = `<span class="prev-cell">${pw != null
      ? `<span class="pv-w">${pw}</span>${prevRepsHTML(ps)}`
      : '<span class="pc-empty">—</span>'}</span>`;
    const sugV = sug ? sug.loads[si] : null;
    const showSugPh = colLayout && sugV != null && (s.weight == null || s.weight === "");
    const wPlaceholder = showSugPh ? sugV : "—";
    const sugPh = showSugPh ? " sug-ph" : "";
    html += `<div class="series-grid${s.done ? " set-done-row" : ""}">
      <button class="set-idx${s.done ? " done" : ""}" data-si="${si}" aria-pressed="${!!s.done}" aria-label="Série ${si+1}${s.done ? " — concluída" : ""}">${s.done ? "✓" : (si+1)+"ª"}</button>
      ${prevCell}
      <button class="${cls}" data-si="${si}" aria-label="Série ${si+1}: ${s.reps} reps${s.done?' concluída':''}"><span class="tick">✓</span>${s.reps}</button>
      <input class="reps-input" type="text" inputmode="numeric" data-si="${si}" placeholder="${s.reps}" value="${s.repsDone ?? ""}" aria-label="Reps feitas série ${si+1}">
      <div class="load-cell${filled}${sugPh}${fromSug}">
        <input class="weight-input" type="text" inputmode="decimal" data-si="${si}" placeholder="${wPlaceholder}" value="${s.weight ?? ""}" aria-label="Carga da série ${si+1} em ${UNIT_ABBR[u]}">
        <span class="unit">${UNIT_ABBR[u]}</span>
      </div>
    </div>`;
    // in-session hint: only for still-empty upcoming sets, derived from the most
    // recent COMPLETED set above (weight + repsDone), fatigue-discounted by distance.
    if(autoreg && (s.weight == null || s.weight === "")){
      let src = null, gap = 0;
      for(let j = si - 1; j >= 0; j--){
        if(typeof sets[j].weight === "number" && sets[j].repsDone != null){ src = sets[j]; gap = si - j; break; }
      }
      if(src){
        const v = projectLoad(src.weight, src.repsDone, s.reps, equip, u, step, gap);
        if(v != null && v !== src.weight){
          const arrow = v > src.weight ? "↑" : "↓";
          html += `<div class="set-hint">sugerido <b>${v}</b> ${UNIT_ABBR[u]} ${arrow}</div>`;
        }
      }
    }
  });
  html += `</div>`;
  return html;
}
function badgesHTML(b){
  if(!b||!b.length) return "";
  return `<div class="badges">${b.map(x=>`<span class="badge ${x}">${BADGE_LABEL[x]}</span>`).join("")}</div>`;
}

function skeletonStrip(){
  let h = "";
  for(let i=0;i<5;i++){
    h += `<button class="day-btn" disabled>
      <span class="abbr"><div class="skeleton" style="width:28px;height:14px;margin:0 auto"></div></span>
      <span class="focus"><div class="skeleton" style="width:44px;height:10px;margin:0 auto"></div></span>
    </button>`;
  }
  return h;
}

function skeletonPanel(n=5){
  let h = `<div class="panel-head"><div>
    <div class="skeleton" style="width:120px;height:20px;margin-bottom:6px"></div>
    <div class="skeleton" style="width:80px;height:12px"></div>
  </div></div>
`;
  for(let i=0;i<n;i++){
    h += `<article class="ex"><div class="ex-header">
      <div class="num"><div class="skeleton" style="width:32px;height:32px;border-radius:8px"></div></div>
      <div class="body">
        <div class="skeleton" style="width:60%;height:14px;margin-bottom:6px"></div>
        <div class="skeleton" style="width:40%;height:10px"></div>
      </div>
    </div>
    <div class="series-table">
      <div class="skeleton" style="width:100%;height:34px;margin-bottom:7px"></div>
      <div class="skeleton" style="width:100%;height:34px;margin-bottom:7px"></div>
      <div class="skeleton" style="width:100%;height:34px"></div>
    </div></article>`;
  }
  return h;
}

// skeletonEvo moved to features/evolution.js (only consumer)

// ========= Train mode =========

function trainExCount(){ return activeDays()[state.current].ex.length; }

function firstIncompleteIdx(){
  if(!state.session) return 0;
  const i = state.session.exercises.findIndex(ex => !exDone(ex));
  return i < 0 ? 0 : i;
}

function enterTrainMode(){
  if(!state.session || trainExCount() === 0) return;
  state.trainMode = true;
  state.trainIdx = firstIncompleteIdx();
  document.body.classList.add("mode-train");
  applyPrevLayoutState();
  renderDay();
}

function exitTrainMode(){
  const back = state.trainIdx;
  state.trainMode = false;
  document.body.classList.remove("mode-train");
  applyPrevLayoutState();
  renderDay();
  const art = $panel.querySelector(`.ex[data-i="${back}"]`);
  if(art) art.scrollIntoView({ block: "center" });
}
// Exposed so shell.js's showTab (which owns tab-switching) can exit train mode
// without importing this day-view code, which isn't extracted in this phase.
window._exitTrainMode = exitTrainMode;

function renderTrainBar(){
  if(!state.trainMode || !state.session) return;
  const day = activeDays()[state.current];
  const n = day.ex.length;
  const exs = state.session.exercises || [];
  let segs = "";
  for(let i = 0; i < n; i++){
    const done = exs[i] ? exDone(exs[i]) : false;
    segs += `<button class="train-seg${done?" is-done":""}${i===state.trainIdx?" is-current":""}" data-seg="${i}" type="button" aria-label="Ir para exercício ${i+1}"></button>`;
  }
  segs += `<button class="train-seg train-seg-end${state.trainIdx>=n?" is-current":""}" data-seg="${n}" type="button" aria-label="Resumo do treino"></button>`;
  $trainSegs.innerHTML = segs;
  $trainCount.textContent = state.trainIdx >= n ? "fim" : `${state.trainIdx+1}/${n}`;
  $trainFocus.textContent = day.focus || "";
}

// Restore horizontal position synchronously after renderDay() rebuilds $panel.
function restoreTrainScroll(){
  const track = document.getElementById("trainTrack");
  if(!track) return;
  const prev = track.style.scrollBehavior;
  track.style.scrollBehavior = "auto";
  track.scrollLeft = state.trainIdx * track.clientWidth;
  track.style.scrollBehavior = prev;
}

// Track is recreated on every render, so this binds per render (no listener stacking).
function bindTrainTrack(){
  const track = document.getElementById("trainTrack");
  if(!track) return;
  track.addEventListener("scroll", () => {
    clearTimeout(state._trainScrollT);
    state._trainScrollT = setTimeout(() => {
      const w = track.clientWidth || 1;
      const i = Math.round(track.scrollLeft / w);
      // renderTrainBar() only — never renderDay() here, or the swipe rebuilds the DOM mid-gesture.
      if(i !== state.trainIdx){
        state.trainIdx = i;
        renderTrainBar();
        if(state.trainIdx >= trainExCount()) refreshTrainEndCard();
      }
    }, 120);
  }, { passive: true });
}

function goToTrainIdx(i){
  const track = document.getElementById("trainTrack");
  if(!track) return;
  state.trainIdx = Math.max(0, Math.min(i, trainExCount()));
  track.scrollTo({ left: state.trainIdx * track.clientWidth, behavior: "smooth" });
  renderTrainBar();
  if(state.trainIdx >= trainExCount()) refreshTrainEndCard();
}

// ========= Session summary (pure; derived from firstSetAt + per-set doneAt) =========
const LB_TO_KG = 0.45359237;

function fmtDur(ms, withSecs){
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if(h) return `${h}h${String(m).padStart(2,"0")}`;
  if(m) return withSecs ? `${m}min${String(s).padStart(2,"0")}` : `${m}min`;
  return `${s}s`;
}
function fmtNum(v){ return (Math.round(v * 10) / 10).toLocaleString("pt-BR"); }
function fmtKg(v){ return Math.round(v).toLocaleString("pt-BR"); }

// Returns null when there is not enough data to say anything.
function trainSummary(){
  if(!state.session) return null;
  const day = activeDays()[state.current];
  const evts = [];
  let volKg = 0, volSkipped = 0, doneSets = 0;
  const prs = [];

  state.session.exercises.forEach((ex, i) => {
    const e = day.ex[i];
    if(!e) return;
    const blocks = [{
      sets: ex.main || [], sup: false, unit: e.unit || "kg",
      name: ex.subName || e.name,
      machine: machineFilterActive() ? ex.machine : undefined
    }];
    if(ex.sup && e.superset) blocks.push({
      sets: ex.sup, sup: true, unit: e.superset.unit || "kg",
      name: ex.supSubName || e.superset.name,
      machine: machineFilterActive() ? ex.supMachine : undefined
    });

    blocks.forEach(b => {
      let topW = null;
      b.sets.forEach(s => {
        if(!s || !s.done) return;
        doneSets++;
        if(s.doneAt){ const t = Date.parse(s.doneAt); if(!isNaN(t)) evts.push({t, ex:i, sup:b.sup}); }
        const w = typeof s.weight === "number" ? s.weight : null;
        const r = typeof s.repsDone === "number" ? s.repsDone : null;
        if(w != null && r != null){
          // "placas" is not a mass unit — it cannot enter a tonnage sum.
          if(b.unit === "kg") volKg += w * r;
          else if(b.unit === "lb") volKg += w * LB_TO_KG * r;
          else volSkipped++;
        }
        if(w != null && b.unit !== "placas" && (topW == null || w > topW)) topW = w;
      });
      if(topW != null){
        const prev = bestWeightEver(b.name, b.machine);
        if(prev != null && topW > prev) prs.push({ name: b.name, weight: topW, unit: b.unit, prev });
      }
    });
  });

  if(!evts.length) return null;
  evts.sort((a, b) => a.t - b.t);

  // Start = earliest firstSetAt (stamped on the first keystroke, before any set completes).
  let startT = null;
  state.session.exercises.forEach(ex => {
    if(!ex.firstSetAt) return;
    const t = Date.parse(ex.firstSetAt);
    if(!isNaN(t) && (startT == null || t < startT)) startT = t;
  });
  if(startT == null || startT > evts[0].t) startT = evts[0].t;
  const totalMs = Math.max(0, evts[evts.length - 1].t - startT);

  // Consecutive completions. Superset-internal transitions carry no rest by design.
  const gaps = [];
  for(let k = 1; k < evts.length; k++){
    const a = evts[k-1], b = evts[k];
    if(a.ex === b.ex && a.sup !== b.sup) continue;
    const d = b.t - a.t;
    if(d >= GAP_MIN_MS && d <= GAP_MAX_MS) gaps.push(d);
  }
  // Median, not mean: one bathroom break would dominate a mean.
  let gapMs = null;
  if(gaps.length >= 3){
    gaps.sort((x, y) => x - y);
    const mid = gaps.length >> 1;
    gapMs = gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid-1] + gaps[mid]) / 2);
  }

  const mins = totalMs / 60000;
  const density = (volKg > 0 && mins >= 1) ? volKg / mins : null;

  return { totalMs, gapMs, gapN: gaps.length, volKg, volSkipped, density, doneSets, prs };
}

function trainEndInnerHTML(done, total){
  const all = done >= total;
  const sum = trainSummary();

  if(!sum){
    return `<div class="train-end-inner">
      <span class="train-end-big">${done}/${total} exercícios</span>
      <p class="train-end-sub">Ainda faltam exercícios — deslize de volta ou toque na barra para escolher.</p>
      <button class="train-end-btn" id="trainFinish" type="button">Voltar à lista</button>
    </div>`;
  }

  let h = `<div class="train-end-inner">`;
  h += `<span class="train-end-big">${all ? "Treino concluído" : done + "/" + total + " exercícios"}</span>`;

  h += `<div class="ts-grid">`;
  h += `<div class="ts-tile">
    <span class="ts-val">${fmtDur(sum.totalMs, false)}</span>
    <span class="ts-lbl">Tempo total</span>
  </div>`;
  h += `<div class="ts-tile">
    <span class="ts-val">${sum.gapMs != null ? fmtDur(sum.gapMs, true) : "—"}</span>
    <span class="ts-lbl">Intervalo entre séries</span>
    <span class="ts-sub">${sum.gapMs != null ? "mediana de " + sum.gapN : "poucos dados"}</span>
  </div>`;
  if(sum.density != null){
    const skipped = sum.volSkipped
      ? ` · ${sum.volSkipped} série${sum.volSkipped > 1 ? "s" : ""} em placas fora da conta`
      : "";
    h += `<div class="ts-tile ts-wide">
      <span class="ts-val">${fmtKg(sum.density)}<em>kg/min</em></span>
      <span class="ts-lbl">Densidade</span>
      <span class="ts-sub">${fmtKg(sum.volKg)} kg em ${fmtDur(sum.totalMs, false)}${skipped}</span>
    </div>`;
  }
  h += `</div>`;

  if(sum.prs.length){
    h += `<div class="ts-prs"><span class="ts-prs-title">${sum.prs.length === 1 ? "1 recorde" : sum.prs.length + " recordes"}</span>`;
    sum.prs.slice(0, 4).forEach(p => {
      h += `<div class="ts-pr">
        <span class="ts-pr-name">${esc(p.name)}</span>
        <span class="ts-pr-w">${fmtNum(p.weight)} ${UNIT_ABBR[p.unit] || "kg"}<em> · antes ${fmtNum(p.prev)}</em></span>
      </div>`;
    });
    h += `</div>`;
  }

  if(!all) h += `<p class="train-end-sub">Faltam ${total - done} exercício${total - done > 1 ? "s" : ""}.</p>`;
  h += `<button class="train-end-btn" id="trainFinish" type="button">${all ? "Concluir" : "Voltar à lista"}</button>`;
  h += `</div>`;
  return h;
}

// Placeholder while the user is still on an exercise card — the summary scans allSessions,
// which is too expensive to recompute on every renderDay().
function trainEndCardHTML(done, total){
  const body = (state.trainIdx >= total)
    ? trainEndInnerHTML(done, total)
    : `<div class="train-end-inner"><span class="train-end-big">Resumo</span></div>`;
  return `<article class="ex train-end" data-i="end">${body}</article>`;
}

// Targeted refresh when the carousel lands on the terminal card. Avoids a full renderDay(),
// which would rebuild the track and disturb the in-flight scroll.
function refreshTrainEndCard(){
  if(!state.trainMode || !state.session) return;
  const card = document.querySelector(".train-track > .train-end");
  if(!card) return;
  card.innerHTML = trainEndInnerHTML(countDone(), trainExCount());
  const $tf = document.getElementById("trainFinish");
  if($tf) $tf.addEventListener("click", exitTrainMode);
}

// Bound once — $panel is never recreated, only its innerHTML.
document.getElementById("trainExit").addEventListener("click", exitTrainMode);
$trainSegs.addEventListener("click", e => {
  const b = e.target.closest("[data-seg]");
  if(b) goToTrainIdx(+b.dataset.seg);
});
// iOS: fixed panel + soft keyboard can hide the focused field. Re-center it inside the card.
$panel.addEventListener("focusin", e => {
  if(!state.trainMode) return;
  const t = e.target;
  if(!t.matches || !t.matches(".weight-input, .reps-input")) return;
  setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 260);
});

// renderDay() replaces $panel.innerHTML, which destroys the element the user is tapping
// next — the tap never lands and the field looks uneditable. Defer one task, then skip the
// rebuild if focus moved to another field inside the panel. State was already written by
// the `input` handler, so nothing is lost; the panel refreshes when focus leaves the table.
function renderDaySoft(){
  clearTimeout(state._softRenderT);
  state._softRenderT = setTimeout(() => {
    const a = document.activeElement;
    if(a && $panel.contains(a) &&
       (a.classList.contains("weight-input") || a.classList.contains("reps-input"))) return;
    renderDay();
  }, 0);
}

function renderDay(){
  clearTimeout(state._softRenderT);
  if(!state.session) return;
  $panel.classList.toggle("compact", state.viewMode === "compact");
  const day = activeDays()[state.current];
  const total = day.ex.length;

  if(total === 0){
    if(state.trainMode){ state.trainMode = false; document.body.classList.remove("mode-train"); applyPrevLayoutState(); }
    document.getElementById("dayProgressFill").style.width = "0%";
    document.getElementById("dayProgressPct").textContent = "0%";
    $panel.innerHTML = `
      <div class="rest-placeholder">
        <span class="big">Descanso</span>
        Nenhum exerc\u00edcio programado para hoje. Aproveite para recuperar!
      </div>`;
    return;
  }

  const completed = countDone();

  const _deloadActive = isDeloadActive();
  const _deload = !_deloadActive && !state.deloadDismissed ? deloadDue() : { due: false };

  let head = `
    <div class="panel-head">
      <div class="focus-tag">${esc(day.focus)}${_deloadActive ? '<span class="deload-tag">Descarga</span>' : ''}</div>
      <div class="progress">
        <span><span class="count">${completed}</span>/${total} conclu\u00eddos</span>
        <button class="reset" id="resetBtn">Limpar</button>
      </div>
      <button class="train-start" id="trainStartBtn" type="button">${completed > 0 ? "▶ Retomar treino" : "▶ Iniciar treino"}</button>
    </div>
  `;
  let html = "";
  if(_deload.due){
    head += `<div class="deload-card">
      <div class="deload-title">Hora de uma semana de descarga</div>
      <div class="deload-reason">${_deload.reason}. Reduza carga/volume por uma semana para recuperar e voltar a progredir.</div>
      <div class="deload-actions">
        <button class="deload-apply">Aplicar descarga</button>
        <button class="deload-skip">Agora não</button>
      </div>
    </div>`;
  }
  const barPct = setPct();
  document.getElementById("dayProgressFill").style.width = barPct + "%";
  document.getElementById("dayProgressPct").textContent = barPct + "%";

  day.ex.forEach((e, i) => {
    const ex = state.session.exercises[i];
    const isDone = exDone(ex);

    html += `<article class="ex ${isDone?'done':''}" data-i="${i}">`;
    const isSub = !!ex.subName;
    const effectiveName = ex.subName || e.name;
    const prevMain = isSub ? null : prevLoadData(effectiveName, machineFilterActive() ? ex.machine : undefined);
    const sugMain = suggestData(effectiveName, e.unit, false, i);
    html += `<div class="ex-header">
      <div class="num"><span class="n">${i+1}</span></div>
      <div class="body">
        <div class="name"><span class="evo-link" data-evo-i="${i}" data-evo-sup="0" role="button" tabindex="0" title="Ver evolução">${esc(effectiveName)}${ICON_TREND}</span>${isSub?'<span class="sub-tag">trocado</span>':''}${ex.machine?`<span class="machine-tag">${esc(ex.machine)}</span>`:''}</div>
        ${!isSub && e.note?`<div class="note">${esc(e.note)}</div>`:""}
      </div>
      <button class="ex-icon-btn machine-btn" data-i="${i}" data-sup="0" title="Indicar máquina (opcional)">🏷</button>
      <button class="ex-icon-btn sub-btn" data-i="${i}" data-sup="0" title="Trocar exercício (só hoje)">⇄</button>
      <button class="unit-toggle" data-ex="${i}" data-sup="0" title="Trocar unidade (KG/LB/Placas)">${UNIT_BTN[e.unit||"kg"]}</button>
    </div>`;
    html += prevBlockHTML(prevMain, sugMain, e.unit, i, false);
    html += seriesHTML(ex.main, i, false, e.unit, effectiveName, prevMain, sugMain);
    html += !isSub ? badgesHTML(e.badges) : "";

    if(e.superset){
      const isSupSub = !!ex.supSubName;
      const supEffName = ex.supSubName || e.superset.name;
      const prevSup = isSupSub ? null : prevLoadData(supEffName, machineFilterActive() ? ex.supMachine : undefined);
      const sugSup = suggestData(supEffName, e.superset.unit, true, i);
      html += `<div class="superset">
        <span class="tag">+ Supersérie</span>
        <div class="sname"><span class="sname-text"><span class="evo-link" data-evo-i="${i}" data-evo-sup="1" role="button" tabindex="0" title="Ver evolução">${esc(supEffName)}${ICON_TREND}</span>${isSupSub?'<span class="sub-tag">trocado</span>':''}${ex.supMachine?`<span class="machine-tag">${esc(ex.supMachine)}</span>`:''}</span><button class="ex-icon-btn machine-btn" data-i="${i}" data-sup="1" title="Indicar máquina (opcional)">🏷</button><button class="ex-icon-btn sub-btn" data-i="${i}" data-sup="1" title="Trocar exercício (só hoje)">⇄</button><button class="unit-toggle" data-ex="${i}" data-sup="1" title="Trocar unidade (KG/LB/Placas)">${UNIT_BTN[e.superset.unit||"kg"]}</button></div>
        ${prevBlockHTML(prevSup, sugSup, e.superset.unit, i, true)}`;
      html += seriesHTML(ex.sup, i, true, e.superset.unit, supEffName, prevSup, sugSup);
      html += `</div>`;
    }
    html += `</article>`;
  });

  if(state.trainMode){
    html += trainEndCardHTML(completed, total);
    if(state.trainIdx > total) state.trainIdx = total;
    $panel.innerHTML = `<div class="train-track" id="trainTrack">${html}</div>`;
    attachHandlers();
    renderTrainBar();
    bindTrainTrack();
    restoreTrainScroll();   // must run synchronously, before paint
  } else {
    $panel.innerHTML = head + html;
    attachHandlers();
  }
}

// Single write path for set completion. Stamps doneAt only on the false→true edge, so
// editing weight/reps on an already-completed set never moves the timestamp.
function setDoneState(set, val){
  if(!set) return;
  const was = !!set.done;
  set.done = !!val;
  if(!val) set.doneAt = null;
  else if(!was || !set.doneAt) set.doneAt = new Date().toISOString();
}

// In-place feedback for a single set row. renderDay() rebuilds the whole panel and would
// destroy the field the user is tapping next, so completion is reflected here; the full
// re-render (hints and placeholders on the other rows) still follows via renderDaySoft().
function syncSetRow(row, si, set){
  const idx = row.querySelector(`.set-idx[data-si="${si}"]`);
  const grid = idx ? idx.closest(".series-grid") : null;
  if(!grid) return;
  const on = !!set.done;
  grid.classList.toggle("set-done-row", on);
  idx.classList.toggle("done", on);
  idx.textContent = on ? "✓" : (si + 1) + "ª";
  idx.setAttribute("aria-pressed", String(on));
  idx.setAttribute("aria-label", `Série ${si + 1}${on ? " — concluída" : ""}`);
  const chip = grid.querySelector(".chip");
  if(chip) chip.classList.toggle("set-done", on);
  const w = grid.querySelector(".weight-input");
  if(w && w.parentElement){
    const has = set.weight != null && set.weight !== "";
    if(has && w.value === "") w.value = set.weight;
    w.parentElement.classList.toggle("filled", has);
    w.parentElement.classList.toggle("from-sug", has && !!set.fromSug);
    if(has) w.parentElement.classList.remove("sug-ph");
  }
}

// The load currently shown for this set, in precedence order:
//   1. the suggestion echoed in the weight placeholder (.load-cell.sug-ph)
//   2. the SUGESTÃO row of the reference panel (panel layout)
//   3. the in-session autoreg hint under the row (.set-hint)
// Read from the DOM on purpose: suggestData() switches off once any set in the block has a
// weight, so re-deriving it would let only the first completed set adopt anything.
function displayedLoadFor(row, si){
  const idx = row.querySelector(`.set-idx[data-si="${si}"]`);
  const grid = idx ? idx.closest(".series-grid") : null;
  if(!grid) return null;
  const num = t => { const v = parseFloat(String(t).replace(",", ".")); return isNaN(v) ? null : v; };

  const cell = grid.querySelector(".load-cell");
  if(cell && cell.classList.contains("sug-ph")){
    const inp = cell.querySelector(".weight-input");
    const v = inp ? num(inp.placeholder) : null;
    if(v != null) return v;
  }

  const block = row.previousElementSibling;
  if(block && block.classList.contains("prev-block")){
    const vals = block.querySelectorAll(".pp-sug .pp-val");
    if(vals[si]){ const v = num(vals[si].textContent); if(v != null) return v; }
  }

  const hint = grid.nextElementSibling;
  if(hint && hint.classList.contains("set-hint")){
    const b = hint.querySelector("b");
    if(b){ const v = num(b.textContent); if(v != null) return v; }
  }
  return null;
}

// Completing a set with no typed load adopts the load on screen, and remembers that the
// number came from a suggestion rather than from the user.
function adoptSuggestedLoad(row, si, set){
  if(!set || (set.weight != null && set.weight !== "")) return;
  const v = displayedLoadFor(row, si);
  if(v == null) return;
  set.weight = v;
  set.fromSug = true;
}

function markExecStart(ei){ const ex = state.session.exercises[ei]; if(ex && !ex.firstSetAt){ ex.firstSetAt = new Date().toISOString(); } }

function attachHandlers(){
  $panel.querySelectorAll(".series-table").forEach(row => {
    const ei = +row.dataset.ex;
    const isSup = !!row.dataset.sup;
    const target = () => isSup ? state.session.exercises[ei].sup : state.session.exercises[ei].main;

    row.querySelectorAll(".chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const si = +btn.dataset.si;
        const toggling = !target()[si].done;
        setDoneState(target()[si], toggling);
        if(toggling) markExecStart(ei);
        scheduleSave(); renderDay(); renderStrip();
      });
    });
    row.querySelectorAll(".set-idx").forEach(btn => {
      btn.addEventListener("click", () => {
        const si = +btn.dataset.si;
        const set = target()[si];
        const period = document.body.classList.contains("flag-periodization");
        const turningOn = !set.done;
        if (turningOn) adoptSuggestedLoad(row, si, set);
        setDoneState(set, turningOn);
        if (turningOn) {
          if (period && (set.repsDone == null || set.repsDone === "")) set.repsDone = set.reps;
          markExecStart(ei);
        } else if (period && set.repsDone === set.reps) {
          set.repsDone = null;
        }
        scheduleSave(); renderDay(); renderStrip();
      });
    });
    row.querySelectorAll(".weight-input").forEach(inp => {
      inp.addEventListener("input", () => {
        const si = +inp.dataset.si;
        const v = inp.value.replace(",", ".").trim();
        target()[si].weight = v === "" ? null : (isNaN(parseFloat(v)) ? target()[si].weight : parseFloat(v));
        target()[si].fromSug = false;
        inp.parentElement.classList.toggle("filled", v !== "");
        inp.parentElement.classList.remove("from-sug");
        if(v !== "") markExecStart(ei);
        scheduleSave();
      });
      inp.addEventListener("change", () => { renderDaySoft(); });
    });
    row.querySelectorAll(".reps-input").forEach(inp => {
      inp.addEventListener("input", () => {
        const si = +inp.dataset.si;
        const v = inp.value.trim();
        target()[si].repsDone = v === "" ? null : (isNaN(parseInt(v, 10)) ? target()[si].repsDone : parseInt(v, 10));
        if(v !== "") markExecStart(ei);
        scheduleSave();
      });
      inp.addEventListener("change", () => {
        const si = +inp.dataset.si;
        const set = target()[si];
        const on = set.repsDone != null;
        if(on) adoptSuggestedLoad(row, si, set);
        setDoneState(set, on);
        scheduleSave();
        syncSetRow(row, si, set);
        renderStrip(); renderTrainBar();
        renderDaySoft();
      });
    });
  });

  $panel.querySelectorAll(".unit-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ei = +btn.dataset.ex;
      const isSup = btn.dataset.sup === "1";
      const id = activeDays()[state.current].ex[ei]._id;
      const exDoc = state.exercisesCatalog.get(id);
      if(!exDoc) return;
      const cur = isSup ? (exDoc.superset && exDoc.superset.unit || "kg") : (exDoc.unit || "kg");
      const next = UNIT_CYCLE[(UNIT_CYCLE.indexOf(cur) + 1) % 3];
      if(isSup){
        exDoc.superset.unit = next;
        await saveExerciseDoc(id, {superset: {unit: next}});
      } else {
        exDoc.unit = next;
        await saveExerciseDoc(id, {unit: next});
      }
      rebuildUserDays(); renderDay();
    });
  });

  $panel.querySelectorAll(".suggest-apply").forEach(btn => {
    btn.addEventListener("click", () => {
      const ei = +btn.dataset.ex;
      const isSup = btn.dataset.sup === "1";
      const e = activeDays()[state.current].ex[ei];
      const ex = state.session.exercises[ei];
      const name = isSup ? (ex.supSubName || e.superset.name) : (ex.subName || e.name);
      const unit = isSup ? (e.superset.unit || "kg") : (e.unit || "kg");
      const machine = machineFilterActive() ? (isSup ? ex.supMachine : ex.machine) : undefined;
      const muscle = isSup ? (ex.supSubMuscle || (e.superset && e.superset.muscle) || e.muscle) : (ex.subMuscle || e.muscle);
      const result = suggestLoads(name, unit, machine, {muscle});
      if(!result) return;
      const sets = isSup ? state.session.exercises[ei].sup : state.session.exercises[ei].main;
      result.loads.forEach((v, si) => {
        if(v != null && sets[si]) sets[si].weight = v;
      });
      scheduleSave(); renderDay(); renderStrip();
    });
  });

  $panel.querySelectorAll(".evo-link").forEach(el => {
    const go = () => {
      const i = +el.dataset.evoI;
      const isSup = el.dataset.evoSup === "1";
      const ex = state.session.exercises[i];
      const e = activeDays()[state.current]?.ex[i];
      if(!ex || !e) return;
      const name = isSup ? (ex.supSubName || e.superset?.name) : (ex.subName || e.name);
      const machine = isSup ? ex.supMachine : ex.machine;
      if(name) openEvolucaoFor(name, machine);
    };
    el.addEventListener("click", go);
    el.addEventListener("keydown", ev => {
      if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); go(); }
    });
  });

  $panel.querySelectorAll(".sub-btn").forEach(btn => {
    btn.addEventListener("click", () => openSubModal(+btn.dataset.i, btn.dataset.sup === "1"));
  });

  $panel.querySelectorAll(".machine-btn").forEach(btn => {
    btn.addEventListener("click", () => openMachineModal(+btn.dataset.i, btn.dataset.sup === "1"));
  });

  const $reset = document.getElementById("resetBtn");
  if($reset) $reset.addEventListener("click", () => {
    if(!confirm("Limpar séries e cargas deste dia?")) return;
    state.session = emptySession(state.current);
    scheduleSave(); renderDay(); renderStrip();
  });

  const $skipBtn = $panel.querySelector(".deload-skip");
  if($skipBtn) $skipBtn.addEventListener("click", () => { state.deloadDismissed = true; renderDay(); });

  const $applyBtn = $panel.querySelector(".deload-apply");
  if($applyBtn) $applyBtn.addEventListener("click", async () => {
    const day = activeDays()[state.current];
    day.ex.forEach((e, ei) => {
      const ex = state.session.exercises[ei];
      const applyDeload = (sets, name, unit, machine) => {
        if(!sets) return;
        const u = unit || "kg";
        const step = UNIT_STEP[u] || 2.5;
        const hist = exerciseTopHistory(name, null, machine);
        if(!hist.length) return;
        const lastEntry = hist[hist.length - 1];
        // find the session's per-set weights for this exercise variant.
        // allSessions is newest-first, so a forward scan hits the most recent
        // matching session first when the date is shared by more than one.
        let refSets = null;
        for(let k = 0; k < state.allSessions.length; k++){
          const sess = state.allSessions[k];
          if(sess.date !== lastEntry.date || !sess.exercises) continue;
          for(const entry of sess.exercises){
            if((entry.subName || entry.name) === name && matchVariant(entry.machine, machine) && entry.main) refSets = entry.main;
            else if((entry.supSubName || entry.supName) === name && matchVariant(entry.supMachine, machine) && entry.sup) refSets = entry.sup;
            if(refSets) break;
          }
          if(refSets) break;
        }
        sets.forEach((s, si) => {
          const ref = refSets && refSets[si] && typeof refSets[si].weight === "number" ? refSets[si].weight : null;
          if(ref == null) return;
          const deloaded = ref * DELOAD_FACTOR;
          const rounded = Math.round(deloaded / step) * step;
          s.weight = u === "placas" ? Math.round(rounded) : rounded;
        });
      };
      const mainName = ex.subName || e.name;
      const mainMachine = machineFilterActive() ? ex.machine : undefined;
      const supMachine = machineFilterActive() ? ex.supMachine : undefined;
      applyDeload(ex.main, mainName, e.unit, mainMachine);
      if(e.superset && ex.sup) applyDeload(ex.sup, ex.supSubName || e.superset.name, e.superset.unit, supMachine);
    });
    const today = formatDate(new Date());
    state.lastDeloadDate = today;
    await saveDeloadDate();
    scheduleSave(); renderDay(); renderStrip();
  });

  const $ts = document.getElementById("trainStartBtn");
  if($ts) $ts.addEventListener("click", enterTrainMode);
  const $tf = document.getElementById("trainFinish");
  if($tf) $tf.addEventListener("click", exitTrainMode);
}

// ========= Substitution Modal =========
$subModal.addEventListener("click", e => { if(e.target === $subModal) closeSubModal(); });

function closeSubModal(){ $subModal.classList.remove("open"); }

function openSubModal(exIdx, isSup=false){
  const day = activeDays()[state.current];
  const planEx = day.ex[exIdx];
  const ex = state.session.exercises[exIdx];
  if(isSup && !planEx.superset) return;
  const originalName = isSup ? planEx.superset.name : planEx.name;
  const originalMuscle = isSup ? ((planEx.superset && planEx.superset.muscle) || planEx.muscle) : planEx.muscle;
  const curSub = isSup ? ex.supSubName : ex.subName;
  const isSub = !!curSub;

  // Build suggestions: same muscle, exclude original name, cap 8
  const suggestions = EXERCISE_CATALOG
    .filter(c => c.muscle === originalMuscle && c.name !== originalName)
    .slice(0, 8);

  let html = `<h3 style="margin:0 0 4px">Trocar ${isSup ? "supersérie" : "exercício"} (só hoje)</h3>`;
  html += `<p class="sub-desc">Substitui apenas esta sessão. O plano mantém <b>${esc(originalName)}</b>.</p>`;

  if(isSub){
    html += `<div class="sub-current">Atual: ${esc(curSub)}</div>`;
    html += `<button class="sub-revert" id="subRevertBtn">↩ Reverter ao padrão (${esc(originalName)})</button>`;
  }

  html += `<div class="sub-section-label">Buscar exercício</div>`;
  html += `<div class="sub-input-wrap">`;
  html += `<input class="modal-input" id="subSearchInput" placeholder="Digite o nome do exercício" autocomplete="off">`;
  html += `<div class="ac-list" id="subAcList"></div>`;
  html += `</div>`;

  if(suggestions.length){
    html += `<div class="sub-section-label">Sugestões (${esc(MUSCLE_LABEL[originalMuscle]||originalMuscle)})</div>`;
    html += `<div class="sub-chips">`;
    suggestions.forEach(c => {
      html += `<button class="sub-chip" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}</button>`;
    });
    html += `</div>`;
  }

  $subModalInner.innerHTML = html;
  $subModal.classList.add("open");

  function applySub(name, muscle){
    if(isSup){
      ex.supSubName = name;
      ex.supSubMuscle = muscle || originalMuscle;
    } else {
      ex.subName = name;
      ex.subMuscle = muscle || originalMuscle;
    }
    scheduleSave(); renderDay(); closeSubModal();
  }

  // Revert button
  const revertBtn = document.getElementById("subRevertBtn");
  if(revertBtn){
    revertBtn.addEventListener("click", () => {
      if(isSup){ ex.supSubName = null; ex.supSubMuscle = null; }
      else { ex.subName = null; ex.subMuscle = null; }
      scheduleSave(); renderDay(); closeSubModal();
    });
  }

  // Suggestion chips
  $subModalInner.querySelectorAll(".sub-chip").forEach(chip => {
    chip.addEventListener("click", () => applySub(chip.dataset.name, chip.dataset.muscle));
  });

  // Autocomplete on search input
  const subInp = document.getElementById("subSearchInput");
  const subList = document.getElementById("subAcList");
  let subActiveIdx = -1;

  function subFilter(q){
    if(!q || q.length < 1){ subList.classList.remove("open"); return; }
    const nq = stripDiacritics(q);
    const prefix = [], sub = [];
    EXERCISE_CATALOG.forEach(c => {
      const nc = stripDiacritics(c.name);
      if(nc.startsWith(nq)) prefix.push(c);
      else if(nc.includes(nq)) sub.push(c);
    });
    const results = prefix.concat(sub).slice(0, 8);
    if(!results.length){ subList.classList.remove("open"); return; }
    subActiveIdx = -1;
    subList.innerHTML = results.map((c,i) =>
      `<div class="ac-item" data-i="${i}" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}<span class="ac-muscle">${esc(MUSCLE_LABEL[c.muscle]||c.muscle)}</span></div>`
    ).join("");
    subList.classList.add("open");
    subList.querySelectorAll(".ac-item").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        applySub(el.dataset.name, el.dataset.muscle);
      });
    });
  }

  subInp.addEventListener("input", () => subFilter(subInp.value.trim()));
  subInp.addEventListener("focus", () => { if(subInp.value.trim()) subFilter(subInp.value.trim()); });
  subInp.addEventListener("blur", () => { setTimeout(() => subList.classList.remove("open"), 150); });
  subInp.addEventListener("keydown", e => {
    const items = subList.querySelectorAll(".ac-item");
    if(!items.length || !subList.classList.contains("open")) return;
    if(e.key === "ArrowDown"){ e.preventDefault(); subActiveIdx = Math.min(subActiveIdx+1, items.length-1); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); subActiveIdx = Math.max(subActiveIdx-1, 0); }
    else if(e.key === "Enter" && subActiveIdx >= 0){ e.preventDefault(); applySub(items[subActiveIdx].dataset.name, items[subActiveIdx].dataset.muscle); return; }
    else if(e.key === "Enter" && subInp.value.trim()){
      e.preventDefault();
      applySub(subInp.value.trim(), originalMuscle);
      return;
    }
    else if(e.key === "Escape"){ subList.classList.remove("open"); return; }
    else return;
    items.forEach((el,j) => el.classList.toggle("active", j === subActiveIdx));
  });

  setTimeout(() => subInp.focus(), 100);
}

// ========= Machine Modal =========
$machineModal.addEventListener("click", e => { if(e.target === $machineModal) closeMachineModal(); });

function closeMachineModal(){ $machineModal.classList.remove("open"); }

function openMachineModal(exIdx, isSup){
  const ex = state.session.exercises[exIdx];
  const currentMachine = isSup ? ex.supMachine : ex.machine;

  // Build chips: user's most-used machines GLOBAL across all sessions, ranked by frequency desc, cap 8
  const chips = usedMachinesRanked().slice(0, 8);

  let html = `<h3 style="margin:0 0 4px">Máquina (opcional)</h3>`;
  html += `<p class="sub-desc">Identifica o equipamento usado. Histórico e sugestões ficam separados por máquina.</p>`;

  if(currentMachine){
    html += `<div class="sub-current">Atual: ${esc(currentMachine)}</div>`;
  }

  if(chips.length){
    html += `<div class="sub-section-label">Usadas anteriormente</div>`;
    html += `<div class="sub-chips">`;
    chips.forEach(m => {
      html += `<button class="sub-chip machine-chip" data-machine="${esc(m)}">${esc(m)}</button>`;
    });
    html += `</div>`;
  }

  html += `<div class="sub-section-label">Nova máquina</div>`;
  html += `<div class="sub-input-wrap">`;
  html += `<input class="modal-input" id="machineInput" placeholder="Ex: Gervasport, Life Fitness…" autocomplete="off" value="${esc(currentMachine)}">`;
  html += `<div class="ac-list" id="machineAcList"></div>`;
  html += `</div>`;

  if(currentMachine){
    html += `<button class="sub-revert" id="machineRemoveBtn">✕ Remover máquina</button>`;
  }

  $machineModalInner.innerHTML = html;
  $machineModal.classList.add("open");

  function applyMachine(val){
    const v = val ? String(val).trim() : null;
    if(isSup) ex.supMachine = v || null;
    else ex.machine = v || null;
    scheduleSave(); renderDay(); closeMachineModal();
  }

  // Chip clicks
  $machineModalInner.querySelectorAll(".machine-chip").forEach(chip => {
    chip.addEventListener("click", () => applyMachine(chip.dataset.machine));
  });

  // Remove button
  const removeBtn = document.getElementById("machineRemoveBtn");
  if(removeBtn){
    removeBtn.addEventListener("click", () => applyMachine(null));
  }

  // Autocomplete: union of user machines + seed catalog, deduped via normMachine
  const machInp = document.getElementById("machineInput");
  const acSource = (() => {
    const out = [], seenK = new Set();
    const push = disp => { const k = normMachine(disp); if(k && !seenK.has(k)){ seenK.add(k); out.push(disp); } };
    usedMachinesRanked().forEach(push);
    MACHINE_CATALOG.forEach(push);
    return out;
  })();
  const machList = document.getElementById("machineAcList");
  let machActiveIdx = -1;
  function machFilter(q){
    if(!q){ machList.classList.remove("open"); return; }
    const nq = stripDiacritics(q.toLowerCase());
    const prefix = [], sub = [];
    acSource.forEach(m => {
      const nm = stripDiacritics(m.toLowerCase());
      if(nm.startsWith(nq)) prefix.push(m); else if(nm.includes(nq)) sub.push(m);
    });
    const results = prefix.concat(sub).slice(0, 8);
    if(!results.length){ machList.classList.remove("open"); return; }
    machActiveIdx = -1;
    machList.innerHTML = results.map((m,i) => `<div class="ac-item" data-i="${i}" data-machine="${esc(m)}">${esc(m)}</div>`).join("");
    machList.classList.add("open");
    machList.querySelectorAll(".ac-item").forEach(el => {
      el.addEventListener("mousedown", ev => { ev.preventDefault(); applyMachine(el.dataset.machine); });
    });
  }
  machInp.addEventListener("input", () => machFilter(machInp.value.trim()));
  machInp.addEventListener("focus", () => machFilter(machInp.value.trim()));
  machInp.addEventListener("blur", () => setTimeout(() => machList.classList.remove("open"), 150));
  machInp.addEventListener("keydown", e => {
    const items = machList.querySelectorAll(".ac-item");
    const open = machList.classList.contains("open") && items.length;
    if(e.key === "ArrowDown" && open){ e.preventDefault(); machActiveIdx = Math.min(machActiveIdx+1, items.length-1); }
    else if(e.key === "ArrowUp" && open){ e.preventDefault(); machActiveIdx = Math.max(machActiveIdx-1, 0); }
    else if(e.key === "Enter" && open && machActiveIdx >= 0){ e.preventDefault(); applyMachine(items[machActiveIdx].dataset.machine); return; }
    else if(e.key === "Enter"){ e.preventDefault(); applyMachine(machInp.value); return; }
    else if(e.key === "Escape"){ machList.classList.remove("open"); return; }
    else return;
    items.forEach((el,j) => el.classList.toggle("active", j === machActiveIdx));
  });

  setTimeout(() => machInp.focus(), 100);
}

function renderStrip(){
  $strip.innerHTML = activeDays().map((d,i) => {
    const isToday = state.weekOffset === 0 && i === todayIdx;
    const isRest = d.ex.length === 0;
    return `
      <button class="day-btn ${isToday?'is-today':''} ${isRest?'rest':''}"
              role="tab" aria-selected="${i===state.current}" data-i="${i}">
        <span class="abbr">${d.abbr}</span>
        <span class="focus">${isRest ? 'Descanso' : esc(d.tag || d.focus.split('\u00b7')[0].trim())}</span>
        <span class="today">Hoje</span>
        <span class="dot"></span>
      </button>`;
  }).join("");

  $strip.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      state.current = +btn.dataset.i;
      renderStrip();
      $panel.innerHTML = skeletonPanel();
      await loadDay(state.current);
      renderStrip();
      btn.scrollIntoView({inline:"center",block:"nearest",behavior:"smooth"});
    });
  });

  updateWeekLabel();
  centerActiveDay();
}

// centerActiveDay lives in core/ui/sticky-header.js (imported above) — it's also
// needed by that module's own scroll-collapse logic, which may not import main.js.

function updateWeekLabel(){
  if(state.weekOffset === 0){
    $weekLabel.textContent = "Semana atual";
  } else {
    const mon = getWeekMonday(state.weekOffset);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const monDay = mon.getDate();
    const sunDay = sun.getDate();
    const sunMonth = months[sun.getMonth()];
    if(mon.getMonth() === sun.getMonth()){
      $weekLabel.textContent = `${monDay} – ${sunDay} ${sunMonth}`;
    } else {
      const monMonth = months[mon.getMonth()];
      $weekLabel.textContent = `${monDay} ${monMonth} – ${sunDay} ${sunMonth}`;
    }
  }
  $weekNext.disabled = state.weekOffset >= 0;
}

$weekPrev.addEventListener("click", async () => {
  state.weekOffset--;
  renderStrip();
  $panel.innerHTML = skeletonPanel();
  await loadDay(state.current);
  renderStrip();
});

$weekNext.addEventListener("click", async () => {
  if(state.weekOffset >= 0) return;
  state.weekOffset++;
  renderStrip();
  $panel.innerHTML = skeletonPanel();
  await loadDay(state.current);
  renderStrip();
});

// ========= Evolução — moved to features/evolution.js =========

// ========= Exercise CRUD (Firestore) =========

// Build userDays from exercisesCatalog
function rebuildUserDays(){
  const base = [
    {abbr:"Seg",name:"Segunda",tag:"Ombro · Costas",focus:"Ombro lateral/posterior · Costas"},
    {abbr:"Ter",name:"Terça",tag:"Posterior",focus:"Ombro frontal · Posterior de coxa · Glúteo"},
    {abbr:"Qua",name:"Quarta",tag:"Peito",focus:"Peito · Ombro"},
    {abbr:"Qui",name:"Quinta",tag:"Braços",focus:"Posterior de ombro · Tríceps · Bíceps"},
    {abbr:"Sex",name:"Sexta",tag:"Pernas",focus:"Quadríceps · Adutor"},
    {abbr:"Sáb",name:"Sábado",tag:"Livre",focus:"Livre"},
    {abbr:"Dom",name:"Domingo",tag:"Livre",focus:"Livre"},
  ];
  base.forEach((d,i) => {
    d.ex = [];
    const custom = state.dayCustomizations[i];
    if(custom){
      if(custom.tag) d.tag = custom.tag;
      if(custom.focus) d.focus = custom.focus;
    }
  });
  state.exercisesCatalog.forEach((ex, id) => {
    if(!ex.active) return;
    (ex.days || []).forEach(dk => {
      if(dk < 0 || dk > 6) return;
      const order = orderForDay(ex, dk);
      const sup = ex.superset ? {...ex.superset, unit: ex.superset.unit || "kg"} : null;
      base[dk].ex.push({
        _id: id,
        _order: order,
        name: ex.name,
        muscle: ex.muscle,
        reps: ex.reps || [12,10,8],
        badges: ex.badges || [],
        note: ex.note || null,
        unit: ex.unit || "kg",
        superset: sup,
      });
    });
  });
  base.forEach(d => d.ex.sort((a,b) =>
    cmpExOrder(a._order, a.name, a._id, b._order, b.name, b._id)));
  state.userDays = base;
  state.EXERCISES = buildExerciseList();
  state.evoInitialized = false;
}

// Load exercises from Firestore (seeds from hardcoded DAYS on first login)
async function loadExercises(uid){
  if(!state.user && !uid) return;
  uid = uid || state.user.uid;
  let docs;
  try { docs = await repo.fetchExercises(uid); }
  catch(e){ console.warn("loadExercises:", e.message); return; }
  state.exercisesCatalog.clear();
  if(docs.length){
    docs.forEach(({id, data}) => state.exercisesCatalog.set(id, data));
    return;
  }
  // First login: seed from hardcoded DAYS, populate cache from write refs (no re-read)
  const byName = new Map();
  DAYS.forEach((d, dk) => {
    d.ex.forEach((e, ei) => {
      if(!byName.has(e.name)){
        byName.set(e.name, {
          name: e.name, muscle: e.muscle,
          reps: [...e.reps], badges: [...(e.badges||[])],
          note: e.note || null, active: true,
          days: [dk], orderByDay: {[dk]: ei},
          superset: e.superset ? {
            name: e.superset.name, muscle: e.superset.muscle || e.muscle,
            reps: [...e.superset.reps], badges: [...(e.superset.badges||[])],
            note: e.superset.note || null
          } : null,
        });
      } else {
        const existing = byName.get(e.name);
        if(!existing.days.includes(dk)){
          existing.days.push(dk);
          existing.orderByDay[dk] = ei;
        }
      }
    });
  });
  try {
    const writes = [];
    byName.forEach(ex => {
      const data = { ...ex, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      writes.push(repo.addExercise(uid, data).then(id => state.exercisesCatalog.set(id, data)));
    });
    await Promise.all(writes);
  } catch(e){ console.error("seed exercises:", e); }
}

// Save exercise doc
async function saveExerciseDoc(docId, data){
  if(!state.user) return null;
  data.updatedAt = serverTimestamp();
  if(docId){
    await repo.putExercise(state.user.uid, docId, data);
    return docId;
  } else {
    data.createdAt = serverTimestamp();
    return await repo.addExercise(state.user.uid, data);
  }
}

// Delete exercise doc
async function deleteExerciseDoc(docId){
  if(!state.user) return;
  await repo.deleteExercise(state.user.uid, docId);
}

// ========= Day Customizations =========

const DAY_DEFAULTS = [
  {tag:"Ombro · Costas", focus:"Ombro lateral/posterior · Costas"},
  {tag:"Posterior", focus:"Ombro frontal · Posterior de coxa · Glúteo"},
  {tag:"Peito", focus:"Peito · Ombro"},
  {tag:"Braços", focus:"Posterior de ombro · Tríceps · Bíceps"},
  {tag:"Pernas", focus:"Quadríceps · Adutor"},
  {tag:"Livre", focus:"Livre"},
  {tag:"Livre", focus:"Livre"},
];

async function loadDayCustomizations(){
  if(!state.user) return;
  state.dayCustomizations = {};
  try {
    const docs = await repo.fetchDayCustomizations(state.user.uid);
    docs.forEach(({id, data}) => { state.dayCustomizations[id] = data; });
  } catch(e){ console.warn("loadDayCustomizations:", e.message); }
}

async function saveDayCustomization(dayKey, tag, focus){
  if(!state.user) return;
  const data = { tag, focus, updatedAt: serverTimestamp() };
  await repo.putDayCustomization(state.user.uid, dayKey, data);
  state.dayCustomizations[dayKey] = { tag, focus };
}

async function deleteDayCustomization(dayKey){
  if(!state.user) return;
  await repo.deleteDayCustomization(state.user.uid, dayKey);
  delete state.dayCustomizations[dayKey];
}

function renderDayCustomSection(){
  const base = [
    {abbr:"Seg", name:"Segunda"},
    {abbr:"Ter", name:"Terça"},
    {abbr:"Qua", name:"Quarta"},
    {abbr:"Qui", name:"Quinta"},
    {abbr:"Sex", name:"Sexta"},
    {abbr:"Sáb", name:"Sábado"},
    {abbr:"Dom", name:"Domingo"},
  ];

  let html = "";
  base.forEach((d, i) => {
    const custom = state.dayCustomizations[i] || {};
    const tagVal = custom.tag ?? DAY_DEFAULTS[i].tag;
    const focusVal = custom.focus ?? DAY_DEFAULTS[i].focus;
    const isCustom = state.dayCustomizations[i] != null;
    html += `<div class="day-row" data-dk="${i}">
      <span class="day-row-abbr">${d.abbr}</span>
      <div class="day-row-info">
        <div class="day-row-tag">${tagVal}${isCustom ? ' <span class="ex-tag accent" style="font-size:9px;padding:2px 6px;vertical-align:middle">Personalizado</span>' : ''}</div>
        <div class="day-row-focus">${focusVal}</div>
      </div>
      <span class="day-row-chevron">›</span>
    </div>`;
  });
  $dayCustomSection.innerHTML = html;

  // Tap row → open bottom-sheet editor
  $dayCustomSection.querySelectorAll(".day-row").forEach(row => {
    row.addEventListener("click", () => {
      const dk = Number(row.dataset.dk);
      openDayEditSheet(dk, base[dk].name);
    });
  });
}

function openDayEditSheet(dk, dayName){
  const custom = state.dayCustomizations[dk] || {};
  const tagVal = custom.tag ?? DAY_DEFAULTS[dk].tag;
  const focusVal = custom.focus ?? DAY_DEFAULTS[dk].focus;
  const isCustom = state.dayCustomizations[dk] != null;

  let html = `<h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0 0 18px">${esc(dayName)}</h3>`;
  html += `<div class="modal-field" style="margin-bottom:14px">
    <label style="display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:6px">Tag</label>
    <input class="modal-input" id="dayEditTag" value="${esc(tagVal)}" maxlength="30" placeholder="${DAY_DEFAULTS[dk].tag}">
  </div>`;
  html += `<div class="modal-field" style="margin-bottom:18px">
    <label style="display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:6px">Foco</label>
    <input class="modal-input" id="dayEditFocus" value="${esc(focusVal)}" maxlength="80" placeholder="${DAY_DEFAULTS[dk].focus}">
  </div>`;
  html += `<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">`;
  if(isCustom) html += `<button class="modal-btn" id="dayEditReset" style="margin-right:auto;color:var(--muted)">Restaurar padrão</button>`;
  html += `<button class="modal-btn" id="dayEditCancel">Cancelar</button>`;
  html += `<button class="modal-btn" id="dayEditSave" style="background:var(--accent);color:#fff;border-color:var(--accent)">Salvar</button>`;
  html += `</div>`;
  $dayEditModalBody.innerHTML = html;
  $dayEditModal.classList.add("open");

  const closeDaySheet = () => $dayEditModal.classList.remove("open");

  document.getElementById("dayEditCancel").addEventListener("click", closeDaySheet);
  $dayEditModal.addEventListener("click", e => { if(e.target === $dayEditModal) closeDaySheet(); }, {once:true});

  document.getElementById("dayEditSave").addEventListener("click", async () => {
    const tag = document.getElementById("dayEditTag").value.trim();
    const focus = document.getElementById("dayEditFocus").value.trim();
    const finalTag = tag || DAY_DEFAULTS[dk].tag;
    const finalFocus = focus || DAY_DEFAULTS[dk].focus;
    try {
      await saveDayCustomization(dk, finalTag, finalFocus);
      rebuildUserDays();
      renderStrip();
      if(state.current === dk) renderDay();
      closeDaySheet();
      renderDayCustomSection();
    } catch(e) { console.error(e); alert("Erro ao salvar"); }
  });

  if(isCustom){
    document.getElementById("dayEditReset").addEventListener("click", async () => {
      try {
        await deleteDayCustomization(dk);
        rebuildUserDays();
        renderStrip();
        if(state.current === dk) renderDay();
        closeDaySheet();
        renderDayCustomSection();
      } catch(e) { console.error(e); alert("Erro ao restaurar"); }
    });
  }
}

// ========= Exercícios list view =========

function renderExercicios(){
  document.querySelectorAll("#exSubTabs [data-subtab]").forEach(b =>
    b.classList.toggle("active", b.dataset.subtab === state.exSubTab));
  document.getElementById("subViewList").style.display  = state.exSubTab==="list"  ? "" : "none";
  document.getElementById("subViewPlans").style.display = state.exSubTab==="plans" ? "" : "none";
  document.getElementById("subViewDays").style.display  = state.exSubTab==="days"  ? "" : "none";
  if(state.exSubTab==="list"){ renderExFilterBar(); renderExList(); }
  else if(state.exSubTab==="plans"){ renderPlansSection(); }
  else { renderDayCustomSection(); }
}
// Exposed so shell.js's showTab can render this view without importing this
// exercises-view code, which isn't extracted in this phase.
window._renderExercicios = renderExercicios;

function renderExFilterBar(){
  const muscles = Object.entries(MUSCLE_LABEL);
  let html = `<div class="ex-toolbar">
    <input type="search" class="ex-search" id="exSearchInput" placeholder="Buscar exercício…" value="${esc(state.exSearchQuery)}">
    <button class="ex-new-btn" id="exNewBtn" style="width:auto;flex:0 0 auto">+ Novo</button>
  </div>`;
  // Muscle chips
  html += `<div class="chip-scroll">`;
  html += `<span class="filter-chip ${state.exFilterMuscle===null?'active':''}" data-muscle="">Todos</span>`;
  muscles.forEach(([k,v]) => {
    html += `<span class="filter-chip ${state.exFilterMuscle===k?'active':''}" data-muscle="${k}">${v}</span>`;
  });
  html += `</div>`;
  // Day chips + Inativos toggle
  html += `<div class="chip-scroll">`;
  html += `<span class="filter-chip ${state.exFilterDay===null?'active':''}" data-day="">Todos</span>`;
  DAY_NAMES_SHORT.forEach((d,i) => {
    html += `<span class="filter-chip ${state.exFilterDay===i?'active':''}" data-day="${i}">${d}</span>`;
  });
  html += `<span class="filter-chip ${state.exShowInactive?'active':''}" id="exInactiveChip">Inativos</span>`;
  html += `</div>`;
  $exFilterBar.innerHTML = html;

  // search input — only re-render the list (keep focus)
  document.getElementById("exSearchInput").addEventListener("input", e => {
    state.exSearchQuery = e.target.value;
    renderExList();
  });
  // bind filter clicks
  $exFilterBar.querySelectorAll("[data-muscle]").forEach(el => {
    el.addEventListener("click", () => {
      state.exFilterMuscle = el.dataset.muscle === "" ? null : el.dataset.muscle;
      renderExFilterBar(); renderExList();
    });
  });
  $exFilterBar.querySelectorAll("[data-day]").forEach(el => {
    el.addEventListener("click", () => {
      state.exFilterDay = el.dataset.day === "" ? null : Number(el.dataset.day);
      renderExFilterBar(); renderExList();
    });
  });
  document.getElementById("exInactiveChip").addEventListener("click", () => {
    state.exShowInactive = !state.exShowInactive;
    renderExFilterBar(); renderExList();
  });
  document.getElementById("exNewBtn").addEventListener("click", () => openExEditor(null));
}

function renderExItemHtml(ex, canDrag){
  const isInactive = ex.active === false;
  const dayPills = (ex.days||[]).sort().map(d => DAY_NAMES_SHORT[d]).join(" · ");
  const repsSummary = (ex.reps||[]).length + "×" + (ex.reps||[])[0];
  const badgeTags = (ex.badges||[]).map(b => `<span class="ex-tag accent">${b}</span>`).join("");

  let h = `<div class="ex-list-item ${isInactive?'inactive':''}" data-id="${ex._id}" ${canDrag?'draggable="true"':''}>`;
  if(canDrag) h += `<div class="drag-handle"><span></span><span></span><span></span></div>`;
  h += `<div class="ex-list-body">
    <div class="ex-list-name">${esc(ex.name)}</div>
    <div class="ex-list-meta">
      <span class="ex-tag">${esc(MUSCLE_LABEL[ex.muscle]||ex.muscle)}</span>
      <span class="ex-tag">${dayPills}</span>
      <span class="ex-tag">${repsSummary}</span>
      ${badgeTags}
      ${isInactive ? '<span class="ex-tag inactive-tag">Inativo</span>' : ''}
      ${ex.superset ? '<span class="ex-tag accent">supersérie</span>' : ''}
    </div>
  </div>`;
  h += `<div class="ex-list-actions">
    <button class="ex-icon-btn active-toggle ${!isInactive?'is-active':''}" data-id="${ex._id}" title="${isInactive?'Ativar':'Desativar'}">
      ${isInactive ? '○' : '●'}
    </button>
    <button class="ex-icon-btn edit-btn" data-id="${ex._id}" title="Editar">✎</button>
  </div>`;
  h += `</div>`;
  return h;
}

function renderExList(){
  let items = [];
  state.exercisesCatalog.forEach((ex, id) => items.push({...ex, _id: id}));

  // filters
  if(state.exFilterMuscle) items = items.filter(e => e.muscle === state.exFilterMuscle);
  if(state.exFilterDay !== null) items = items.filter(e => (e.days||[]).includes(state.exFilterDay));
  if(!state.exShowInactive) items = items.filter(e => e.active !== false);
  if(state.exSearchQuery.trim()){
    const q = stripDiacritics(state.exSearchQuery.trim());
    items = items.filter(e => stripDiacritics(e.name).includes(q));
  }

  if(!items.length){
    $exList.innerHTML = `<div class="evo-empty"><span class="big">Nenhum exercício encontrado</span></div>`;
    return;
  }

  const canDrag = state.exFilterDay !== null && !state.exSearchQuery.trim();
  let html = "";

  if(canDrag){
    // Flat list sorted by day order — drag-and-drop enabled
    items.sort((a,b) => cmpExOrder(
      orderForDay(a, state.exFilterDay), a.name, a._id,
      orderForDay(b, state.exFilterDay), b.name, b._id));
    items.forEach(ex => { html += renderExItemHtml(ex, true); });
  } else {
    // Grouped by weekday — no drag-and-drop
    const dayGroups = new Map(); // dayIndex -> items[]
    const noDayItems = [];
    items.forEach(ex => {
      const days = ex.days || [];
      if(!days.length){ noDayItems.push(ex); return; }
      days.forEach(dk => {
        if(!dayGroups.has(dk)) dayGroups.set(dk, []);
        dayGroups.get(dk).push(ex);
      });
    });
    // Sort each group by orderByDay within that day, then by name
    dayGroups.forEach((list, dk) => {
      list.sort((a,b) => cmpExOrder(
        orderForDay(a, dk), a.name, a._id,
        orderForDay(b, dk), b.name, b._id));
    });
    noDayItems.sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));

    // Render in day order 0–4
    const seenIds = new Set();
    for(let dk = 0; dk < DAY_NAMES_SHORT.length; dk++){
      const group = dayGroups.get(dk);
      if(!group || !group.length) continue;
      // Apply muscle/inactive filters already done above, but also deduplicate
      const filtered = group.filter(ex => {
        if(seenIds.has(ex._id + "_" + dk)) return false;
        seenIds.add(ex._id + "_" + dk);
        return true;
      });
      if(!filtered.length) continue;
      html += `<div class="ex-section-header">${DAY_NAMES_SHORT[dk]}</div>`;
      filtered.forEach(ex => { html += renderExItemHtml(ex, false); });
    }
    if(noDayItems.length){
      html += `<div class="ex-section-header">Sem dia</div>`;
      noDayItems.forEach(ex => { html += renderExItemHtml(ex, false); });
    }
  }

  $exList.innerHTML = html;

  // bind clicks
  $exList.querySelectorAll(".ex-list-item").forEach(el => {
    el.addEventListener("click", e => {
      if(e.target.closest(".ex-icon-btn") || e.target.closest(".drag-handle")) return;
      openExEditor(el.dataset.id);
    });
  });
  $exList.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); openExEditor(btn.dataset.id); });
  });
  $exList.querySelectorAll(".active-toggle").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const ex = state.exercisesCatalog.get(id);
      if(!ex) return;
      const newActive = ex.active === false;
      await saveExerciseDoc(id, { active: newActive });
      ex.active = newActive;
      rebuildUserDays();
      renderExList();
    });
  });

  // drag and drop
  if(canDrag) initDragAndDrop();
}

// ========= Drag and Drop =========

function initDragAndDrop(){
  const items = $exList.querySelectorAll(".ex-list-item[draggable]");
  let dragId = null;

  items.forEach(el => {
    // HTML5 DnD
    el.addEventListener("dragstart", e => {
      dragId = el.dataset.id;
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", el.dataset.id);
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      $exList.querySelectorAll(".drag-over-top,.drag-over-bottom").forEach(x => x.classList.remove("drag-over-top","drag-over-bottom"));
    });
    el.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      el.classList.toggle("drag-over-top", e.clientY < mid);
      el.classList.toggle("drag-over-bottom", e.clientY >= mid);
    });
    el.addEventListener("dragleave", () => {
      el.classList.remove("drag-over-top","drag-over-bottom");
    });
    el.addEventListener("drop", e => {
      e.preventDefault();
      el.classList.remove("drag-over-top","drag-over-bottom");
      const fromId = e.dataTransfer.getData("text/plain");
      if(fromId === el.dataset.id) return;
      const rect = el.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      reorderExercise(fromId, el.dataset.id, before);
    });

    // Touch fallback
    let touchClone = null;
    let touchActive = false;
    let longPressTimer = null;

    const handle = el.querySelector(".drag-handle");
    if(!handle) return;

    handle.addEventListener("touchstart", e => {
      dragId = el.dataset.id;
      longPressTimer = setTimeout(() => {
        touchActive = true;
        el.classList.add("dragging");
        touchClone = el.cloneNode(true);
        touchClone.style.cssText = `position:fixed;left:16px;right:16px;width:${el.offsetWidth}px;opacity:.7;pointer-events:none;z-index:200;transform:scale(.97)`;
        touchClone.style.top = e.touches[0].clientY - el.offsetHeight/2 + "px";
        document.body.appendChild(touchClone);
      }, 250);
    }, {passive:true});

    handle.addEventListener("touchmove", e => {
      if(!touchActive){ clearTimeout(longPressTimer); return; }
      e.preventDefault();
      const y = e.touches[0].clientY;
      if(touchClone) touchClone.style.top = y - el.offsetHeight/2 + "px";
      // highlight drop target
      $exList.querySelectorAll(".drag-over-top,.drag-over-bottom").forEach(x => x.classList.remove("drag-over-top","drag-over-bottom"));
      const target = document.elementFromPoint(e.touches[0].clientX, y);
      const item = target?.closest?.(".ex-list-item");
      if(item && item.dataset.id !== dragId){
        const rect = item.getBoundingClientRect();
        item.classList.toggle("drag-over-top", y < rect.top + rect.height/2);
        item.classList.toggle("drag-over-bottom", y >= rect.top + rect.height/2);
      }
    }, {passive:false});

    handle.addEventListener("touchend", e => {
      clearTimeout(longPressTimer);
      if(!touchActive) return;
      touchActive = false;
      el.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
      $exList.querySelectorAll(".drag-over-top,.drag-over-bottom").forEach(x => x.classList.remove("drag-over-top","drag-over-bottom"));

      const y = e.changedTouches[0].clientY;
      const target = document.elementFromPoint(e.changedTouches[0].clientX, y);
      const item = target?.closest?.(".ex-list-item");
      if(item && item.dataset.id !== dragId){
        const rect = item.getBoundingClientRect();
        reorderExercise(dragId, item.dataset.id, y < rect.top + rect.height/2);
      }
    });

    handle.addEventListener("touchcancel", () => {
      clearTimeout(longPressTimer);
      touchActive = false;
      el.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
    });
  });
}

async function reorderExercise(fromId, toId, before){
  if(state.exFilterDay === null) return;
  const dk = state.exFilterDay;

  // get current order
  const ordered = [];
  $exList.querySelectorAll(".ex-list-item").forEach(el => ordered.push(el.dataset.id));

  // remove fromId and insert at new position
  const fromIdx = ordered.indexOf(fromId);
  if(fromIdx >= 0) ordered.splice(fromIdx, 1);
  let toIdx = ordered.indexOf(toId);
  if(!before) toIdx++;
  ordered.splice(toIdx, 0, fromId);

  // update orderByDay for all affected
  const promises = [];
  ordered.forEach((id, i) => {
    const ex = state.exercisesCatalog.get(id);
    if(!ex) return;
    if(!ex.orderByDay) ex.orderByDay = {};
    ex.orderByDay[dk] = i;
    promises.push(saveExerciseDoc(id, { orderByDay: ex.orderByDay }));
  });
  await Promise.all(promises);

  rebuildUserDays();
  renderExList();
}

// ========= Plans =========

async function loadPlans(){
  if(!state.user) return;
  state.plansCache.clear();
  try{
    const docs = await repo.fetchPlans(state.user.uid);
    docs.forEach(({id, data}) => state.plansCache.set(id, data));
  }catch(e){ console.warn("loadPlans:", e.message); }
}

async function savePlanDoc(docId, data){
  if(!state.user) return null;
  data.updatedAt = serverTimestamp();
  if(docId){
    await repo.putPlan(state.user.uid, docId, data);
    return docId;
  } else {
    data.createdAt = serverTimestamp();
    return await repo.addPlan(state.user.uid, data);
  }
}

async function deletePlanDoc(docId){
  if(!state.user) return;
  await repo.deletePlan(state.user.uid, docId);
}

// ========= Data export — moved to features/export.js =========
// renderPlansSection is Plans-view code (not export); it stays here.
function renderPlansSection(){
  let html = "";

  if(state.currentPlanName){
    html += `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">
      Plano ativo: <b style="color:var(--accent)">${esc(state.currentPlanName)}</b>
    </div>`;
  }

  html += `<button class="ex-new-btn" id="newPlanBtn" style="margin-bottom:14px">+ Novo plano</button>`;

  html += `<div class="ex-section-header">Predefinidos</div>`;
  PLAN_TEMPLATES.forEach(t => {
    const isActive = state.currentPlanKey === t.templateKey;
    const daysSummary = t.days.map(d => d.type).join(' \u00b7 ');
    html += `<div class="plan-card ${isActive?'active-plan':''}" data-key="${t.templateKey}">
      <div class="plan-card-body">
        <div class="plan-card-name">${esc(t.name)}</div>
        <div class="plan-card-meta">
          <span class="ex-tag">${daysSummary}</span>
          ${isActive ? '<span class="ex-tag accent">Ativo</span>' : ''}
        </div>
      </div>
      <div class="plan-card-actions">
        <button class="plan-apply-btn" data-key="${t.templateKey}">Aplicar</button>
      </div>
    </div>`;
  });

  if(state.plansCache.size){
    html += `<div class="ex-section-header">Meus planos</div>`;
    state.plansCache.forEach((plan, id) => {
      const isActive = state.currentPlanId === id;
      const daysSummary = (plan.days||[]).map(d => d.type).join(' \u00b7 ');
      html += `<div class="plan-card ${isActive?'active-plan':''}" data-id="${id}">
        <div class="plan-card-body">
          <div class="plan-card-name">${esc(plan.name)}</div>
          <div class="plan-card-meta">
            <span class="ex-tag">${daysSummary}</span>
            ${isActive ? '<span class="ex-tag accent">Ativo</span>' : ''}
          </div>
        </div>
        <div class="plan-card-actions">
          <button class="ex-icon-btn plan-edit-btn" data-id="${id}" title="Editar">\u270e</button>
          <button class="ex-icon-btn plan-delete-btn" data-id="${id}" title="Excluir">\u2715</button>
          <button class="plan-apply-btn" data-id="${id}">Aplicar</button>
        </div>
      </div>`;
    });
  }

  $plansSection.innerHTML = html;

  document.getElementById("newPlanBtn").addEventListener("click", () => openPlanEditor(null));

  $plansSection.querySelectorAll(".plan-apply-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const id = btn.dataset.id;
      if(key){
        const tpl = PLAN_TEMPLATES.find(t => t.templateKey === key);
        if(tpl) openApplyPlanModal(tpl, null);
      } else if(id){
        const plan = state.plansCache.get(id);
        if(plan) openApplyPlanModal(plan, id);
      }
    });
  });

  $plansSection.querySelectorAll(".plan-edit-btn").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); openPlanEditor(btn.dataset.id); });
  });

  $plansSection.querySelectorAll(".plan-delete-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const plan = state.plansCache.get(id);
      if(!plan || !confirm(`Excluir plano "${plan.name}"?`)) return;
      try{
        await deletePlanDoc(id);
        state.plansCache.delete(id);
        if(state.currentPlanId === id){ state.currentPlanId = null; state.currentPlanName = null; savePref(); }
        renderPlansSection();
      }catch(e){ alert("Erro: " + e.message); }
    });
  });
}

// ========= Apply plan modal =========

function openApplyPlanModal(plan, planDocId){
  const dayTypes = plan.days || [];
  const weekdays = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  const autoMap = dayTypes.length === 5 || dayTypes.length === 7;

  let html = `<h3>Aplicar plano</h3>`;
  html += `<p style="color:var(--muted);font-size:13px;margin-bottom:16px">${esc(plan.name)}</p>`;
  html += `<p style="color:var(--muted);font-size:12px;margin-bottom:14px">Associe cada tipo de dia a um dia da semana. Dias n\u00e3o mapeados ser\u00e3o dias de descanso.</p>`;

  dayTypes.forEach((d, i) => {
    const defaultDay = autoMap ? i : -1;
    html += `<div class="day-map-row">
      <span class="day-map-type">${d.type}</span>
      <span class="day-map-label">${esc(d.label)} (${d.exercises.length} ex.)</span>
      <select class="day-map-select" data-idx="${i}">
        <option value="">— Selecionar —</option>
        ${weekdays.map((w,wi) => `<option value="${wi}" ${defaultDay===wi?'selected':''}>${w}</option>`).join("")}
      </select>
    </div>`;
  });

  html += `<div class="modal-error" id="applyError" style="display:none"></div>`;
  html += `<div class="modal-footer">
    <button class="modal-btn primary" id="applyConfirm">Aplicar</button>
    <button class="modal-btn secondary" id="applyCancel">Cancelar</button>
  </div>`;

  $applyPlanModalInner.innerHTML = html;
  $applyPlanModal.classList.add("open");

  const closeApply = () => $applyPlanModal.classList.remove("open");
  document.getElementById("applyCancel").addEventListener("click", closeApply);
  $applyPlanModal.addEventListener("click", e => { if(e.target === $applyPlanModal) closeApply(); });

  document.getElementById("applyConfirm").addEventListener("click", async () => {
    const errEl = document.getElementById("applyError");
    errEl.style.display = "none";

    const mapping = [];
    const usedWeekdays = new Set();
    let valid = true;

    $applyPlanModalInner.querySelectorAll(".day-map-select").forEach(sel => {
      if(!valid) return;
      const idx = +sel.dataset.idx;
      const val = sel.value;
      if(val === ''){
        errEl.textContent = `Selecione um dia para o tipo ${dayTypes[idx].type}.`;
        errEl.style.display = ""; valid = false; return;
      }
      const weekday = +val;
      if(usedWeekdays.has(weekday)){
        errEl.textContent = `O dia ${weekdays[weekday]} foi selecionado mais de uma vez.`;
        errEl.style.display = ""; valid = false; return;
      }
      usedWeekdays.add(weekday);
      mapping.push({ dayTypeIdx: idx, weekday });
    });

    if(!valid) return;

    const $confirmBtn = document.getElementById("applyConfirm");
    const $cancelBtn = document.getElementById("applyCancel");
    $confirmBtn.disabled = true;
    $confirmBtn.classList.add("loading");
    $confirmBtn.innerHTML = '<span class="spinner"></span>Aplicando…';
    $cancelBtn.disabled = true;
    $cancelBtn.style.opacity = ".4";
    $cancelBtn.style.pointerEvents = "none";

    try{
      await applyPlan(plan, planDocId, mapping);
      closeApply();
    }catch(e){
      $confirmBtn.disabled = false;
      $confirmBtn.classList.remove("loading");
      $confirmBtn.textContent = "Aplicar";
      $cancelBtn.disabled = false;
      $cancelBtn.style.opacity = "";
      $cancelBtn.style.pointerEvents = "";
      errEl.textContent = "Erro: " + e.message;
      errEl.style.display = "";
    }
  });
}

async function preserveCurrentAsCustomPlan(){
  if(!state.user || state.exercisesCatalog.size === 0) return;

  const typeLetters = ['A','B','C','D','E','F','G'];
  const days = activeDays();
  const dayTypes = [];

  days.forEach((d) => {
    if(d.ex.length === 0) return;
    const exercises = d.ex.map(e => ({
      name: e.name, muscle: e.muscle,
      reps: [...(e.reps||[])],
      badges: [...(e.badges||[])],
      note: e.note || null,
      superset: e.superset ? {
        name: e.superset.name, muscle: e.superset.muscle,
        reps: [...(e.superset.reps||[])],
        badges: [...(e.superset.badges||[])],
        note: e.superset.note || null,
      } : null,
    }));
    dayTypes.push({
      type: typeLetters[dayTypes.length] || String(dayTypes.length),
      label: d.tag || d.focus || d.name,
      exercises,
    });
  });

  if(!dayTypes.length) return;

  const planName = state.currentPlanName || "Treino anterior";
  const planData = { name: planName, source: "custom", days: dayTypes };

  let existingId = null;
  state.plansCache.forEach((p, id) => { if(p.name === planName) existingId = id; });

  const id = await savePlanDoc(existingId, planData);
  state.plansCache.set(id, { ...planData });
}

async function applyPlan(plan, planDocId, mapping){
  if(!state.user) return;

  // 1. Preserve current workout
  await preserveCurrentAsCustomPlan();

  // 2. Delete all current exercises
  const delPromises = [];
  state.exercisesCatalog.forEach((_, id) => delPromises.push(deleteExerciseDoc(id)));
  await Promise.all(delPromises);
  state.exercisesCatalog.clear();

  // 3. Create new exercises — deduplicate by name, merge days
  const byName = new Map();
  mapping.forEach(({ dayTypeIdx, weekday }) => {
    const dayType = plan.days[dayTypeIdx];
    dayType.exercises.forEach((e, ei) => {
      if(!byName.has(e.name)){
        byName.set(e.name, {
          name: e.name, muscle: e.muscle,
          reps: [...(e.reps||[12,10,8])],
          badges: [...(e.badges||[])],
          note: e.note || null, active: true,
          days: [weekday], orderByDay: { [weekday]: ei },
          superset: e.superset ? {
            name: e.superset.name, muscle: e.superset.muscle || e.muscle,
            reps: [...(e.superset.reps||[])],
            badges: [...(e.superset.badges||[])],
            note: e.superset.note || null,
          } : null,
        });
      } else {
        const existing = byName.get(e.name);
        if(!existing.days.includes(weekday)){
          existing.days.push(weekday);
          existing.orderByDay[weekday] = ei;
        }
      }
    });
  });

  const addPromises = [];
  byName.forEach(exData => {
    addPromises.push(
      repo.addExercise(state.user.uid, { ...exData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        .then(id => state.exercisesCatalog.set(id, exData))
    );
  });
  await Promise.all(addPromises);

  // 4. Update day customizations
  for(let dk = 0; dk < 5; dk++){
    const mappedItem = mapping.find(m => m.weekday === dk);
    if(mappedItem){
      const dayType = plan.days[mappedItem.dayTypeIdx];
      await saveDayCustomization(dk, dayType.label, dayType.label);
    } else {
      await saveDayCustomization(dk, "Descanso", "Dia de descanso");
    }
  }

  // 5. Update plan pointer
  state.currentPlanName = plan.name;
  if(planDocId){
    state.currentPlanId = planDocId; state.currentPlanKey = null;
  } else if(plan.templateKey){
    state.currentPlanKey = plan.templateKey; state.currentPlanId = null;
  } else {
    state.currentPlanId = null; state.currentPlanKey = null;
  }
  await savePref();

  // 6. Rebuild and re-render
  rebuildUserDays();
  renderStrip();
  state.session = null;
  await loadDay(state.current);
  renderPlansSection();
}

// ========= Plan editor modal =========

function openPlanEditor(planDocId){
  const isNew = !planDocId;
  let plan;

  if(isNew){
    plan = { name: "", source: "custom", days: [
      { type: "A", label: "", exercises: [{name:"",muscle:"peito",reps:[10,10,10]}] }
    ]};
  } else {
    plan = JSON.parse(JSON.stringify(state.plansCache.get(planDocId)));
  }

  function renderPlanEditorContent(){
    let html = `<h3>${isNew ? 'Novo plano' : 'Editar plano'}</h3>`;
    html += `<div class="modal-field">
      <label>Nome do plano</label>
      <input class="modal-input" id="pfName" value="${esc(plan.name)}" placeholder="Ex: Push Pull Legs">
    </div>`;
    html += `<div class="modal-field"><label>Dias do plano</label></div>`;

    plan.days.forEach((d, di) => {
      html += `<div class="plan-day-type" data-di="${di}">
        <div class="plan-day-type-header">
          <span class="plan-day-type-letter">${d.type}</span>
          <input class="plan-day-type-label-input" data-di="${di}" value="${esc(d.label)}" placeholder="Ex: Push, Pull, Legs...">
          ${plan.days.length > 1 ? `<button class="plan-remove-day" data-di="${di}" title="Remover dia">\u2715</button>` : ''}
        </div>`;

      d.exercises.forEach((e, ei) => {
        html += `<div class="plan-ex-row" data-di="${di}" data-ei="${ei}">
          <div class="ac-wrap plan-ex-name-wrap">
            <input class="plan-ex-name" value="${esc(e.name)}" placeholder="Nome do exerc\u00edcio" data-di="${di}" data-ei="${ei}" autocomplete="off">
            <div class="ac-list"></div>
          </div>
          <select class="plan-ex-muscle" data-di="${di}" data-ei="${ei}">
            ${Object.entries(MUSCLE_LABEL).map(([k,v]) => `<option value="${k}" ${e.muscle===k?'selected':''}>${v}</option>`).join("")}
          </select>
          <input class="plan-ex-reps" value="${(e.reps||[]).join(',')}" placeholder="8,8,8" data-di="${di}" data-ei="${ei}" title="Reps separadas por v\u00edrgula">
          <button class="plan-ex-remove" data-di="${di}" data-ei="${ei}" title="Remover">\u2715</button>
        </div>`;
      });

      html += `<button class="plan-add-ex-btn" data-di="${di}">+ Exerc\u00edcio</button>`;
      html += `</div>`;
    });

    if(plan.days.length < 7){
      html += `<button class="plan-add-day-btn" id="pfAddDay">+ Adicionar dia</button>`;
    }

    html += `<div class="modal-error" id="pfError" style="display:none"></div>`;
    html += `<div class="modal-footer">
      <button class="modal-btn primary" id="pfSave">Salvar</button>
      <button class="modal-btn secondary" id="pfCancel">Cancelar</button>
      ${!isNew ? `<button class="modal-btn danger" id="pfDelete">Excluir</button>` : ''}
    </div>`;

    $planModalInner.innerHTML = html;
    bindPlanEditorEvents();
  }

  function syncPlanFromUI(){
    const nameEl = document.getElementById("pfName");
    if(nameEl) plan.name = nameEl.value.trim();

    $planModalInner.querySelectorAll(".plan-day-type").forEach(dtEl => {
      const di = +dtEl.dataset.di;
      if(!plan.days[di]) return;
      const labelInput = dtEl.querySelector(".plan-day-type-label-input");
      if(labelInput) plan.days[di].label = labelInput.value.trim();

      const exRows = dtEl.querySelectorAll(".plan-ex-row");
      const exercises = [];
      exRows.forEach(exRow => {
        const nameInput = exRow.querySelector(".plan-ex-name");
        const muscleSelect = exRow.querySelector(".plan-ex-muscle");
        const repsInput = exRow.querySelector(".plan-ex-reps");
        exercises.push({
          name: nameInput ? nameInput.value.trim() : "",
          muscle: muscleSelect ? muscleSelect.value : "peito",
          reps: repsInput ? repsInput.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0) : [10,10,10],
          badges: [], note: null, superset: null,
        });
      });
      plan.days[di].exercises = exercises;
    });
  }

  function bindPlanEditorEvents(){
    bindPlanExAutocomplete();
    document.getElementById("pfCancel").addEventListener("click", closePlanEditor);

    function bindPlanExAutocomplete(){
      $planModalInner.querySelectorAll(".plan-ex-name").forEach(inp => {
        const wrap = inp.closest(".ac-wrap");
        const list = wrap && wrap.querySelector(".ac-list");
        const row = inp.closest(".plan-ex-row");
        const mSel = row && row.querySelector(".plan-ex-muscle");
        if(!list) return;
        let activeIdx = -1;

        function filter(q){
          if(!q || q.length < 1){ list.classList.remove("open"); return; }
          const nq = stripDiacritics(q);
          const prefix = [], sub = [];
          EXERCISE_CATALOG.forEach(c => {
            const nc = stripDiacritics(c.name);
            if(nc.startsWith(nq)) prefix.push(c);
            else if(nc.includes(nq)) sub.push(c);
          });
          const results = prefix.concat(sub).slice(0, 8);
          if(!results.length){ list.classList.remove("open"); return; }
          activeIdx = -1;
          list.innerHTML = results.map((c,i) =>
            `<div class="ac-item" data-i="${i}" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}<span class="ac-muscle">${esc(MUSCLE_LABEL[c.muscle]||c.muscle)}</span></div>`
          ).join("");
          list.classList.add("open");
          list.querySelectorAll(".ac-item").forEach(el => {
            el.addEventListener("mousedown", e => { e.preventDefault(); pick(el.dataset.name, el.dataset.muscle); });
          });
        }
        function pick(name, muscle){
          inp.value = name;
          if(mSel && muscle) mSel.value = muscle;
          list.classList.remove("open");
        }
        inp.addEventListener("input", () => filter(inp.value.trim()));
        inp.addEventListener("focus", () => { if(inp.value.trim()) filter(inp.value.trim()); });
        inp.addEventListener("blur", () => { setTimeout(() => list.classList.remove("open"), 150); });
        inp.addEventListener("keydown", e => {
          const items = list.querySelectorAll(".ac-item");
          if(!items.length || !list.classList.contains("open")) return;
          if(e.key === "ArrowDown"){ e.preventDefault(); activeIdx = Math.min(activeIdx+1, items.length-1); }
          else if(e.key === "ArrowUp"){ e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); }
          else if(e.key === "Enter" && activeIdx >= 0){ e.preventDefault(); pick(items[activeIdx].dataset.name, items[activeIdx].dataset.muscle); return; }
          else if(e.key === "Escape"){ list.classList.remove("open"); return; }
          else return;
          items.forEach((it,i) => it.classList.toggle("active", i === activeIdx));
        });
      });
    }
    $planModal.addEventListener("click", e => { if(e.target === $planModal) closePlanEditor(); });

    $planModalInner.querySelectorAll(".plan-add-ex-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        const di = +btn.dataset.di;
        plan.days[di].exercises.push({name:"",muscle:"peito",reps:[10,10,10],badges:[],note:null,superset:null});
        renderPlanEditorContent();
      });
    });

    $planModalInner.querySelectorAll(".plan-ex-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        const di = +btn.dataset.di, ei = +btn.dataset.ei;
        plan.days[di].exercises.splice(ei, 1);
        renderPlanEditorContent();
      });
    });

    const addDayBtn = document.getElementById("pfAddDay");
    if(addDayBtn){
      addDayBtn.addEventListener("click", () => {
        syncPlanFromUI();
        const typeLetters = 'ABCDEFGHIJ';
        plan.days.push({ type: typeLetters[plan.days.length] || String(plan.days.length), label: "", exercises: [{name:"",muscle:"peito",reps:[10,10,10]}] });
        renderPlanEditorContent();
        requestAnimationFrame(() => {
          $planModalInner.scrollTo({ top: $planModalInner.scrollHeight, behavior: "smooth" });
        });
      });
    }

    $planModalInner.querySelectorAll(".plan-remove-day").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        plan.days.splice(+btn.dataset.di, 1);
        const typeLetters = 'ABCDEFGHIJ';
        plan.days.forEach((d, i) => d.type = typeLetters[i] || String(i));
        renderPlanEditorContent();
      });
    });

    document.getElementById("pfSave").addEventListener("click", async () => {
      syncPlanFromUI();
      const errEl = document.getElementById("pfError");
      errEl.style.display = "none";

      if(!plan.name){
        errEl.textContent = "Nome \u00e9 obrigat\u00f3rio."; errEl.style.display = ""; return;
      }

      for(const d of plan.days){
        d.exercises = d.exercises.filter(e => e.name);
        if(!d.exercises.length){
          errEl.textContent = `Dia ${d.type} precisa de pelo menos 1 exerc\u00edcio.`;
          errEl.style.display = ""; return;
        }
      }

      try{
        const data = { name: plan.name, source: "custom", days: plan.days };
        const id = await savePlanDoc(planDocId, data);
        state.plansCache.set(id, { ...data });
        closePlanEditor();
        renderPlansSection();
      }catch(e){
        errEl.textContent = "Erro: " + e.message;
        errEl.style.display = "";
      }
    });

    if(!isNew){
      const delBtn = document.getElementById("pfDelete");
      if(delBtn){
        delBtn.addEventListener("click", async () => {
          if(!confirm(`Excluir plano "${plan.name}"?`)) return;
          try{
            await deletePlanDoc(planDocId);
            state.plansCache.delete(planDocId);
            if(state.currentPlanId === planDocId){ state.currentPlanId = null; state.currentPlanName = null; savePref(); }
            closePlanEditor();
            renderPlansSection();
          }catch(e){ alert("Erro: " + e.message); }
        });
      }
    }
  }

  renderPlanEditorContent();
  $planModal.classList.add("open");
}

function closePlanEditor(){
  $planModal.classList.remove("open");
}

// ========= Exercise editor modal =========

function openExEditor(docId){
  const isNew = !docId;
  const ex = isNew ? {
    name:"", muscle:"ombro", reps:[12,10,8], badges:[], note:null,
    active:true, days:[], orderByDay:{}, superset:null,
  } : {...state.exercisesCatalog.get(docId)};

  let html = `<h3>${isNew ? 'Novo exercício' : 'Editar exercício'}</h3>`;

  // Nome
  html += `<div class="modal-field">
    <label>Nome</label>
    <div class="ac-wrap">
      <input class="modal-input" id="mfName" value="${esc(ex.name)}" placeholder="Nome do exercício" autocomplete="off">
      <div class="ac-list" id="acName"></div>
    </div>
  </div>`;

  // Grupo muscular
  html += `<div class="modal-field">
    <label>Grupo muscular</label>
    <select class="modal-select" id="mfMuscle">
      ${Object.entries(MUSCLE_LABEL).map(([k,v]) => `<option value="${k}" ${ex.muscle===k?'selected':''}>${v}</option>`).join("")}
    </select>
  </div>`;

  // Reps
  html += `<div class="modal-field">
    <label>Repetições por série</label>
    <div class="reps-list" id="mfReps">
      ${(ex.reps||[12]).map((r,i) => `<input class="rep-input" type="number" inputmode="numeric" value="${r}" min="1">`).join("")}
      <button class="rep-add" type="button" id="mfRepAdd">+</button>
    </div>
  </div>`;

  // Badges
  html += `<div class="modal-field">
    <label>Badges</label>
    <div class="badge-toggles" id="mfBadges">
      ${["drop","iso","fast"].map(b => `<span class="badge-toggle ${(ex.badges||[]).includes(b)?'selected':''}" data-badge="${b}">${BADGE_LABEL[b]}</span>`).join("")}
    </div>
  </div>`;

  // Nota
  html += `<div class="modal-field">
    <label>Observação</label>
    <textarea class="modal-textarea" id="mfNote" placeholder="Opcional">${esc(ex.note)}</textarea>
  </div>`;

  // Dias
  html += `<div class="modal-field">
    <label>Dias</label>
    <div class="day-chips" id="mfDays">
      ${DAY_NAMES_SHORT.map((d,i) => `<span class="day-chip ${(ex.days||[]).includes(i)?'selected':''}" data-day="${i}">${d}</span>`).join("")}
    </div>
  </div>`;

  // Ativo
  html += `<div class="modal-field" style="display:flex;align-items:center;gap:10px">
    <label style="margin-bottom:0">Ativo</label>
    <label class="switch"><input type="checkbox" id="mfActive" ${ex.active!==false?'checked':''}><span class="slider"></span></label>
  </div>`;

  // Supersérie
  const sup = ex.superset || {name:"",muscle:"ombro",reps:[12,10,8],badges:[],note:null};
  const hasSup = !!ex.superset;
  html += `<div class="modal-field">
    <button class="superset-toggle" type="button" id="mfSupToggle">
      <span id="mfSupArrow">${hasSup?'▼':'▶'}</span> Supersérie
    </button>
    <div class="superset-fields ${hasSup?'open':''}" id="mfSupFields">
      <div class="modal-field">
        <label>Nome</label>
        <div class="ac-wrap">
          <input class="modal-input" id="mfSupName" value="${esc(sup.name)}" placeholder="Nome da supersérie" autocomplete="off">
          <div class="ac-list" id="acSupName"></div>
        </div>
      </div>
      <div class="modal-field">
        <label>Grupo muscular</label>
        <select class="modal-select" id="mfSupMuscle">
          ${Object.entries(MUSCLE_LABEL).map(([k,v]) => `<option value="${k}" ${sup.muscle===k?'selected':''}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="modal-field">
        <label>Repetições por série</label>
        <div class="reps-list" id="mfSupReps">
          ${(sup.reps||[12]).map(r => `<input class="rep-input" type="number" inputmode="numeric" value="${r}" min="1">`).join("")}
          <button class="rep-add" type="button" id="mfSupRepAdd">+</button>
        </div>
      </div>
      <div class="modal-field">
        <label>Badges</label>
        <div class="badge-toggles" id="mfSupBadges">
          ${["drop","iso","fast"].map(b => `<span class="badge-toggle ${(sup.badges||[]).includes(b)?'selected':''}" data-badge="${b}">${BADGE_LABEL[b]}</span>`).join("")}
        </div>
      </div>
      <div class="modal-field">
        <label>Observação</label>
        <textarea class="modal-textarea" id="mfSupNote" placeholder="Opcional">${esc(sup.note)}</textarea>
      </div>
    </div>
  </div>`;

  // Error
  html += `<div class="modal-error" id="mfError" style="display:none"></div>`;

  // Footer
  html += `<div class="modal-footer">
    <button class="modal-btn primary" id="mfSave">Salvar</button>
    <button class="modal-btn secondary" id="mfCancel">Cancelar</button>
    ${!isNew ? `<button class="modal-btn danger" id="mfDelete">Excluir</button>` : ''}
  </div>`;

  $exModalInner.innerHTML = html;
  $exModal.classList.add("open");

  // Event bindings
  const bindRepsAdd = (containerId, addBtnId) => {
    const container = document.getElementById(containerId);
    const addBtn = document.getElementById(addBtnId);
    addBtn.addEventListener("click", () => {
      const inputs = container.querySelectorAll(".rep-input");
      const lastVal = inputs.length ? inputs[inputs.length-1].value : "10";
      const inp = document.createElement("input");
      inp.className = "rep-input"; inp.type = "number"; inp.inputMode = "numeric";
      inp.value = lastVal; inp.min = "1";
      container.insertBefore(inp, addBtn);
      // add remove on double tap
      inp.addEventListener("dblclick", () => { if(container.querySelectorAll(".rep-input").length > 1) inp.remove(); });
    });
    container.querySelectorAll(".rep-input").forEach(inp => {
      inp.addEventListener("dblclick", () => { if(container.querySelectorAll(".rep-input").length > 1) inp.remove(); });
    });
  };
  bindRepsAdd("mfReps","mfRepAdd");
  bindRepsAdd("mfSupReps","mfSupRepAdd");

  // badge toggles
  const bindBadges = (containerId) => {
    document.getElementById(containerId).querySelectorAll(".badge-toggle").forEach(el => {
      el.addEventListener("click", () => el.classList.toggle("selected"));
    });
  };
  bindBadges("mfBadges");
  bindBadges("mfSupBadges");

  // day chips
  document.getElementById("mfDays").querySelectorAll(".day-chip").forEach(el => {
    el.addEventListener("click", () => el.classList.toggle("selected"));
  });

  // superset toggle
  document.getElementById("mfSupToggle").addEventListener("click", () => {
    const f = document.getElementById("mfSupFields");
    const a = document.getElementById("mfSupArrow");
    f.classList.toggle("open");
    a.textContent = f.classList.contains("open") ? "▼" : "▶";
  });

  // autocomplete helper
  function bindAutocomplete(inputId, listId, muscleSelectId){
    const inp = document.getElementById(inputId);
    const list = document.getElementById(listId);
    const mSel = document.getElementById(muscleSelectId);
    let activeIdx = -1;

    function filter(q){
      if(!q || q.length < 1){ list.classList.remove("open"); return; }
      const nq = stripDiacritics(q);
      const prefix = [], sub = [];
      EXERCISE_CATALOG.forEach(c => {
        const nc = stripDiacritics(c.name);
        if(nc.startsWith(nq)) prefix.push(c);
        else if(nc.includes(nq)) sub.push(c);
      });
      const results = prefix.concat(sub).slice(0, 8);
      if(!results.length){ list.classList.remove("open"); return; }
      activeIdx = -1;
      list.innerHTML = results.map((c,i) =>
        `<div class="ac-item" data-i="${i}" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}<span class="ac-muscle">${esc(MUSCLE_LABEL[c.muscle]||c.muscle)}</span></div>`
      ).join("");
      list.classList.add("open");
      list.querySelectorAll(".ac-item").forEach(el => {
        el.addEventListener("mousedown", e => {
          e.preventDefault();
          pick(el.dataset.name, el.dataset.muscle);
        });
      });
    }

    function pick(name, muscle){
      inp.value = name;
      if(mSel) mSel.value = muscle;
      list.classList.remove("open");
    }

    inp.addEventListener("input", () => filter(inp.value.trim()));
    inp.addEventListener("focus", () => { if(inp.value.trim()) filter(inp.value.trim()); });
    inp.addEventListener("blur", () => { setTimeout(() => list.classList.remove("open"), 150); });
    inp.addEventListener("keydown", e => {
      const items = list.querySelectorAll(".ac-item");
      if(!items.length || !list.classList.contains("open")) return;
      if(e.key === "ArrowDown"){ e.preventDefault(); activeIdx = Math.min(activeIdx+1, items.length-1); }
      else if(e.key === "ArrowUp"){ e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); }
      else if(e.key === "Enter" && activeIdx >= 0){ e.preventDefault(); pick(items[activeIdx].dataset.name, items[activeIdx].dataset.muscle); return; }
      else if(e.key === "Escape"){ list.classList.remove("open"); return; }
      else return;
      items.forEach((it,i) => it.classList.toggle("active", i === activeIdx));
    });
  }
  bindAutocomplete("mfName","acName","mfMuscle");
  bindAutocomplete("mfSupName","acSupName","mfSupMuscle");

  // cancel
  document.getElementById("mfCancel").addEventListener("click", closeExEditor);
  $exModal.addEventListener("click", e => { if(e.target === $exModal) closeExEditor(); });
  document.addEventListener("keydown", escHandler);

  // save
  document.getElementById("mfSave").addEventListener("click", async () => {
    const errEl = document.getElementById("mfError");
    errEl.style.display = "none";
    const name = document.getElementById("mfName").value.trim();
    const muscle = document.getElementById("mfMuscle").value;
    const reps = [...document.querySelectorAll("#mfReps .rep-input")].map(i => Math.max(1, parseInt(i.value)||1));
    const badges = [...document.querySelectorAll("#mfBadges .badge-toggle.selected")].map(el => el.dataset.badge);
    const note = document.getElementById("mfNote").value.trim() || null;
    const days = [...document.querySelectorAll("#mfDays .day-chip.selected")].map(el => Number(el.dataset.day));
    const active = document.getElementById("mfActive").checked;

    // superset
    const supOpen = document.getElementById("mfSupFields").classList.contains("open");
    const supName = document.getElementById("mfSupName").value.trim();
    let superset = null;
    if(supOpen && supName){
      superset = {
        name: supName,
        muscle: document.getElementById("mfSupMuscle").value,
        reps: [...document.querySelectorAll("#mfSupReps .rep-input")].map(i => Math.max(1, parseInt(i.value)||1)),
        badges: [...document.querySelectorAll("#mfSupBadges .badge-toggle.selected")].map(el => el.dataset.badge),
        note: document.getElementById("mfSupNote").value.trim() || null,
      };
    }

    // validation
    if(!name){ errEl.textContent = "Nome é obrigatório."; errEl.style.display = ""; return; }
    if(reps.length < 1){ errEl.textContent = "Adicione ao menos 1 série."; errEl.style.display = ""; return; }
    if(days.length < 1){ errEl.textContent = "Selecione ao menos 1 dia."; errEl.style.display = ""; return; }

    // compute orderByDay for new days (append to end)
    const orderByDay = docId ? {...(state.exercisesCatalog.get(docId)?.orderByDay || {})} : {};
    days.forEach(dk => {
      if(orderByDay[dk] == null){
        // find max order for this day
        let maxOrder = -1;
        state.exercisesCatalog.forEach(ex => {
          if(ex.days?.includes(dk) && ex.orderByDay?.[dk] != null && ex.orderByDay[dk] > maxOrder)
            maxOrder = ex.orderByDay[dk];
        });
        orderByDay[dk] = maxOrder + 1;
      }
    });
    // remove orderByDay for days no longer assigned
    Object.keys(orderByDay).forEach(k => {
      if(!days.includes(Number(k))) delete orderByDay[k];
    });

    const data = { name, muscle, reps, badges, note, active, days, orderByDay, superset };

    try {
      const id = await saveExerciseDoc(docId, data);
      state.exercisesCatalog.set(id, { ...data, createdAt: state.exercisesCatalog.get(id)?.createdAt || null });
      rebuildUserDays();
      closeExEditor();
      renderExercicios();
    } catch(e) {
      errEl.textContent = "Erro ao salvar: " + e.message;
      errEl.style.display = "";
    }
  });

  // delete
  if(!isNew){
    document.getElementById("mfDelete").addEventListener("click", async () => {
      if(!confirm(`Excluir "${ex.name}" permanentemente?`)) return;
      try {
        await deleteExerciseDoc(docId);
        state.exercisesCatalog.delete(docId);
        rebuildUserDays();
        closeExEditor();
        renderExercicios();
      } catch(e) { alert("Erro ao excluir: " + e.message); }
    });
  }
}

function escHandler(e){ if(e.key === "Escape") closeExEditor(); }
function closeExEditor(){
  $exModal.classList.remove("open");
  document.removeEventListener("keydown", escHandler);
}

// ========= Share PDF — moved to features/share-pdf.js =========

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

bindFlagsUpdatedListener();

applyTheme();
applyModeButtons();
renderStrip();
