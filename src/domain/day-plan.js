// Gap bounds for pace estimation. A session's raw "last doneAt minus first firstSetAt"
// duration swallows bathroom breaks and phone calls; only gaps inside this window count
// toward a pace. core/config.js re-exports these two — this file is their home.
export const GAP_MIN_MS = 20 * 1000;      // below this the user is marking sets retroactively
export const GAP_MAX_MS = 8 * 60 * 1000;  // above this the phone was abandoned

// Every doneAt in a session, sorted ascending.
export function setStamps(session){
  if(!session || !Array.isArray(session.exercises)) return [];
  const stamps = [];
  for(const ex of session.exercises){
    for(const cell of (ex && ex.main) || []){
      if(!cell || !cell.doneAt) continue;
      const t = Date.parse(cell.doneAt);
      if(!isNaN(t)) stamps.push(t);
    }
    for(const cell of (ex && ex.sup) || []){
      if(!cell || !cell.doneAt) continue;
      const t = Date.parse(cell.doneAt);
      if(!isNaN(t)) stamps.push(t);
    }
  }
  return stamps.sort((a, b) => a - b);
}

// Valid consecutive gaps (ms) inside [GAP_MIN_MS, GAP_MAX_MS].
export function validGaps(stamps){
  if(!Array.isArray(stamps)) return [];
  const gaps = [];
  for(let i = 1; i < stamps.length; i++){
    const d = stamps[i] - stamps[i - 1];
    if(d >= GAP_MIN_MS && d <= GAP_MAX_MS) gaps.push(d);
  }
  return gaps;
}

export function median(nums){
  if(!Array.isArray(nums) || !nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Median gap of ONE session, or null with fewer than `minGaps` valid gaps.
export function sessionPace(session, { minGaps = 3 } = {}){
  const gaps = validGaps(setStamps(session));
  if(gaps.length < minGaps) return null;
  return median(gaps);
}

function usablePaces(sessions, limit){
  return [...sessions]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map(s => sessionPace(s))
    .filter(p => p != null);
}

// Median of per-session paces. Falls back from "this weekday" to "every session" when
// the weekday has fewer than `minSessions` usable sessions. null when neither reaches
// the threshold — never invent a number.
export function historicPace(sessions, dayKey, { limit = 5, minSessions = 3 } = {}){
  if(!Array.isArray(sessions)) return null;
  const weekday = sessions.filter(s => s && s.dayKey === dayKey);
  const weekdayPaces = usablePaces(weekday, limit);
  if(weekdayPaces.length >= minSessions) return median(weekdayPaces);
  const allPaces = usablePaces(sessions, limit);
  if(allPaces.length >= minSessions) return median(allPaces);
  return null;
}

// Planned and completed counts: { exCount, setCount, doneEx, doneSets }. A set counts
// as done when `done === true`; supersets count both halves. Counts planned sets from
// the session when it exists (it mirrors the plan), falling back to the day's own shape.
export function dayCounts(day, session){
  const exercises = session && Array.isArray(session.exercises) ? session.exercises : null;
  if(exercises){
    let setCount = 0, doneEx = 0, doneSets = 0;
    for(const ex of exercises){
      const main = (ex && ex.main) || [];
      const sup = (ex && ex.sup) || [];
      setCount += main.length + sup.length;
      const mainDone = main.filter(s => s && s.done === true).length;
      const supDone = sup.filter(s => s && s.done === true).length;
      doneSets += mainDone + supDone;
      if(mainDone === main.length && supDone === sup.length) doneEx++;
    }
    return { exCount: exercises.length, setCount, doneEx, doneSets };
  }
  const planEx = (day && Array.isArray(day.ex)) ? day.ex : [];
  let setCount = 0;
  for(const e of planEx){
    const sets = (e && Array.isArray(e.sets)) ? e.sets.length : 0;
    const supSets = (e && e.superset && Array.isArray(e.superset.sets)) ? e.superset.sets.length : 0;
    setCount += sets + supSets;
  }
  return { exCount: planEx.length, setCount, doneEx: 0, doneSets: 0 };
}

// Pace of the session in progress, or null with fewer than 2 valid gaps.
export function livePace(session){
  const gaps = validGaps(setStamps(session));
  if(gaps.length < 2) return null;
  return median(gaps);
}

// Blend: 50/50 when both exist, otherwise whichever exists, else null.
export function blendedPace(historic, live){
  if(historic != null && live != null) return (historic + live) / 2;
  if(historic != null) return historic;
  if(live != null) return live;
  return null;
}

// setCount * pace, or null when pace is null.
export function estimateMs(setCount, pace){
  if(pace == null) return null;
  return setCount * pace;
}

// (setCount - doneSets) * pace, clamped at 0; null when pace is null.
export function remainingMs(counts, pace){
  if(pace == null) return null;
  return Math.max(0, (counts.setCount - counts.doneSets) * pace);
}

// new Date(now + ms); null when ms is null.
export function etaAt(now, ms){
  if(ms == null) return null;
  const t = now instanceof Date ? now.getTime() : now;
  if(typeof t !== "number" || !isFinite(t)) return null;
  return new Date(t + ms);
}
