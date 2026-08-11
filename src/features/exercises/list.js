import { stripDiacritics, esc } from "../../domain/text.js";
import { orderForDay, cmpExOrder } from "../../domain/order.js";
import { MUSCLE_LABEL } from "../../data/labels.js";
import { DAY_NAMES_SHORT } from "../../data/days.js";
import { state } from "../../core/state.js";
import { $exFilterBar, $exList } from "../../core/dom.js";
import { saveExerciseDoc, rebuildUserDays } from "./crud.js";
import { renderDayCustomSection } from "./day-customization.js";
import { initDragAndDrop } from "./dnd.js";
import { openExEditor } from "./editor.js";
import { renderPlansSection } from "../plans/index.js";
import { openOnboarding } from "../onboarding.js";

export function renderExercicios(){
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
// exercises-view code — shell.js isn't touched in this phase, so the window hook
// mechanism from 0.d-3a/3b stays.
window._renderExercicios = renderExercicios;

export function renderExFilterBar(){
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

export function renderExItemHtml(ex, canDrag){
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

export function renderExList(){
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
    if(state.exercisesCatalog.size === 0){
      $exList.innerHTML = `<div class="evo-empty">
        <span class="big">Nenhum programa</span>
        Aplique um programa pronto para começar a treinar.
        <button class="modal-btn primary" id="exApplyPlanBtn" style="margin-top:14px">Aplicar um programa</button>
      </div>`;
      document.getElementById("exApplyPlanBtn").addEventListener("click", openOnboarding);
    } else {
      $exList.innerHTML = `<div class="evo-empty"><span class="big">Nenhum resultado para este filtro</span></div>`;
    }
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

export function init(){
  document.getElementById("exSubTabs").addEventListener("click", e => {
    const b = e.target.closest("[data-subtab]"); if(!b) return;
    state.exSubTab = b.dataset.subtab; renderExercicios();
  });
}
