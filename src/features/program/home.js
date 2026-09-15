import { esc, plural } from "../../domain/text.js";
import { todayWeekdayIdx } from "../../domain/dates.js";
import { deriveProgram, weekPattern, planSetCount, nextLetter, addWorkout, appendToWeekdaysPatch } from "../../domain/program.js";
import { historicPace, estimateMs } from "../../domain/day-plan.js";
import { MUSCLE_LABEL } from "../../data/labels.js";
import { DAY_NAMES_SHORT } from "../../data/days.js";
import { state } from "../../core/state.js";
import { $panel, $subViewHome, $programSheet, $programSheetInner } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { showTab } from "../shell.js";
import { renderStrip, skeletonPanel } from "../day/render.js";
import { loadDay } from "../day/session-io.js";
import { openOnboarding } from "../onboarding.js";
import { fmtDur } from "../train/summary.js";
import { sharePlan } from "../plans/share.js";
import { activeProgramAsPlan } from "../plans/apply-modal.js";
import { savePlanDoc } from "../plans/index.js";
import { saveDayCustomization } from "../exercises/day-customization.js";
import { applyCatalogPatches, refreshAfterPlanEdit, showInfoToast, resolvePick } from "./edit.js";
import { openExercisePicker } from "./picker.js";
import { saveProgram } from "./store.js";

async function goToDay(wd){
  state.current = wd;
  state.showProgramReviewHint = false;
  showTab("treino");
  renderStrip();
  $panel.innerHTML = skeletonPanel();
  await loadDay(wd);
  renderStrip();
}

export function renderProgramHome(){
  if(state.exercisesCatalog.size === 0){
    $subViewHome.innerHTML = `<h1 class="pg-title">Programa</h1>
      <div class="evo-empty">
        <span class="big">Nenhum programa</span>
        Aplique um programa pronto para começar a treinar.
        <button class="modal-btn primary" id="exApplyPlanBtn" style="margin-top:14px">Aplicar um programa</button>
      </div>`;
    document.getElementById("exApplyPlanBtn").addEventListener("click", openOnboarding);
    return;
  }

  const days = activeDays();
  const program = state.program || deriveProgram(state.exercisesCatalog, { dayCustomizations: state.dayCustomizations });
  const pattern = weekPattern(program);
  const today = todayWeekdayIdx();
  const planName = esc(state.currentPlanName || "Meu treino");
  const workoutCount = program.workouts.length;
  const activeDayCount = [...pattern].filter(c => c !== "–").length;

  let html = `<h1 class="pg-title">Programa</h1>`;
  html += `<section class="pg-plan">
    <div class="pg-plan-top">
      <div class="pg-plan-txt">
        <span class="pg-lbl">Plano ativo</span>
        <span class="pg-plan-name">${planName}</span>
        <span class="pg-meta">${plural(workoutCount, "treino", "treinos")} · ${plural(activeDayCount, "dia", "dias")} por semana</span>
      </div>
      <button class="pg-kebab" id="pgPlanMenu" type="button" aria-label="Ações do plano">⋯</button>
    </div>
    <div class="pg-week">`;
  DAY_NAMES_SHORT.forEach((label, wd) => {
    const letter = pattern[wd];
    const isRest = letter === "–";
    html += `<button class="pg-wd ${isRest?'is-rest':''} ${wd===today?'is-today':''}" data-wd="${wd}" type="button" ${isRest?'disabled':''}>
      <small>${label}</small><b>${esc(letter)}</b>
    </button>`;
  });
  html += `</div>
  </section>`;

  html += `<div class="pg-sec"><span class="pg-lbl">Treinos</span></div>`;

  program.workouts.forEach(w => {
    const wd0 = w.weekdays[0];
    const dayEx = days[wd0]?.ex || [];
    const focusLabels = w.focus.map(k => MUSCLE_LABEL[k] || k).join(" · ");
    const name = w.label || focusLabels || `Treino ${w.letter}`;
    const n = dayEx.length;
    const s = planSetCount(dayEx);
    const pace = historicPace(state.allSessions || [], wd0);
    const ms = estimateMs(s, pace);
    const eta = ms != null ? ` · ~${fmtDur(ms, false)}` : "";
    const tags = w.weekdays.map(wd => {
      const isToday = wd === today;
      return `<span class="pg-tag ${isToday?'is-today':''}">${esc(DAY_NAMES_SHORT[wd])}${isToday?' · hoje':''}</span>`;
    }).join("");

    html += `<button class="pg-wk" data-letter="${esc(w.letter)}" type="button">
      <span class="pg-letter">${esc(w.letter)}</span>
      <span class="pg-wk-body">
        <span class="pg-wk-name">${esc(name)}</span>
        ${focusLabels && focusLabels !== name ? `<span class="pg-meta">${esc(focusLabels)}</span>` : ""}
        <span class="pg-meta">${n} exercícios · ${s} séries${eta}</span>
        <span class="pg-days">${tags}</span>
      </span>
      <span class="pg-chev" aria-hidden="true">›</span>
    </button>`;
  });

  const canAddWorkout = nextLetter(program) != null;
  if(canAddWorkout) html += `<button class="pw-add" id="pgNewWorkout" type="button">+ Novo treino</button>`;

  $subViewHome.innerHTML = html;

  $subViewHome.querySelectorAll(".pg-wd:not(.is-rest)").forEach(btn => {
    btn.addEventListener("click", () => goToDay(+btn.dataset.wd));
  });
  $subViewHome.querySelectorAll(".pg-wk").forEach(btn => {
    btn.addEventListener("click", () => {
      state.exWorkoutLetter = btn.dataset.letter;
      state.exSubTab = "workout";
      window._renderExercicios();
      window.scrollTo(0,0);
    });
  });
  document.getElementById("pgPlanMenu").addEventListener("click", openProgramSheet);
  if(canAddWorkout) document.getElementById("pgNewWorkout").addEventListener("click", () => openNewWorkoutSheet(program));
}

