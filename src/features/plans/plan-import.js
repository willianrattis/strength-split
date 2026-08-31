import { esc } from "../../domain/text.js";
import { parseSharedPlan } from "../../domain/plan-share.js";
import { state } from "../../core/state.js";
import { $sharedPlanModal, $sharedPlanModalInner } from "../../core/dom.js";
import { decodeParam, showShareToast } from "./share.js";
import { openApplyPlanModal } from "./apply-modal.js";
import { savePlanDoc, renderPlansSection } from "./index.js";

const SHARE_HASH_PREFIX = "#plan=";

// Held outside `state` — state.js's resetUserState() reassigns every field on
// every auth transition, but a shared link is captured once at boot, before
// login even resolves, and must survive that reset.
let pendingPlan = null;

// Which onDismiss callback the currently-open modal should invoke — set fresh
// by every presentSharedPlan() call, read by the single backdrop-click
// listener wired once in initPlanImport().
let dismissActive = () => {};

export function capturePendingSharedPlan(){
  const hash = location.hash;
  if(!hash.startsWith(SHARE_HASH_PREFIX)) return;
  try{
    const raw = decodeParam(hash.slice(SHARE_HASH_PREFIX.length));
    const plan = parseSharedPlan(raw);
    if(plan) pendingPlan = plan;
  }catch(_e){
    // malformed fragment — ignore, fragment is cleared below regardless
  }
  history.replaceState(null, "", location.pathname + location.search);
}

export function pendingSharedPlan(){
  return pendingPlan;
}

export function presentSharedPlan(plan, opts = {}){
  const { onDismiss = () => {} } = opts;
  pendingPlan = null;

  let settled = false;
  const close = () => $sharedPlanModal.classList.remove("open");
  const dismiss = () => { if(settled) return; settled = true; close(); onDismiss(); };
  dismissActive = dismiss;

  let html = `<div class="modal-head">
    <h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0">Plano compartilhado</h3>
    <button class="modal-close" id="sharedPlanCloseX" type="button" aria-label="Fechar">&#10005;</button>
  </div>`;
  html += `<p style="color:var(--muted);font-size:13px;margin-bottom:16px">${esc(plan.name)}</p>`;

  plan.days.forEach(d => {
    const exNames = d.exercises.map(e => e.superset
      ? `${esc(e.name)} + ${esc(e.superset.name)}`
      : esc(e.name)
    );
    html += `<div class="day-map-item">
      <div class="day-map-row">
        <span class="day-map-type">${esc(d.type)}</span>
        <span class="day-map-label">${esc(d.label)}</span>
      </div>
      <div class="day-map-exlist">
        ${exNames.map(n => `<span class="day-map-ex">${n}</span>`).join("")}
      </div>
    </div>`;
  });

  html += `<div class="modal-error" id="sharedPlanError" style="display:none"></div>`;
  html += `<div class="modal-footer">
    <button class="modal-btn primary" id="sharedPlanApply">Aplicar</button>
    <button class="modal-btn secondary" id="sharedPlanSave">Salvar nos meus planos</button>
  </div>`;

  $sharedPlanModalInner.innerHTML = html;
  $sharedPlanModal.classList.add("open");

  document.getElementById("sharedPlanCloseX").addEventListener("click", dismiss);

  document.getElementById("sharedPlanApply").addEventListener("click", () => {
    // Stays open underneath — same layering as the onboarding wizard's template
    // picker, so a cancel in the mapping modal returns here instead of a blank
    // screen. #applyPlanModal's z-index already paints above the default overlay.
    openApplyPlanModal(plan, null, {
      onApplied: () => {
        if(settled) return;
        settled = true;
        state.needsOnboarding = false;
        close();
      },
    });
  });

  document.getElementById("sharedPlanSave").addEventListener("click", async () => {
    if(settled) return;
    const errEl = document.getElementById("sharedPlanError");
    errEl.style.display = "none";
    const $saveBtn = document.getElementById("sharedPlanSave");
    $saveBtn.disabled = true;
    try{
      const data = { name: plan.name, source: "shared", notes: plan.notes || [], days: plan.days };
      const id = await savePlanDoc(null, data);
      state.plansCache.set(id, { ...data });
      renderPlansSection();
      settled = true;
      close();
      showShareToast("Plano salvo!");
    }catch(e){
      $saveBtn.disabled = false;
      errEl.textContent = "Erro: " + e.message;
      errEl.style.display = "";
    }
  });
}

export function initPlanImport(){
  $sharedPlanModal.addEventListener("click", e => {
    if(e.target === $sharedPlanModal) dismissActive();
  });
}
