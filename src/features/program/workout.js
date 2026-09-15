import { esc } from "../../domain/text.js";
import { historicPace, estimateMs } from "../../domain/day-plan.js";
import {
  deriveProgram, workoutByLetter, workoutForWeekday,
  setWorkoutWeekdays, movePatch, removeFromWorkoutPatch, planSetCount,
  appendToWeekdaysPatch, replaceInWorkoutPatches,
} from "../../domain/program.js";
import { MUSCLE_LABEL, BADGE_LABEL, MUSCLE_ORDER } from "../../data/labels.js";
import { DAY_NAMES_SHORT, WEEKDAYS } from "../../data/days.js";
import { state } from "../../core/state.js";
import { $subViewWorkout, $programSheet, $programSheetInner } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { renderStrip } from "../day/render.js";
import { rebuildUserDays } from "../exercises/crud.js";
import { saveDayCustomization } from "../exercises/day-customization.js";
import { openExEditor } from "../exercises/editor.js";
import { reorderExerciseInDay } from "../exercises/dnd.js";
import { fmtDur } from "../train/summary.js";
import { saveProgram } from "./store.js";
import { applyCatalogPatches, refreshAfterPlanEdit, showUndoToast, showInfoToast, resolvePick } from "./edit.js";
import { openExercisePicker } from "./picker.js";

// Pending stepper-commit timers, keyed by exercise id — persists across re-renders
// so a rapid second click on the same row clears the previous commit's timer.
const stepTimers = new Map();

function closeProgramSheet(){ $programSheet.classList.remove("open"); }

function rowTags(e){
  let t = `<span class="pg-tag">${esc(MUSCLE_LABEL[e.muscle] || e.muscle)}</span>`;
  (e.badges || []).forEach(b => { t += `<span class="pg-tag is-today">${esc(BADGE_LABEL[b] || b)}</span>`; });
  if(e.superset) t += `<span class="pg-tag is-today">⇄ supersérie</span>`;
  return t;
}

function isUniform(reps){
  return Array.isArray(reps) && reps.length > 0 && reps.every(r => r === reps[0]);
}

const hasLoggedToday = wd => !!(state.session && state.current === wd &&
  (state.session.exercises || []).some(e => [...(e?.main || []), ...(e?.sup || [])].some(s => s?.done)));

