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

function readyBodyHTML(day, counts, isToday){
  const pace = historicPace(state.allSessions || [], state.session.dayKey);
  const estimate = estimateMs(counts.setCount, pace);
  let h = `<div class="sc-stats">
    <span>${counts.exCount} exercícios</span>
    <span>${counts.setCount} séries</span>
    ${estimate != null ? `<span>~${fmtDur(estimate, false)} estimado</span>` : ""}
  </div>`;
  if(isToday && estimate != null){
    h += `<div class="sc-eta">termina ~${fmtClock(etaAt(new Date(), estimate))}</div>`;
  }
  return h;
}

function runningBodyHTML(day, counts, isToday){
  const historic = historicPace(state.allSessions || [], state.session.dayKey);
  const pace = blendedPace(historic, livePace(state.session));
  const remain = remainingMs(counts, pace);

  let line = `<b>${counts.doneEx}</b> de ${counts.exCount} exercícios`;
  if(remain != null){
    line += ` · faltam ~${fmtDur(remain, false)}`;
    if(isToday) line += ` · termina ~${fmtClock(etaAt(new Date(), remain))}`;
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

export function bindStateCard(){
  const card = document.getElementById("dayStateCard");
  if(card && card.classList.contains("is-running")){
    card.addEventListener("click", () => { if(window._enterTrainMode) window._enterTrainMode(); });
  }
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
