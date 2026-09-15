import { esc } from "../../domain/text.js";
import { equipmentOf } from "../../domain/equipment.js";
import { pickerResults } from "../../domain/exercise-picker.js";
import { MUSCLE_ORDER, MUSCLE_LABEL } from "../../data/labels.js";
import { EXERCISE_CATALOG } from "../../data/exercise-catalog.js";
import { state } from "../../core/state.js";
import { $exPicker } from "../../core/dom.js";
import { lockBodyScroll, unlockBodyScroll } from "../../core/ui/modal.js";
import { openExEditor } from "../exercises/editor.js";

// Module-local state, reset by every openExercisePicker() call.
let query = "";
let filter = "all";
let selected = new Map(); // key -> item, insertion order = pick order
let opts = null;

function escHandler(e){ if(e.key === "Escape") closeExercisePicker(); }

export function closeExercisePicker(){
  $exPicker.hidden = true;
  unlockBodyScroll();
  document.removeEventListener("keydown", escHandler);
}

export function openExercisePicker(o){
  opts = o;
  query = "";
  filter = (opts.focus && opts.focus.length) ? "focus" : "all";
  selected = new Map();

  $exPicker.hidden = false;
  lockBodyScroll();
  document.addEventListener("keydown", escHandler);
  render();
}

function currentMuscles(){
  if(filter === "focus") return opts.focus || [];
  if(filter === "all") return [];
  return [filter];
}

function computeGroups(){
  return pickerResults(EXERCISE_CATALOG, state.exercisesCatalog, opts.inWorkoutNames || [], {
    query, muscles: currentMuscles(), muscleOrder: MUSCLE_ORDER, muscleLabels: MUSCLE_LABEL,
  });
}

function metaFor(item){
  if(item.inWorkout) return "Já está no treino";
  const eqRaw = equipmentOf(item.name);
  const eq = eqRaw === "barra" ? "barra" : eqRaw === "halter" ? "halteres" : "";
  const typeLabel = item.type === "comp" ? "Composto" : "Isolado";
  return eq ? `${typeLabel} · ${eq}` : typeLabel;
}

function rowHtml(item){
  const cls = [selected.has(item.key) ? "on" : "", item.inWorkout ? "has" : ""].filter(Boolean).join(" ");
  return `<button class="xp-row ${cls}" data-key="${esc(item.key)}" type="button" ${item.inWorkout ? "disabled" : ""}>
    <span class="xp-cb"></span>
    <span class="xp-row-b"><b>${esc(item.name)}</b><span>${esc(metaFor(item))}</span></span>
  </button>`;
}

function groupsHtml(groups){
  if(!groups.length) return `<p class="xp-empty">Nenhum exercício encontrado.</p>`;
  return groups.map(g =>
    `<div class="xp-ghead">${esc(MUSCLE_LABEL[g.muscle] || g.muscle)}</div><div class="xp-group">${g.items.map(rowHtml).join("")}</div>`
  ).join("");
}

function chipsHtml(){
  let html = "";
  if(opts.focus && opts.focus.length){
    html += `<button class="xp-chip ${filter==="focus"?"on":""}" data-f="focus" type="button">Foco do treino</button>`;
  }
  html += `<button class="xp-chip ${filter==="all"?"on":""}" data-f="all" type="button">Todos</button>`;
  MUSCLE_ORDER.forEach(m => {
    html += `<button class="xp-chip ${filter===m?"on":""}" data-f="${m}" type="button">${esc(MUSCLE_LABEL[m] || m)}</button>`;
  });
  return html;
}

function confirmLabel(){
  return opts.mode === "single" ? "Trocar" : `Adicionar (${selected.size})`;
}

function updateConfirmButton(){
  const btn = document.getElementById("xpConfirm");
  if(!btn) return;
  btn.disabled = selected.size === 0;
  btn.textContent = confirmLabel();
}

function bindListRows(groups){
  const itemsByKey = new Map(groups.flatMap(g => g.items).map(it => [it.key, it]));
  document.querySelectorAll("#xpList .xp-row").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = itemsByKey.get(btn.dataset.key);
      if(!item) return;
      if(opts.mode === "single"){
        selected = new Map([[item.key, item]]);
        document.querySelectorAll("#xpList .xp-row").forEach(r => r.classList.toggle("on", r.dataset.key === item.key));
      }else{
        if(selected.has(item.key)) selected.delete(item.key);
        else selected.set(item.key, item);
        btn.classList.toggle("on", selected.has(item.key));
      }
      updateConfirmButton();
    });
  });
}

function renderList(){
  const groups = computeGroups();
  document.getElementById("xpList").innerHTML = groupsHtml(groups);
  bindListRows(groups);
  updateConfirmButton();
}

function bindChips(){
  document.querySelectorAll("#xpChips .xp-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      filter = chip.dataset.f;
      document.getElementById("xpChips").innerHTML = chipsHtml();
      bindChips();
      renderList();
    });
  });
}

function render(){
  $exPicker.innerHTML = `
    <div class="xp-top">
      <div class="xp-bar"><button class="xp-x" id="xpClose" type="button" aria-label="Fechar">✕</button><span class="xp-title">${esc(opts.title)}</span></div>
      <input class="xp-search" id="xpSearch" type="search" placeholder="Buscar exercício ou músculo…" autocomplete="off" value="${esc(query)}">
      <div class="xp-chips" id="xpChips">${chipsHtml()}</div>
    </div>
    <div class="xp-list" id="xpList"></div>
    <div class="xp-foot">
      <button class="xp-confirm" id="xpConfirm" type="button" disabled>${confirmLabel()}</button>
      <button class="xp-create" id="xpCreate" type="button">Não achou? <b>Criar exercício</b></button>
    </div>`;

  document.getElementById("xpClose").addEventListener("click", closeExercisePicker);
  const $search = document.getElementById("xpSearch");
  $search.addEventListener("input", () => {
    query = $search.value;
    renderList();
  });
  bindChips();
  document.getElementById("xpConfirm").addEventListener("click", () => {
    if(selected.size === 0) return;
    const picks = [...selected.values()].map(({ name, muscle, userId }) => ({ name, muscle, userId }));
    const onConfirm = opts.onConfirm;
    closeExercisePicker();
    onConfirm(picks);
  });
  document.getElementById("xpCreate").addEventListener("click", () => {
    const onConfirm = opts.onConfirm;
    const muscle = (opts.focus && opts.focus[0]) || "peito";
    openExEditor(null, {
      hideDaysActive: true,
      ex: { name: query.trim(), muscle, reps: [10,10,10], badges: [], grip: null, note: null, superset: null },
      onSave: data => {
        closeExercisePicker();
        onConfirm([{ name: data.name, muscle: data.muscle, userId: null, doc: data }]);
      },
    });
  });

  renderList();
}
