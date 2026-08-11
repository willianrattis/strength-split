import { esc } from "../domain/text.js";
import { PLAN_TEMPLATES } from "../data/plan-templates.js";
import { state } from "../core/state.js";
import { $onboardingModal, $onboardingModalInner } from "../core/dom.js";
import { renderStrip } from "./day/render.js";
import { loadDay } from "./day/session-io.js";
import { rebuildUserDays } from "./exercises/crud.js";
import { openApplyPlanModal } from "./plans/apply-modal.js";

function closeOnboarding(){
  $onboardingModal.classList.remove("open");
}

function chooseTemplate(tpl){
  // Picker overlay stays open underneath; the apply modal layers on top
  // (z-index override in app.css) so a cancel leaves the user back at the
  // picker instead of a blank screen.
  openApplyPlanModal(tpl, null, {
    onApplied: () => {
      state.needsOnboarding = false;
      closeOnboarding();
    },
  });
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
