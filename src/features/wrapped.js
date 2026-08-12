import { esc } from "../domain/text.js";
import { fmtDateBR } from "../domain/dates.js";
import { state } from "../core/state.js";
import { $gamifModal, $wrappedOverlay, $wrappedSlides, $wrappedProgress, $wrappedYearPills } from "../core/dom.js";
import { computeWrapped } from "../core/adapters.js";
import { ensureSessionsLoaded } from "./day/session-io.js";

function wrappedCapitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

function getWrappedYears(){
  if(!state.allSessions || !state.allSessions.length) return [];
  const years = new Set();
  for(const s of state.allSessions){ if(s.date) years.add(s.date.slice(0,4)); }
  return [...years].sort().reverse();
}

function buildWrappedSlides(data){
  if(!data){
    $wrappedSlides.innerHTML = '<div class="wrapped-card active"><div class="wrapped-empty">Nenhum treino registrado neste ano.</div></div>';
    state._wrappedTotal = 1; state._wrappedCurrent = 0;
    $wrappedProgress.innerHTML = '<div class="wrapped-progress-seg filled"></div>';
    return;
  }
  const slides = [];

  // S1: Seu ano de treino
  slides.push(`<div class="wrapped-card">
    <div class="wrapped-big-label">Seu ano de treino</div>
    <div class="wrapped-stat-row">
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.sessionsCount.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Treinos</span></div>
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.trainedDates.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Dias</span></div>
    </div>
    <div class="wrapped-stat-row">
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.totalVolume.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">kg levantados</span></div>
    </div>
    <div class="wrapped-stat-row">
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.totalSets.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Séries</span></div>
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.totalReps.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Repetições</span></div>
    </div>
  </div>`);

  // S2: Grupo mais treinado
  if(data.topMuscle){
    slides.push(`<div class="wrapped-card">
      <div class="wrapped-big-label">Grupo mais treinado</div>
      <div class="wrapped-big-num" style="font-size:36px">${esc(wrappedCapitalize(data.topMuscle))}</div>
      <div class="wrapped-stat-row" style="margin-top:16px">
        <div class="wrapped-stat"><span class="wrapped-stat-val">${data.topMuscleSets.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Séries</span></div>
        <div class="wrapped-stat"><span class="wrapped-stat-val">${data.topMuscleReps.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Repetições</span></div>
      </div>
    </div>`);
  }

  // S3: Maior carga do ano (skip if no valid weight)
  if(data.heaviest){
    slides.push(`<div class="wrapped-card">
      <div class="wrapped-big-label">Maior carga do ano</div>
      <div class="wrapped-big-num">${data.heaviest.weight.toLocaleString("pt-BR")} kg</div>
      <div class="wrapped-detail"><strong>${esc(data.heaviest.exercise)}</strong></div>
      <div class="wrapped-detail">${fmtDateBR(data.heaviest.date)}</div>
    </div>`);
  }

  // S4: Maior evolução (skip if null)
  if(data.mostProgressed){
    const mp = data.mostProgressed;
    slides.push(`<div class="wrapped-card">
      <div class="wrapped-big-label">Maior evolução</div>
      <div class="wrapped-detail" style="font-size:16px;margin-bottom:12px"><strong>${esc(mp.exercise)}</strong></div>
      <div class="wrapped-detail" style="font-size:18px">de <strong>${mp.from.toLocaleString("pt-BR")} kg</strong> → <strong>${mp.to.toLocaleString("pt-BR")} kg</strong></div>
      <div class="wrapped-big-num" style="font-size:48px;margin-top:8px">+${mp.delta.toLocaleString("pt-BR")} kg</div>
    </div>`);
  }

  // S5: Repetições por grupo + top exercícios
  {
    const top6 = data.repsByMuscle.slice(0,6);
    let rankHtml = '';
    top6.forEach((m,i) => {
      rankHtml += `<div class="wrapped-rank-item"><span class="wrapped-rank-pos">${i+1}</span><span class="wrapped-rank-name">${esc(wrappedCapitalize(m.muscle))}</span><span class="wrapped-rank-val">${m.reps.toLocaleString("pt-BR")} reps</span></div>`;
    });
    let topExHtml = '';
    data.topExercisesByReps.forEach((e,i) => {
      topExHtml += `<div class="wrapped-rank-item"><span class="wrapped-rank-pos">${i+1}</span><span class="wrapped-rank-name">${esc(e.name)}</span><span class="wrapped-rank-val">${e.reps.toLocaleString("pt-BR")} reps</span></div>`;
    });
    slides.push(`<div class="wrapped-card">
      <div class="wrapped-big-label">Repetições por grupo</div>
      <div class="wrapped-rank-list">${rankHtml}</div>
      ${topExHtml ? `<div class="wrapped-section-title">Top exercícios</div><div class="wrapped-rank-list">${topExHtml}</div>` : ""}
    </div>`);
  }

  state._wrappedTotal = slides.length;
  state._wrappedCurrent = 0;
  $wrappedSlides.innerHTML = slides.join("");
  // Progress segments
  $wrappedProgress.innerHTML = slides.map(() => '<div class="wrapped-progress-seg"></div>').join("");
  updateWrappedSlide();
}

