import { serverTimestamp } from "firebase/firestore";
import { esc } from "../../domain/text.js";
import { PLAN_TEMPLATES } from "../../data/plan-templates.js";
import { state } from "../../core/state.js";
import * as repo from "../../core/repo.js";
import { $plansSection } from "../../core/dom.js";
import { savePref } from "../shell.js";
import { openPlanEditor } from "./editor.js";
import { openApplyPlanModal } from "./apply-modal.js";

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

// renderPlansSection is Plans-view code (not export); it stays here.
export function renderPlansSection(){
  let html = "";

  if(state.currentPlanName){
    html += `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">
      Plano ativo: <b style="color:var(--accent)">${esc(state.currentPlanName)}</b>
    </div>`;
  }

  html += `<button class="ex-new-btn" id="newPlanBtn" style="margin-bottom:14px">+ Novo plano</button>`;

  html += `<div class="ex-section-header">Predefinidos</div>`;
  PLAN_TEMPLATES.forEach(t => {
    const isActive = state.currentPlanKey === t.templateKey;
    const daysSummary = t.days.map(d => d.type).join(' · ');
    html += `<div class="plan-card ${isActive?'active-plan':''}" data-key="${t.templateKey}">
      <div class="plan-card-body">
        <div class="plan-card-name">${esc(t.name)}</div>
        <div class="plan-card-meta">
          <span class="ex-tag">${daysSummary}</span>
          ${isActive ? '<span class="ex-tag accent">Ativo</span>' : ''}
        </div>
      </div>
      <div class="plan-card-actions">
        <button class="plan-apply-btn" data-key="${t.templateKey}">Aplicar</button>
      </div>
    </div>`;
  });

  if(state.plansCache.size){
    html += `<div class="ex-section-header">Meus planos</div>`;
    state.plansCache.forEach((plan, id) => {
      const isActive = state.currentPlanId === id;
      const daysSummary = (plan.days||[]).map(d => d.type).join(' · ');
      html += `<div class="plan-card ${isActive?'active-plan':''}" data-id="${id}">
        <div class="plan-card-body">
          <div class="plan-card-name">${esc(plan.name)}</div>
          <div class="plan-card-meta">
            <span class="ex-tag">${daysSummary}</span>
            ${isActive ? '<span class="ex-tag accent">Ativo</span>' : ''}
          </div>
        </div>
        <div class="plan-card-actions">
          <button class="ex-icon-btn plan-edit-btn" data-id="${id}" title="Editar">✎</button>
          <button class="ex-icon-btn plan-delete-btn" data-id="${id}" title="Excluir">✕</button>
          <button class="plan-apply-btn" data-id="${id}">Aplicar</button>
        </div>
      </div>`;
    });
  }

  $plansSection.innerHTML = html;

  document.getElementById("newPlanBtn").addEventListener("click", () => openPlanEditor(null));

  $plansSection.querySelectorAll(".plan-apply-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const id = btn.dataset.id;
      if(key){
        const tpl = PLAN_TEMPLATES.find(t => t.templateKey === key);
        if(tpl) openApplyPlanModal(tpl, null);
      } else if(id){
        const plan = state.plansCache.get(id);
        if(plan) openApplyPlanModal(plan, id);
      }
    });
  });

  $plansSection.querySelectorAll(".plan-edit-btn").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); openPlanEditor(btn.dataset.id); });
  });

  $plansSection.querySelectorAll(".plan-delete-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const plan = state.plansCache.get(id);
      if(!plan || !confirm(`Excluir plano "${plan.name}"?`)) return;
      try{
        await deletePlanDoc(id);
        state.plansCache.delete(id);
        if(state.currentPlanId === id){ state.currentPlanId = null; state.currentPlanName = null; savePref(); }
        renderPlansSection();
      }catch(e){ alert("Erro: " + e.message); }
    });
  });
}
