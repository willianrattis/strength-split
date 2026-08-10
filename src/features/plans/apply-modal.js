import { serverTimestamp } from "firebase/firestore";
import { esc } from "../../domain/text.js";
import { state } from "../../core/state.js";
import * as repo from "../../core/repo.js";
import { $applyPlanModal, $applyPlanModalInner } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { savePref } from "../shell.js";
import { renderStrip } from "../day/render.js";
import { loadDay } from "../day/session-io.js";
import { rebuildUserDays, deleteExerciseDoc } from "../exercises/crud.js";
import { saveDayCustomization } from "../exercises/day-customization.js";
import { savePlanDoc, renderPlansSection } from "./index.js";

export function openApplyPlanModal(plan, planDocId){
  const dayTypes = plan.days || [];
  const weekdays = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  const autoMap = dayTypes.length === 5 || dayTypes.length === 7;

  let html = `<h3>Aplicar plano</h3>`;
  html += `<p style="color:var(--muted);font-size:13px;margin-bottom:16px">${esc(plan.name)}</p>`;
  html += `<p style="color:var(--muted);font-size:12px;margin-bottom:14px">Associe cada tipo de dia a um dia da semana. Dias não mapeados serão dias de descanso.</p>`;

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

export async function preserveCurrentAsCustomPlan(){
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

export async function applyPlan(plan, planDocId, mapping){
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
