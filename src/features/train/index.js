import { state } from "../../core/state.js";
import { $panel, $trainSegs, $trainCount, $trainFocus } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { applyPrevLayoutState } from "../settings.js";
import { exDone, renderDay } from "../day/render.js";
import { ensureSessionsLoaded } from "../day/session-io.js";
import { refreshTrainEndCard } from "./summary.js";

export function trainExCount(){ return activeDays()[state.current].ex.length; }

export function firstIncompleteIdx(){
  if(!state.session) return 0;
  const i = state.session.exercises.findIndex(ex => !exDone(ex));
  return i < 0 ? 0 : i;
}

export function enterTrainMode(){
  if(!state.session || trainExCount() === 0) return;
  state.trainMode = true;
  state.trainIdx = firstIncompleteIdx();
  document.body.classList.add("mode-train");
  applyPrevLayoutState();
  // Fire-and-forget: the train-mode summary needs full history for bestWeightEver
  // PRs, but the user has to swipe through every exercise before reaching it — by
  // then this has almost always resolved. refreshTrainEndCard awaits it again right
  // before reading, as the authoritative check.
  ensureSessionsLoaded("ALL");
  renderDay();
}

export function exitTrainMode(){
  const back = state.trainIdx;
  state.trainMode = false;
  document.body.classList.remove("mode-train");
  applyPrevLayoutState();
  renderDay();
  const art = $panel.querySelector(`.ex[data-i="${back}"]`);
  if(art) art.scrollIntoView({ block: "center" });
}
// Exposed so shell.js's showTab (which owns tab-switching) can exit train mode
// without importing this day-view code, which isn't extracted in this phase.
window._exitTrainMode = exitTrainMode;

export function renderTrainBar(){
  if(!state.trainMode || !state.session) return;
  const day = activeDays()[state.current];
  const n = day.ex.length;
  const exs = state.session.exercises || [];
  let segs = "";
  for(let i = 0; i < n; i++){
    const done = exs[i] ? exDone(exs[i]) : false;
    segs += `<button class="train-seg${done?" is-done":""}${i===state.trainIdx?" is-current":""}" data-seg="${i}" type="button" aria-label="Ir para exercício ${i+1}"></button>`;
  }
  segs += `<button class="train-seg train-seg-end${state.trainIdx>=n?" is-current":""}" data-seg="${n}" type="button" aria-label="Resumo do treino"></button>`;
  $trainSegs.innerHTML = segs;
  $trainCount.textContent = state.trainIdx >= n ? "fim" : `${state.trainIdx+1}/${n}`;
  $trainFocus.textContent = day.focus || "";
}

// Restore horizontal position synchronously after renderDay() rebuilds $panel.
export function restoreTrainScroll(){
  const track = document.getElementById("trainTrack");
  if(!track) return;
  const prev = track.style.scrollBehavior;
  track.style.scrollBehavior = "auto";
  track.scrollLeft = state.trainIdx * track.clientWidth;
  track.style.scrollBehavior = prev;
}

// Track is recreated on every render, so this binds per render (no listener stacking).
export function bindTrainTrack(){
  const track = document.getElementById("trainTrack");
  if(!track) return;
  track.addEventListener("scroll", () => {
    clearTimeout(state._trainScrollT);
    state._trainScrollT = setTimeout(() => {
      const w = track.clientWidth || 1;
      const i = Math.round(track.scrollLeft / w);
      // renderTrainBar() only — never renderDay() here, or the swipe rebuilds the DOM mid-gesture.
      if(i !== state.trainIdx){
        state.trainIdx = i;
        renderTrainBar();
        if(state.trainIdx >= trainExCount()) refreshTrainEndCard();
      }
    }, 120);
  }, { passive: true });
}

export function goToTrainIdx(i){
  const track = document.getElementById("trainTrack");
  if(!track) return;
  state.trainIdx = Math.max(0, Math.min(i, trainExCount()));
  track.scrollTo({ left: state.trainIdx * track.clientWidth, behavior: "smooth" });
  renderTrainBar();
  if(state.trainIdx >= trainExCount()) refreshTrainEndCard();
}

export function init(){
  // Bound once — $panel is never recreated, only its innerHTML.
  document.getElementById("trainExit").addEventListener("click", exitTrainMode);
  $trainSegs.addEventListener("click", e => {
    const b = e.target.closest("[data-seg]");
    if(b) goToTrainIdx(+b.dataset.seg);
  });
}
