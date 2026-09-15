import { serverTimestamp } from "firebase/firestore";
import { esc } from "../../domain/text.js";
import { planWeekPattern } from "../../domain/plan-schedule.js";
import { PLAN_TEMPLATES } from "../../data/plan-templates.js";
import { state } from "../../core/state.js";
import * as repo from "../../core/repo.js";
import { $plansSection, $programSheet, $programSheetInner } from "../../core/dom.js";
import { savePref } from "../prefs.js";
import { openPlanEditor } from "./editor.js";
import { openApplyPlanModal } from "./apply-modal.js";
import { sharePlan } from "./share.js";
import { openPlanWizard } from "./wizard.js";
import { showInfoToast, showUndoToast } from "../program/edit.js";

export async function loadPlans(){
  if(!state.user) return;
  state.plansCache.clear();
  try{
    const docs = await repo.fetchPlans(state.user.uid);
    docs.forEach(({id, data}) => state.plansCache.set(id, data));
  }catch(e){ console.warn("loadPlans:", e.message); }
}

export async function savePlanDoc(docId, data){
  if(!state.user) return null;
  data.updatedAt = serverTimestamp();
  if(docId){
    await repo.putPlan(state.user.uid, docId, data);
    return docId;
  } else {
    data.createdAt = serverTimestamp();
    return await repo.addPlan(state.user.uid, data);
  }
}

export async function deletePlanDoc(docId){
  if(!state.user) return;
  await repo.deletePlan(state.user.uid, docId);
}

function pluralize(n, singular, plural){ return `${n} ${n === 1 ? singular : plural}`; }

function closeProgramSheet(){ $programSheet.classList.remove("open"); }

function usePlan(plan, docId){
  const current = state.currentPlanName || (state.exercisesCatalog.size ? "Meu treino" : null);
  openApplyPlanModal(plan, docId, {
    note: current
      ? `O plano atual "${current}" fica salvo em Meus planos. O histórico de cargas continua valendo para exercícios com o mesmo nome.`
      : undefined,
    onApplied: () => {
      state.exSubTab = "home";
      window._renderExercicios();
      window.scrollTo(0, 0);
      showInfoToast(`Plano "${plan.name}" ativado`);
    },
  });
}

/** Deletes a custom plan with a 5s undo window: cache/active pointer update immediately, Firestore delete deferred. Shared by the card kebab menu and the plan editor's delete button. */
export function deletePlanWithUndo(id){
  const plan = state.plansCache.get(id);
  if(!plan) return;
  const wasActive = state.currentPlanId === id;

  state.plansCache.delete(id);
  if(wasActive){ state.currentPlanId = null; state.currentPlanName = null; savePref(); }
  renderPlansSection();

  let undone = false;
  const timer = setTimeout(async () => {
    if(undone) return;
    try{
      await deletePlanDoc(id);
    }catch(e){
      console.warn("deletePlanDoc:", e.message);
      state.plansCache.set(id, plan);
      if(wasActive){ state.currentPlanId = id; state.currentPlanName = plan.name; savePref(); }
      renderPlansSection();
      showInfoToast("Não foi possível excluir");
    }
  }, 5000);

  showUndoToast("Plano excluído", () => {
    undone = true;
    clearTimeout(timer);
    state.plansCache.set(id, plan);
    if(wasActive){ state.currentPlanId = id; state.currentPlanName = plan.name; savePref(); }
    renderPlansSection();
  });
}

function openCustomPlanSheet(id){
  const plan = state.plansCache.get(id);
  if(!plan) return;
  const isActive = state.currentPlanId === id;

  let sheet = `<h3 class="pg-sheet-title">${esc(plan.name)}</h3>`;
  if(!isActive) sheet += `<button class="pg-sheet-item" data-act="use" type="button">Usar este plano</button>`;
  sheet += `<button class="pg-sheet-item" data-act="edit" type="button">Editar</button>`;
  sheet += `<button class="pg-sheet-item" data-act="share" type="button">Compartilhar</button>`;
  sheet += `<button class="pg-sheet-item pw-danger" data-act="delete" type="button">Excluir<small>desfazer por 5s</small></button>`;
  $programSheetInner.innerHTML = sheet;
  $programSheet.classList.add("open");

  const useBtn = $programSheetInner.querySelector('[data-act="use"]');
  if(useBtn) useBtn.addEventListener("click", () => { closeProgramSheet(); usePlan(plan, id); });
  $programSheetInner.querySelector('[data-act="edit"]').addEventListener("click", () => { closeProgramSheet(); openPlanEditor(id); });
  $programSheetInner.querySelector('[data-act="share"]').addEventListener("click", () => { closeProgramSheet(); sharePlan(plan); });
  $programSheetInner.querySelector('[data-act="delete"]').addEventListener("click", () => { closeProgramSheet(); deletePlanWithUndo(id); });
}

