import { esc } from "../../domain/text.js";
import { MUSCLE_LABEL } from "../../data/labels.js";
import { $dayQuickEditModal, $dayQuickEditModalInner, $exModal } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { openDayEditSheet } from "../exercises/day-customization.js";
import { openExEditor } from "../exercises/editor.js";
import { reorderExerciseInDay } from "../exercises/dnd.js";
import { rebuildUserDays } from "../exercises/crud.js";
import { renderDay, renderStrip } from "./render.js";

function closeDayQuickEdit(){
  $dayQuickEditModal.classList.remove("open");
}

function refreshAfterMutation(dayKey){
  rebuildUserDays();
  renderQuickEditBody(dayKey);
  renderDay();
  renderStrip();
}

// $exModal (add/edit exercise) is a separate overlay opened on top of this sheet.
// Its own save/delete flow only re-renders the Exercícios tab, so watch it close
// here and refresh this sheet + the Treino view ourselves, regardless of which
// close path (save, delete, cancel, backdrop, drag-dismiss) was taken.
function watchExEditorClose(dayKey){
  const obs = new MutationObserver(() => {
    if($exModal.classList.contains("open")) return;
    obs.disconnect();
    refreshAfterMutation(dayKey);
  });
  obs.observe($exModal, { attributes: true, attributeFilter: ["class"] });
}

function renderQuickEditBody(dayKey){
  const day = activeDays()[dayKey];
  const exList = day.ex;

  let html = `<h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0 0 18px">${esc(day.name)}</h3>`;

  html += `<div class="day-row" id="qeRenameRow">
    <span class="day-row-abbr">✎</span>
    <div class="day-row-info"><div class="day-row-tag">Renomear dia</div></div>
    <span class="day-row-chevron">›</span>
  </div>`;

  html += `<div class="ex-section-header">Exercícios</div>`;
  if(!exList.length){
    html += `<div class="evo-empty" style="padding:20px 0"><span class="big">Nenhum exercício neste dia</span></div>`;
  } else {
    exList.forEach((e, i) => {
      const name = e.superset ? `${esc(e.name)} + ${esc(e.superset.name)}` : esc(e.name);
      html += `<div class="ex-list-item" data-id="${e._id}">
        <div class="ex-list-body">
          <div class="ex-list-name">${name}</div>
          <div class="ex-list-meta"><span class="ex-tag">${esc(MUSCLE_LABEL[e.muscle]||e.muscle)}</span></div>
        </div>
        <div class="ex-list-actions">
          <button class="ex-icon-btn qe-up" data-idx="${i}" ${i===0?'disabled':''} title="Mover para cima">↑</button>
          <button class="ex-icon-btn qe-down" data-idx="${i}" ${i===exList.length-1?'disabled':''} title="Mover para baixo">↓</button>
          <button class="ex-icon-btn qe-edit" data-id="${e._id}" title="Editar">✎</button>
        </div>
      </div>`;
    });
  }

  html += `<button class="ex-new-btn" id="qeAddExBtn" style="margin-top:10px">+ Adicionar exercício</button>`;

  $dayQuickEditModalInner.innerHTML = html;

  document.getElementById("qeRenameRow").addEventListener("click", () => {
    openDayEditSheet(dayKey, day.name);
  });

  document.getElementById("qeAddExBtn").addEventListener("click", () => {
    watchExEditorClose(dayKey);
    openExEditor(null, [dayKey]);
  });

  $dayQuickEditModalInner.querySelectorAll(".qe-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      watchExEditorClose(dayKey);
      openExEditor(btn.dataset.id);
    });
  });

  $dayQuickEditModalInner.querySelectorAll(".qe-up").forEach(btn => {
    btn.addEventListener("click", async () => {
      const i = +btn.dataset.idx;
      if(i <= 0) return;
      await reorderExerciseInDay(dayKey, exList[i]._id, exList[i-1]._id, true);
      refreshAfterMutation(dayKey);
    });
  });

  $dayQuickEditModalInner.querySelectorAll(".qe-down").forEach(btn => {
    btn.addEventListener("click", async () => {
      const i = +btn.dataset.idx;
      if(i >= exList.length - 1) return;
      await reorderExerciseInDay(dayKey, exList[i]._id, exList[i+1]._id, false);
      refreshAfterMutation(dayKey);
    });
  });
}

export function openDayQuickEdit(dayKey){
  renderQuickEditBody(dayKey);
  $dayQuickEditModal.classList.add("open");
}

export function init(){
  $dayQuickEditModal.addEventListener("click", e => {
    if(e.target === $dayQuickEditModal) closeDayQuickEdit();
  });
}
