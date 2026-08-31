import { esc } from "../../domain/text.js";
import { formatDate, shortDate, getWeekMonday } from "../../domain/dates.js";
import { equipmentOf } from "../../domain/equipment.js";
import { UNIT_CYCLE, UNIT_ABBR, UNIT_BTN, UNIT_STEP } from "../../domain/units.js";
import { BADGE_LABEL, GRIP_LABEL } from "../../data/labels.js";
import { DELOAD_FACTOR } from "../../core/config.js";
import { state } from "../../core/state.js";
import { $panel, $strip, $weekPrev, $weekNext, $weekLabel } from "../../core/dom.js";
import {
  activeDays, machineFilterActive, prevLoadData, suggestLoads,
  isDeloadActive, deloadDue, projectLoad, exerciseTopHistory, matchVariant, emptySession,
} from "../../core/adapters.js";
import { centerActiveDay } from "../../core/ui/sticky-header.js";
import { saveDeloadDate } from "../prefs.js";
import { applyPrevLayoutState } from "../settings.js";
import { hasSeenTip, markTipSeen } from "../tips.js";
import { openEvolucaoFor } from "../evolution.js";
import { openOnboarding } from "../onboarding.js";
import { openExEditor } from "../exercises/editor.js";
import { openDayQuickEdit } from "./quick-edit.js";
import { scheduleSave, loadDay, ensureSessionsLoaded } from "./session-io.js";
import { openSubModal } from "./substitution-modal.js";
import { openMachineModal } from "./machine-modal.js";
import { enterTrainMode, exitTrainMode, renderTrainBar, bindTrainTrack, restoreTrainScroll } from "../train/index.js";
import { trainEndCardHTML } from "../train/summary.js";

const ICON_TREND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>';

const todayIdx = (()=>{ const g=new Date().getDay(); return g===0?6:g-1; })();

export function exDone(ex){
  const mainOk = ex.main.every(s => s.done);
  const supOk  = !ex.sup || ex.sup.every(s => s.done);
  return mainOk && supOk;
}
export function countDone(){ return state.session.exercises.filter(exDone).length; }

function setPct(){
  let done = 0, total = 0;
  for(const ex of state.session.exercises){
    total += ex.main.length;
    done  += ex.main.filter(s => s.done).length;
    if(ex.sup){ total += ex.sup.length; done += ex.sup.filter(s => s.done).length; }
  }
  return total ? Math.round(done / total * 100) : 0;
}

// Legacy single-line renderer. Output is intentionally unchanged; stage B replaces it.
// Shared meta row + variant-1 panel. `prev` / `sug` are precomputed by renderDay so the
// history scan and the suggestion engine each run once per exercise.
// "×N" for the reps actually completed on that set last time. Accented when the user beat that
// session's target — the cue that the load is ready to go up. Empty when no repsDone was recorded.
function prevRepsHTML(ps){
  if(!ps || ps.repsDone == null) return "";
  const over = (ps.reps != null && ps.repsDone > ps.reps) ? " over" : "";
  return `<span class="pv-reps${over}">×${ps.repsDone}</span>`;
}

function prevBlockHTML(prev, sug, unit, exIdx, isSup){
  if(!prev && !sug) return "";
  const u = unit || "kg";
  const ua = UNIT_ABBR[u];
  const n = Math.max(prev ? prev.perSet.length : 0, sug ? sug.loads.length : 0);
  if(!n) return "";

  const rank = (prev && prev.execRank != null) ? ` · ${prev.execRank}º` : "";
  const dateTxt = prev
    ? `Último treino <b>${shortDate(prev.date)}</b>${rank}`
    : `Sem histórico`;
  const applyBtn = sug
    ? `<button class="suggest-apply" data-ex="${exIdx}" ${isSup?'data-sup="1"':""}>aplicar sugestão ${sug.dir}</button>`
    : "";

  let html = `<div class="prev-block">`;
  html += `<div class="prev-meta"><span class="pm-date">${dateTxt}</span>${applyBtn}</div>`;
  html += `<div class="prev-panel" style="--pp-cols:${n}">`;
  html += `<div class="pp-row pp-head"><span class="pp-lbl pp-unit">${ua}</span>`;
  for(let i = 0; i < n; i++) html += `<span class="pp-val">${i+1}ª</span>`;
  html += `</div>`;

  if(prev){
    html += `<div class="pp-row pp-prev"><span class="pp-lbl">ÚLTIMA</span>`;
    for(let i = 0; i < n; i++){
      const ps = prev.perSet[i] || null;
      const w = ps ? ps.weight : null;
      html += w != null
        ? `<span class="pp-val"><span class="pv-w">${w}</span>${prevRepsHTML(ps)}</span>`
        : `<span class="pp-val">—</span>`;
    }
    html += `</div>`;
  }
  if(sug){
    html += `<div class="pp-row pp-sug"><span class="pp-lbl">SUGESTÃO</span>`;
    for(let i = 0; i < n; i++){
      const v = sug.loads[i];
      const w = prev && prev.perSet[i] ? prev.perSet[i].weight : null;
      const chg = (v != null && w != null && v !== w) ? " chg" : "";
      html += `<span class="pp-val${chg}">${v != null ? v : "—"}</span>`;
    }
    html += `</div>`;
    if(sug.limited) html += `<div class="pp-note">limitação</div>`;
  }
  html += `</div></div>`;
  return html;
}

