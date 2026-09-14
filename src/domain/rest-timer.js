// Rest durations are stored as whole seconds. 0 means "no timer" — the off state is a
// duration, not a separate flag, so there is one thing to configure instead of two.
export const REST_MAX_SEC = 599;   // 9:59 — the widest MM:SS with two digits
export const REST_STEP_SEC = 15;   // the ±15 adjustment, the industry-standard increment

function clampRest(sec){
  return Math.max(0, Math.min(REST_MAX_SEC, sec));
}

// Parses a rest duration from "M:SS"/"MM:SS" or a bare integer (seconds). Returns whole
// seconds clamped to [0, REST_MAX_SEC], or null when the input is empty or unparseable.
export function parseRest(input){
  if(input === "" || input === null || input === undefined) return null;

  if(typeof input === "number"){
    if(!isFinite(input) || input < 0) return null;
    return clampRest(Math.round(input));
  }

  if(typeof input !== "string") return null;
  const s = input.trim();
  if(s === "") return null;

  if(s.includes(":")){
    const parts = s.split(":");
    if(parts.length !== 2) return null;
    const [mPart, sPart] = parts;
    if(!/^\d+$/.test(mPart) || !/^\d{2}$/.test(sPart)) return null;
    const m = Number(mPart), sec = Number(sPart);
    if(sec >= 60) return null;
    return clampRest(m * 60 + sec);
  }

  if(!/^\d+$/.test(s)) return null;
  return clampRest(Number(s));
}

// Formats whole seconds as "M:SS" — zero-padded seconds, no leading zero on the minutes.
export function formatRest(sec){
  if(typeof sec !== "number" || !isFinite(sec) || sec < 0) return "0:00";
  const clamped = clampRest(Math.round(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Resolves the rest duration that applies to `planEx`: a per-exercise override beats the
// global default, including an explicit 0 override overriding a non-zero default.
export function effectiveRestSec(planEx, defaultSec){
  const override = planEx && planEx.restSec;
  if(typeof override === "number" && isFinite(override) && override >= 0){
    return clampRest(override);
  }
  if(typeof defaultSec === "number" && isFinite(defaultSec) && defaultSec >= 0){
    return clampRest(defaultSec);
  }
  return 0;
}

// Is the rest unit at set index `si` finished? A superset's rest belongs after the pair,
// not between the two movements, so both cells must be done when a superset cell exists.
export function restUnitComplete(ex, si){
  if(!ex || !Array.isArray(ex.main)) return false;
  const mainCell = ex.main[si];
  if(!mainCell) return false;

  const supCell = ex.sup && Array.isArray(ex.sup) ? ex.sup[si] : null;
  if(!supCell) return !!mainCell.done;

  return !!mainCell.done && !!supCell.done;
}

// Whole seconds left until `deadlineMs`, ceil'd so a partial second still counts as a
// tick, floored at 0. Counting down from a deadline avoids setInterval drift when a
// backgrounded tab throttles ticks.
export function remainingSec(deadlineMs, nowMs){
  if(typeof deadlineMs !== "number" || !isFinite(deadlineMs)) return 0;
  if(typeof nowMs !== "number" || !isFinite(nowMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}
