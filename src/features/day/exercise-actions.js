import { esc } from "../../domain/text.js";
import { UNIT_CYCLE, UNIT_BTN } from "../../domain/units.js";
import { convertSetWeights } from "../../domain/session.js";
import { parseRest, formatRest, effectiveRestSec } from "../../domain/rest-timer.js";
import { startRest } from "../train/rest-timer.js";
import { state } from "../../core/state.js";
import { $exActionsModal, $exActionsModalInner } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { openMachineModal } from "./machine-modal.js";
import { openSubModal } from "./substitution-modal.js";
import { openEvolucaoFor } from "../evolution.js";
import { renderDay, unitFor, ICON_TREND } from "./render.js";
import { scheduleSave } from "./session-io.js";

export function closeExActions(){ $exActionsModal.classList.remove("open"); }

export async function setUnit(exIdx, isSup, next){
  const e = activeDays()[state.current].ex[exIdx];
  const id = e._id;
  const exDoc = state.exercisesCatalog.get(id);
  if(!exDoc) return;
  if(isSup){ exDoc.superset.unit = next; await window._saveExerciseDoc(id, {superset:{unit:next}}); }
  else     { exDoc.unit = next;          await window._saveExerciseDoc(id, {unit:next}); }
  const sess = state.session && state.session.exercises[exIdx];
  if(sess){
    // The weights already logged today were entered in the OUTGOING unit. Re-express them
    // so the stored number and its stamp keep agreeing. Stamping alone would turn 110 lb
    // into 110 kg in Firestore.
    const prev = unitFor(sess, e, isSup);
    if(prev !== next){
      if(isSup) sess.sup = convertSetWeights(sess.sup, prev, next);
      else      sess.main = convertSetWeights(sess.main, prev, next);
    }
    if(isSup) sess.supUnit = next; else sess.unit = next;
    // Saving this entry is what makes the choice remembered for its machine — lastUnitFor
    // derives from exactly this stamp. No separate per-machine structure is written.
    scheduleSave();
  }
  window._rebuildUserDays(); renderDay();
}

// `next` is seconds, or null to clear the override back to the global default.
export async function setRest(exIdx, next){
  const e = activeDays()[state.current].ex[exIdx];
  const exDoc = state.exercisesCatalog.get(e._id);
  if(!exDoc) return;
  exDoc.restSec = next;
  await window._saveExerciseDoc(e._id, { restSec: next });
  window._rebuildUserDays();
}

export function openExActions(exIdx, isSup){
  const e = activeDays()[state.current].ex[exIdx];
  const ex = state.session.exercises[exIdx];
  const name = isSup ? (ex.supSubName || e.superset.name) : (ex.subName || e.name);
  const machine = isSup ? ex.supMachine : ex.machine;
  const unit = unitFor(ex, e, isSup);

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

  if(!isSup){
    const restSec = effectiveRestSec(e, state.restDefaultSec);
    const overridden = typeof e.restSec === "number" && isFinite(e.restSec);
    html += `<div class="sheet-item" data-act="rest">
      <span class="sheet-ico">⏱</span>
      <span class="sheet-txt"><span class="si-t">Descanso</span><span class="si-s">${overridden ? "Só para este exercício" : "Usando o padrão dos Ajustes"}</span></span>
      <input class="modal-input rest-input" id="exRestInput" type="text" inputmode="numeric" maxlength="5"
             value="${overridden ? formatRest(e.restSec) : ""}" placeholder="${formatRest(restSec)}"
             aria-label="Tempo de descanso deste exercício (MM:SS)">
    </div>`;
    if(restSec > 0){
      html += `<button class="sheet-item" data-act="restStart">
        <span class="sheet-ico">▶</span>
        <span class="sheet-txt"><span class="si-t">Iniciar descanso</span><span class="si-s">Começa a contagem agora</span></span>
        <span class="sheet-val">${formatRest(restSec)}</span>
      </button>`;
    }
  }

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
  const restInp = document.getElementById("exRestInput");
  if(restInp) restInp.addEventListener("change", async () => {
    const raw = restInp.value.trim();
    if(raw === ""){ await setRest(exIdx, null); return; }   // back to inheriting
    const sec = parseRest(raw);
    if(sec == null){ restInp.value = ""; return; }
    await setRest(exIdx, sec);
  });
  const restStartBtn = $exActionsModalInner.querySelector('[data-act="restStart"]');
  if(restStartBtn) restStartBtn.addEventListener("click", () => {
    startRest(effectiveRestSec(e, state.restDefaultSec));
    closeExActions();
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
