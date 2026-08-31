import { esc, stripDiacritics } from "../../domain/text.js";
import { WEEKDAYS } from "../../data/days.js";
import { MUSCLE_ORDER, MUSCLE_LABEL, GRIP_LABEL } from "../../data/labels.js";
import { EXERCISE_CATALOG } from "../../data/exercise-catalog.js";
import { state } from "../../core/state.js";
import { $planBuilderModal, $planBuilderModalInner } from "../../core/dom.js";
import { openExEditor } from "../exercises/editor.js";
import { savePlanDoc, renderPlansSection } from "./index.js";
import { applyPlan } from "./apply-modal.js";

const STEP_LABELS = ["Dias", "Foco", "Exercícios"];
const DAY_TYPE_LETTERS = ["A","B","C","D","E","F","G"];

// Ephemeral wizard draft — reset every time the builder opens, never persisted.
// Shape: { name, days:[{ weekday, focus:[muscleKey], label, exercises:[] }] }
let draft = { name: "", days: [] };
let step = 1;
// Which draft.days[] entry Step 3 is currently configuring. Reset to 0 each time
// Step 3 is entered fresh from Step 2 (not when paging back/forth within it).
let currentDayIdx = 0;
// Step 3's search query. Reset on entering Step 3 and on every day change, but
// NOT when adding/removing/editing an exercise — the whole point is that
// picking a result keeps the query + filtered list so a run of similar
// exercises (e.g. "supino" variants) can be added without retyping.
let pbSearch = "";

function closePlanBuilder(){
  $planBuilderModal.classList.remove("open");
}

function goToStep(n){
  step = n;
  renderStep();
}

function stepIndicatorHTML(){
  let dots = "";
  STEP_LABELS.forEach((_, i) => {
    const n = i + 1;
    if(i > 0) dots += `<span class="wiz-step-line ${step > n - 1 ? 'done' : ''}"></span>`;
    const dotCls = step === n ? 'active' : (step > n ? 'done' : '');
    dots += `<span class="wiz-step-dot ${dotCls}">${step > n ? '✓' : n}</span>`;
  });
  return `<div class="wiz-steps">${dots}</div>
    <div class="wiz-step-title">Passo ${step} de ${STEP_LABELS.length} — ${STEP_LABELS[step-1]}</div>`;
}

function renderShell(){
  let html = `<h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0 0 14px">Montar treino</h3>`;
  html += stepIndicatorHTML();
  html += `<div id="pbBody"></div>`;
  html += `<div class="modal-footer" id="pbFooter"></div>`;
  $planBuilderModalInner.innerHTML = html;
}

function renderStep1(){
  // Transient selection, seeded from the draft (so navigating back from Step 2
  // shows what was already chosen). Only merged into draft.days on Próximo.
  const selected = new Set(draft.days.map(d => d.weekday));

  let html = `<div class="modal-field">
    <label>Nome do plano</label>
    <input type="text" class="modal-input" id="pbName" placeholder="Ex: Push Pull Legs" value="${esc(draft.name)}">
  </div>`;
  html += `<div class="modal-field">
    <label>Dias de treino</label>
    <div class="day-chips" id="pbDayChips">
      ${WEEKDAYS.map((d,i) => `<span class="day-chip ${selected.has(i)?'selected':''}" data-day="${i}">${d.abbr}</span>`).join("")}
    </div>
  </div>`;

  const $body = document.getElementById("pbBody");
  $body.innerHTML = html;

  document.getElementById("pbFooter").innerHTML = `
    <button class="modal-btn secondary" id="pbCancel">Cancelar</button>
    <button class="modal-btn primary" id="pbNext1">Próximo</button>
  `;

  const $nameInput = document.getElementById("pbName");
  const $next = document.getElementById("pbNext1");

  function updateNextState(){
    $next.disabled = !($nameInput.value.trim().length > 0 && selected.size > 0);
  }
  updateNextState();

  $nameInput.addEventListener("input", updateNextState);

  $body.querySelectorAll("#pbDayChips .day-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const day = +chip.dataset.day;
      if(selected.has(day)) selected.delete(day); else selected.add(day);
      chip.classList.toggle("selected", selected.has(day));
      updateNextState();
    });
  });

  document.getElementById("pbCancel").addEventListener("click", closePlanBuilder);

  $next.addEventListener("click", () => {
    draft.name = $nameInput.value.trim();
    // Rebuild draft.days from the selected weekdays, preserving focus/label/
    // exercises already set for any weekday that stays selected.
    const prevByWeekday = new Map(draft.days.map(d => [d.weekday, d]));
    draft.days = [...selected].sort((a,b) => a - b).map(weekday =>
      prevByWeekday.get(weekday) || { weekday, focus: [], label: "", exercises: [] }
    );
    goToStep(2);
  });
}