// Suggestion payload, or null. Gating that used to live in `.flag-periodization .suggest`
// now lives here so the panel row, the apply button and the input placeholders agree.
function suggestData(name, unit, isSup, exIdx){
  if(!document.body.classList.contains("flag-periodization")) return null;
  if(!state.session || !state.session.exercises[exIdx]) return null;
  const ex = state.session.exercises[exIdx];
  const sets = isSup ? ex.sup : ex.main;
  if(sets && sets.some(s => typeof s.weight === "number")) return null;
  const machine = machineFilterActive() ? (isSup ? ex.supMachine : ex.machine) : undefined;
  const planEx = activeDays()[state.current] && activeDays()[state.current].ex[exIdx];
  const muscle = planEx ? (isSup ? (ex.supSubMuscle || (planEx.superset && planEx.superset.muscle) || planEx.muscle) : (ex.subMuscle || planEx.muscle)) : undefined;
  return suggestLoads(name, unit, machine, {muscle}) || null;
}

function seriesHTML(sets, exIdx, isSup, unit, name, prev, sug){
  const u = unit || "kg";
  const step = UNIT_STEP[u] || 2.5;
  const equip = name ? equipmentOf(name) : null;
  const autoreg = document.body.classList.contains("flag-autoreg");
  // In panel layout the SUGESTÃO row already carries these values; echoing them as
  // placeholders reads like pre-filled data. Column layout has no such row, so it keeps them.
  // Train mode is the exception: it shows the panel AND the placeholder — the panel is a
  // stable reference across sets, the placeholder is the field the user is about to type in.
  const colLayout = document.body.classList.contains("layout-prev-column")
                 || document.body.classList.contains("mode-train");
  let html = `<div class="series-table" data-ex="${exIdx}" ${isSup?'data-sup="1"':""}>`;
  html += `<span class="compact-reps-lbl">Reps</span>`;
  html += `<div class="series-grid series-head">
    <span>Série</span><span class="h-prev">Anterior</span><span class="h-reps">Reps</span><span class="h-load">Carga</span>
  </div>`;
  sets.forEach((s, si) => {
    const cls = "chip" + (s.done ? " set-done" : "");
    const filled = (s.weight != null && s.weight !== "") ? " filled" : "";
    const fromSug = (filled && s.fromSug) ? " from-sug" : "";
    const ps = (prev && prev.perSet[si]) ? prev.perSet[si] : null;
    const pw = ps ? ps.weight : null;
    const prevCell = `<span class="prev-cell">${pw != null
      ? `<span class="pv-w">${pw}</span>${prevRepsHTML(ps)}`
      : '<span class="pc-empty">—</span>'}</span>`;
    const sugV = sug ? sug.loads[si] : null;
    const showSugPh = colLayout && sugV != null && (s.weight == null || s.weight === "");
    const wPlaceholder = showSugPh ? sugV : "—";
    const sugPh = showSugPh ? " sug-ph" : "";
    html += `<div class="series-grid${s.done ? " set-done-row" : ""}">
      <button class="set-idx${s.done ? " done" : ""}" data-si="${si}" aria-pressed="${!!s.done}" aria-label="Série ${si+1}${s.done ? " — concluída" : ""}">${s.done ? "✓" : (si+1)+"ª"}</button>
      ${prevCell}
      <button class="${cls}" data-si="${si}" aria-label="Série ${si+1}: ${s.reps} reps${s.done?' concluída':''}"><span class="tick">✓</span>${s.reps}</button>
      <input class="reps-input" type="text" inputmode="numeric" data-si="${si}" placeholder="${s.reps}" value="${s.repsDone ?? ""}" aria-label="Reps feitas série ${si+1}">
      <div class="load-cell${filled}${sugPh}${fromSug}">
        <input class="weight-input" type="text" inputmode="decimal" data-si="${si}" placeholder="${wPlaceholder}" value="${s.weight ?? ""}" aria-label="Carga da série ${si+1} em ${UNIT_ABBR[u]}">
        <span class="unit">${UNIT_ABBR[u]}</span>
      </div>
    </div>`;
    // in-session hint: only for still-empty upcoming sets, derived from the most
    // recent COMPLETED set above (weight + repsDone), fatigue-discounted by distance.
    if(autoreg && (s.weight == null || s.weight === "")){
      let src = null, gap = 0;
      for(let j = si - 1; j >= 0; j--){
        if(typeof sets[j].weight === "number" && sets[j].repsDone != null){ src = sets[j]; gap = si - j; break; }
      }
      if(src){
        const v = projectLoad(src.weight, src.repsDone, s.reps, equip, u, step, gap);
        if(v != null && v !== src.weight){
          const arrow = v > src.weight ? "↑" : "↓";
          html += `<div class="set-hint">sugerido <b>${v}</b> ${UNIT_ABBR[u]} ${arrow}</div>`;
        }
      }
    }
  });
  html += `</div>`;
  return html;
}
function badgesHTML(b){
  if(!b||!b.length) return "";
  return `<div class="badges">${b.map(x=>`<span class="badge ${x}">${BADGE_LABEL[x]}</span>`).join("")}</div>`;
}