function closeProgramSheet(){ $programSheet.classList.remove("open"); }

export function openProgramSheet(){
  const planName = esc(state.currentPlanName || "Meu treino");
  $programSheetInner.innerHTML = `<h3 class="pg-sheet-title">${planName}</h3>
    <button class="pg-sheet-item" data-act="plans" type="button">Trocar plano<small>biblioteca</small></button>
    <button class="pg-sheet-item" data-act="share" type="button">Compartilhar</button>
    <button class="pg-sheet-item" data-act="copy" type="button">Salvar cópia em Meus planos</button>`;
  $programSheet.classList.add("open");

  $programSheetInner.querySelector('[data-act="plans"]').addEventListener("click", () => {
    closeProgramSheet();
    state.exSubTab = "plans";
    window._renderExercicios();
    window.scrollTo(0,0);
  });
  $programSheetInner.querySelector('[data-act="share"]').addEventListener("click", () => {
    closeProgramSheet();
    sharePlan(activeProgramAsPlan());
  });
  const $copyBtn = $programSheetInner.querySelector('[data-act="copy"]');
  $copyBtn.addEventListener("click", async () => {
    $copyBtn.disabled = true;
    const p = activeProgramAsPlan();
    const data = { name: `${p.name} (cópia)`, source: "custom", notes: [], days: p.days };
    try{
      const id = await savePlanDoc(null, data);
      state.plansCache.set(id, data);
      $copyBtn.textContent = "Salvo em Meus planos ✓";
      setTimeout(closeProgramSheet, 900);
    }catch(_){
      $copyBtn.textContent = "Não foi possível salvar";
      $copyBtn.disabled = false;
    }
  });
}

