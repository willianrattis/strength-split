import { esc } from "../../domain/text.js";
import { weekPattern, planSetCount } from "../../domain/program.js";
import { nameKey } from "../../domain/exercise-picker.js";
import { suggestExercises } from "../../domain/exercise-suggest.js";
import { scheduleFromPlan, scheduleToMapping } from "../../domain/plan-schedule.js";
import {
  splitsForDays, buildAgenda, cycleAgendaCell, agendaPattern,
  draftForSplit, validateDraft, suggestPlanName, draftToPlan,
} from "../../domain/plan-draft.js";
import { DAY_NAMES_SHORT } from "../../data/days.js";
import { MUSCLE_ORDER, MUSCLE_LABEL } from "../../data/labels.js";
import { EXERCISE_CATALOG } from "../../data/exercise-catalog.js";
import { state } from "../../core/state.js";
import { $planWizard } from "../../core/dom.js";
import { lockBodyScroll, unlockBodyScroll } from "../../core/ui/modal.js";
import { openExercisePicker } from "../program/picker.js";
import { showInfoToast } from "../program/edit.js";
import { savePlanDoc } from "./index.js";
import { applyPlan } from "./apply-modal.js";

const STEP_NAMES = ["Divisão e agenda", "Exercícios", "Revisão"];

// Module-local state, reset by every openPlanWizard() call.
let draft = null;
let step = 1;
let activeIdx = 0;
let openStepperIdx = null;
let suggestOffset = new Map();
let saving = false;
let suppressPopstate = false;

function escHandler(e){
  if(e.key !== "Escape") return;
  const scrim = document.getElementById("wzScrim");
  if(scrim){ closeDiscardDialog(scrim); return; }
  requestClose();
}

function popstateHandler(){
  if(suppressPopstate){ suppressPopstate = false; return; }
  if($planWizard.hidden) return;
  const scrim = document.getElementById("wzScrim");
  if(scrim){
    closeDiscardDialog(scrim);
    history.pushState({ planWizard: true }, "");
    return;
  }
  requestClose();
  if(!$planWizard.hidden) history.pushState({ planWizard: true }, "");
}

function isDirty(){
  const hasExercises = draft.workouts.some(w => w.exercises.length > 0);
  return hasExercises || !!draft.name.trim() || !!draft.notes.trim();
}

function requestClose(){
  if(saving) return;
  if(!isDirty()){ closePlanWizard(true); return; }
  showDiscardDialog();
}

function closeDiscardDialog(scrim){
  scrim.remove();
}

function showDiscardDialog(){
  const W = draft.workouts.filter(w => w.exercises.length > 0).length;
  const E = draft.workouts.reduce((sum, w) => sum + w.exercises.length, 0);

  const scrim = document.createElement("div");
  scrim.className = "wz-scrim";
  scrim.id = "wzScrim";
  scrim.innerHTML = `<div class="wz-dlg" role="alertdialog" aria-labelledby="wzDlgT">
    <h4 id="wzDlgT">Descartar rascunho?</h4>
    <p>Você montou ${W} treino(s) com ${E} exercício(s). Se sair agora, isso se perde.</p>
    <button class="wz-back" id="wzKeep" type="button">Continuar editando</button>
    <button class="wz-discard" id="wzDiscard" type="button">Descartar</button>
  </div>`;
  $planWizard.appendChild(scrim);

  scrim.addEventListener("click", e => { if(e.target === scrim) closeDiscardDialog(scrim); });
  document.getElementById("wzKeep").addEventListener("click", () => closeDiscardDialog(scrim));
  document.getElementById("wzDiscard").addEventListener("click", () => {
    closeDiscardDialog(scrim);
    closePlanWizard(true);
  });
}

function initialDays(){
  if(!state.program || !state.program.workouts || state.program.workouts.length === 0) return 3;
  const pattern = weekPattern(state.program);
  const n = [...pattern].filter(c => c !== "–").length;
  return Math.min(7, Math.max(2, n));
}

