import { stripDiacritics, esc, normMachine } from "../../domain/text.js";
import { state } from "../../core/state.js";
import { $machineModal, $machineModalInner } from "../../core/dom.js";
import { usedMachinesRanked } from "../../core/adapters.js";
import { scheduleSave } from "./session-io.js";
import { renderDay } from "./render.js";

const MACHINE_CATALOG = ["Hammer","Life Fitness","Technogym","Matrix Fitness","Cybex","Nautilus","Movement","Cimerian","Ipiranga","Righetto"];

export function closeMachineModal(){ $machineModal.classList.remove("open"); }

export function openMachineModal(exIdx, isSup){
  const ex = state.session.exercises[exIdx];
  const currentMachine = isSup ? ex.supMachine : ex.machine;

  // Build chips: user's most-used machines GLOBAL across all sessions, ranked by frequency desc, cap 8
  const chips = usedMachinesRanked().slice(0, 8);

  let html = `<h3 style="margin:0 0 4px">Máquina (opcional)</h3>`;
  html += `<p class="sub-desc">Identifica o equipamento usado. Histórico e sugestões ficam separados por máquina.</p>`;

  if(currentMachine){
    html += `<div class="sub-current">Atual: ${esc(currentMachine)}</div>`;
  }

  if(chips.length){
    html += `<div class="sub-section-label">Usadas anteriormente</div>`;
    html += `<div class="sub-chips">`;
    chips.forEach(m => {
      html += `<button class="sub-chip machine-chip" data-machine="${esc(m)}">${esc(m)}</button>`;
    });
    html += `</div>`;
  }

  html += `<div class="sub-section-label">Nova máquina</div>`;
  html += `<div class="sub-input-wrap">`;
  html += `<input class="modal-input" id="machineInput" placeholder="Ex: Gervasport, Life Fitness…" autocomplete="off" value="${esc(currentMachine)}">`;
  html += `<div class="ac-list" id="machineAcList"></div>`;
  html += `</div>`;

  if(currentMachine){
    html += `<button class="sub-revert" id="machineRemoveBtn">✕ Remover máquina</button>`;
  }

  $machineModalInner.innerHTML = html;
  $machineModal.classList.add("open");

  function applyMachine(val){
    const v = val ? String(val).trim() : null;
    if(isSup) ex.supMachine = v || null;
    else ex.machine = v || null;
    scheduleSave(); renderDay(); closeMachineModal();
  }

  // Chip clicks
  $machineModalInner.querySelectorAll(".machine-chip").forEach(chip => {
    chip.addEventListener("click", () => applyMachine(chip.dataset.machine));
  });

  // Remove button
  const removeBtn = document.getElementById("machineRemoveBtn");
  if(removeBtn){
    removeBtn.addEventListener("click", () => applyMachine(null));
  }

  // Autocomplete: union of user machines + seed catalog, deduped via normMachine
  const machInp = document.getElementById("machineInput");
  const acSource = (() => {
    const out = [], seenK = new Set();
    const push = disp => { const k = normMachine(disp); if(k && !seenK.has(k)){ seenK.add(k); out.push(disp); } };
    usedMachinesRanked().forEach(push);
    MACHINE_CATALOG.forEach(push);
    return out;
  })();
  const machList = document.getElementById("machineAcList");
  let machActiveIdx = -1;
  function machFilter(q){
    if(!q){ machList.classList.remove("open"); return; }
    const nq = stripDiacritics(q.toLowerCase());
    const prefix = [], sub = [];
    acSource.forEach(m => {
      const nm = stripDiacritics(m.toLowerCase());
      if(nm.startsWith(nq)) prefix.push(m); else if(nm.includes(nq)) sub.push(m);
    });
    const results = prefix.concat(sub).slice(0, 8);
    if(!results.length){ machList.classList.remove("open"); return; }
    machActiveIdx = -1;
    machList.innerHTML = results.map((m,i) => `<div class="ac-item" data-i="${i}" data-machine="${esc(m)}">${esc(m)}</div>`).join("");
    machList.classList.add("open");
    machList.querySelectorAll(".ac-item").forEach(el => {
      el.addEventListener("mousedown", ev => { ev.preventDefault(); applyMachine(el.dataset.machine); });
    });
  }
  machInp.addEventListener("input", () => machFilter(machInp.value.trim()));
  machInp.addEventListener("focus", () => machFilter(machInp.value.trim()));
  machInp.addEventListener("blur", () => setTimeout(() => machList.classList.remove("open"), 150));
  machInp.addEventListener("keydown", e => {
    const items = machList.querySelectorAll(".ac-item");
    const open = machList.classList.contains("open") && items.length;
    if(e.key === "ArrowDown" && open){ e.preventDefault(); machActiveIdx = Math.min(machActiveIdx+1, items.length-1); }
    else if(e.key === "ArrowUp" && open){ e.preventDefault(); machActiveIdx = Math.max(machActiveIdx-1, 0); }
    else if(e.key === "Enter" && open && machActiveIdx >= 0){ e.preventDefault(); applyMachine(items[machActiveIdx].dataset.machine); return; }
    else if(e.key === "Enter"){ e.preventDefault(); applyMachine(machInp.value); return; }
    else if(e.key === "Escape"){ machList.classList.remove("open"); return; }
    else return;
    items.forEach((el,j) => el.classList.toggle("active", j === machActiveIdx));
  });

  setTimeout(() => machInp.focus(), 100);
}

export function init(){
  $machineModal.addEventListener("click", e => { if(e.target === $machineModal) closeMachineModal(); });
}
