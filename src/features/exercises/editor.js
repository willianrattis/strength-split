import { stripDiacritics, esc } from "../../domain/text.js";
import { MUSCLE_LABEL, BADGE_LABEL } from "../../data/labels.js";
import { DAY_NAMES_SHORT } from "../../data/days.js";
import { EXERCISE_CATALOG } from "../../data/exercise-catalog.js";
import { state } from "../../core/state.js";
import { $exModal, $exModalInner } from "../../core/dom.js";
import { saveExerciseDoc, deleteExerciseDoc, rebuildUserDays } from "./crud.js";
import { renderExercicios } from "./list.js";

// PLAN mode (opts.ex + opts.onSave both set): edits an arbitrary in-memory exercise
// (a plan day's exercise entry) instead of the Firestore catalog. Days/Active are
// hidden (hideDaysActive) and Save calls onSave(collected) instead of persisting —
// see plans/editor.js. docId is always null in this mode. CATALOG mode (no opts.ex)
// is everything below unchanged: Firestore save, Days + Active shown, delete allowed.
export function openExEditor(docId, opts = {}){
  const { preselectDays = [], ex: planEx = null, hideDaysActive = false, onSave = null } = opts;
  const isPlanMode = !!onSave;
  const isNew = isPlanMode ? !planEx?.name : !docId;
  const showDelete = !isPlanMode && !isNew;
  const ex = isPlanMode
    ? { name:"", muscle:"ombro", reps:[12,10,8], badges:[], note:null, superset:null, ...planEx }
    : (isNew ? {
        name:"", muscle:"ombro", reps:[12,10,8], badges:[], note:null,
        active:true, days:[...preselectDays], orderByDay:{}, superset:null,
      } : {...state.exercisesCatalog.get(docId)});

  let html = `<h3>${isNew ? 'Novo exercício' : 'Editar exercício'}</h3>`;
  html += `<div class="modal-scroll">`;

  // Nome
  html += `<div class="modal-field">
    <label>Nome</label>
    <div class="ac-wrap">
      <input class="modal-input" id="mfName" value="${esc(ex.name)}" placeholder="Nome do exercício" autocomplete="off">
      <div class="ac-list" id="acName"></div>
    </div>
  </div>`;

  // Grupo muscular
  html += `<div class="modal-field">
    <label>Grupo muscular</label>
    <select class="modal-select" id="mfMuscle">
      ${Object.entries(MUSCLE_LABEL).map(([k,v]) => `<option value="${k}" ${ex.muscle===k?'selected':''}>${v}</option>`).join("")}
    </select>
  </div>`;

  // Reps
  html += `<div class="modal-field">
    <label>Repetições por série</label>
    <div class="reps-list" id="mfReps">
      ${(ex.reps||[12]).map((r,i) => `<input class="rep-input" type="number" inputmode="numeric" value="${r}" min="1">`).join("")}
      <button class="rep-add" type="button" id="mfRepAdd">+</button>
    </div>
  </div>`;

  // Badges
  html += `<div class="modal-field">
    <label>Badges</label>
    <div class="badge-toggles" id="mfBadges">
      ${["drop","iso","fast"].map(b => `<span class="badge-toggle ${(ex.badges||[]).includes(b)?'selected':''}" data-badge="${b}">${BADGE_LABEL[b]}</span>`).join("")}
    </div>
  </div>`;

  // Nota
  html += `<div class="modal-field">
    <label>Observação</label>
    <textarea class="modal-textarea" id="mfNote" placeholder="Opcional">${esc(ex.note)}</textarea>
  </div>`;

  if(!hideDaysActive){
    // Dias
    html += `<div class="modal-field">
      <label>Dias</label>
      <div class="day-chips" id="mfDays">
        ${DAY_NAMES_SHORT.map((d,i) => `<span class="day-chip ${(ex.days||[]).includes(i)?'selected':''}" data-day="${i}">${d}</span>`).join("")}
      </div>
    </div>`;

    // Ativo
    html += `<div class="modal-field" style="display:flex;align-items:center;gap:10px">
      <label style="margin-bottom:0">Ativo</label>
      <label class="switch"><input type="checkbox" id="mfActive" ${ex.active!==false?'checked':''}><span class="slider"></span></label>
    </div>`;
  }

  // Supersérie
  const sup = ex.superset || {name:"",muscle:"ombro",reps:[12,10,8],badges:[],note:null};
  const hasSup = !!ex.superset;
  html += `<div class="modal-field">
    <button class="superset-toggle" type="button" id="mfSupToggle">
      <span id="mfSupArrow">${hasSup?'▼':'▶'}</span> Supersérie
    </button>
    <div class="superset-fields ${hasSup?'open':''}" id="mfSupFields">
      <div class="modal-field">
        <label>Nome</label>
        <div class="ac-wrap">
          <input class="modal-input" id="mfSupName" value="${esc(sup.name)}" placeholder="Nome da supersérie" autocomplete="off">
          <div class="ac-list" id="acSupName"></div>
        </div>
      </div>
      <div class="modal-field">
        <label>Grupo muscular</label>
        <select class="modal-select" id="mfSupMuscle">
          ${Object.entries(MUSCLE_LABEL).map(([k,v]) => `<option value="${k}" ${sup.muscle===k?'selected':''}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="modal-field">
        <label>Repetições por série</label>
        <div class="reps-list" id="mfSupReps">
          ${(sup.reps||[12]).map(r => `<input class="rep-input" type="number" inputmode="numeric" value="${r}" min="1">`).join("")}
          <button class="rep-add" type="button" id="mfSupRepAdd">+</button>
        </div>
      </div>
      <div class="modal-field">
        <label>Badges</label>
        <div class="badge-toggles" id="mfSupBadges">
          ${["drop","iso","fast"].map(b => `<span class="badge-toggle ${(sup.badges||[]).includes(b)?'selected':''}" data-badge="${b}">${BADGE_LABEL[b]}</span>`).join("")}
        </div>
      </div>
      <div class="modal-field">
        <label>Observação</label>
        <textarea class="modal-textarea" id="mfSupNote" placeholder="Opcional">${esc(sup.note)}</textarea>
      </div>
    </div>
  </div>`;

  html += `</div>`;

  // Error
  html += `<div class="modal-error" id="mfError" style="display:none"></div>`;

  // Footer
  html += `<div class="modal-footer">
    <button class="modal-btn primary" id="mfSave">Salvar</button>
    <button class="modal-btn secondary" id="mfCancel">Cancelar</button>
    ${showDelete ? `<button class="modal-btn danger" id="mfDelete">Excluir</button>` : ''}
  </div>`;

  $exModalInner.innerHTML = html;
  $exModal.classList.add("open");

  // Event bindings
  const bindRepsAdd = (containerId, addBtnId) => {
    const container = document.getElementById(containerId);
    const addBtn = document.getElementById(addBtnId);
    addBtn.addEventListener("click", () => {
      const inputs = container.querySelectorAll(".rep-input");
      const lastVal = inputs.length ? inputs[inputs.length-1].value : "10";
      const inp = document.createElement("input");
      inp.className = "rep-input"; inp.type = "number"; inp.inputMode = "numeric";
      inp.value = lastVal; inp.min = "1";
      container.insertBefore(inp, addBtn);
      // add remove on double tap
      inp.addEventListener("dblclick", () => { if(container.querySelectorAll(".rep-input").length > 1) inp.remove(); });
    });
    container.querySelectorAll(".rep-input").forEach(inp => {
      inp.addEventListener("dblclick", () => { if(container.querySelectorAll(".rep-input").length > 1) inp.remove(); });
    });
  };
  bindRepsAdd("mfReps","mfRepAdd");
  bindRepsAdd("mfSupReps","mfSupRepAdd");

  // badge toggles
  const bindBadges = (containerId) => {
    document.getElementById(containerId).querySelectorAll(".badge-toggle").forEach(el => {
      el.addEventListener("click", () => el.classList.toggle("selected"));
    });
  };
  bindBadges("mfBadges");
  bindBadges("mfSupBadges");

  // day chips
  if(!hideDaysActive){
    document.getElementById("mfDays").querySelectorAll(".day-chip").forEach(el => {
      el.addEventListener("click", () => el.classList.toggle("selected"));
    });
  }

  // superset toggle
  document.getElementById("mfSupToggle").addEventListener("click", () => {
    const f = document.getElementById("mfSupFields");
    const a = document.getElementById("mfSupArrow");
    f.classList.toggle("open");
    a.textContent = f.classList.contains("open") ? "▼" : "▶";
  });

  // autocomplete helper
  function bindAutocomplete(inputId, listId, muscleSelectId){
    const inp = document.getElementById(inputId);
    const list = document.getElementById(listId);
    const mSel = document.getElementById(muscleSelectId);
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
        el.addEventListener("mousedown", e => {
          e.preventDefault();
          pick(el.dataset.name, el.dataset.muscle);
        });
      });
    }

    function pick(name, muscle){
      inp.value = name;
      if(mSel) mSel.value = muscle;
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
  }
  bindAutocomplete("mfName","acName","mfMuscle");
  bindAutocomplete("mfSupName","acSupName","mfSupMuscle");

  // cancel
  document.getElementById("mfCancel").addEventListener("click", closeExEditor);
  $exModal.addEventListener("click", e => { if(e.target === $exModal) closeExEditor(); });
  document.addEventListener("keydown", escHandler);

  // save
  document.getElementById("mfSave").addEventListener("click", async () => {
    const errEl = document.getElementById("mfError");
    errEl.style.display = "none";
    const name = document.getElementById("mfName").value.trim();
    const muscle = document.getElementById("mfMuscle").value;
    const reps = [...document.querySelectorAll("#mfReps .rep-input")].map(i => Math.max(1, parseInt(i.value)||1));
    const badges = [...document.querySelectorAll("#mfBadges .badge-toggle.selected")].map(el => el.dataset.badge);
    const note = document.getElementById("mfNote").value.trim() || null;

    // superset
    const supOpen = document.getElementById("mfSupFields").classList.contains("open");
    const supName = document.getElementById("mfSupName").value.trim();
    let superset = null;
    if(supOpen && supName){
      superset = {
        name: supName,
        muscle: document.getElementById("mfSupMuscle").value,
        reps: [...document.querySelectorAll("#mfSupReps .rep-input")].map(i => Math.max(1, parseInt(i.value)||1)),
        badges: [...document.querySelectorAll("#mfSupBadges .badge-toggle.selected")].map(el => el.dataset.badge),
        note: document.getElementById("mfSupNote").value.trim() || null,
      };
    }

    // validation
    if(!name){ errEl.textContent = "Nome é obrigatório."; errEl.style.display = ""; return; }
    if(reps.length < 1){ errEl.textContent = "Adicione ao menos 1 série."; errEl.style.display = ""; return; }

    if(isPlanMode){
      onSave({ name, muscle, reps, badges, note, superset });
      closeExEditor();
      return;
    }

    const days = [...document.querySelectorAll("#mfDays .day-chip.selected")].map(el => Number(el.dataset.day));
    const active = document.getElementById("mfActive").checked;
    if(days.length < 1){ errEl.textContent = "Selecione ao menos 1 dia."; errEl.style.display = ""; return; }

    // compute orderByDay for new days (append to end)
    const orderByDay = docId ? {...(state.exercisesCatalog.get(docId)?.orderByDay || {})} : {};
    days.forEach(dk => {
      if(orderByDay[dk] == null){
        // find max order for this day
        let maxOrder = -1;
        state.exercisesCatalog.forEach(ex => {
          if(ex.days?.includes(dk) && ex.orderByDay?.[dk] != null && ex.orderByDay[dk] > maxOrder)
            maxOrder = ex.orderByDay[dk];
        });
        orderByDay[dk] = maxOrder + 1;
      }
    });
    // remove orderByDay for days no longer assigned
    Object.keys(orderByDay).forEach(k => {
      if(!days.includes(Number(k))) delete orderByDay[k];
    });

    const data = { name, muscle, reps, badges, note, active, days, orderByDay, superset };

    try {
      const id = await saveExerciseDoc(docId, data);
      state.exercisesCatalog.set(id, { ...data, createdAt: state.exercisesCatalog.get(id)?.createdAt || null });
      rebuildUserDays();
      closeExEditor();
      renderExercicios();
    } catch(e) {
      errEl.textContent = "Erro ao salvar: " + e.message;
      errEl.style.display = "";
    }
  });

  // delete
  if(showDelete){
    document.getElementById("mfDelete").addEventListener("click", async () => {
      if(!confirm(`Excluir "${ex.name}" permanentemente?`)) return;
      try {
        await deleteExerciseDoc(docId);
        state.exercisesCatalog.delete(docId);
        rebuildUserDays();
        closeExEditor();
        renderExercicios();
      } catch(e) { alert("Erro ao excluir: " + e.message); }
    });
  }
}

// escHandler is added/removed from document by the open/close pair — that dynamic
// binding is correct as-is, not module init().
export function escHandler(e){ if(e.key === "Escape") closeExEditor(); }
export function closeExEditor(){
  $exModal.classList.remove("open");
  document.removeEventListener("keydown", escHandler);
}
