import { $howItWorksModal, $howItWorksModalInner } from "../core/dom.js";
import { markTipSeen } from "./tips.js";

export function closeHowItWorks(){
  $howItWorksModal.classList.remove("open");
  markTipSeen("howItWorks");
}

export function openHowItWorks(){
  $howItWorksModalInner.innerHTML = `
    <div class="modal-head">
      <h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0">Como funciona</h3>
      <button class="modal-close" id="howItWorksCloseX" type="button" aria-label="Fechar">&#10005;</button>
    </div>
    <div class="hiw-block">
      <div class="hiw-label">Modo compacto</div>
      <p class="hiw-desc">Para acompanhar o treino e marcar as séries feitas, sem se perder. Ideal quando você só quer executar.</p>
    </div>
    <div class="hiw-block">
      <div class="hiw-label">Modo carga</div>
      <p class="hiw-desc">Registre peso e repetições de cada série. Assim o app acompanha seu desempenho ao longo do tempo e passa a sugerir carga, avisar quando é hora de descarga (deload), mostrar o histórico do último treino e os gráficos de evolução.</p>
    </div>
    <div class="hiw-block">
      <div class="hiw-label">Personalização</div>
      <p class="hiw-desc">Ajuste seu treino em Exercícios, Planos e Dias.</p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn primary" id="howItWorksOk" style="width:100%">Entendi</button>
    </div>
  `;
  $howItWorksModal.classList.add("open");
  document.getElementById("howItWorksCloseX").addEventListener("click", closeHowItWorks);
  document.getElementById("howItWorksOk").addEventListener("click", closeHowItWorks);
}

export function initHowItWorks(){
  $howItWorksModal.addEventListener("click", e => { if(e.target === $howItWorksModal) closeHowItWorks(); });
}