export function skeletonStrip(){
  let h = "";
  for(let i=0;i<5;i++){
    h += `<button class="day-btn" disabled>
      <span class="abbr"><div class="skeleton" style="width:28px;height:14px;margin:0 auto"></div></span>
      <span class="focus"><div class="skeleton" style="width:44px;height:10px;margin:0 auto"></div></span>
    </button>`;
  }
  return h;
}

export function skeletonPanel(n=5){
  let h = `<div class="panel-head"><div>
    <div class="skeleton" style="width:120px;height:20px;margin-bottom:6px"></div>
    <div class="skeleton" style="width:80px;height:12px"></div>
  </div></div>
`;
  for(let i=0;i<n;i++){
    h += `<article class="ex"><div class="ex-header">
      <div class="num"><div class="skeleton" style="width:32px;height:32px;border-radius:8px"></div></div>
      <div class="body">
        <div class="skeleton" style="width:60%;height:14px;margin-bottom:6px"></div>
        <div class="skeleton" style="width:40%;height:10px"></div>
      </div>
    </div>
    <div class="series-table">
      <div class="skeleton" style="width:100%;height:34px;margin-bottom:7px"></div>
      <div class="skeleton" style="width:100%;height:34px;margin-bottom:7px"></div>
      <div class="skeleton" style="width:100%;height:34px"></div>
    </div></article>`;
  }
  return h;
}

// renderDay() replaces $panel.innerHTML, which destroys the element the user is tapping
// next — the tap never lands and the field looks uneditable. Defer one task, then skip the
// rebuild if focus moved to another field inside the panel. State was already written by
// the `input` handler, so nothing is lost; the panel refreshes when focus leaves the table.
export function renderDaySoft(){
  clearTimeout(state._softRenderT);
  state._softRenderT = setTimeout(() => {
    const a = document.activeElement;
    if(a && $panel.contains(a) &&
       (a.classList.contains("weight-input") || a.classList.contains("reps-input"))) return;
    renderDay();
  }, 0);
}

