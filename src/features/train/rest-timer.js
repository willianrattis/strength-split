import { REST_MAX_SEC, REST_STEP_SEC, formatRest, remainingSec } from "../../domain/rest-timer.js";
import { state } from "../../core/state.js";
import { $restBar, $restLbl, $restClock, $restActions, $restProgFill } from "../../core/dom.js";

const TICK_MS = 250;
const WARN_SEC = 5;
const FINISH_HIDE_MS = 3000;
const FINISH_ADD_SEC = 30;

let audioCtx = null;

function getAudioContext(){
  if(audioCtx) return audioCtx;
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;
    audioCtx = new Ctx();
  }catch(_){ return null; }
  return audioCtx;
}

// iOS will not start an AudioContext outside a user gesture — this is called both on
// first pointerdown and again when the tab regains visibility.
function resumeAudio(){
  try{
    const ctx = getAudioContext();
    if(ctx && ctx.state === "suspended") ctx.resume();
  }catch(_){}
}

function blip(ctx, freq, startAt){
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const dur = 0.11;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(0.3, startAt + 0.015);
  gain.gain.linearRampToValueAtTime(0.0001, startAt + dur);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

// Two short blips, 880Hz then 1175Hz, under half a second total. On iOS the ringer
// switch silences Web Audio — accepted, not worked around (see epic notes).
function playAlertSound(){
  try{
    const ctx = getAudioContext();
    if(!ctx) return;
    if(ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    blip(ctx, 880, now);
    blip(ctx, 1175, now + 0.13);
  }catch(_){}
}

// navigator.vibrate does not exist on iOS Safari — never branch logic on its result.
function vibrate(){
  try{
    if(typeof navigator.vibrate === "function") navigator.vibrate([120, 80, 120]);
  }catch(_){}
}

function clearTick(){
  clearInterval(state._restTick);
  state._restTick = null;
}

function clearHideTimer(){
  clearTimeout(state._restHideT);
  state._restHideT = null;
}

export function isResting(){
  return state.restDeadline != null;
}

function renderRunning(remaining){
  $restLbl.textContent = "Descanso";
  $restClock.textContent = formatRest(remaining);
  const pct = state.restTotalSec > 0 ? Math.min(1, remaining / state.restTotalSec) : 0;
  $restProgFill.style.width = `${pct * 100}%`;
  $restBar.classList.remove("is-done");
  $restBar.classList.toggle("is-warn", remaining > 0 && remaining <= WARN_SEC);
  $restActions.innerHTML =
    `<button type="button" data-restact="minus">-15</button>
     <button type="button" data-restact="plus">+15</button>
     <button type="button" data-restact="skip">Pular</button>`;
}

function renderDone(){
  $restLbl.textContent = "Pode ir";
  $restClock.textContent = "0:00";
  $restProgFill.style.width = "100%";
  $restBar.classList.remove("is-warn");
  $restBar.classList.add("is-done");
  $restActions.innerHTML = `<button type="button" data-restact="plus30">+30</button>`;
}

// Programmatic teardown, shared by skipRest/stopRest and the background-catch-up path.
// No sound, no vibration — silence is the point of every caller of this function.
function hide(){
  clearTick();
  clearHideTimer();
  state.restDeadline = null;
  state.restTotalSec = 0;
  document.body.classList.remove("rest-active");
  $restBar.classList.remove("is-warn", "is-done");
}

function finish(){
  clearTick();
  playAlertSound();
  vibrate();
  renderDone();
  state._restHideT = setTimeout(hide, FINISH_HIDE_MS);
}

function tick(){
  const remaining = remainingSec(state.restDeadline, Date.now());
  if(remaining <= 0){ finish(); return; }
  renderRunning(remaining);
}

export function startRest(sec){
  if(!(sec > 0)) return;
  clearHideTimer();
  clearTick();
  resumeAudio();
  state.restTotalSec = sec;
  state.restDeadline = Date.now() + sec * 1000;
  document.body.classList.add("rest-active");
  renderRunning(sec);
  state._restTick = setInterval(tick, TICK_MS);
}

export function adjustRest(delta){
  if(!isResting()) return;
  const now = Date.now();
  const remaining = remainingSec(state.restDeadline, now);
  const next = Math.max(1, Math.min(REST_MAX_SEC, remaining + delta));
  state.restDeadline = now + next * 1000;
  if(next > state.restTotalSec) state.restTotalSec = next;
  renderRunning(next);
}

// The user already knows they skipped — alerting them for their own action is noise.
export function skipRest(){
  hide();
}

export function stopRest(){
  hide();
}

function onVisibilityChange(){
  if(document.visibilityState === "hidden"){
    // Stop ticking while hidden so a throttled interval can never fire finish() (and
    // its beep) in the background — the visible handler below is the only path that
    // may end the countdown once the tab is hidden.
    clearTick();
    return;
  }
  resumeAudio();
  if(!isResting()) return;
  const remaining = remainingSec(state.restDeadline, Date.now());
  if(remaining <= 0){ hide(); return; }
  renderRunning(remaining);
  state._restTick = setInterval(tick, TICK_MS);
}

export function init(){
  $restActions.addEventListener("click", e => {
    const btn = e.target.closest("[data-restact]");
    if(!btn) return;
    const act = btn.dataset.restact;
    if(act === "minus") adjustRest(-REST_STEP_SEC);
    else if(act === "plus") adjustRest(REST_STEP_SEC);
    else if(act === "skip") skipRest();
    else if(act === "plus30") startRest(FINISH_ADD_SEC);
  });
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("pointerdown", resumeAudio, { once: true });
}
