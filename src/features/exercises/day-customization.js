import { serverTimestamp } from "firebase/firestore";
import { esc } from "../../domain/text.js";
import { state } from "../../core/state.js";
import * as repo from "../../core/repo.js";
import { $dayCustomSection, $dayEditModal, $dayEditModalBody } from "../../core/dom.js";
import { renderDay, renderStrip } from "../day/render.js";
import { rebuildUserDays } from "./crud.js";

export const DAY_DEFAULTS = [
  {tag:"Ombro · Costas", focus:"Ombro lateral/posterior · Costas"},
  {tag:"Posterior", focus:"Ombro frontal · Posterior de coxa · Glúteo"},
  {tag:"Peito", focus:"Peito · Ombro"},
  {tag:"Braços", focus:"Posterior de ombro · Tríceps · Bíceps"},
  {tag:"Pernas", focus:"Quadríceps · Adutor"},
  {tag:"Livre", focus:"Livre"},
  {tag:"Livre", focus:"Livre"},
];

export async function loadDayCustomizations(){
  if(!state.user) return;
  state.dayCustomizations = {};
  try {
    const docs = await repo.fetchDayCustomizations(state.user.uid);
    docs.forEach(({id, data}) => { state.dayCustomizations[id] = data; });
  } catch(e){ console.warn("loadDayCustomizations:", e.message); }
}

export async function saveDayCustomization(dayKey, tag, focus){
  if(!state.user) return;
  const data = { tag, focus, updatedAt: serverTimestamp() };
  await repo.putDayCustomization(state.user.uid, dayKey, data);
  state.dayCustomizations[dayKey] = { tag, focus };
}

export async function deleteDayCustomization(dayKey){
  if(!state.user) return;
  await repo.deleteDayCustomization(state.user.uid, dayKey);
  delete state.dayCustomizations[dayKey];
}

export function renderDayCustomSection(){
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

export function openDayEditSheet(dk, dayName){
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
