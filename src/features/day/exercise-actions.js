import { esc } from "../../domain/text.js";
import { UNIT_CYCLE, UNIT_BTN } from "../../domain/units.js";
import { state } from "../../core/state.js";
import { $exActionsModal, $exActionsModalInner } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { openMachineModal } from "./machine-modal.js";
import { openSubModal } from "./substitution-modal.js";
import { openEvolucaoFor } from "../evolution.js";
import { renderDay, ICON_TREND } from "./render.js";
import { scheduleSave } from "./session-io.js";

export function closeExActions(){ $exActionsModal.classList.remove("open"); }

export async function setUnit(exIdx, isSup, next){
  const id = activeDays()[state.current].ex[exIdx]._id;
  const exDoc = state.exercisesCatalog.get(id);
  if(!exDoc) return;
  if(isSup){ exDoc.superset.unit = next; await window._saveExerciseDoc(id, {superset:{unit:next}}); }
  else     { exDoc.unit = next;          await window._saveExerciseDoc(id, {unit:next}); }
  const sess = state.session && state.session.exercises[exIdx];
  if(sess){
    if(isSup) sess.supUnit = next; else sess.unit = next;
    scheduleSave();
  }
  window._rebuildUserDays(); renderDay();
}

export function openExActions(exIdx, isSup){
  const e = activeDays()[state.current].ex[exIdx];
  const ex = state.session.exercises[exIdx];
  const name = isSup ? (ex.supSubName || e.superset.name) : (ex.subName || e.name);
  const machine = isSup ? ex.supMachine : ex.machine;
  const unit = isSup ? (e.superset.unit || "kg") : (e.unit || "kg");

  let html = `<h3 style="margin:0 0 4px">${esc(name)}</h3>`;
  html += `<p class="sub-desc">Ações do exercício</p>`;

  html += `<button class="sheet-item" data-act="machine">
    <span class="sheet-ico">🏷</span>
    <span class="sheet-txt"><span class="si-t">Indicar máquina</span><span class="si-s">Registre o aparelho usado</span></span>
    ${machine ? `<span class="sheet-val">${esc(machine)}</span>` : ""}
  </button>`;

  html += `<button class="sheet-item" data-act="sub">
    <span class="sheet-ico">⇄</span>
    <span class="sheet-txt"><span class="si-t">Trocar exercício</span><span class="si-s">Substituição válida só para hoje</span></span>
  </button>`;

  html += `<div class="sheet-item" data-act="unit">
    <span class="sheet-ico">${UNIT_BTN[unit]}</span>
    <span class="sheet-txt"><span class="si-t">Unidade de peso</span><span class="si-s">Aplica a este exercício</span></span>
    <span class="sheet-seg">${UNIT_CYCLE.map(u =>
      `<button type="button" class="${u === unit ? "on" : ""}" data-unit="${u}">${UNIT_BTN[u]}</button>`
    ).join("")}</span>
  </div>`;

  html += `<button class="sheet-item" data-act="evo">
    <span class="sheet-ico">${ICON_TREND}</span>
    <span class="sheet-txt"><span class="si-t">Ver evolução</span><span class="si-s">Histórico e progresso</span></span>
  </button>`;

  $exActionsModalInner.innerHTML = html;

  $exActionsModalInner.querySelector('[data-act="machine"]').addEventListener("click", () => {
    closeExActions();
    openMachineModal(exIdx, isSup);
  });
  $exActionsModalInner.querySelector('[data-act="sub"]').addEventListener("click", () => {
    closeExActions();
    openSubModal(exIdx, isSup);
  });
  $exActionsModalInner.querySelectorAll('[data-act="unit"] .sheet-seg button').forEach(btn => {
    btn.addEventListener("click", async () => {
      await setUnit(exIdx, isSup, btn.dataset.unit);
      openExActions(exIdx, isSup);
    });
  });
  $exActionsModalInner.querySelector('[data-act="evo"]').addEventListener("click", () => {
    closeExActions();
    openEvolucaoFor(name, machine);
  });

  $exActionsModal.classList.add("open");
}

export function init(){
  $exActionsModal.addEventListener("click", e => { if(e.target === $exActionsModal) closeExActions(); });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape" && $exActionsModal.classList.contains("open")) closeExActions();
  });
}
