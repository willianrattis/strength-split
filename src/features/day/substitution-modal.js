import { stripDiacritics, esc } from "../../domain/text.js";
import { MUSCLE_LABEL } from "../../data/labels.js";
import { EXERCISE_CATALOG } from "../../data/exercise-catalog.js";
import { state } from "../../core/state.js";
import { $subModal, $subModalInner } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { scheduleSave } from "./session-io.js";
import { renderDay } from "./render.js";

export function closeSubModal(){ $subModal.classList.remove("open"); }

export function openSubModal(exIdx, isSup=false){
  const day = activeDays()[state.current];
  const planEx = day.ex[exIdx];
  const ex = state.session.exercises[exIdx];
  if(isSup && !planEx.superset) return;
  const originalName = isSup ? planEx.superset.name : planEx.name;
  const originalMuscle = isSup ? ((planEx.superset && planEx.superset.muscle) || planEx.muscle) : planEx.muscle;
  const curSub = isSup ? ex.supSubName : ex.subName;
  const isSub = !!curSub;

  // Build suggestions: same muscle, exclude original name, cap 8
  const suggestions = EXERCISE_CATALOG
    .filter(c => c.muscle === originalMuscle && c.name !== originalName)
    .slice(0, 8);

  let html = `<h3 style="margin:0 0 4px">Trocar ${isSup ? "supersérie" : "exercício"} (só hoje)</h3>`;
  html += `<p class="sub-desc">Substitui apenas esta sessão. O plano mantém <b>${esc(originalName)}</b>.</p>`;

  if(isSub){
    html += `<div class="sub-current">Atual: ${esc(curSub)}</div>`;
    html += `<button class="sub-revert" id="subRevertBtn">↩ Reverter ao padrão (${esc(originalName)})</button>`;
  }

  html += `<div class="sub-section-label">Buscar exercício</div>`;
  html += `<div class="sub-input-wrap">`;
  html += `<input class="modal-input" id="subSearchInput" placeholder="Digite o nome do exercício" autocomplete="off">`;
  html += `<div class="ac-list" id="subAcList"></div>`;
  html += `</div>`;

  if(suggestions.length){
    html += `<div class="sub-section-label">Sugestões (${esc(MUSCLE_LABEL[originalMuscle]||originalMuscle)})</div>`;
    html += `<div class="sub-chips">`;
    suggestions.forEach(c => {
      html += `<button class="sub-chip" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}</button>`;
    });
    html += `</div>`;
  }

  $subModalInner.innerHTML = html;
  $subModal.classList.add("open");

  function applySub(name, muscle){
    if(isSup){
      ex.supSubName = name;
      ex.supSubMuscle = muscle || originalMuscle;
    } else {
      ex.subName = name;
      ex.subMuscle = muscle || originalMuscle;
    }
    scheduleSave(); renderDay(); closeSubModal();
  }

  // Revert button
  const revertBtn = document.getElementById("subRevertBtn");
  if(revertBtn){
    revertBtn.addEventListener("click", () => {
      if(isSup){ ex.supSubName = null; ex.supSubMuscle = null; }
      else { ex.subName = null; ex.subMuscle = null; }
      scheduleSave(); renderDay(); closeSubModal();
    });
  }

  // Suggestion chips
  $subModalInner.querySelectorAll(".sub-chip").forEach(chip => {
    chip.addEventListener("click", () => applySub(chip.dataset.name, chip.dataset.muscle));
  });

  // Autocomplete on search input
  const subInp = document.getElementById("subSearchInput");
  const subList = document.getElementById("subAcList");
  let subActiveIdx = -1;

  function subFilter(q){
    if(!q || q.length < 1){ subList.classList.remove("open"); return; }
    const nq = stripDiacritics(q);
    const prefix = [], sub = [];
    EXERCISE_CATALOG.forEach(c => {
      const nc = stripDiacritics(c.name);
      if(nc.startsWith(nq)) prefix.push(c);
      else if(nc.includes(nq)) sub.push(c);
    });
    const results = prefix.concat(sub).slice(0, 8);
    if(!results.length){ subList.classList.remove("open"); return; }
    subActiveIdx = -1;
    subList.innerHTML = results.map((c,i) =>
      `<div class="ac-item" data-i="${i}" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}<span class="ac-muscle">${esc(MUSCLE_LABEL[c.muscle]||c.muscle)}</span></div>`
    ).join("");
    subList.classList.add("open");
    subList.querySelectorAll(".ac-item").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        applySub(el.dataset.name, el.dataset.muscle);
      });
    });
  }

  subInp.addEventListener("input", () => subFilter(subInp.value.trim()));
  subInp.addEventListener("focus", () => { if(subInp.value.trim()) subFilter(subInp.value.trim()); });
  subInp.addEventListener("blur", () => { setTimeout(() => subList.classList.remove("open"), 150); });
  subInp.addEventListener("keydown", e => {
    const items = subList.querySelectorAll(".ac-item");
    if(!items.length || !subList.classList.contains("open")) return;
    if(e.key === "ArrowDown"){ e.preventDefault(); subActiveIdx = Math.min(subActiveIdx+1, items.length-1); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); subActiveIdx = Math.max(subActiveIdx-1, 0); }
    else if(e.key === "Enter" && subActiveIdx >= 0){ e.preventDefault(); applySub(items[subActiveIdx].dataset.name, items[subActiveIdx].dataset.muscle); return; }
    else if(e.key === "Enter" && subInp.value.trim()){
      e.preventDefault();
      applySub(subInp.value.trim(), originalMuscle);
      return;
    }
    else if(e.key === "Escape"){ subList.classList.remove("open"); return; }
    else return;
    items.forEach((el,j) => el.classList.toggle("active", j === subActiveIdx));
  });

  setTimeout(() => subInp.focus(), 100);
}

export function init(){
  $subModal.addEventListener("click", e => { if(e.target === $subModal) closeSubModal(); });
}