export function renderDay(){
  clearTimeout(state._softRenderT);
  if(!state.session) return;
  $panel.classList.toggle("compact", state.viewMode === "compact");
  const day = activeDays()[state.current];
  const total = day.ex.length;

  if(total === 0){
    if(state.trainMode){ state.trainMode = false; document.body.classList.remove("mode-train"); applyPrevLayoutState(); }
    document.getElementById("dayProgressFill").style.width = "0%";
    document.getElementById("dayProgressPct").textContent = "0%";

    if(state.exercisesCatalog.size === 0){
      $panel.innerHTML = `
        <div class="rest-placeholder">
          <span class="big">Nenhum programa</span>
          Você ainda não tem exercícios cadastrados. Aplique um programa pronto ou adicione seu primeiro exercício.
          <div class="modal-footer" style="justify-content:center">
            <button class="modal-btn primary" id="setupApplyPlanBtn">Aplicar um programa</button>
            <button class="modal-btn secondary" id="setupAddExBtn">Adicionar exercício</button>
          </div>
        </div>`;
      document.getElementById("setupApplyPlanBtn").addEventListener("click", openOnboarding);
      document.getElementById("setupAddExBtn").addEventListener("click", () => openExEditor(null));
      return;
    }

    $panel.innerHTML = `
      <div class="rest-placeholder">
        <span class="big">Descanso</span>
        Nenhum exercício programado para hoje. Aproveite para recuperar!
      </div>`;
    return;
  }

  const completed = countDone();

  const _deloadActive = isDeloadActive();
  const _deload = !_deloadActive && !state.deloadDismissed ? deloadDue() : { due: false };

  // First-session coach-mark: only for a brand-new user (confirmed empty across the
  // FULL account history, not merely today, and not merely the day view's recent
  // window) who hasn't dismissed it or started a workout. An account dormant for
  // longer than RECENT_WINDOW_DAYS also has an empty recent window, so an empty
  // window alone doesn't prove "never trained" — only sessionsLoadedSince === "ALL"
  // does. When the recent window comes back empty, kick off a one-time full fetch
  // (fire-and-forget, non-blocking) to get an authoritative answer: a genuinely new
  // account still has 0 docs, a dormant one gets its history back and the hint stays
  // suppressed on the next render.
  if(!state._firstRunEnsureTried && state.allSessions && state.allSessions.length === 0 && state.sessionsLoadedSince !== "ALL"){
    state._firstRunEnsureTried = true;
    ensureSessionsLoaded("ALL");
  }
  const showFirstRunHint = !state.showProgramReviewHint && !state.trainMode && completed === 0 &&
    !hasSeenTip("firstRun") && state.sessionsLoadedSince === "ALL" && (state.allSessions?.length ?? 0) === 0;

  let head = `
    <div class="panel-head">
      <div class="panel-head-title">
        <div class="focus-tag">${esc(day.focus)}${_deloadActive ? '<span class="deload-tag">Descarga</span>' : ''}</div>
        <button class="day-edit-btn" id="editDayBtn" type="button" title="Editar dia">✎</button>
      </div>
      <div class="progress">
        <span><span class="count">${completed}</span>/${total} concluídos</span>
        <button class="reset" id="resetBtn">Limpar</button>
      </div>
      <button class="train-start ${showFirstRunHint ? 'pulse-hint' : ''}" id="trainStartBtn" type="button">${completed > 0 ? "▶ Retomar treino" : "▶ Iniciar treino"}</button>
    </div>
  `;
  if(showFirstRunHint){
    head += `<div class="first-run-hint" id="firstRunHint">
      <span>Tudo pronto! Toque em <b>Iniciar treino</b> para fazer seu primeiro treino.</span>
      <button class="first-run-hint-close" id="firstRunHintClose" title="Dispensar" type="button">×</button>
    </div>`;
  }
  if(state.showProgramReviewHint){
    head += `<div class="review-hint-card">
      <span class="review-hint-text">Programa aplicado — revisar programa?</span>
      <div class="review-hint-actions">
        <button class="modal-btn primary" id="reviewHintOpen">Revisar</button>
        <button class="ex-icon-btn" id="reviewHintDismiss" title="Dispensar">✕</button>
      </div>
    </div>`;
  }
  let html = "";
  if(_deload.due){
    head += `<div class="deload-card">
      <div class="deload-title">Hora de uma semana de descarga</div>
      <div class="deload-reason">${_deload.reason}. Reduza carga/volume por uma semana para recuperar e voltar a progredir.</div>
      <div class="deload-actions">
        <button class="deload-apply">Aplicar descarga</button>
        <button class="deload-skip">Agora não</button>
      </div>
    </div>`;
  }
  const barPct = setPct();
  document.getElementById("dayProgressFill").style.width = barPct + "%";
  document.getElementById("dayProgressPct").textContent = barPct + "%";

  day.ex.forEach((e, i) => {
    const ex = state.session.exercises[i];
    const isDone = exDone(ex);

    html += `<article class="ex ${isDone?'done':''}" data-i="${i}">`;
    const isSub = !!ex.subName;
    const effectiveName = ex.subName || e.name;
    const prevMain = isSub ? null : prevLoadData(effectiveName, machineFilterActive() ? ex.machine : undefined);
    const sugMain = suggestData(effectiveName, e.unit, false, i);
    html += `<div class="ex-header">
      <div class="num"><span class="n">${i+1}</span></div>
      <div class="body">
        <div class="name"><span class="evo-link" data-evo-i="${i}" data-evo-sup="0" role="button" tabindex="0" title="Ver evolução">${esc(effectiveName)}${ICON_TREND}</span>${isSub?'<span class="sub-tag">trocado</span>':''}${ex.machine?`<span class="machine-tag">${esc(ex.machine)}</span>`:''}${e.grip?`<span class="grip-tag">${esc(GRIP_LABEL[e.grip])}</span>`:''}</div>
        ${!isSub && e.note?`<div class="note">${esc(e.note)}</div>`:""}
      </div>
      <button class="ex-icon-btn machine-btn" data-i="${i}" data-sup="0" title="Indicar máquina (opcional)">🏷</button>
      <button class="ex-icon-btn sub-btn" data-i="${i}" data-sup="0" title="Trocar exercício (só hoje)">⇄</button>
      <button class="unit-toggle" data-ex="${i}" data-sup="0" title="Trocar unidade (KG/LB/Placas)">${UNIT_BTN[e.unit||"kg"]}</button>
    </div>`;
    html += prevBlockHTML(prevMain, sugMain, e.unit, i, false);
    html += seriesHTML(ex.main, i, false, e.unit, effectiveName, prevMain, sugMain);
    html += !isSub ? badgesHTML(e.badges) : "";

    if(e.superset){
      const isSupSub = !!ex.supSubName;
      const supEffName = ex.supSubName || e.superset.name;
      const prevSup = isSupSub ? null : prevLoadData(supEffName, machineFilterActive() ? ex.supMachine : undefined);
      const sugSup = suggestData(supEffName, e.superset.unit, true, i);
      html += `<div class="superset">
        <span class="tag">+ Supersérie</span>
        <div class="sname"><span class="sname-text"><span class="evo-link" data-evo-i="${i}" data-evo-sup="1" role="button" tabindex="0" title="Ver evolução">${esc(supEffName)}${ICON_TREND}</span>${isSupSub?'<span class="sub-tag">trocado</span>':''}${ex.supMachine?`<span class="machine-tag">${esc(ex.supMachine)}</span>`:''}${e.superset.grip?`<span class="grip-tag">${esc(GRIP_LABEL[e.superset.grip])}</span>`:''}</span><button class="ex-icon-btn machine-btn" data-i="${i}" data-sup="1" title="Indicar máquina (opcional)">🏷</button><button class="ex-icon-btn sub-btn" data-i="${i}" data-sup="1" title="Trocar exercício (só hoje)">⇄</button><button class="unit-toggle" data-ex="${i}" data-sup="1" title="Trocar unidade (KG/LB/Placas)">${UNIT_BTN[e.superset.unit||"kg"]}</button></div>
        ${prevBlockHTML(prevSup, sugSup, e.superset.unit, i, true)}`;
      html += seriesHTML(ex.sup, i, true, e.superset.unit, supEffName, prevSup, sugSup);
      html += `</div>`;
    }
    html += `</article>`;
  });

  if(state.trainMode){
    html += trainEndCardHTML(completed, total);
    if(state.trainIdx > total) state.trainIdx = total;
    $panel.innerHTML = `<div class="train-track" id="trainTrack">${html}</div>`;
    attachHandlers();
    renderTrainBar();
    bindTrainTrack();
    restoreTrainScroll();   // must run synchronously, before paint
  } else {
    $panel.innerHTML = head + html;
    attachHandlers();
  }
}

