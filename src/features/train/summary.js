import { esc } from "../../domain/text.js";
import { UNIT_ABBR } from "../../domain/units.js";
import { GAP_MIN_MS, GAP_MAX_MS } from "../../core/config.js";
import { state } from "../../core/state.js";
import { activeDays, machineFilterActive, bestWeightEver } from "../../core/adapters.js";
import { countDone } from "../day/render.js";
import { trainExCount, exitTrainMode } from "./index.js";

const LB_TO_KG = 0.45359237;

function fmtDur(ms, withSecs){
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if(h) return `${h}h${String(m).padStart(2,"0")}`;
  if(m) return withSecs ? `${m}min${String(s).padStart(2,"0")}` : `${m}min`;
  return `${s}s`;
}
function fmtNum(v){ return (Math.round(v * 10) / 10).toLocaleString("pt-BR"); }
function fmtKg(v){ return Math.round(v).toLocaleString("pt-BR"); }

// Returns null when there is not enough data to say anything.
function trainSummary(){
  if(!state.session) return null;
  const day = activeDays()[state.current];
  const evts = [];
  let volKg = 0, volSkipped = 0, doneSets = 0;
  const prs = [];

  state.session.exercises.forEach((ex, i) => {
    const e = day.ex[i];
    if(!e) return;
    const blocks = [{
      sets: ex.main || [], sup: false, unit: e.unit || "kg",
      name: ex.subName || e.name,
      machine: machineFilterActive() ? ex.machine : undefined
    }];
    if(ex.sup && e.superset) blocks.push({
      sets: ex.sup, sup: true, unit: e.superset.unit || "kg",
      name: ex.supSubName || e.superset.name,
      machine: machineFilterActive() ? ex.supMachine : undefined
    });

    blocks.forEach(b => {
      let topW = null;
      b.sets.forEach(s => {
        if(!s || !s.done) return;
        doneSets++;
        if(s.doneAt){ const t = Date.parse(s.doneAt); if(!isNaN(t)) evts.push({t, ex:i, sup:b.sup}); }
        const w = typeof s.weight === "number" ? s.weight : null;
        const r = typeof s.repsDone === "number" ? s.repsDone : null;
        if(w != null && r != null){
          // "placas" is not a mass unit — it cannot enter a tonnage sum.
          if(b.unit === "kg") volKg += w * r;
          else if(b.unit === "lb") volKg += w * LB_TO_KG * r;
          else volSkipped++;
        }
        if(w != null && b.unit !== "placas" && (topW == null || w > topW)) topW = w;
      });
      if(topW != null){
        const prev = bestWeightEver(b.name, b.machine);
        if(prev != null && topW > prev) prs.push({ name: b.name, weight: topW, unit: b.unit, prev });
      }
    });
  });

  if(!evts.length) return null;
  evts.sort((a, b) => a.t - b.t);

  // Start = earliest firstSetAt (stamped on the first keystroke, before any set completes).
  let startT = null;
  state.session.exercises.forEach(ex => {
    if(!ex.firstSetAt) return;
    const t = Date.parse(ex.firstSetAt);
    if(!isNaN(t) && (startT == null || t < startT)) startT = t;
  });
  if(startT == null || startT > evts[0].t) startT = evts[0].t;
  const totalMs = Math.max(0, evts[evts.length - 1].t - startT);

  // Consecutive completions. Superset-internal transitions carry no rest by design.
  const gaps = [];
  for(let k = 1; k < evts.length; k++){
    const a = evts[k-1], b = evts[k];
    if(a.ex === b.ex && a.sup !== b.sup) continue;
    const d = b.t - a.t;
    if(d >= GAP_MIN_MS && d <= GAP_MAX_MS) gaps.push(d);
  }
  // Median, not mean: one bathroom break would dominate a mean.
  let gapMs = null;
  if(gaps.length >= 3){
    gaps.sort((x, y) => x - y);
    const mid = gaps.length >> 1;
    gapMs = gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid-1] + gaps[mid]) / 2);
  }

  const mins = totalMs / 60000;
  const density = (volKg > 0 && mins >= 1) ? volKg / mins : null;

  return { totalMs, gapMs, gapN: gaps.length, volKg, volSkipped, density, doneSets, prs };
}