export function openPlanWizard(){
  step = 1;
  activeIdx = 0;
  openStepperIdx = null;
  suggestOffset = new Map();
  saving = false;
  const n = initialDays();
  const offered = splitsForDays(n);
  const splitKey = offered.length ? offered[0].key : "custom";
  draft = draftForSplit(n, splitKey);

  $planWizard.hidden = false;
  lockBodyScroll();
  document.addEventListener("keydown", escHandler);
  history.pushState({ planWizard: true }, "");
  window.addEventListener("popstate", popstateHandler);
  render();
}

/** `fromUi`: close was requested from within the wizard (✕/Escape/Discard/finish), not by an already-consumed browser back-navigation — pops the history entry pushed on open, unless it was already popped by that navigation. */
export function closePlanWizard(fromUi){
  if(fromUi && history.state?.planWizard){
    suppressPopstate = true;
    history.back();
  }
  $planWizard.hidden = true;
  unlockBodyScroll();
  document.removeEventListener("keydown", escHandler);
  window.removeEventListener("popstate", popstateHandler);
}

function splitPattern(n, split){
  if(!split.types) return "?";
  return agendaPattern(buildAgenda(n, split.types.length)).replace(/–/g, "");
}

function splitMeta(n, split){
  if(!split.types) return "você define treinos e foco";
  const typeCount = split.types.length;
  const counts = new Array(typeCount).fill(0);
  buildAgenda(n, typeCount).forEach(idx => { if(idx !== null) counts[idx]++; });
  const T = typeCount;
  const allEqual = counts.every(c => c === counts[0]);
  if(allEqual) return `${T} treino(s) · ${T === 1 ? "" : "cada um "}${counts[0]}× por semana`;
  return `${T} treinos`;
}

function splitCardHtml(split){
  const isOn = draft.splitKey === split.key;
  let html = `<button class="wz-split ${isOn ? "on" : ""}" data-key="${esc(split.key)}" type="button">
    <span class="wz-radio"></span>
    <span class="wz-split-b"><b>${esc(split.name)}</b><span class="pg-meta">${esc(splitMeta(draft.days, split))}</span></span>
    <span class="wz-pattern">${esc(splitPattern(draft.days, split))}</span>
  </button>`;
  if(isOn && split.key === "custom"){
    html += `<div class="wz-custom">Treinos diferentes <div class="pw-stp-c"><button type="button" data-d="-1">−</button><b>${draft.workouts.length}</b><button type="button" data-d="1">+</button></div></div>`;
  }
  return html;
}

function agendaCellsHtml(){
  let html = "";
  DAY_NAMES_SHORT.forEach((abbr, wd) => {
    const idx = draft.schedule[wd];
    const w = (idx === null || idx === undefined) ? null : draft.workouts[idx];
    const letter = w ? w.letter : "–";
    html += `<button class="pg-wd ${w ? "" : "is-rest"}" data-wd="${wd}" type="button"><small>${esc(abbr)}</small><b>${esc(letter)}</b></button>`;
  });
  return html;
}

function step1Body(err){
  const offered = splitsForDays(draft.days);

  let html = `<section class="wz-sec"><h3 class="wz-q">Dias por semana</h3>
    <div class="wz-seg" id="wzDays">`;
  for(let v = 2; v <= 7; v++){
    html += `<button class="${draft.days === v ? "on" : ""}" data-v="${v}" type="button">${v}</button>`;
  }
  html += `</div></section>`;

  html += `<section class="wz-sec"><h3 class="wz-q">Divisão</h3>
    <div class="wz-splits" id="wzSplits">${offered.map(splitCardHtml).join("")}</div>
  </section>`;

  html += `<section class="wz-sec"><h3 class="wz-q">Agenda</h3>
    <div class="pg-week" id="wzAgenda">${agendaCellsHtml()}</div>
    <p class="pg-meta">Toque num dia para trocar o treino ou marcar descanso.</p>
    <p class="wz-err" id="wzErr" ${err ? "" : "hidden"}>${esc(err || "")}</p>
  </section>`;

  return html;
}

