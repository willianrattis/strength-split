import { esc } from "../../domain/text.js";
import { dayCounts, historicPace, livePace, blendedPace, estimateMs, remainingMs, etaAt } from "../../domain/day-plan.js";
import { state } from "../../core/state.js";
import { activeDays } from "../../core/adapters.js";
import { todayWeekdayIdx } from "../../domain/dates.js";
import { trainSummary, summaryStatsHTML, fmtDur } from "../train/summary.js";
import { ensureSessionsLoaded } from "./session-io.js";

function fmtClock(d){
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Same rule updateTrainFab() uses for "done" — the card and the FAB must never disagree.
export function dayState(counts){
  if(counts.doneEx >= counts.exCount) return "done";
  if(counts.doneSets > 0) return "running";
  return "ready";
}

// Shared with tickStateCard() — the builders and the tick must never compute the
// pace/estimate differently, or the text the tick writes could drift from what a
// full renderDay() would have shown.
function readyEstimate(counts){
  const pace = historicPace(state.allSessions || [], state.session.dayKey);
  return estimateMs(counts.setCount, pace);
}
function runningRemain(counts){
  const historic = historicPace(state.allSessions || [], state.session.dayKey);
  const pace = blendedPace(historic, livePace(state.session));
  return remainingMs(counts, pace);
}

function readyBodyHTML(day, counts, isToday){
  const estimate = readyEstimate(counts);
  let h = `<div class="sc-stats">
    <span>${counts.exCount} exercícios</span>
    <span>${counts.setCount} séries</span>
    ${estimate != null ? `<span>~${fmtDur(estimate, false)} estimado</span>` : ""}
  </div>`;
  if(isToday && estimate != null){
    const eta = etaAt(Date.now(), estimate);
    if(eta) h += `<div class="sc-eta">termina ~<span id="scEta">${fmtClock(eta)}</span></div>`;
  }
  return h;
}

function runningBodyHTML(day, counts, isToday){
  const remain = runningRemain(counts);

  let line = `<b>${counts.doneEx}</b> de ${counts.exCount} exercícios`;
  if(remain != null){
    line += ` · faltam ~<span id="scRemain">${fmtDur(remain, false)}</span>`;
    if(isToday){
      const eta = etaAt(Date.now(), remain);
      if(eta) line += ` · termina ~<span id="scEta">${fmtClock(eta)}</span>`;
    }
  }

  return `<div class="sc-bottom">
    <span class="sc-count">${line}</span>
    <span class="sc-cta">Continuar ▸</span>
  </div>`;
}

function doneBodyHTML(day, counts){
  const sum = trainSummary();
  return sum ? summaryStatsHTML(sum) : readyBodyHTML(day, counts, false);
}

function stateCardBodyHTML(day, counts, st, isToday){
  const badgeOrEdit = st === "ready"
    ? `<button class="day-edit-btn" id="editDayBtn" type="button" title="Editar dia">✎</button>`
    : st === "running"
      ? `<span class="sc-badge">● em andamento</span>`
      : `<span class="sc-badge">✓ concluído</span>`;

  const body = st === "ready" ? readyBodyHTML(day, counts, isToday)
    : st === "running" ? runningBodyHTML(day, counts, isToday)
    : doneBodyHTML(day, counts);

  return `<div class="sc-top">
      <span class="sc-focus">${esc(day.focus)}</span>
      ${badgeOrEdit}
    </div>
    ${body}`;
}

export function dayStateCardHTML(day, isToday){
  const counts = dayCounts(day, state.session);
  const st = dayState(counts);
  const cls = st === "running" ? "is-running" : st === "done" ? "is-done" : "";
  return `<div class="state-card ${cls}" id="dayStateCard">${stateCardBodyHTML(day, counts, st, isToday)}</div>`;
}

function currentCardClass(card){
  if(card.classList.contains("is-running")) return "is-running";
  if(card.classList.contains("is-done")) return "is-done";
  return "";
}

// Rewrites #scEta/#scRemain in place — never rebuilds the card. A renderDay() on a
// timer would tear the DOM out from under the user's finger, which is exactly what
// renderDaySoft()'s focus guard exists to prevent elsewhere; this is the read-only
// equivalent for text that would otherwise go stale while the user just sits on the
// day screen. If the day's state has moved on (ready/running/done) since this card
// was rendered, do nothing here — that transition belongs to the next renderDay().
export function tickStateCard(){
  const card = document.getElementById("dayStateCard");
  if(!card || state.trainMode || !state.session) return;
  const day = activeDays()[state.current];
  if(!day) return;
  const counts = dayCounts(day, state.session);
  const st = dayState(counts);
  const expectedCls = st === "running" ? "is-running" : st === "done" ? "is-done" : "";
  if(currentCardClass(card) !== expectedCls) return;
  const isToday = state.weekOffset === 0 && state.current === todayWeekdayIdx();

  if(st === "ready"){
    if(!isToday) return;
    const $eta = document.getElementById("scEta");
    if(!$eta) return;
    const estimate = readyEstimate(counts);
    const eta = estimate != null ? etaAt(Date.now(), estimate) : null;
    if(eta) $eta.textContent = fmtClock(eta);
  } else if(st === "running"){
    const remain = runningRemain(counts);
    if(remain == null) return;
    const $rem = document.getElementById("scRemain");
    if($rem) $rem.textContent = fmtDur(remain, false);
    if(isToday){
      const $eta = document.getElementById("scEta");
      const eta = etaAt(Date.now(), remain);
      if($eta && eta) $eta.textContent = fmtClock(eta);
    }
  }
}

let _tickT = null;
export function startStateCardTick(){
  stopStateCardTick();
  _tickT = setInterval(tickStateCard, 60000);
}
export function stopStateCardTick(){ if(_tickT){ clearInterval(_tickT); _tickT = null; } }

// Covers the pocket case: on resume the value corrects immediately instead of up to
// 60s later. Registered once, at module scope — tickStateCard() itself is always
// safe to call (no-ops without a card, in train mode, or without a session).
document.addEventListener("visibilitychange", () => { if(!document.hidden) tickStateCard(); });

export function bindStateCard(){
  const card = document.getElementById("dayStateCard");
  if(!card) return;
  if(card.classList.contains("is-running")){
    card.addEventListener("click", () => { if(window._enterTrainMode) window._enterTrainMode(); });
  }
  startStateCardTick();
}

// Mirrors refreshTrainEndCard: the "done" body's PR block needs the FULL account
// history (trainSummary → bestWeightEver), which the day view's recent window doesn't
// carry. Re-renders in place once ensureSessionsLoaded("ALL") resolves.
export async function refreshDayStateCard(){
  if(state.trainMode || !state.session) return;
  await ensureSessionsLoaded("ALL");
  if(state.trainMode || !state.session) return;
  const card = document.getElementById("dayStateCard");
  if(!card) return;
  const day = activeDays()[state.current];
  if(!day) return;
  const counts = dayCounts(day, state.session);
  if(dayState(counts) !== "done") return;
  const isToday = state.weekOffset === 0 && state.current === todayWeekdayIdx();
  card.innerHTML = stateCardBodyHTML(day, counts, "done", isToday);
}
