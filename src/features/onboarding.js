import { esc } from "../domain/text.js";
import { PLAN_TEMPLATES } from "../data/plan-templates.js";
import { state } from "../core/state.js";
import { $onboardingModal, $onboardingModalInner } from "../core/dom.js";
import { renderStrip } from "./day/render.js";
import { loadDay } from "./day/session-io.js";
import { rebuildUserDays } from "./exercises/crud.js";
import { openApplyPlanModal } from "./plans/apply-modal.js";
import { renderProfileForm } from "./profile-modal.js";
import { openSettings } from "./settings.js";
import { hasSeenTip } from "./tips.js";
import { openHowItWorks } from "./how-it-works.js";

const STEP_LABELS = ["Perfil", "Treino", "Config"];

// Ephemeral — which step the wizard is on. Reset to 1 every time it opens; never
// persisted (a reload always starts a fresh account back at Step 1).
let step = 1;

function closeOnboarding(){
  $onboardingModal.classList.remove("open");
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

function renderWizardShell(){
  let html = `<h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0 0 14px">Configuração inicial</h3>`;
  html += stepIndicatorHTML();
  html += `<div id="wizBody"></div>`;
  html += `<div class="modal-footer" id="wizFooter"></div>`;
  $onboardingModalInner.innerHTML = html;
}

function renderStepPerfil(){
  renderProfileForm(document.getElementById("wizBody"));
  document.getElementById("wizFooter").innerHTML = `
    <button class="modal-btn secondary" id="wizSkip">Pular</button>
    <button class="modal-btn primary" id="wizNext">Próximo</button>
  `;
  // Profile is optional and already autosaves as the user types — both buttons
  // just move on, nothing to validate or gate.
  document.getElementById("wizSkip").addEventListener("click", () => goToStep(2));
  document.getElementById("wizNext").addEventListener("click", () => goToStep(2));
}

function chooseTemplate(tpl){
  // Picker stays on Step 2 underneath; the apply modal layers on top (z-index
  // override in app.css) so a cancel leaves the user back at the picker instead
  // of a blank screen. Applying advances the wizard instead of closing it.
  openApplyPlanModal(tpl, null, {
    onApplied: () => goToStep(3),
  });
}

function chooseBlank(){
  // Catalog is already empty for a fresh account — nothing to build here. Defer
  // the actual rebuildUserDays/renderStrip/loadDay pass to the wizard's finish
  // step, same as the template path (whose own applyPlan already did its render).
  goToStep(3);
}

function renderStepTreino(){
  let html = `<h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0 0 6px">Escolha um treino</h3>`;
  html += `<p style="font-size:12px;color:var(--muted);margin:0 0 16px;line-height:1.4">Escolha um programa pronto para começar, ou monte o seu do zero.</p>`;
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

  html += `<button class="modal-btn secondary" id="wizBlankBtn" style="width:100%;margin-top:10px">Começar em branco</button>`;

  const $body = document.getElementById("wizBody");
  $body.innerHTML = html;

  $body.querySelectorAll(".plan-apply-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tpl = PLAN_TEMPLATES.find(t => t.templateKey === btn.dataset.key);
      if(tpl) chooseTemplate(tpl);
    });
  });
  document.getElementById("wizBlankBtn").addEventListener("click", chooseBlank);

  // Required step — only completing it (template applied or blank chosen) can
  // reach Step 3, so there's no "Pular"/"Próximo" here, just back to Step 1.
  document.getElementById("wizFooter").innerHTML = `<button class="modal-btn secondary" id="wizBack">Voltar</button>`;
  document.getElementById("wizBack").addEventListener("click", () => goToStep(1));
}

function renderStepConfig(){
  document.getElementById("wizBody").innerHTML = `
    <h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0 0 6px">Configurações</h3>
    <p style="font-size:12px;color:var(--muted);margin:0 0 18px;line-height:1.4">Ajuste periodização, autorregulação, unidades e outras preferências quando quiser — pode pular e mudar depois em Config.</p>
    <button class="modal-btn secondary" id="wizOpenSettings" style="width:100%">Abrir configurações</button>
  `;
  document.getElementById("wizOpenSettings").addEventListener("click", openSettings);

  document.getElementById("wizFooter").innerHTML = `
    <button class="modal-btn secondary" id="wizSkipEnd">Pular</button>
    <button class="modal-btn primary" id="wizFinish">Concluir</button>
  `;
  document.getElementById("wizSkipEnd").addEventListener("click", finishWizard);
  document.getElementById("wizFinish").addEventListener("click", finishWizard);
}

async function finishWizard(){
  state.needsOnboarding = false;
  closeOnboarding();
  rebuildUserDays();
  renderStrip();
  await loadDay(state.current);
  step = 1;
  if(!hasSeenTip("howItWorks")) openHowItWorks();
}

function renderStep(){
  renderWizardShell();
  if(step === 1) renderStepPerfil();
  else if(step === 2) renderStepTreino();
  else renderStepConfig();
}

export function openOnboarding(){
  step = 1;
  $onboardingModal.classList.add("open");
  renderStep();
}

export function initOnboarding(){
  $onboardingModal.addEventListener("click", e => {
    if(e.target === $onboardingModal) closeOnboarding();
  });
}