function bindStep1(){
  document.querySelectorAll("#wzDays button").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = +btn.dataset.v;
      const offered = splitsForDays(v);
      const key = offered.some(s => s.key === draft.splitKey) ? draft.splitKey : offered[0].key;
      draft = draftForSplit(v, key, { prev: draft });
      render();
    });
  });

  document.querySelectorAll("#wzSplits .wz-split").forEach(btn => {
    btn.addEventListener("click", () => {
      draft = draftForSplit(draft.days, btn.dataset.key, { prev: draft });
      render();
    });
  });

  document.querySelectorAll("#wzSplits .wz-custom .pw-stp-c button").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = +btn.dataset.d;
      const count = Math.min(draft.days, Math.max(1, draft.workouts.length + d));
      draft = draftForSplit(draft.days, "custom", { customTypeCount: count, prev: draft });
      render();
    });
  });

  document.querySelectorAll("#wzAgenda button").forEach(btn => {
    btn.addEventListener("click", () => {
      const wd = +btn.dataset.wd;
      const schedule = cycleAgendaCell(draft.schedule, wd, draft.workouts.length);
      const days = schedule.filter(v => v !== null).length;
      draft = { ...draft, schedule, days };
      render();
    });
  });
}

// ---- step 2: Exercícios ----

function isUniform(reps){
  return Array.isArray(reps) && reps.length > 0 && reps.every(r => r === reps[0]);
}

function defaultReps(name){
  const key = nameKey(name);
  const entry = EXERCISE_CATALOG.find(it => nameKey(it.name) === key);
  return entry && entry.type === "comp" ? [8, 8, 8, 8] : [12, 12, 12];
}

function tabsHtml(){
  return draft.workouts.map((w, i) => {
    const cls = [i === activeIdx ? "on" : "", w.exercises.length === 0 ? "empty" : ""].filter(Boolean).join(" ");
    const label = w.label || `Treino ${w.letter}`;
    return `<button class="wz-tab ${cls}" data-i="${i}" type="button"><b>${esc(w.letter)}</b><small>${esc(label)} · ${w.exercises.length || "vazio"}</small></button>`;
  }).join("");
}

function updateActiveTabSmall(w){
  const small = document.querySelector(`#wzTabs .wz-tab[data-i="${activeIdx}"] small`);
  if(small) small.textContent = `${w.label || `Treino ${w.letter}`} · ${w.exercises.length || "vazio"}`;
}

function focusChipsHtml(w){
  return MUSCLE_ORDER.map(m =>
    `<button class="pw-day ${w.focus.includes(m) ? "on" : ""}" data-m="${m}" type="button">${esc(MUSCLE_LABEL[m] || m)}</button>`
  ).join("");
}

function suggestBlockHtml(w){
  const hasFocus = w.focus.length > 0;
  return `<p class="pg-meta">${hasFocus ? "Preencher com compostos e isoladores do foco escolhido." : "Escolha o foco para receber sugestões."}</p>
    <button class="wz-back wz-suggest-btn" id="wzSuggest" type="button" ${hasFocus ? "" : "disabled"}>Sugerir exercícios</button>`;
}

function rowHtml(e, j){
  const uniform = isUniform(e.reps);
  const setsText = uniform ? `${e.reps.length} × ${e.reps[0]}` : (e.reps || []).join("/");
  const open = openStepperIdx === j;
  return `<div class="pw-row ${open ? "open" : ""}" data-j="${j}" draggable="true">
    <span class="pw-grip" aria-label="Arrastar"><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <div class="pw-row-b"><span class="pw-row-n">${esc(e.name)}</span><span class="pw-row-m"><span class="pg-tag">${esc(MUSCLE_LABEL[e.muscle] || e.muscle)}</span></span></div>
    <button class="pw-sets" type="button" data-j="${j}">${esc(setsText)}</button>
    <button class="rm pw-more" data-j="${j}" aria-label="Remover" type="button">✕</button>
    <div class="pw-steppers" ${open ? "" : "hidden"}>
      <div class="pw-stp" data-k="sets"><span class="pg-lbl">Séries</span><div class="pw-stp-c"><button type="button" data-k="sets" data-d="-1">−</button><b>${e.reps.length}</b><button type="button" data-k="sets" data-d="1">+</button></div></div>
      <div class="pw-stp" data-k="reps"><span class="pg-lbl">Reps</span><div class="pw-stp-c"><button type="button" data-k="reps" data-d="-1">−</button><b>${e.reps[0]}</b><button type="button" data-k="reps" data-d="1">+</button></div></div>
    </div>
  </div>`;
}

