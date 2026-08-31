import { esc } from "../../domain/text.js";
import { MUSCLE_LABEL, GRIP_LABEL } from "../../data/labels.js";
import { state } from "../../core/state.js";
import { $planModal, $planModalInner } from "../../core/dom.js";
import { savePref } from "../prefs.js";
import { openExEditor } from "../exercises/editor.js";
import { savePlanDoc, deletePlanDoc, renderPlansSection } from "./index.js";

export function openPlanEditor(planDocId){
  const isNew = !planDocId;
  let plan;

  if(isNew){
    plan = { name: "", source: "custom", days: [
      { type: "A", label: "", exercises: [{name:"",muscle:"peito",reps:[10,10,10],badges:[],grip:null,note:null,superset:null}] }
    ]};
  } else {
    plan = JSON.parse(JSON.stringify(state.plansCache.get(planDocId)));
  }

  function renderPlanEditorContent(){
    let html = `<h3>${isNew ? 'Novo plano' : 'Editar plano'}</h3>`;
    html += `<div class="modal-scroll">`;
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
        const badgeCount = (e.badges||[]).length;
        const repsSummary = (e.reps||[]).length ? `${(e.reps||[]).length}×${e.reps[0]}` : '';
        html += `<div class="ex-list-item plan-ex-item" data-di="${di}" data-ei="${ei}">
          <div class="ex-list-body">
            <div class="ex-list-name">${e.name ? esc(e.name) : 'Sem nome'}</div>
            <div class="ex-list-meta">
              <span class="ex-tag">${esc(MUSCLE_LABEL[e.muscle]||e.muscle||'')}</span>
              ${repsSummary ? `<span class="ex-tag">${repsSummary}</span>` : ''}
              ${badgeCount ? `<span class="ex-tag accent">${badgeCount} badge${badgeCount>1?'s':''}</span>` : ''}
              ${e.grip ? `<span class="ex-tag">${esc(GRIP_LABEL[e.grip])}</span>` : ''}
              ${e.note ? '<span class="ex-tag">nota</span>' : ''}
              ${e.superset ? '<span class="ex-tag accent">⇄ supersérie</span>' : ''}
            </div>
          </div>
          <div class="ex-list-actions">
            <button class="ex-icon-btn plan-ex-edit" data-di="${di}" data-ei="${ei}" title="Editar">✎</button>
            <button class="ex-icon-btn plan-ex-remove" data-di="${di}" data-ei="${ei}" title="Remover">✕</button>
          </div>
        </div>`;
      });

      html += `<button class="plan-add-ex-btn" data-di="${di}">+ Exercício</button>`;
      html += `</div>`;
    });

    if(plan.days.length < 7){
      html += `<button class="plan-add-day-btn" id="pfAddDay">+ Adicionar dia</button>`;
    }

    html += `</div>`;

    html += `<div class="modal-error" id="pfError" style="display:none"></div>`;
    html += `<div class="modal-footer">
      <button class="modal-btn primary" id="pfSave">Salvar</button>
      <button class="modal-btn secondary" id="pfCancel">Cancelar</button>
      ${!isNew ? `<button class="modal-btn danger" id="pfDelete">Excluir</button>` : ''}
    </div>`;

    $planModalInner.innerHTML = html;
    bindPlanEditorEvents();
  }

  // The `plan` object is the single source of truth for exercises — each detail
  // edit (openPlanExEditor's onSave) writes straight into it. Only the plan name
  // and day-type labels stay as plain inline inputs that need DOM sync.
  function syncPlanFromUI(){
    const nameEl = document.getElementById("pfName");
    if(nameEl) plan.name = nameEl.value.trim();

    $planModalInner.querySelectorAll(".plan-day-type").forEach(dtEl => {
      const di = +dtEl.dataset.di;
      if(!plan.days[di]) return;
      const labelInput = dtEl.querySelector(".plan-day-type-label-input");
      if(labelInput) plan.days[di].label = labelInput.value.trim();
    });
  }

  // Opens the full exercise-attribute form (reps, badges, note, superset) for
  // plan.days[di].exercises[ei] — same rich form the Exercícios tab uses, in PLAN
  // mode (no Days/Active, no Firestore write; onSave just updates `plan` in place).
  function openPlanExEditor(di, ei){
    openExEditor(null, {
      ex: plan.days[di].exercises[ei],
      hideDaysActive: true,
      onSave: (data) => {
        plan.days[di].exercises[ei] = data;
        renderPlanEditorContent();
      },
    });
  }

  function bindPlanEditorEvents(){
    document.getElementById("pfCancel").addEventListener("click", closePlanEditor);
    $planModal.addEventListener("click", e => { if(e.target === $planModal) closePlanEditor(); });

    $planModalInner.querySelectorAll(".plan-ex-item").forEach(el => {
      el.addEventListener("click", e => {
        if(e.target.closest(".ex-icon-btn")) return;
        openPlanExEditor(+el.dataset.di, +el.dataset.ei);
      });
    });

    $planModalInner.querySelectorAll(".plan-ex-edit").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        openPlanExEditor(+btn.dataset.di, +btn.dataset.ei);
      });
    });

    $planModalInner.querySelectorAll(".plan-add-ex-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        const di = +btn.dataset.di;
        const ei = plan.days[di].exercises.length;
        plan.days[di].exercises.push({name:"",muscle:"peito",reps:[10,10,10],badges:[],grip:null,note:null,superset:null});
        renderPlanEditorContent();
        openPlanExEditor(di, ei);
      });
    });

    $planModalInner.querySelectorAll(".plan-ex-remove").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
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
        plan.days.push({ type: typeLetters[plan.days.length] || String(plan.days.length), label: "", exercises: [{name:"",muscle:"peito",reps:[10,10,10],badges:[],grip:null,note:null,superset:null}] });
        renderPlanEditorContent();
        requestAnimationFrame(() => {
          const $scroll = $planModalInner.querySelector(".modal-scroll");
          if($scroll) $scroll.scrollTo({ top: $scroll.scrollHeight, behavior: "smooth" });
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