// Single write path for set completion. Stamps doneAt only on the false→true edge, so
// editing weight/reps on an already-completed set never moves the timestamp.
export function setDoneState(set, val){
  if(!set) return;
  const was = !!set.done;
  set.done = !!val;
  if(!val) set.doneAt = null;
  else if(!was || !set.doneAt) set.doneAt = new Date().toISOString();
}

// In-place feedback for a single set row. renderDay() rebuilds the whole panel and would
// destroy the field the user is tapping next, so completion is reflected here; the full
// re-render (hints and placeholders on the other rows) still follows via renderDaySoft().
export function syncSetRow(row, si, set){
  const idx = row.querySelector(`.set-idx[data-si="${si}"]`);
  const grid = idx ? idx.closest(".series-grid") : null;
  if(!grid) return;
  const on = !!set.done;
  grid.classList.toggle("set-done-row", on);
  idx.classList.toggle("done", on);
  idx.textContent = on ? "✓" : (si + 1) + "ª";
  idx.setAttribute("aria-pressed", String(on));
  idx.setAttribute("aria-label", `Série ${si + 1}${on ? " — concluída" : ""}`);
  const chip = grid.querySelector(".chip");
  if(chip) chip.classList.toggle("set-done", on);
  const w = grid.querySelector(".weight-input");
  if(w && w.parentElement){
    const has = set.weight != null && set.weight !== "";
    if(has && w.value === "") w.value = set.weight;
    w.parentElement.classList.toggle("filled", has);
    w.parentElement.classList.toggle("from-sug", has && !!set.fromSug);
    if(has) w.parentElement.classList.remove("sug-ph");
  }
}