function dayFocusLabel(day){
  return day.focus.map(k => MUSCLE_LABEL[k]).join(" · ");
}

function renderStep2(){
  let html = `<div class="pb-week-grid">`;
  draft.days.forEach((day, di) => {
    html += `<div class="pb-day-col">`;
    html += `<div class="sub-section-label">${esc(WEEKDAYS[day.weekday].name)}</div>`;
    html += `<div class="day-chips" data-di="${di}">
      ${MUSCLE_ORDER.map(k => `<span class="day-chip ${day.focus.includes(k)?'selected':''}" data-muscle="${k}">${esc(MUSCLE_LABEL[k])}</span>`).join("")}
    </div>`;
    html += `<p id="pbLabel${di}" style="font-size:12px;color:var(--muted);margin:6px 0 0">${esc(dayFocusLabel(day))}</p>`;
    html += `</div>`;
  });
  html += `</div>`;

  document.getElementById("pbBody").innerHTML = html;

  document.getElementById("pbFooter").innerHTML = `
    <button class="modal-btn secondary" id="pbBack2">Voltar</button>
    <button class="modal-btn primary" id="pbNext2">Próximo</button>
  `;

  document.querySelectorAll("#pbBody .day-chips[data-di]").forEach(group => {
    const di = +group.dataset.di;
    group.querySelectorAll(".day-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const k = chip.dataset.muscle;
        const day = draft.days[di];
        const idx = day.focus.indexOf(k);
        if(idx === -1) day.focus.push(k); else day.focus.splice(idx, 1);
        day.label = dayFocusLabel(day);
        chip.classList.toggle("selected", day.focus.includes(k));
        document.getElementById(`pbLabel${di}`).textContent = day.label;
      });
    });
  });

  document.getElementById("pbBack2").addEventListener("click", () => goToStep(1));
  document.getElementById("pbNext2").addEventListener("click", () => {
    currentDayIdx = 0;
    pbSearch = "";
    goToStep(3);
  });
}

