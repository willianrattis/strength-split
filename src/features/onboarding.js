import { esc } from "../domain/text.js";
import { PLAN_TEMPLATES } from "../data/plan-templates.js";
import { state } from "../core/state.js";
import { $onboardingModal, $onboardingModalInner } from "../core/dom.js";
import { renderStrip } from "./day/render.js";
import { loadDay } from "./day/session-io.js";
import { rebuildUserDays } from "./exercises/crud.js";
import { applyPlan } from "./plans/apply-modal.js";

function closeOnboarding(){
  $onboardingModal.classList.remove("open");
}

async function chooseTemplate(tpl){
  const errEl = document.getElementById("onboardingError");
  const buttons = $onboardingModalInner.querySelectorAll("button");
  buttons.forEach(b => { b.disabled = true; });
  try{
    // Sequential weekday mapping (A→Mon, B→Tue, ...) — every template tops out
    // at 5 day-types, well within the Mon–Fri range.
    const mapping = tpl.days.map((d, i) => ({ dayTypeIdx: i, weekday: i }));
    await applyPlan(tpl, null, mapping);
    state.needsOnboarding = false;
    closeOnboarding();
  }catch(e){
    buttons.forEach(b => { b.disabled = false; });
    if(errEl){ errEl.textContent = "Erro: " + e.message; errEl.style.display = ""; }
  }
}

async function chooseBlank(){
  state.needsOnboarding = false;
  closeOnboarding();
  rebuildUserDays();
  renderStrip();
  await loadDay(state.current);
}

export function openOnboarding(){
  let html = `<h3>Bem-vindo!</h3>`;
  html += `<p style="color:var(--muted);font-size:13px;margin-bottom:16px">Escolha um programa para começar, ou monte o seu do zero.</p>`;
  html += `<div class="ex-section-header">Programas predefinidos</div>`;

  PLAN_TEMPLATES.forEach(t => {
    const daysSummary = t.days.map(d => d.label).join(" · ");
    html += `<div class="plan-card" data-key="${t.templateKey}">
      <div class="plan-card-body">
        <div class="plan-card-name">${esc(t.name)}</div>
        <div class="plan-card-meta"><span class="ex-tag">${esc(daysSummary)}</span></div>
      </div>
      <div class="plan-card-actions">
        <button class="plan-apply-btn" data-key="${t.templateKey}">Usar</button>
      </div>
    </div>`;
  });

  html += `<div class="modal-error" id="onboardingError" style="display:none"></div>`;
  html += `<div class="modal-footer">
    <button class="modal-btn secondary" id="onboardingBlankBtn">Começar em branco</button>
  </div>`;

  $onboardingModalInner.innerHTML = html;
  $onboardingModal.classList.add("open");

  $onboardingModalInner.querySelectorAll(".plan-apply-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tpl = PLAN_TEMPLATES.find(t => t.templateKey === btn.dataset.key);
      if(tpl) chooseTemplate(tpl);
    });
  });
  document.getElementById("onboardingBlankBtn").addEventListener("click", chooseBlank);
}

export function initOnboarding(){
  $onboardingModal.addEventListener("click", e => {
    if(e.target === $onboardingModal) closeOnboarding();
  });
}