function trainEndInnerHTML(done, total){
  const all = done >= total;
  const sum = trainSummary();

  if(!sum){
    return `<div class="train-end-inner">
      <span class="train-end-big">${done}/${total} exercícios</span>
      <p class="train-end-sub">Ainda faltam exercícios — deslize de volta ou toque na barra para escolher.</p>
      <button class="train-end-btn" id="trainFinish" type="button">Voltar à lista</button>
    </div>`;
  }

  let h = `<div class="train-end-inner">`;
  h += `<span class="train-end-big">${all ? "Treino concluído" : done + "/" + total + " exercícios"}</span>`;

  h += `<div class="ts-grid">`;
  h += `<div class="ts-tile">
    <span class="ts-val">${fmtDur(sum.totalMs, false)}</span>
    <span class="ts-lbl">Tempo total</span>
  </div>`;
  h += `<div class="ts-tile">
    <span class="ts-val">${sum.gapMs != null ? fmtDur(sum.gapMs, true) : "—"}</span>
    <span class="ts-lbl">Intervalo entre séries</span>
    <span class="ts-sub">${sum.gapMs != null ? "mediana de " + sum.gapN : "poucos dados"}</span>
  </div>`;
  if(sum.density != null){
    const skipped = sum.volSkipped
      ? ` · ${sum.volSkipped} série${sum.volSkipped > 1 ? "s" : ""} em placas fora da conta`
      : "";
    h += `<div class="ts-tile ts-wide">
      <span class="ts-val">${fmtKg(sum.density)}<em>kg/min</em></span>
      <span class="ts-lbl">Densidade</span>
      <span class="ts-sub">${fmtKg(sum.volKg)} kg em ${fmtDur(sum.totalMs, false)}${skipped}</span>
    </div>`;
  }
  h += `</div>`;

  if(sum.prs.length){
    h += `<div class="ts-prs"><span class="ts-prs-title">${sum.prs.length === 1 ? "1 recorde" : sum.prs.length + " recordes"}</span>`;
    sum.prs.slice(0, 4).forEach(p => {
      h += `<div class="ts-pr">
        <span class="ts-pr-name">${esc(p.name)}</span>
        <span class="ts-pr-w">${fmtNum(p.weight)} ${UNIT_ABBR[p.unit] || "kg"}<em> · antes ${fmtNum(p.prev)}</em></span>
      </div>`;
    });
    h += `</div>`;
  }

  if(!all) h += `<p class="train-end-sub">Faltam ${total - done} exercício${total - done > 1 ? "s" : ""}.</p>`;
  h += `<button class="train-end-btn" id="trainFinish" type="button">${all ? "Concluir" : "Voltar à lista"}</button>`;
  h += `</div>`;
  return h;
}

// Placeholder while the user is still on an exercise card — the summary scans allSessions,
// which is too expensive to recompute on every renderDay().
export function trainEndCardHTML(done, total){
  const body = (state.trainIdx >= total)
    ? trainEndInnerHTML(done, total)
    : `<div class="train-end-inner"><span class="train-end-big">Resumo</span></div>`;
  return `<article class="ex train-end" data-i="end">${body}</article>`;
}

// Targeted refresh when the carousel lands on the terminal card. Avoids a full renderDay(),
// which would rebuild the track and disturb the in-flight scroll.
export function refreshTrainEndCard(){
  if(!state.trainMode || !state.session) return;
  const card = document.querySelector(".train-track > .train-end");
  if(!card) return;
  card.innerHTML = trainEndInnerHTML(countDone(), trainExCount());
  const $tf = document.getElementById("trainFinish");
  if($tf) $tf.addEventListener("click", exitTrainMode);
}