function openTemplatePreview(key){
  const t = PLAN_TEMPLATES.find(x => x.templateKey === key);
  if(!t) return;
  const pattern = [...planWeekPattern(t)].join(" ");

  let sheet = `<h3 class="pg-sheet-title">${esc(t.name)}</h3>`;
  sheet += `<p class="pg-meta">${esc(pattern)}</p>`;
  t.days.forEach(d => {
    sheet += `<div class="pl-prev-row"><span class="pg-letter">${esc(d.type)}</span><span><b>${esc(d.label)}</b><span class="pg-meta">${d.exercises.length} exercícios</span></span></div>`;
  });
  sheet += `<button class="xp-confirm" data-act="use" type="button">Usar este plano</button>`;
  sheet += `<button class="pg-sheet-item" data-act="share" type="button">Compartilhar</button>`;
  $programSheetInner.innerHTML = sheet;
  $programSheet.classList.add("open");

  $programSheetInner.querySelector('[data-act="use"]').addEventListener("click", () => { closeProgramSheet(); usePlan(t, null); });
  $programSheetInner.querySelector('[data-act="share"]').addEventListener("click", () => { closeProgramSheet(); sharePlan(t); });
}

// renderPlansSection is Plans-view code (not export); it stays here.
export function renderPlansSection(){
  let html = `<h1 class="pg-title">Planos</h1>`;
  html += `<button class="xp-confirm pl-create" id="plCreate" type="button">+ Criar plano</button>`;

  if(state.plansCache.size){
    html += `<div class="pg-sec"><span class="pg-lbl">Meus planos</span></div>`;
    [...state.plansCache].reverse().forEach(([id, plan]) => {
      const isActive = state.currentPlanId === id;
      const pattern = planWeekPattern(plan);
      const n = (plan.days || []).length;
      const d = [...pattern].filter(c => c !== "–").length;
      html += `<div class="pl-card" data-id="${id}">
        <button class="pl-card-main" data-id="${id}" type="button">
          <span class="pl-name">${esc(plan.name)}${isActive ? ' <span class="pg-tag is-today">Ativo</span>' : ''}</span>
          <span class="pg-meta">${pluralize(n, "treino", "treinos")} · ${pluralize(d, "dia", "dias")} · ${esc([...pattern].join(" "))}</span>
        </button>
        <button class="pg-kebab" data-id="${id}" type="button" aria-label="Ações do plano">⋯</button>
      </div>`;
    });
  }

  html += `<div class="pg-sec"><span class="pg-lbl">Prontos</span><span class="pg-meta">toque para ver</span></div>`;
  PLAN_TEMPLATES.forEach(t => {
    const isActive = state.currentPlanKey === t.templateKey;
    const pattern = planWeekPattern(t);
    const n = t.days.length;
    const d = [...pattern].filter(c => c !== "–").length;
    html += `<button class="pl-card pl-tpl" data-key="${t.templateKey}" type="button">
      <span class="pl-card-main">
        <span class="pl-name">${esc(t.name)}${isActive ? ' <span class="pg-tag is-today">Ativo</span>' : ''}</span>
        <span class="pg-meta">${pluralize(n, "treino", "treinos")} · ${pluralize(d, "dia", "dias")} · ${esc([...pattern].join(" "))}</span>
      </span>
      <span class="pg-chev" aria-hidden="true">›</span>
    </button>`;
  });

  $plansSection.innerHTML = html;

  document.getElementById("plCreate").addEventListener("click", openPlanWizard);

  $plansSection.querySelectorAll(".pl-card-main[data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const plan = state.plansCache.get(btn.dataset.id);
      if(plan) usePlan(plan, btn.dataset.id);
    });
  });
  $plansSection.querySelectorAll(".pg-kebab[data-id]").forEach(btn => {
    btn.addEventListener("click", () => openCustomPlanSheet(btn.dataset.id));
  });
  $plansSection.querySelectorAll(".pl-tpl").forEach(btn => {
    btn.addEventListener("click", () => openTemplatePreview(btn.dataset.key));
  });
}