// The load currently shown for this set, in precedence order:
//   1. the suggestion echoed in the weight placeholder (.load-cell.sug-ph)
//   2. the SUGESTÃO row of the reference panel (panel layout)
//   3. the in-session autoreg hint under the row (.set-hint)
// Read from the DOM on purpose: suggestData() switches off once any set in the block has a
// weight, so re-deriving it would let only the first completed set adopt anything.
export function displayedLoadFor(row, si){
  const idx = row.querySelector(`.set-idx[data-si="${si}"]`);
  const grid = idx ? idx.closest(".series-grid") : null;
  if(!grid) return null;
  const num = t => { const v = parseFloat(String(t).replace(",", ".")); return isNaN(v) ? null : v; };

  const cell = grid.querySelector(".load-cell");
  if(cell && cell.classList.contains("sug-ph")){
    const inp = cell.querySelector(".weight-input");
    const v = inp ? num(inp.placeholder) : null;
    if(v != null) return v;
  }

  const block = row.previousElementSibling;
  if(block && block.classList.contains("prev-block")){
    const vals = block.querySelectorAll(".pp-sug .pp-val");
    if(vals[si]){ const v = num(vals[si].textContent); if(v != null) return v; }
  }

  const hint = grid.nextElementSibling;
  if(hint && hint.classList.contains("set-hint")){
    const b = hint.querySelector("b");
    if(b){ const v = num(b.textContent); if(v != null) return v; }
  }
  return null;
}

// Completing a set with no typed load adopts the load on screen, and remembers that the
// number came from a suggestion rather than from the user.
export function adoptSuggestedLoad(row, si, set){
  if(!set || (set.weight != null && set.weight !== "")) return;
  const v = displayedLoadFor(row, si);
  if(v == null) return;
  set.weight = v;
  set.fromSug = true;
}

export function markExecStart(ei){ const ex = state.session.exercises[ei]; if(ex && !ex.firstSetAt){ ex.firstSetAt = new Date().toISOString(); } }