function listHtml(w){
  return w.exercises.map((e, j) => rowHtml(e, j)).join("");
}

function step2Body(w){
  let html = `<div class="wz-tabs" id="wzTabs">${tabsHtml()}</div>`;

  html += `<section class="wz-sec">
    <input class="pw-name-input" id="wzLabel" maxlength="30" placeholder="Nome do treino (ex.: Push)" value="${esc(w.label || "")}">
    <div class="pw-days" id="wzFocus">${focusChipsHtml(w)}</div>
  </section>`;

  html += `<div class="pw-list" id="wzList">${listHtml(w)}</div>`;
  html += `<button class="pw-add" id="wzAdd" type="button">+ Adicionar exercícios</button>`;
  html += `<div class="wz-suggest">${suggestBlockHtml(w)}</div>`;

  return html;
}

// Splices `from` out of `list` and reinserts it immediately before/after the
// item currently at `to` — index-order-agnostic, since it re-locates the
// target item by reference after the removal instead of doing index math.
function reorderDraftExercises(list, from, to, before){
  const item = list[from];
  const target = list[to];
  const without = list.filter((_, i) => i !== from);
  const targetIdx = without.indexOf(target);
  without.splice(before ? targetIdx : targetIdx + 1, 0, item);
  return without;
}

function bindTabs(){
  document.querySelectorAll("#wzTabs .wz-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      activeIdx = +btn.dataset.i;
      openStepperIdx = null;
      render();
    });
  });
}

function bindFocusChips(w){
  document.querySelectorAll("#wzFocus .pw-day").forEach(chip => {
    chip.addEventListener("click", () => {
      const m = chip.dataset.m;
      const set = new Set(w.focus);
      if(set.has(m)) set.delete(m); else set.add(m);
      w.focus = MUSCLE_ORDER.filter(k => set.has(k));
      renderFocusAndSuggest(w);
    });
  });
}

function renderFocusAndSuggest(w){
  const $focus = document.getElementById("wzFocus");
  $focus.innerHTML = focusChipsHtml(w);
  bindFocusChips(w);

  const $suggest = document.querySelector(".wz-suggest");
  $suggest.innerHTML = suggestBlockHtml(w);
  document.getElementById("wzSuggest").addEventListener("click", () => doSuggest(w));
}

function doSuggest(w){
  const offset = suggestOffset.get(w.letter) || 0;
  const items = suggestExercises(EXERCISE_CATALOG, w.focus, { exclude: w.exercises.map(e => e.name), offset });
  suggestOffset.set(w.letter, offset + 1);
  if(!items.length){ showInfoToast("Sem novas sugestões para esse foco"); return; }
  items.forEach(s => w.exercises.push({ name: s.name, muscle: s.muscle, reps: s.reps, badges: [], grip: null, note: null, superset: null }));
  openStepperIdx = null;
  render();
  showInfoToast(`${items.length} exercícios sugeridos`);
}

function openAddPicker(w){
  openExercisePicker({
    title: `Adicionar ao treino ${w.letter}`,
    mode: "multi",
    focus: w.focus,
    inWorkoutNames: w.exercises.map(e => e.name),
    onConfirm: picks => {
      picks.forEach(p => w.exercises.push(p.doc
        ? { name: p.doc.name, muscle: p.doc.muscle, reps: [...p.doc.reps], badges: [...(p.doc.badges || [])], grip: p.doc.grip ?? null, note: p.doc.note ?? null, superset: p.doc.superset ?? null }
        : { name: p.name, muscle: p.muscle, reps: defaultReps(p.name), badges: [], grip: null, note: null, superset: null }));
      openStepperIdx = null;
      render();
    },
  });
}