export function renderWorkoutDetail(){
  const program = state.program || deriveProgram(state.exercisesCatalog, { dayCustomizations: state.dayCustomizations });
  const W = workoutByLetter(program, state.exWorkoutLetter);
  if(!W){
    state.exWorkoutLetter = null;
    state.exSubTab = "home";
    window._renderExercicios();
    return;
  }

  const refWd = W.weekdays[0];
  const rows = activeDays()[refWd].ex;
  const focusLabels = W.focus.map(k => MUSCLE_LABEL[k] || k).join(" · ");
  const name = W.label || `Treino ${W.letter}`;

  function summaryText(){
    const freshRows = activeDays()[refWd].ex;
    const n = freshRows.length;
    const s = planSetCount(freshRows);
    const pace = historicPace(state.allSessions || [], refWd);
    const ms = estimateMs(s, pace);
    const eta = ms != null ? ` · ~${fmtDur(ms, false)}` : "";
    return `${n} · ${s} séries${eta}`;
  }

  let html = `<div class="pw-head">
    <span class="pg-letter">${esc(W.letter)}</span>
    <div class="pw-head-txt">
      <button class="pw-name" id="pwName" type="button">${esc(name)}</button>
      <span class="pg-meta">${esc(focusLabels || "Sem foco")} · <button class="pw-link" id="pwFocus" type="button">editar</button></span>
    </div>
  </div>`;

  html += `<div class="pw-field"><span class="pg-lbl">Dias da semana</span><div class="pw-days" id="pwDays">`;
  DAY_NAMES_SHORT.forEach((abbr, wd) => {
    const inW = W.weekdays.includes(wd);
    const owner = inW ? null : workoutForWeekday(program, wd);
    const cls = inW ? "on" : (owner ? "other" : "");
    const suffix = owner ? ` · ${esc(owner.letter)}` : "";
    html += `<button class="pw-day ${cls}" data-wd="${wd}" type="button">${abbr}${suffix}</button>`;
  });
  html += `</div></div>`;

  html += `<div class="pg-sec pw-sec"><span class="pg-lbl">Exercícios</span><span class="pg-meta" id="pwSummary">${summaryText()}</span></div>`;

  html += `<div class="pw-list" id="pwList">`;
  rows.forEach((e, i) => {
    const uniform = isUniform(e.reps);
    const setsText = uniform ? `${e.reps.length} × ${e.reps[0]}` : (e.reps || []).join("/");
    html += `<div class="pw-row" data-id="${e._id}" data-i="${i}" draggable="true">
      <span class="pw-grip" aria-label="Arrastar"><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <div class="pw-row-b"><span class="pw-row-n">${esc(e.name)}</span><span class="pw-row-m">${rowTags(e)}</span></div>
      <button class="pw-sets" type="button" data-uniform="${uniform ? 1 : 0}">${esc(setsText)}</button>
      <button class="pw-more" type="button" aria-label="Mais ações">⋮</button>
      <div class="pw-steppers" hidden>
        <div class="pw-stp" data-k="sets"><span class="pg-lbl">Séries</span><div class="pw-stp-c"><button type="button" data-k="sets" data-d="-1">−</button><b>${uniform ? e.reps.length : ""}</b><button type="button" data-k="sets" data-d="1">+</button></div></div>
        <div class="pw-stp" data-k="reps"><span class="pg-lbl">Reps</span><div class="pw-stp-c"><button type="button" data-k="reps" data-d="-1">−</button><b>${uniform ? e.reps[0] : ""}</b><button type="button" data-k="reps" data-d="1">+</button></div></div>
      </div>
    </div>`;
  });
  html += `</div>`;

  html += `<button class="pw-add" id="pwAdd" type="button">+ Adicionar exercícios</button>`;

  $subViewWorkout.innerHTML = html;

  // ---- name ----
  document.getElementById("pwName").addEventListener("click", () => {
    const $name = document.getElementById("pwName");
    const input = document.createElement("input");
    input.className = "pw-name-input";
    input.maxLength = 30;
    input.value = W.label || "";
    $name.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const commit = async () => {
      if(done) return; done = true;
      const v = input.value.trim();
      const nextProgram = { ...program, workouts: program.workouts.map(w =>
        w.letter === W.letter ? { ...w, label: v } : w) };
      saveProgram(nextProgram);
      const proms = W.weekdays.map(wd => {
        state.dayCustomizations[wd] = { tag: v, focus: focusLabels };
        return saveDayCustomization(wd, v, focusLabels).catch(err => console.warn("saveDayCustomization:", err.message));
      });
      await Promise.all(proms);
      rebuildUserDays();
      renderStrip();
      renderWorkoutDetail();
    };
    const cancel = () => { if(done) return; done = true; renderWorkoutDetail(); };
    input.addEventListener("keydown", ev => {
      if(ev.key === "Enter") commit();
      else if(ev.key === "Escape") cancel();
    });
    input.addEventListener("blur", commit);
  });

  // ---- focus ----
  document.getElementById("pwFocus").addEventListener("click", () => {
    const selected = new Set(W.focus);
    let sheet = `<h3 class="pg-sheet-title">Foco do treino</h3><div class="pw-focus-grid">`;
    MUSCLE_ORDER.forEach(m => {
      sheet += `<button class="pw-day ${selected.has(m) ? "on" : ""}" data-muscle="${m}" type="button">${esc(MUSCLE_LABEL[m])}</button>`;
    });
    sheet += `</div><button class="modal-btn primary" id="pwFocusSave" style="width:100%">Salvar</button>`;
    $programSheetInner.innerHTML = sheet;
    $programSheet.classList.add("open");

    $programSheetInner.querySelectorAll(".pw-day").forEach(chip => {
      chip.addEventListener("click", () => chip.classList.toggle("on"));
    });
    document.getElementById("pwFocusSave").addEventListener("click", async () => {
      const nextFocus = [...$programSheetInner.querySelectorAll(".pw-day.on")].map(el => el.dataset.muscle);
      const nextFocusLabels = nextFocus.map(k => MUSCLE_LABEL[k] || k).join(" · ");
      const nextProgram = { ...program, workouts: program.workouts.map(w =>
        w.letter === W.letter ? { ...w, focus: nextFocus } : w) };
      saveProgram(nextProgram);
      const proms = W.weekdays.map(wd => {
        state.dayCustomizations[wd] = { tag: W.label, focus: nextFocusLabels };
        return saveDayCustomization(wd, W.label, nextFocusLabels).catch(err => console.warn("saveDayCustomization:", err.message));
      });
      await Promise.all(proms);
      rebuildUserDays();
      renderStrip();
      closeProgramSheet();
      renderWorkoutDetail();
    });
  });

  // ---- days ----
  async function applyScheduleChange(nextWeekdays){
    const r = setWorkoutWeekdays(state.exercisesCatalog, program, W.letter, nextWeekdays);
    if(!r) return;
    await applyCatalogPatches(r.patches);
    saveProgram(r.program);

    const oldSet = new Set(W.weekdays);
    const newSet = new Set(nextWeekdays);
    const coveredAfter = new Set();
    r.program.workouts.forEach(w => w.weekdays.forEach(wd => coveredAfter.add(wd)));

    const proms = [];
    newSet.forEach(wd => {
      if(!oldSet.has(wd)){
        state.dayCustomizations[wd] = { tag: W.label, focus: focusLabels };
        proms.push(saveDayCustomization(wd, W.label, focusLabels).catch(err => console.warn("saveDayCustomization:", err.message)));
      }
    });
    oldSet.forEach(wd => {
      if(!newSet.has(wd) && !coveredAfter.has(wd)){
        state.dayCustomizations[wd] = { tag: "Descanso", focus: "Dia de descanso" };
        proms.push(saveDayCustomization(wd, "Descanso", "Dia de descanso").catch(err => console.warn("saveDayCustomization:", err.message)));
      }
    });
    await Promise.all(proms);

    refreshAfterPlanEdit(new Set([...oldSet, ...newSet]));
    renderWorkoutDetail();
  }

  function openMoveDayConfirm(wd, owner){
    const dayName = WEEKDAYS[wd] ? WEEKDAYS[wd].name : DAY_NAMES_SHORT[wd];
    let text = `Mover este dia para o treino ${esc(W.letter)}?`;
    if(owner.weekdays.length === 1) text += ` O treino ${esc(owner.letter)} sai do programa.`;
    let sheet = `<h3 class="pg-sheet-title">${esc(dayName)} é do treino ${esc(owner.letter)}</h3>`;
    sheet += `<p class="pg-meta" style="margin:0 0 14px">${text}</p>`;
    if(hasLoggedToday(wd)) sheet += `<p class="pg-meta pw-warn">Hoje já tem séries registradas nesse dia. Elas saem do treino de hoje.</p>`;
    sheet += `<div style="display:flex;gap:8px">
      <button class="modal-btn primary" id="pwMoveConfirm" style="flex:1">Mover</button>
      <button class="modal-btn secondary" id="pwMoveCancel" style="flex:1">Cancelar</button>
    </div>`;
    $programSheetInner.innerHTML = sheet;
    $programSheet.classList.add("open");
    document.getElementById("pwMoveCancel").addEventListener("click", closeProgramSheet);
    document.getElementById("pwMoveConfirm").addEventListener("click", () => {
      closeProgramSheet();
      applyScheduleChange([...W.weekdays, wd]);
    });
  }

  function openRemoveDayConfirm(wd){
    const dayName = WEEKDAYS[wd] ? WEEKDAYS[wd].name : DAY_NAMES_SHORT[wd];
    let sheet = `<h3 class="pg-sheet-title">Tirar ${esc(dayName)} do treino ${esc(W.letter)}?</h3>`;
    sheet += `<p class="pg-meta pw-warn">Hoje já tem séries registradas nesse dia. Elas saem do treino de hoje.</p>`;
    sheet += `<div style="display:flex;gap:8px">
      <button class="modal-btn danger" id="pwRemoveDayConfirm" style="flex:1">Tirar</button>
      <button class="modal-btn secondary" id="pwRemoveDayCancel" style="flex:1">Cancelar</button>
    </div>`;
    $programSheetInner.innerHTML = sheet;
    $programSheet.classList.add("open");
    document.getElementById("pwRemoveDayCancel").addEventListener("click", closeProgramSheet);
    document.getElementById("pwRemoveDayConfirm").addEventListener("click", () => {
      closeProgramSheet();
      applyScheduleChange(W.weekdays.filter(d => d !== wd));
    });
  }

  document.querySelectorAll("#pwDays .pw-day").forEach(chip => {
    const wd = +chip.dataset.wd;
    chip.addEventListener("click", () => {
      if(chip.classList.contains("on")){
        if(W.weekdays.length <= 1){ showInfoToast("O treino precisa de pelo menos 1 dia"); return; }
        if(hasLoggedToday(wd)){ openRemoveDayConfirm(wd); return; }
        applyScheduleChange(W.weekdays.filter(d => d !== wd));
      }else if(chip.classList.contains("other")){
        openMoveDayConfirm(wd, workoutForWeekday(program, wd));
      }else{
        applyScheduleChange([...W.weekdays, wd]);
      }
    });
  });

  // ---- row ⋮ menu ----
  function openRowMenu(id){
    const ex = state.exercisesCatalog.get(id);
    const canMove = program.workouts.length > 1;
    let sheet = `<h3 class="pg-sheet-title">${esc(ex ? ex.name : "")}</h3>`;
    sheet += `<button class="pg-sheet-item" data-act="edit" type="button">Séries, técnicas e observação</button>`;
    sheet += `<button class="pg-sheet-item" data-act="swap" type="button">Trocar exercício<small>mantém séries</small></button>`;
    if(canMove) sheet += `<button class="pg-sheet-item" data-act="move" type="button">Mover para outro treino</button>`;
    sheet += `<button class="pg-sheet-item pw-danger" data-act="remove" type="button">Remover do treino</button>`;
    $programSheetInner.innerHTML = sheet;
    $programSheet.classList.add("open");

    $programSheetInner.querySelector('[data-act="edit"]').addEventListener("click", () => {
      closeProgramSheet();
      openExEditor(id, { hideDaysActive: true });
    });
    $programSheetInner.querySelector('[data-act="swap"]').addEventListener("click", () => {
      closeProgramSheet();
      openSwapPicker(id);
    });
    const moveBtn = $programSheetInner.querySelector('[data-act="move"]');
    if(moveBtn) moveBtn.addEventListener("click", () => openMoveTargetSheet(id));
    $programSheetInner.querySelector('[data-act="remove"]').addEventListener("click", () => {
      if(rows.length <= 1){ closeProgramSheet(); showInfoToast("O treino precisa de pelo menos 1 exercício"); return; }
      closeProgramSheet();
      doRemove(id);
    });
  }

  function openSwapPicker(oldId){
    const old = state.exercisesCatalog.get(oldId);
    if(!old) return;
    openExercisePicker({
      title: "Trocar exercício",
      mode: "single",
      focus: old.muscle ? [old.muscle] : W.focus,
      inWorkoutNames: rows.map(r => r.name),
      onConfirm: async ([pick]) => {
        const newId = await resolvePick(pick, { reps: [...(old.reps || [10,10,10])] });
        const snap = [oldId, newId].map(x => {
          const e = state.exercisesCatalog.get(x);
          return [x, { days: [...(e.days || [])], orderByDay: { ...(e.orderByDay || {}) }, active: e.active }];
        });
        const program = state.program || deriveProgram(state.exercisesCatalog, { dayCustomizations: state.dayCustomizations });
        const patches = replaceInWorkoutPatches(state.exercisesCatalog, program, W.letter, oldId, newId);
        if(!patches){ showInfoToast("Não foi possível trocar"); return; }
        await applyCatalogPatches([...patches].map(([x, p]) => [x, x === newId ? { ...p, active: true } : p]));
        refreshAfterPlanEdit(W.weekdays);
        renderWorkoutDetail();
        showUndoToast(`Trocado por ${pick.name}`, async () => {
          await applyCatalogPatches(snap);
          refreshAfterPlanEdit(W.weekdays);
          renderWorkoutDetail();
        });
      },
    });
  }

  function openMoveTargetSheet(id){
    if(rows.length <= 1){
      closeProgramSheet();
      showInfoToast("O treino precisa de pelo menos 1 exercício");
      return;
    }
    const others = program.workouts.filter(w => w.letter !== W.letter);
    let sheet = `<h3 class="pg-sheet-title">Mover para</h3>`;
    sheet += others.map(w =>
      `<button class="pg-sheet-item" data-letter="${esc(w.letter)}" type="button">${esc(w.letter)} · ${esc(w.label || "Treino " + w.letter)}</button>`
    ).join("");
    $programSheetInner.innerHTML = sheet;
    $programSheetInner.querySelectorAll("[data-letter]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const toLetter = btn.dataset.letter;
        closeProgramSheet();
        const patch = movePatch(state.exercisesCatalog, program, W.letter, toLetter, id);
        if(!patch) return;
        await applyCatalogPatches([[id, patch]]);
        const toWorkout = workoutByLetter(program, toLetter);
        refreshAfterPlanEdit(new Set([...W.weekdays, ...(toWorkout ? toWorkout.weekdays : [])]));
        renderWorkoutDetail();
        showInfoToast(`Movido para o treino ${toLetter}`);
      });
    });
  }

  async function doRemove(id){
    const ex = state.exercisesCatalog.get(id);
    if(!ex) return;
    const snapshot = { days: [...(ex.days || [])], orderByDay: { ...(ex.orderByDay || {}) } };
    const patch = removeFromWorkoutPatch(state.exercisesCatalog, program, W.letter, id);
    if(!patch) return;
    await applyCatalogPatches([[id, patch]]);
    refreshAfterPlanEdit(W.weekdays);
    renderWorkoutDetail();
    showUndoToast("Removido do treino", async () => {
      await applyCatalogPatches([[id, snapshot]]);
      refreshAfterPlanEdit(W.weekdays);
      renderWorkoutDetail();
    });
  }

  document.querySelectorAll("#pwList .pw-more").forEach(btn => {
    btn.addEventListener("click", () => openRowMenu(btn.closest(".pw-row").dataset.id));
  });

  // ---- add exercises ----
  document.getElementById("pwAdd").addEventListener("click", () => {
    openExercisePicker({
      title: `Adicionar ao treino ${W.letter}`,
      mode: "multi",
      focus: W.focus,
      inWorkoutNames: rows.map(r => r.name),
      onConfirm: async picks => {
        for(const pick of picks){
          const id = await resolvePick(pick);
          const patch = appendToWeekdaysPatch(state.exercisesCatalog, W.weekdays, id);
          if(patch) await applyCatalogPatches([[id, { ...patch, active: true }]]);
        }
        refreshAfterPlanEdit(W.weekdays);
        renderWorkoutDetail();
        showInfoToast(picks.length === 1 ? "1 exercício adicionado" : `${picks.length} exercícios adicionados`);
      },
    });
  });

  // ---- sets: inline steppers or full editor ----
  document.querySelectorAll("#pwList .pw-sets").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".pw-row");
      if(btn.dataset.uniform !== "1"){
        openExEditor(row.dataset.id, { hideDaysActive: true });
        return;
      }
      const wasOpen = row.classList.contains("open");
      document.querySelectorAll("#pwList .pw-row.open").forEach(r => {
        r.classList.remove("open");
        r.querySelector(".pw-steppers").hidden = true;
      });
      if(!wasOpen){
        row.classList.add("open");
        row.querySelector(".pw-steppers").hidden = false;
      }
    });
  });

  document.querySelectorAll("#pwList .pw-stp-c button").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".pw-row");
      const id = row.dataset.id;
      const k = btn.dataset.k;
      const d = +btn.dataset.d;
      const valEl = btn.parentElement.querySelector("b");
      const max = k === "sets" ? 10 : 50;
      const next = Math.min(max, Math.max(1, (parseInt(valEl.textContent, 10) || 1) + d));
      valEl.textContent = next;

      const setsVal = +row.querySelector('.pw-stp[data-k="sets"] b').textContent;
      const repsVal = +row.querySelector('.pw-stp[data-k="reps"] b').textContent;
      row.querySelector(".pw-sets").textContent = `${setsVal} × ${repsVal}`;

      clearTimeout(stepTimers.get(id));
      stepTimers.set(id, setTimeout(async () => {
        const reps = Array(setsVal).fill(repsVal);
        await applyCatalogPatches([[id, { reps }]]);
        refreshAfterPlanEdit(W.weekdays);
        const summaryEl = document.getElementById("pwSummary");
        if(summaryEl) summaryEl.textContent = summaryText();
      }, 600));
    });
  });

  // ---- reorder ----
  document.querySelectorAll("#pwList .pw-row").forEach(row => {
    let dragId = null;

    row.addEventListener("dragstart", e => {
      dragId = row.dataset.id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.id);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      document.querySelectorAll("#pwList .drag-over-top,#pwList .drag-over-bottom").forEach(x => x.classList.remove("drag-over-top", "drag-over-bottom"));
    });
    row.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      row.classList.toggle("drag-over-top", e.clientY < mid);
      row.classList.toggle("drag-over-bottom", e.clientY >= mid);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-top", "drag-over-bottom");
    });
    row.addEventListener("drop", async e => {
      e.preventDefault();
      row.classList.remove("drag-over-top", "drag-over-bottom");
      const fromId = e.dataTransfer.getData("text/plain");
      if(!fromId || fromId === row.dataset.id) return;
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      await reorderExerciseInDay(refWd, fromId, row.dataset.id, before);
      refreshAfterPlanEdit(W.weekdays);
      renderWorkoutDetail();
    });

    const handle = row.querySelector(".pw-grip");
    let touchClone = null, touchActive = false, longPressTimer = null;
    if(!handle) return;

    handle.addEventListener("touchstart", e => {
      dragId = row.dataset.id;
      longPressTimer = setTimeout(() => {
        touchActive = true;
        row.classList.add("dragging");
        touchClone = row.cloneNode(true);
        touchClone.style.cssText = `position:fixed;left:16px;right:16px;width:${row.offsetWidth}px;opacity:.7;pointer-events:none;z-index:200;transform:scale(.97)`;
        touchClone.style.top = e.touches[0].clientY - row.offsetHeight / 2 + "px";
        document.body.appendChild(touchClone);
      }, 250);
    }, { passive: true });

    handle.addEventListener("touchmove", e => {
      if(!touchActive){ clearTimeout(longPressTimer); return; }
      e.preventDefault();
      const y = e.touches[0].clientY;
      if(touchClone) touchClone.style.top = y - row.offsetHeight / 2 + "px";
      document.querySelectorAll("#pwList .drag-over-top,#pwList .drag-over-bottom").forEach(x => x.classList.remove("drag-over-top", "drag-over-bottom"));
      const target = document.elementFromPoint(e.touches[0].clientX, y);
      const item = target?.closest?.(".pw-row");
      if(item && item.dataset.id !== dragId){
        const rect = item.getBoundingClientRect();
        item.classList.toggle("drag-over-top", y < rect.top + rect.height / 2);
        item.classList.toggle("drag-over-bottom", y >= rect.top + rect.height / 2);
      }
    }, { passive: false });

    handle.addEventListener("touchend", async e => {
      clearTimeout(longPressTimer);
      if(!touchActive) return;
      touchActive = false;
      row.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
      document.querySelectorAll("#pwList .drag-over-top,#pwList .drag-over-bottom").forEach(x => x.classList.remove("drag-over-top", "drag-over-bottom"));

      const y = e.changedTouches[0].clientY;
      const target = document.elementFromPoint(e.changedTouches[0].clientX, y);
      const item = target?.closest?.(".pw-row");
      if(item && item.dataset.id !== dragId){
        const rect = item.getBoundingClientRect();
        const before = y < rect.top + rect.height / 2;
        await reorderExerciseInDay(refWd, dragId, item.dataset.id, before);
        refreshAfterPlanEdit(W.weekdays);
        renderWorkoutDetail();
      }
    });

    handle.addEventListener("touchcancel", () => {
      clearTimeout(longPressTimer);
      touchActive = false;
      row.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
    });
  });
}