function attachHandlers(){
  $panel.querySelectorAll(".series-table").forEach(row => {
    const ei = +row.dataset.ex;
    const isSup = !!row.dataset.sup;
    const target = () => isSup ? state.session.exercises[ei].sup : state.session.exercises[ei].main;

    row.querySelectorAll(".chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const si = +btn.dataset.si;
        const toggling = !target()[si].done;
        setDoneState(target()[si], toggling);
        if(toggling) markExecStart(ei);
        scheduleSave(); renderDay(); renderStrip();
      });
    });
    row.querySelectorAll(".set-idx").forEach(btn => {
      btn.addEventListener("click", () => {
        const si = +btn.dataset.si;
        const set = target()[si];
        const period = document.body.classList.contains("flag-periodization");
        const turningOn = !set.done;
        if (turningOn) adoptSuggestedLoad(row, si, set);
        setDoneState(set, turningOn);
        if (turningOn) {
          if (period && (set.repsDone == null || set.repsDone === "")) set.repsDone = set.reps;
          markExecStart(ei);
        } else if (period && set.repsDone === set.reps) {
          set.repsDone = null;
        }
        scheduleSave(); renderDay(); renderStrip();
      });
    });
    row.querySelectorAll(".weight-input").forEach(inp => {
      inp.addEventListener("input", () => {
        const si = +inp.dataset.si;
        const v = inp.value.replace(",", ".").trim();
        target()[si].weight = v === "" ? null : (isNaN(parseFloat(v)) ? target()[si].weight : parseFloat(v));
        target()[si].fromSug = false;
        inp.parentElement.classList.toggle("filled", v !== "");
        inp.parentElement.classList.remove("from-sug");
        if(v !== "") markExecStart(ei);
        scheduleSave();
      });
      inp.addEventListener("change", () => { renderDaySoft(); });
    });
    row.querySelectorAll(".reps-input").forEach(inp => {
      inp.addEventListener("input", () => {
        const si = +inp.dataset.si;
        const v = inp.value.trim();
        target()[si].repsDone = v === "" ? null : (isNaN(parseInt(v, 10)) ? target()[si].repsDone : parseInt(v, 10));
        if(v !== "") markExecStart(ei);
        scheduleSave();
      });
      inp.addEventListener("change", () => {
        const si = +inp.dataset.si;
        const set = target()[si];
        const on = set.repsDone != null;
        if(on) adoptSuggestedLoad(row, si, set);
        setDoneState(set, on);
        scheduleSave();
        syncSetRow(row, si, set);
        renderStrip(); renderTrainBar();
        renderDaySoft();
      });
    });
  });

  $panel.querySelectorAll(".unit-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ei = +btn.dataset.ex;
      const isSup = btn.dataset.sup === "1";
      const id = activeDays()[state.current].ex[ei]._id;
      const exDoc = state.exercisesCatalog.get(id);
      if(!exDoc) return;
      const cur = isSup ? (exDoc.superset && exDoc.superset.unit || "kg") : (exDoc.unit || "kg");
      const next = UNIT_CYCLE[(UNIT_CYCLE.indexOf(cur) + 1) % 3];
      if(isSup){
        exDoc.superset.unit = next;
        await window._saveExerciseDoc(id, {superset: {unit: next}});
      } else {
        exDoc.unit = next;
        await window._saveExerciseDoc(id, {unit: next});
      }
      window._rebuildUserDays(); renderDay();
    });
  });

  $panel.querySelectorAll(".suggest-apply").forEach(btn => {
    btn.addEventListener("click", () => {
      const ei = +btn.dataset.ex;
      const isSup = btn.dataset.sup === "1";
      const e = activeDays()[state.current].ex[ei];
      const ex = state.session.exercises[ei];
      const name = isSup ? (ex.supSubName || e.superset.name) : (ex.subName || e.name);
      const unit = isSup ? (e.superset.unit || "kg") : (e.unit || "kg");
      const machine = machineFilterActive() ? (isSup ? ex.supMachine : ex.machine) : undefined;
      const muscle = isSup ? (ex.supSubMuscle || (e.superset && e.superset.muscle) || e.muscle) : (ex.subMuscle || e.muscle);
      const result = suggestLoads(name, unit, machine, {muscle});
      if(!result) return;
      const sets = isSup ? state.session.exercises[ei].sup : state.session.exercises[ei].main;
      result.loads.forEach((v, si) => {
        if(v != null && sets[si]) sets[si].weight = v;
      });
      scheduleSave(); renderDay(); renderStrip();
    });
  });

  $panel.querySelectorAll(".evo-link").forEach(el => {
    const go = () => {
      const i = +el.dataset.evoI;
      const isSup = el.dataset.evoSup === "1";
      const ex = state.session.exercises[i];
      const e = activeDays()[state.current]?.ex[i];
      if(!ex || !e) return;
      const name = isSup ? (ex.supSubName || e.superset?.name) : (ex.subName || e.name);
      const machine = isSup ? ex.supMachine : ex.machine;
      if(name) openEvolucaoFor(name, machine);
    };
    el.addEventListener("click", go);
    el.addEventListener("keydown", ev => {
      if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); go(); }
    });
  });

  $panel.querySelectorAll(".sub-btn").forEach(btn => {
    btn.addEventListener("click", () => openSubModal(+btn.dataset.i, btn.dataset.sup === "1"));
  });

  $panel.querySelectorAll(".machine-btn").forEach(btn => {
    btn.addEventListener("click", () => openMachineModal(+btn.dataset.i, btn.dataset.sup === "1"));
  });

  const $reset = document.getElementById("resetBtn");
  if($reset) $reset.addEventListener("click", () => {
    if(!confirm("Limpar séries e cargas deste dia?")) return;
    state.session = emptySession(state.current);
    scheduleSave(); renderDay(); renderStrip();
  });

  const $skipBtn = $panel.querySelector(".deload-skip");
  if($skipBtn) $skipBtn.addEventListener("click", () => { state.deloadDismissed = true; renderDay(); });

  const $applyBtn = $panel.querySelector(".deload-apply");
  if($applyBtn) $applyBtn.addEventListener("click", async () => {
    const day = activeDays()[state.current];
    day.ex.forEach((e, ei) => {
      const ex = state.session.exercises[ei];
      const applyDeload = (sets, name, unit, machine) => {
        if(!sets) return;
        const u = unit || "kg";
        const step = UNIT_STEP[u] || 2.5;
        const hist = exerciseTopHistory(name, null, machine);
        if(!hist.length) return;
        const lastEntry = hist[hist.length - 1];
        // find the session's per-set weights for this exercise variant.
        // allSessions is newest-first, so a forward scan hits the most recent
        // matching session first when the date is shared by more than one.
        let refSets = null;
        for(let k = 0; k < state.allSessions.length; k++){
          const sess = state.allSessions[k];
          if(sess.date !== lastEntry.date || !sess.exercises) continue;
          for(const entry of sess.exercises){
            if((entry.subName || entry.name) === name && matchVariant(entry.machine, machine) && entry.main) refSets = entry.main;
            else if((entry.supSubName || entry.supName) === name && matchVariant(entry.supMachine, machine) && entry.sup) refSets = entry.sup;
            if(refSets) break;
          }
          if(refSets) break;
        }
        sets.forEach((s, si) => {
          const ref = refSets && refSets[si] && typeof refSets[si].weight === "number" ? refSets[si].weight : null;
          if(ref == null) return;
          const deloaded = ref * DELOAD_FACTOR;
          const rounded = Math.round(deloaded / step) * step;
          s.weight = u === "placas" ? Math.round(rounded) : rounded;
        });
      };
      const mainName = ex.subName || e.name;
      const mainMachine = machineFilterActive() ? ex.machine : undefined;
      const supMachine = machineFilterActive() ? ex.supMachine : undefined;
      applyDeload(ex.main, mainName, e.unit, mainMachine);
      if(e.superset && ex.sup) applyDeload(ex.sup, ex.supSubName || e.superset.name, e.superset.unit, supMachine);
    });
    const today = formatDate(new Date());
    state.lastDeloadDate = today;
    await saveDeloadDate();
    scheduleSave(); renderDay(); renderStrip();
  });

  const $ts = document.getElementById("trainStartBtn");
  if($ts) $ts.addEventListener("click", () => {
    // Starting the first session retires the hint immediately, so it can't
    // flicker back before the first set is saved.
    markTipSeen("firstRun");
    enterTrainMode();
  });
  const $tf = document.getElementById("trainFinish");
  if($tf) $tf.addEventListener("click", exitTrainMode);

  const $firstRunHintClose = document.getElementById("firstRunHintClose");
  if($firstRunHintClose) $firstRunHintClose.addEventListener("click", () => {
    markTipSeen("firstRun");
    renderDay();
  });

  const $editDayBtn = document.getElementById("editDayBtn");
  if($editDayBtn) $editDayBtn.addEventListener("click", () => openDayQuickEdit(state.current));

  const $reviewOpen = document.getElementById("reviewHintOpen");
  if($reviewOpen) $reviewOpen.addEventListener("click", () => {
    state.showProgramReviewHint = false;
    renderDay();
    openDayQuickEdit(state.current);
  });
  const $reviewDismiss = document.getElementById("reviewHintDismiss");
  if($reviewDismiss) $reviewDismiss.addEventListener("click", () => {
    state.showProgramReviewHint = false;
    renderDay();
  });
}