function bindDnD(w){
  document.querySelectorAll("#wzList .pw-row").forEach(row => {
    let dragJ = null;

    row.addEventListener("dragstart", e => {
      dragJ = +row.dataset.j;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(dragJ));
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      document.querySelectorAll("#wzList .drag-over-top,#wzList .drag-over-bottom").forEach(x => x.classList.remove("drag-over-top", "drag-over-bottom"));
    });
    row.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      row.classList.toggle("drag-over-top", e.clientY < mid);
      row.classList.toggle("drag-over-bottom", e.clientY >= mid);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-top", "drag-over-bottom");
    });
    row.addEventListener("drop", e => {
      e.preventDefault();
      row.classList.remove("drag-over-top", "drag-over-bottom");
      const fromJ = +e.dataTransfer.getData("text/plain");
      const toJ = +row.dataset.j;
      if(Number.isNaN(fromJ) || fromJ === toJ) return;
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      w.exercises = reorderDraftExercises(w.exercises, fromJ, toJ, before);
      openStepperIdx = null;
      render();
    });

    const handle = row.querySelector(".pw-grip");
    let touchClone = null, touchActive = false, longPressTimer = null;
    if(!handle) return;

    handle.addEventListener("touchstart", e => {
      dragJ = +row.dataset.j;
      longPressTimer = setTimeout(() => {
        touchActive = true;
        row.classList.add("dragging");
        touchClone = row.cloneNode(true);
        touchClone.style.cssText = `position:fixed;left:16px;right:16px;width:${row.offsetWidth}px;opacity:.7;pointer-events:none;z-index:200;transform:scale(.97)`;
        touchClone.style.top = e.touches[0].clientY - row.offsetHeight / 2 + "px";
        document.body.appendChild(touchClone);
      }, 250);
    }, { passive: true });

    handle.addEventListener("touchmove", e => {
      if(!touchActive){ clearTimeout(longPressTimer); return; }
      e.preventDefault();
      const y = e.touches[0].clientY;
      if(touchClone) touchClone.style.top = y - row.offsetHeight / 2 + "px";
      document.querySelectorAll("#wzList .drag-over-top,#wzList .drag-over-bottom").forEach(x => x.classList.remove("drag-over-top", "drag-over-bottom"));
      const target = document.elementFromPoint(e.touches[0].clientX, y);
      const item = target?.closest?.(".pw-row");
      if(item && +item.dataset.j !== dragJ){
        const rect = item.getBoundingClientRect();
        item.classList.toggle("drag-over-top", y < rect.top + rect.height / 2);
        item.classList.toggle("drag-over-bottom", y >= rect.top + rect.height / 2);
      }
    }, { passive: false });

    handle.addEventListener("touchend", e => {
      clearTimeout(longPressTimer);
      if(!touchActive) return;
      touchActive = false;
      row.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
      document.querySelectorAll("#wzList .drag-over-top,#wzList .drag-over-bottom").forEach(x => x.classList.remove("drag-over-top", "drag-over-bottom"));

      const y = e.changedTouches[0].clientY;
      const target = document.elementFromPoint(e.changedTouches[0].clientX, y);
      const item = target?.closest?.(".pw-row");
      if(item && +item.dataset.j !== dragJ){
        const rect = item.getBoundingClientRect();
        const before = y < rect.top + rect.height / 2;
        w.exercises = reorderDraftExercises(w.exercises, dragJ, +item.dataset.j, before);
        openStepperIdx = null;
        render();
      }
    });

    handle.addEventListener("touchcancel", () => {
      clearTimeout(longPressTimer);
      touchActive = false;
      row.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
    });
  });
}