// Common-exercise candidates for a day: catalog entries matching any of its
// focus muscles AND (if given) a search query, compounds first, excluding
// names already added to the day. Empty query = focus-only filtering. The
// query matches the exercise name OR its muscle label — catalog names rarely
// spell out the muscle (e.g. "Rosca direta com barra"), so searching the
// muscle itself ("bíceps") needs the label match to find anything.
function catalogForDay(day, query = ""){
  const already = new Set(day.exercises.map(e => e.name));
  const nq = stripDiacritics(query.trim());
  return EXERCISE_CATALOG
    .filter(c => day.focus.includes(c.muscle) && !already.has(c.name) && (
      !nq || stripDiacritics(c.name).includes(nq) || stripDiacritics(MUSCLE_LABEL[c.muscle]||"").includes(nq)
    ))
    .slice()
    .sort((a, b) => {
      if(a.type !== b.type) return a.type === "comp" ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
}

function openDayExEditor(di, ei){
  const day = draft.days[di];
  openExEditor(null, {
    ex: day.exercises[ei],
    hideDaysActive: true,
    onSave: (data) => { day.exercises[ei] = data; refreshDay(); },
  });
}

function openDayExAdder(di){
  const day = draft.days[di];
  openExEditor(null, {
    ex: { name:"", muscle: day.focus[0] || "peito", reps:[10,10,10], badges:[], grip:null, note:null, superset:null },
    hideDaysActive: true,
    onSave: (data) => { day.exercises.push(data); refreshDay(); },
  });
}

function exerciseRowsHTML(day, di){
  return day.exercises.map((e, ei) => {
    const badgeCount = (e.badges||[]).length;
    const repsSummary = (e.reps||[]).length ? `${e.reps.length}×${e.reps[0]}` : '';
    return `<div class="ex-list-item plan-ex-item" data-di="${di}" data-ei="${ei}">
      <div class="ex-list-body">
        <div class="ex-list-name">${esc(e.name)}</div>
        <div class="ex-list-meta">
          ${repsSummary ? `<span class="ex-tag">${repsSummary}</span>` : ''}
          ${badgeCount ? `<span class="ex-tag accent">${badgeCount} badge${badgeCount>1?'s':''}</span>` : ''}
          ${e.grip ? `<span class="ex-tag">${esc(GRIP_LABEL[e.grip])}</span>` : ''}
          ${e.note ? '<span class="ex-tag">nota</span>' : ''}
          ${e.superset ? '<span class="ex-tag accent">⇄ supersérie</span>' : ''}
        </div>
      </div>
      <div class="ex-list-actions">
        <button class="ex-icon-btn pb-ex-edit" data-di="${di}" data-ei="${ei}" title="Editar">✎</button>
        <button class="ex-icon-btn pb-ex-remove" data-di="${di}" data-ei="${ei}" title="Remover">✕</button>
      </div>
    </div>`;
  }).join("");
}

function exResultsHTML(day, query = ""){
  const candidates = catalogForDay(day, query);
  if(!candidates.length){
    return `<p style="font-size:12px;color:var(--muted);margin:10px 0 0">Nenhum exercício encontrado.</p>`;
  }
  return `<div class="sub-chips">
    ${candidates.map(c => `<button type="button" class="sub-chip" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}</button>`).join("")}
  </div>`;
}

// Rebuilds the footer for Step 3's current day — split out of renderStep3 so
// refreshDay() (below) can recompute the Concluir/hint state after a surgical
// add/remove/edit without doing a full step re-render.
function renderFooter(){
  const isLast = currentDayIdx === draft.days.length - 1;
  const complete = draft.days.every(d => d.exercises.length > 0);

  let footerHTML = (isLast && !complete)
    ? `<p style="flex:1 0 100%;margin:0 0 2px;font-size:12px;color:var(--muted)">Adicione ao menos 1 exercício em cada dia para concluir.</p>`
    : '';
  footerHTML += `<button class="modal-btn secondary" id="pbBack3">Voltar</button>`;
  footerHTML += isLast
    ? `<button class="modal-btn primary" id="pbFinish" ${complete ? '' : 'disabled'}>Concluir</button>`
    : `<button class="modal-btn primary" id="pbNextDay">Próximo dia</button>`;
  document.getElementById("pbFooter").innerHTML = footerHTML;

  document.getElementById("pbBack3").addEventListener("click", () => {
    if(currentDayIdx > 0){ currentDayIdx--; pbSearch = ""; renderStep3(); }
    else goToStep(2);
  });

  if(isLast){
    document.getElementById("pbFinish").addEventListener("click", finishBuilder);
  } else {
    document.getElementById("pbNextDay").addEventListener("click", () => { currentDayIdx++; pbSearch = ""; renderStep3(); });
  }
}

// Surgical update after add/remove/edit — updates the count badge, the added-
// exercises list, and the search results (using the CURRENT pbSearch), plus
// the footer's Concluir/hint state. Deliberately never touches #pbExSearch,
// so its value and focus survive (the whole point of this helper: picking a
// result shouldn't clear the query or force a retype for the next one).
function refreshDay(){
  const day = draft.days[currentDayIdx];

  const $count = document.getElementById("pbExCount");
  if($count){
    $count.textContent = `${day.exercises.length} exercício${day.exercises.length===1?'':'s'}`;
    $count.classList.toggle("accent", day.exercises.length > 0);
  }

  const $added = document.getElementById("pbAddedList");
  if($added) $added.innerHTML = exerciseRowsHTML(day, currentDayIdx);

  const $results = document.getElementById("pbExResults");
  if($results) $results.innerHTML = exResultsHTML(day, pbSearch);

  renderFooter();
}

// Step 3 configures one draft day at a time (currentDayIdx), search-driven —
// see catalogForDay/exResultsHTML above.
function renderStep3(){
  const di = currentDayIdx;
  const day = draft.days[di];

  let html = `<div class="plan-day-type">`;
  html += `<div class="plan-day-type-header">
    <span class="plan-day-type-letter">${DAY_TYPE_LETTERS[di] || (di+1)}</span>
    <div style="flex:1;min-width:0">
      <div style="font-family:var(--display);font-weight:600;font-size:14px">Dia ${di+1} de ${draft.days.length} — ${esc(WEEKDAYS[day.weekday].name)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(day.label) || "Sem foco definido"}</div>
    </div>
    <span class="ex-tag ${day.exercises.length ? 'accent' : ''}" id="pbExCount">${day.exercises.length} exercício${day.exercises.length===1?'':'s'}</span>
  </div>`;

  html += `<div id="pbAddedList">${exerciseRowsHTML(day, di)}</div>`;

  if(!day.focus.length){
    html += `<p style="font-size:12px;color:var(--muted);margin:0 0 10px">Volte ao Passo 2 para escolher o foco deste dia e ver sugestões de exercícios.</p>`;
  } else {
    html += `<div class="modal-field">
      <input type="text" class="modal-input" id="pbExSearch" placeholder="Buscar exercício…" autocomplete="off" value="${esc(pbSearch)}">
    </div>`;
    html += `<div id="pbExResults">${exResultsHTML(day, pbSearch)}</div>`;
  }

  html += `<button class="plan-add-ex-btn" id="pbAddCustomEx">+ Outro exercício</button>`;
  html += `</div>`;

  const $body = document.getElementById("pbBody");
  $body.innerHTML = html;

  // Delegated listeners, bound once per full render — refreshDay() only ever
  // replaces #pbAddedList's/#pbExResults' innerHTML, never these containers
  // themselves, so the bindings below survive its surgical updates.
  document.getElementById("pbAddedList").addEventListener("click", e => {
    const removeBtn = e.target.closest(".pb-ex-remove");
    if(removeBtn){
      const ei = +removeBtn.closest(".plan-ex-item").dataset.ei;
      day.exercises.splice(ei, 1);
      refreshDay();
      return;
    }
    const row = e.target.closest(".plan-ex-item");
    if(row) openDayExEditor(di, +row.dataset.ei);
  });

  const $search = document.getElementById("pbExSearch");
  const $results = document.getElementById("pbExResults");
  if($results){
    $results.addEventListener("click", e => {
      const chip = e.target.closest(".sub-chip");
      if(!chip) return;
      day.exercises.push({
        name: chip.dataset.name, muscle: chip.dataset.muscle,
        reps: [10,10,10], badges: [], grip: null, note: null, superset: null,
      });
      refreshDay();
    });
  }
  if($search){
    $search.addEventListener("input", () => {
      pbSearch = $search.value;
      document.getElementById("pbExResults").innerHTML = exResultsHTML(day, pbSearch);
    });
  }

  document.getElementById("pbAddCustomEx").addEventListener("click", () => openDayExAdder(di));

  renderFooter();
}

async function finishBuilder(){
  const $back = document.getElementById("pbBack3");
  const $finish = document.getElementById("pbFinish");
  $back.disabled = true;
  $finish.disabled = true;
  $finish.classList.add("loading");
  $finish.innerHTML = '<span class="spinner"></span>Salvando…';

  try{
    const plan = {
      name: draft.name,
      source: "custom",
      days: draft.days.map((d, i) => ({
        type: DAY_TYPE_LETTERS[i] || String(i),
        label: d.label || WEEKDAYS[d.weekday].name,
        exercises: d.exercises,
      })),
    };

    const id = await savePlanDoc(null, { name: plan.name, source: "custom", days: plan.days });
    state.plansCache.set(id, { ...plan });

    const mapping = draft.days.map((d, i) => ({ dayTypeIdx: i, weekday: d.weekday }));
    await applyPlan(plan, id, mapping);

    closePlanBuilder();
    draft = { name: "", days: [] };
    step = 1;
    renderPlansSection();
  }catch(e){
    $back.disabled = false;
    $finish.disabled = false;
    $finish.classList.remove("loading");
    $finish.textContent = "Concluir";
    alert("Erro: " + e.message);
  }
}

function renderStep(){
  renderShell();
  if(step === 1) renderStep1();
  else if(step === 2) renderStep2();
  else renderStep3();
}

export function openPlanBuilder(){
  draft = { name: "", days: [] };
  step = 1;
  currentDayIdx = 0;
  pbSearch = "";
  $planBuilderModal.classList.add("open");
  renderStep();
}

export function initPlanBuilder(){
  $planBuilderModal.addEventListener("click", e => {
    if(e.target === $planBuilderModal) closePlanBuilder();
  });
}