function openNewWorkoutSheet(program){
  const letter = nextLetter(program);
  if(!letter) return;
  const pattern = weekPattern(program);
  const restWds = [];
  for(let wd = 0; wd <= 6; wd++) if(pattern[wd] === "–") restWds.push(wd);

  let sheet = `<h3 class="pg-sheet-title">Novo treino ${esc(letter)}</h3>`;
  if(restWds.length === 0){
    sheet += `<p class="pg-meta" id="nwHint">Todos os dias já têm treino. Tire um dia de algum treino para liberar espaço.</p>`;
    $programSheetInner.innerHTML = sheet;
    $programSheet.classList.add("open");
    return;
  }

  sheet += `<div class="pw-field"><span class="pg-lbl">Nome (opcional)</span>
    <input class="pw-name-input" id="nwName" maxlength="30" placeholder="Ex.: Push, Superiores"></div>`;
  sheet += `<div class="pw-field"><span class="pg-lbl">Dias da semana</span><div class="pw-days" id="nwDays">`;
  DAY_NAMES_SHORT.forEach((abbr, wd) => {
    if(pattern[wd] === "–") sheet += `<button class="pw-day" data-wd="${wd}" type="button">${esc(abbr)}</button>`;
    else sheet += `<button class="pw-day other" type="button" disabled>${esc(abbr)} · ${esc(pattern[wd])}</button>`;
  });
  sheet += `</div></div>`;
  sheet += `<p class="pg-meta" id="nwHint"></p>`;
  sheet += `<button class="xp-confirm" id="nwNext" type="button" disabled>Escolher exercícios</button>`;

  $programSheetInner.innerHTML = sheet;
  $programSheet.classList.add("open");

  const $next = document.getElementById("nwNext");
  $programSheetInner.querySelectorAll("#nwDays .pw-day:not(.other)").forEach(chip => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("on");
      $next.disabled = $programSheetInner.querySelectorAll("#nwDays .pw-day.on").length === 0;
    });
  });

  $next.addEventListener("click", () => {
    const label = document.getElementById("nwName").value.trim();
    const weekdays = [...$programSheetInner.querySelectorAll("#nwDays .pw-day.on")]
      .map(el => +el.dataset.wd).sort((a, b) => a - b);
    if(weekdays.length === 0) return;
    closeProgramSheet();
    openExercisePicker({
      title: `Novo treino ${letter}`,
      mode: "multi",
      focus: [],
      inWorkoutNames: [],
      onConfirm: picks => createWorkout({ label, weekdays, picks }),
    });
  });
}

async function createWorkout({ label, weekdays, picks }){
  if(!picks.length) return;
  const ids = [];
  for(const pick of picks){
    const id = await resolvePick(pick);
    const patch = appendToWeekdaysPatch(state.exercisesCatalog, weekdays, id);
    if(patch) await applyCatalogPatches([[id, { ...patch, active: true }]]);
    ids.push(id);
  }
  const focus = [...new Set(ids.map(id => state.exercisesCatalog.get(id)?.muscle).filter(Boolean))];
  const base = state.program || deriveProgram(state.exercisesCatalog, { dayCustomizations: state.dayCustomizations });
  const next = addWorkout(base, { label, focus, weekdays });
  if(!next){ showInfoToast("Não foi possível criar o treino"); refreshAfterPlanEdit(weekdays); return; }
  saveProgram(next);
  const focusLabels = focus.map(k => MUSCLE_LABEL[k] || k).join(" · ");
  await Promise.all(weekdays.map(wd => saveDayCustomization(wd, label || focusLabels, focusLabels)
    .catch(e => console.warn("saveDayCustomization:", e.message))));
  refreshAfterPlanEdit(weekdays);
  const letter = next.workouts[next.workouts.length - 1].letter;
  state.exWorkoutLetter = letter; state.exSubTab = "workout";
  window._renderExercicios(); window.scrollTo(0, 0);
  showInfoToast(`Treino ${letter} criado`);
}

export function init(){
  $programSheet.addEventListener("click", e => { if(e.target === $programSheet) closeProgramSheet(); });
}