function bindList(w){
  document.querySelectorAll("#wzList .pw-sets").forEach(btn => {
    btn.addEventListener("click", () => {
      const j = +btn.dataset.j;
      openStepperIdx = openStepperIdx === j ? null : j;
      render();
    });
  });

  document.querySelectorAll("#wzList .rm").forEach(btn => {
    btn.addEventListener("click", () => {
      const j = +btn.dataset.j;
      w.exercises.splice(j, 1);
      openStepperIdx = null;
      render();
    });
  });

  document.querySelectorAll("#wzList .pw-stp-c button").forEach(btn => {
    btn.addEventListener("click", () => {
      const j = +btn.closest(".pw-row").dataset.j;
      const e = w.exercises[j];
      const k = btn.dataset.k;
      const d = +btn.dataset.d;
      if(k === "sets"){
        const next = Math.min(10, Math.max(1, e.reps.length + d));
        e.reps = Array(next).fill(e.reps[0] ?? 10);
      } else {
        const next = Math.min(50, Math.max(1, (e.reps[0] ?? 10) + d));
        e.reps = Array(e.reps.length).fill(next);
      }
      render();
    });
  });

  bindDnD(w);
}

function bindStep2(w){
  bindTabs();

  const $label = document.getElementById("wzLabel");
  $label.addEventListener("input", () => {
    w.label = $label.value;
    updateActiveTabSmall(w);
  });

  bindFocusChips(w);
  document.getElementById("wzSuggest").addEventListener("click", () => doSuggest(w));
  document.getElementById("wzAdd").addEventListener("click", () => openAddPicker(w));

  bindList(w);
}

// ---- step 3: Revisão ----

function weekCellsHtml(){
  const pattern = agendaPattern(draft.schedule);
  return DAY_NAMES_SHORT.map((abbr, wd) => {
    const letter = pattern[wd];
    const isRest = letter === "–";
    return `<button class="pg-wd ${isRest ? "is-rest" : ""}" type="button" disabled><small>${esc(abbr)}</small><b>${esc(letter)}</b></button>`;
  }).join("");
}

function summaryHtml(){
  return draft.workouts.map(w => {
    const label = w.label || `Treino ${w.letter}`;
    return `<div class="wz-sum-r"><span class="pg-letter">${esc(w.letter)}</span>
      <span class="pg-wk-body"><b>${esc(label)}</b><span class="pg-meta">${w.exercises.length} exercícios · ${planSetCount(w.exercises)} séries</span></span></div>`;
  }).join("");
}

function optionsHtml(){
  const hasCurrent = state.exercisesCatalog.size > 0;
  const activateNote = hasCurrent ? "Substitui o plano atual, que fica salvo em Meus planos." : "Começa a valer já nesta semana.";
  return `<button class="wz-opt ${draft.activate ? "on" : ""}" data-activate="1" type="button"><span class="wz-radio"></span><span><b>Ativar agora</b><span class="pg-meta">${esc(activateNote)}</span></span></button>
    <button class="wz-opt ${draft.activate ? "" : "on"}" data-activate="0" type="button"><span class="wz-radio"></span><span><b>Salvar para depois</b><span class="pg-meta">Vai para Meus planos sem mexer no treino desta semana.</span></span></button>`;
}

function step3Body(){
  let html = `<section class="wz-sec"><h3 class="wz-q">Nome do plano</h3>
    <input class="pw-name-input" id="wzName" maxlength="60" value="${esc(draft.name || suggestPlanName(draft))}"></section>`;

  html += `<div class="pg-week">${weekCellsHtml()}</div>`;
  html += `<div class="wz-sum">${summaryHtml()}</div>`;

  html += `<section class="wz-sec"><h3 class="wz-q">Notas (opcional)</h3>
    <textarea class="wz-notes" id="wzNotes" placeholder="Uma nota por linha">${esc(draft.notes || "")}</textarea></section>`;

  html += `<div class="wz-opts" id="wzOpts" style="display:contents">${optionsHtml()}</div>`;

  return html;
}

function bindOptions(){
  document.querySelectorAll("#wzOpts .wz-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      draft.activate = btn.dataset.activate === "1";
      renderOptionsAndFooter();
    });
  });
}

function renderOptionsAndFooter(){
  document.getElementById("wzOpts").innerHTML = optionsHtml();
  bindOptions();
  const $finish = document.getElementById("wzFinish");
  if($finish) $finish.textContent = draft.activate ? "Criar e ativar" : "Salvar plano";
}

