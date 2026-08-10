import { stripDiacritics, esc } from "../../domain/text.js";
import { MUSCLE_LABEL } from "../../data/labels.js";
import { EXERCISE_CATALOG } from "../../data/exercise-catalog.js";
import { state } from "../../core/state.js";
import { $planModal, $planModalInner } from "../../core/dom.js";
import { savePref } from "../shell.js";
import { savePlanDoc, deletePlanDoc, renderPlansSection } from "./index.js";

export function openPlanEditor(planDocId){
  const isNew = !planDocId;
  let plan;

  if(isNew){
    plan = { name: "", source: "custom", days: [
      { type: "A", label: "", exercises: [{name:"",muscle:"peito",reps:[10,10,10]}] }
    ]};
  } else {
    plan = JSON.parse(JSON.stringify(state.plansCache.get(planDocId)));
  }

  function renderPlanEditorContent(){
    let html = `<h3>${isNew ? 'Novo plano' : 'Editar plano'}</h3>`;
    html += `<div class="modal-field">
      <label>Nome do plano</label>
      <input class="modal-input" id="pfName" value="${esc(plan.name)}" placeholder="Ex: Push Pull Legs">
    </div>`;
    html += `<div class="modal-field"><label>Dias do plano</label></div>`;

    plan.days.forEach((d, di) => {
      html += `<div class="plan-day-type" data-di="${di}">
        <div class="plan-day-type-header">
          <span class="plan-day-type-letter">${d.type}</span>
          <input class="plan-day-type-label-input" data-di="${di}" value="${esc(d.label)}" placeholder="Ex: Push, Pull, Legs...">
          ${plan.days.length > 1 ? `<button class="plan-remove-day" data-di="${di}" title="Remover dia">✕</button>` : ''}
        </div>`;

      d.exercises.forEach((e, ei) => {
        html += `<div class="plan-ex-row" data-di="${di}" data-ei="${ei}">
          <div class="ac-wrap plan-ex-name-wrap">
            <input class="plan-ex-name" value="${esc(e.name)}" placeholder="Nome do exercício" data-di="${di}" data-ei="${ei}" autocomplete="off">
            <div class="ac-list"></div>
          </div>
          <select class="plan-ex-muscle" data-di="${di}" data-ei="${ei}">
            ${Object.entries(MUSCLE_LABEL).map(([k,v]) => `<option value="${k}" ${e.muscle===k?'selected':''}>${v}</option>`).join("")}
          </select>
          <input class="plan-ex-reps" value="${(e.reps||[]).join(',')}" placeholder="8,8,8" data-di="${di}" data-ei="${ei}" title="Reps separadas por vírgula">
          <button class="plan-ex-remove" data-di="${di}" data-ei="${ei}" title="Remover">✕</button>
        </div>`;
      });

      html += `<button class="plan-add-ex-btn" data-di="${di}">+ Exercício</button>`;
      html += `</div>`;
    });

    if(plan.days.length < 7){
      html += `<button class="plan-add-day-btn" id="pfAddDay">+ Adicionar dia</button>`;
    }

    html += `<div class="modal-error" id="pfError" style="display:none"></div>`;
    html += `<div class="modal-footer">
      <button class="modal-btn primary" id="pfSave">Salvar</button>
      <button class="modal-btn secondary" id="pfCancel">Cancelar</button>
      ${!isNew ? `<button class="modal-btn danger" id="pfDelete">Excluir</button>` : ''}
    </div>`;

    $planModalInner.innerHTML = html;
    bindPlanEditorEvents();
  }

  function syncPlanFromUI(){
    const nameEl = document.getElementById("pfName");
    if(nameEl) plan.name = nameEl.value.trim();

    $planModalInner.querySelectorAll(".plan-day-type").forEach(dtEl => {
      const di = +dtEl.dataset.di;
      if(!plan.days[di]) return;
      const labelInput = dtEl.querySelector(".plan-day-type-label-input");
      if(labelInput) plan.days[di].label = labelInput.value.trim();

      const exRows = dtEl.querySelectorAll(".plan-ex-row");
      const exercises = [];
      exRows.forEach(exRow => {
        const nameInput = exRow.querySelector(".plan-ex-name");
        const muscleSelect = exRow.querySelector(".plan-ex-muscle");
        const repsInput = exRow.querySelector(".plan-ex-reps");
        exercises.push({
          name: nameInput ? nameInput.value.trim() : "",
          muscle: muscleSelect ? muscleSelect.value : "peito",
          reps: repsInput ? repsInput.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0) : [10,10,10],
          badges: [], note: null, superset: null,
        });
      });
      plan.days[di].exercises = exercises;
    });
  }

  function bindPlanEditorEvents(){
    bindPlanExAutocomplete();
    document.getElementById("pfCancel").addEventListener("click", closePlanEditor);

    function bindPlanExAutocomplete(){
      $planModalInner.querySelectorAll(".plan-ex-name").forEach(inp => {
        const wrap = inp.closest(".ac-wrap");
        const list = wrap && wrap.querySelector(".ac-list");
        const row = inp.closest(".plan-ex-row");
        const mSel = row && row.querySelector(".plan-ex-muscle");
        if(!list) return;
        let activeIdx = -1;

        function filter(q){
          if(!q || q.length < 1){ list.classList.remove("open"); return; }
          const nq = stripDiacritics(q);
          const prefix = [], sub = [];
          EXERCISE_CATALOG.forEach(c => {
            const nc = stripDiacritics(c.name);
            if(nc.startsWith(nq)) prefix.push(c);
            else if(nc.includes(nq)) sub.push(c);
          });
          const results = prefix.concat(sub).slice(0, 8);
          if(!results.length){ list.classList.remove("open"); return; }
          activeIdx = -1;
          list.innerHTML = results.map((c,i) =>
            `<div class="ac-item" data-i="${i}" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}<span class="ac-muscle">${esc(MUSCLE_LABEL[c.muscle]||c.muscle)}</span></div>`
          ).join("");
          list.classList.add("open");
          list.querySelectorAll(".ac-item").forEach(el => {
            el.addEventListener("mousedown", e => { e.preventDefault(); pick(el.dataset.name, el.dataset.muscle); });
          });
        }
        function pick(name, muscle){
          inp.value = name;
          if(mSel && muscle) mSel.value = muscle;
          list.classList.remove("open");
        }
        inp.addEventListener("input", () => filter(inp.value.trim()));
        inp.addEventListener("focus", () => { if(inp.value.trim()) filter(inp.value.trim()); });
        inp.addEventListener("blur", () => { setTimeout(() => list.classList.remove("open"), 150); });
        inp.addEventListener("keydown", e => {
          const items = list.querySelectorAll(".ac-item");
          if(!items.length || !list.classList.contains("open")) return;
          if(e.key === "ArrowDown"){ e.preventDefault(); activeIdx = Math.min(activeIdx+1, items.length-1); }
          else if(e.key === "ArrowUp"){ e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); }
          else if(e.key === "Enter" && activeIdx >= 0){ e.preventDefault(); pick(items[activeIdx].dataset.name, items[activeIdx].dataset.muscle); return; }
          else if(e.key === "Escape"){ list.classList.remove("open"); return; }
          else return;
          items.forEach((it,i) => it.classList.toggle("active", i === activeIdx));
        });
      });
    }
    $planModal.addEventListener("click", e => { if(e.target === $planModal) closePlanEditor(); });

    $planModalInner.querySelectorAll(".plan-add-ex-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        const di = +btn.dataset.di;
        plan.days[di].exercises.push({name:"",muscle:"peito",reps:[10,10,10],badges:[],note:null,superset:null});
        renderPlanEditorContent();
      });
    });

    $planModalInner.querySelectorAll(".plan-ex-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        const di = +btn.dataset.di, ei = +btn.dataset.ei;
        plan.days[di].exercises.splice(ei, 1);
        renderPlanEditorContent();
      });
    });

    const addDayBtn = document.getElementById("pfAddDay");
    if(addDayBtn){
      addDayBtn.addEventListener("click", () => {
        syncPlanFromUI();
        const typeLetters = 'ABCDEFGHIJ';
        plan.days.push({ type: typeLetters[plan.days.length] || String(plan.days.length), label: "", exercises: [{name:"",muscle:"peito",reps:[10,10,10]}] });
        renderPlanEditorContent();
        requestAnimationFrame(() => {
          $planModalInner.scrollTo({ top: $planModalInner.scrollHeight, behavior: "smooth" });
        });
      });
    }

    $planModalInner.querySelectorAll(".plan-remove-day").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        plan.days.splice(+btn.dataset.di, 1);
        const typeLetters = 'ABCDEFGHIJ';
        plan.days.forEach((d, i) => d.type = typeLetters[i] || String(i));
        renderPlanEditorContent();
      });
    });

    document.getElementById("pfSave").addEventListener("click", async () => {
      syncPlanFromUI();
      const errEl = document.getElementById("pfError");
      errEl.style.display = "none";

      if(!plan.name){
        errEl.textContent = "Nome é obrigatório."; errEl.style.display = ""; return;
      }

      for(const d of plan.days){
        d.exercises = d.exercises.filter(e => e.name);
        if(!d.exercises.length){
          errEl.textContent = `Dia ${d.type} precisa de pelo menos 1 exercício.`;
          errEl.style.display = ""; return;
        }
      }

      try{
        const data = { name: plan.name, source: "custom", days: plan.days };
        const id = await savePlanDoc(planDocId, data);
        state.plansCache.set(id, { ...data });
        closePlanEditor();
        renderPlansSection();
      }catch(e){
        errEl.textContent = "Erro: " + e.message;
        errEl.style.display = "";
      }
    });

    if(!isNew){
      const delBtn = document.getElementById("pfDelete");
      if(delBtn){
        delBtn.addEventListener("click", async () => {
          if(!confirm(`Excluir plano "${plan.name}"?`)) return;
          try{
            await deletePlanDoc(planDocId);
            state.plansCache.delete(planDocId);
            if(state.currentPlanId === planDocId){ state.currentPlanId = null; state.currentPlanName = null; savePref(); }
            closePlanEditor();
            renderPlansSection();
          }catch(e){ alert("Erro: " + e.message); }
        });
      }
    }
  }

  renderPlanEditorContent();
  $planModal.classList.add("open");
}

export function closePlanEditor(){
  $planModal.classList.remove("open");
}