export function renderStrip(){
  $strip.innerHTML = activeDays().map((d,i) => {
    const isToday = state.weekOffset === 0 && i === todayIdx;
    const isRest = d.ex.length === 0;
    return `
      <button class="day-btn ${isToday?'is-today':''} ${isRest?'rest':''}"
              role="tab" aria-selected="${i===state.current}" data-i="${i}">
        <span class="abbr">${d.abbr}</span>
        <span class="focus">${isRest ? 'Descanso' : esc(d.tag || d.focus.split('·')[0].trim())}</span>
        <span class="today">Hoje</span>
        <span class="dot"></span>
      </button>`;
  }).join("");

  $strip.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      state.current = +btn.dataset.i;
      state.showProgramReviewHint = false;
      renderStrip();
      $panel.innerHTML = skeletonPanel();
      await loadDay(state.current);
      renderStrip();
      btn.scrollIntoView({inline:"center",block:"nearest",behavior:"smooth"});
    });
  });

  updateWeekLabel();
  centerActiveDay();
}

export function updateWeekLabel(){
  if(state.weekOffset === 0){
    $weekLabel.textContent = "Semana atual";
  } else {
    const mon = getWeekMonday(state.weekOffset);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const monDay = mon.getDate();
    const sunDay = sun.getDate();
    const sunMonth = months[sun.getMonth()];
    if(mon.getMonth() === sun.getMonth()){
      $weekLabel.textContent = `${monDay} – ${sunDay} ${sunMonth}`;
    } else {
      const monMonth = months[mon.getMonth()];
      $weekLabel.textContent = `${monDay} ${monMonth} – ${sunDay} ${sunMonth}`;
    }
  }
  $weekNext.disabled = state.weekOffset >= 0;
}

export function init(){
  state.current = todayIdx;

  $weekPrev.addEventListener("click", async () => {
    state.weekOffset--;
    renderStrip();
    $panel.innerHTML = skeletonPanel();
    await loadDay(state.current);
    renderStrip();
  });

  $weekNext.addEventListener("click", async () => {
    if(state.weekOffset >= 0) return;
    state.weekOffset++;
    renderStrip();
    $panel.innerHTML = skeletonPanel();
    await loadDay(state.current);
    renderStrip();
  });

  // iOS: fixed panel + soft keyboard can hide the focused field. Re-center it inside the card.
  $panel.addEventListener("focusin", e => {
    if(!state.trainMode) return;
    const t = e.target;
    if(!t.matches || !t.matches(".weight-input, .reps-input")) return;
    setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 260);
  });
}