function bindStep3(){
  const $name = document.getElementById("wzName");
  $name.addEventListener("input", () => { draft.name = $name.value; });

  const $notes = document.getElementById("wzNotes");
  $notes.addEventListener("input", () => { draft.notes = $notes.value; });

  bindOptions();
}

async function finish(){
  const $finish = document.getElementById("wzFinish");
  const $back = document.getElementById("wzBack");
  $finish.disabled = true; $back.disabled = true; $finish.textContent = "Salvando…";
  saving = true;
  try{
    const plan = draftToPlan(draft, { muscleLabels: MUSCLE_LABEL });
    const id = await savePlanDoc(null, { ...plan });
    state.plansCache.set(id, plan);
    if(draft.activate){
      await applyPlan(plan, id, scheduleToMapping(scheduleFromPlan(plan)));
    }
    const activated = draft.activate;
    saving = false;
    closePlanWizard(true);
    state.exSubTab = activated ? "home" : "plans";
    window._renderExercicios();
    window.scrollTo(0, 0);
    showInfoToast(activated ? `Plano "${plan.name}" ativado` : "Plano salvo em Meus planos");
  }catch(e){
    console.warn("wizard finish:", e.message);
    saving = false;
    $finish.disabled = false; $back.disabled = false;
    $finish.textContent = draft.activate ? "Criar e ativar" : "Salvar plano";
    showInfoToast("Não foi possível salvar o plano");
  }
}

function footHtml(err){
  if(step === 1) return `<button class="xp-confirm" id="wzNext" type="button">Próximo</button>`;
  if(step === 2) return `<p class="wz-err" id="wzErr" ${err ? "" : "hidden"}>${esc(err || "")}</p>
    <div class="wz-two"><button class="wz-back" id="wzBack" type="button">Voltar</button><button class="xp-confirm" id="wzNext" type="button" ${err ? "disabled" : ""}>Próximo</button></div>`;
  return `<div class="wz-two"><button class="wz-back" id="wzBack" type="button">Voltar</button><button class="xp-confirm" id="wzFinish" type="button">${draft.activate ? "Criar e ativar" : "Salvar plano"}</button></div>`;
}

function render(){
  // Defensive guard — the step-2 "Próximo" is already disabled while invalid,
  // but this keeps step 3 from ever rendering against a draft that can't be saved.
  if(step === 3 && validateDraft(draft, { requireExercises: true })) step = 2;

  const w = draft.workouts[activeIdx];
  let err = null;
  if(step === 1) err = validateDraft(draft);
  else if(step === 2) err = validateDraft(draft, { requireExercises: true });

  let body;
  if(step === 1) body = step1Body(err);
  else if(step === 2) body = step2Body(w);
  else body = step3Body();

  const steps = Array.from({ length: 3 }, (_, i) => `<i class="${i < step ? "on" : ""}"></i>`).join("");

  $planWizard.innerHTML = `
    <div class="xp-top wz-top">
      <div class="xp-bar"><button class="xp-x" id="wzClose" type="button" aria-label="Fechar">✕</button><span class="xp-title">Criar plano</span></div>
      <div class="wz-steps">${steps}</div>
      <div class="wz-stepname"><b>${esc(STEP_NAMES[step - 1])}</b><span>${step} de 3</span></div>
    </div>
    <div class="wz-body" id="wzBody">${body}</div>
    <div class="xp-foot wz-foot" id="wzFoot">${footHtml(err)}</div>`;

  document.getElementById("wzClose").addEventListener("click", requestClose);

  if(step === 1){
    bindStep1();
    const $next = document.getElementById("wzNext");
    $next.disabled = !!err;
    $next.addEventListener("click", () => { step = 2; activeIdx = 0; openStepperIdx = null; render(); });
  } else if(step === 2){
    bindStep2(w);
    document.getElementById("wzBack").addEventListener("click", () => { step = 1; render(); });
    document.getElementById("wzNext").addEventListener("click", () => { step = 3; render(); });
  } else {
    bindStep3();
    document.getElementById("wzBack").addEventListener("click", () => { step = 2; render(); });
    document.getElementById("wzFinish").addEventListener("click", finish);
  }
}
