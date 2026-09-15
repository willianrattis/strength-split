import { serverTimestamp } from "firebase/firestore";
import { esc } from "../../domain/text.js";
import { scheduleFromPlan, scheduleToMapping, validateSchedule, applyScheduleToPlan } from "../../domain/plan-schedule.js";
import { state } from "../../core/state.js";
import * as repo from "../../core/repo.js";
import { $applyPlanModal, $applyPlanModalInner } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { savePref } from "../prefs.js";
import { renderDay, renderStrip } from "../day/render.js";
import { loadDay } from "../day/session-io.js";
import { rebuildUserDays, deleteExerciseDoc } from "../exercises/crud.js";
import { saveDayCustomization } from "../exercises/day-customization.js";
import { savePlanDoc, renderPlansSection } from "./index.js";

export function openApplyPlanModal(plan, planDocId, opts = {}){
  const { onApplied = () => {}, onCancel = () => {} } = opts;
  const dayTypes = plan.days || [];
  const weekdays = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  const schedule = scheduleFromPlan(plan);

  let html = `<h3>Aplicar plano</h3>`;
  html += `<p style="color:var(--muted);font-size:13px;margin-bottom:16px">${esc(plan.name)}</p>`;
  if(opts.note) html += `<p class="day-map-note">${esc(opts.note)}</p>`;
  html += `<p style="color:var(--muted);font-size:12px;margin-bottom:14px">Escolha o treino de cada dia. Um treino pode repetir na semana.</p>`;

  dayTypes.forEach(d => {
    const exNames = d.exercises.map(e => e.superset
      ? `${esc(e.name)} + ${esc(e.superset.name)}`
      : esc(e.name)
    );
    html += `<div class="day-map-item">
      <div class="day-map-row"><span class="day-map-type">${esc(d.type)}</span><span class="day-map-label">${esc(d.label)} · ${d.exercises.length} exercícios</span></div>
      <div class="day-map-exlist">
        ${exNames.map(n => `<span class="day-map-ex">${n}</span>`).join("")}
      </div>
    </div>`;
  });

  html += `<div class="day-map-section">Agenda</div>`;
  weekdays.forEach((w, wd) => {
    html += `<div class="day-map-row">
      <span class="day-map-wd">${w}</span>
      <select class="day-map-select" data-wd="${wd}">
        <option value="">Descanso</option>
        ${dayTypes.map((d, i) => `<option value="${i}" ${schedule[wd]===i?'selected':''}>${esc(d.type)} · ${esc(d.label)}</option>`).join("")}
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

  let settled = false;
  const closeApply = () => $applyPlanModal.classList.remove("open");
  const cancelApply = () => { if(settled) return; settled = true; closeApply(); onCancel(); };
  document.getElementById("applyCancel").addEventListener("click", cancelApply);
  $applyPlanModal.addEventListener("click", e => { if(e.target === $applyPlanModal) cancelApply(); });

  document.getElementById("applyConfirm").addEventListener("click", async () => {
    const errEl = document.getElementById("applyError");
    errEl.style.display = "none";

    const types = dayTypes.map(d => d.type);
    const chosen = [...$applyPlanModalInner.querySelectorAll(".day-map-select")]
      .reduce((s, sel) => { s[+sel.dataset.wd] = sel.value === "" ? null : +sel.value; return s; }, new Array(7).fill(null));
    const err = validateSchedule(chosen, types);
    if(err){ errEl.textContent = err; errEl.style.display = ""; return; }
    const mapping = scheduleToMapping(chosen);

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
      if(planDocId){
        savePlanDoc(planDocId, { days: applyScheduleToPlan(plan, chosen).days })
          .then(id => { const p = state.plansCache.get(planDocId); if(p) p.days = applyScheduleToPlan(p, chosen).days; })
          .catch(e => console.warn("save schedule:", e.message));
      }
      settled = true;
      closeApply();
      onApplied();
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

function toPlanExercise(e){
  return {
    name: e.name, muscle: e.muscle,
    reps: [...(e.reps||[])],
    badges: [...(e.badges||[])],
    grip: e.grip || null,
    note: e.note || null,
    superset: e.superset ? {
      name: e.superset.name, muscle: e.superset.muscle,
      reps: [...(e.superset.reps||[])],
      badges: [...(e.superset.badges||[])],
      grip: e.superset.grip || null,
      note: e.superset.note || null,
    } : null,
  };
}

// Maps the live day/exercise setup (activeDays()) into plan-shaped {type,label,
// exercises} day types, skipping rest days. Shared by preserveCurrentAsCustomPlan
// (below) and the "share current program" entry point in plans/index.js.
export function activeProgramAsPlan(){
  const typeLetters = ['A','B','C','D','E','F','G'];
  const days = activeDays();
  const dayTypes = [];

  if(state.program?.workouts?.length){
    state.program.workouts.forEach(w => {
      const d = days[w.weekdays[0]];
      if(!d || d.ex.length === 0) return;
      dayTypes.push({
        type: w.letter,
        label: w.label || d.tag || d.focus || d.name,
        exercises: d.ex.map(toPlanExercise),
        weekdays: [...w.weekdays],
      });
    });
  }else{
    days.forEach((d, dayIdx) => {
      if(d.ex.length === 0) return;
      dayTypes.push({
        type: typeLetters[dayTypes.length] || String(dayTypes.length),
        label: d.tag || d.focus || d.name,
        exercises: d.ex.map(toPlanExercise),
        weekdays: [dayIdx],
      });
    });
  }

  return { name: state.currentPlanName || "Meu treino", days: dayTypes };
}

export async function preserveCurrentAsCustomPlan(){
  if(!state.user || state.exercisesCatalog.size === 0) return;

  const { days: dayTypes } = activeProgramAsPlan();
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
          grip: e.grip || null,
          note: e.note || null, active: true,
          days: [weekday], orderByDay: { [weekday]: ei },
          superset: e.superset ? {
            name: e.superset.name, muscle: e.superset.muscle || e.muscle,
            reps: [...(e.superset.reps||[])],
            badges: [...(e.superset.badges||[])],
            grip: e.superset.grip || null,
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
  for(let dk = 0; dk < 7; dk++){
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
  // Force syncProgram to re-derive from the new catalog so labels come from this plan, not the previous program.
  state.program = null;
  rebuildUserDays();
  renderStrip();
  state.session = null;
  await loadDay(state.current);
  renderPlansSection();

  // Ephemeral post-apply nudge (never persisted) — set only after the renders
  // above, then one more renderDay() to actually paint the banner.
  state.showProgramReviewHint = true;
  renderDay();
}