function updateWrappedSlide(){
  const cards = $wrappedSlides.querySelectorAll(".wrapped-card");
  cards.forEach((c,i) => c.classList.toggle("active", i === state._wrappedCurrent));
  const segs = $wrappedProgress.querySelectorAll(".wrapped-progress-seg");
  segs.forEach((s,i) => s.classList.toggle("filled", i <= state._wrappedCurrent));
}

export async function openWrapped(){
  await ensureSessionsLoaded("ALL");
  if(!state.allSessions || !state.allSessions.length) return;
  const years = getWrappedYears();
  if(!years.length) return;
  // Find most recent year with data
  let bestYear = years[0];
  for(const y of years){
    const d = computeWrapped(state.allSessions, y);
    if(d){ bestYear = y; break; }
  }
  // Render year pills
  if(years.length > 1){
    $wrappedYearPills.innerHTML = years.map(y => `<button type="button" class="wrapped-year-pill${y===bestYear?" active":""}" data-year="${y}">${y}</button>`).join("");
    $wrappedYearPills.style.display = "";
    $wrappedYearPills.querySelectorAll(".wrapped-year-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        const yr = btn.dataset.year;
        $wrappedYearPills.querySelectorAll(".wrapped-year-pill").forEach(b => b.classList.toggle("active", b.dataset.year === yr));
        buildWrappedSlides(computeWrapped(state.allSessions, yr));
      });
    });
  } else {
    $wrappedYearPills.innerHTML = "";
    $wrappedYearPills.style.display = "none";
  }
  buildWrappedSlides(computeWrapped(state.allSessions, bestYear));
  $wrappedOverlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

export function closeWrapped(){
  $wrappedOverlay.classList.remove("open");
  document.body.style.overflow = "";
}

export function init(){
  document.getElementById("wrappedOpenBtn").addEventListener("click", () => {
    $gamifModal.classList.remove("open");
    openWrapped();
  });
  document.getElementById("wrappedCloseBtn").addEventListener("click", closeWrapped);

  // Tap navigation: right half → next, left half → prev
  $wrappedSlides.addEventListener("click", e => {
    if(e.target.closest(".wrapped-close") || e.target.closest(".wrapped-year-pill")) return;
    const rect = $wrappedSlides.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if(x > rect.width / 2){
      if(state._wrappedCurrent < state._wrappedTotal - 1){ state._wrappedCurrent++; updateWrappedSlide(); }
    } else {
      if(state._wrappedCurrent > 0){ state._wrappedCurrent--; updateWrappedSlide(); }
    }
  });
}
