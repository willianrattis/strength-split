import { matchVariant } from "./machines.js";
import { orderFactor } from "./autoreg.js";
import { STALL_SESSIONS } from "./tuning.js";

export function pickSets(entry, name, machine, machineFilter) {
  if ((entry.subName || entry.name) === name && matchVariant(entry.machine, machine, machineFilter)) return entry.main;
  if ((entry.supSubName || entry.supName) === name && matchVariant(entry.supMachine, machine, machineFilter)) return entry.sup;
  return null;
}

// Groups sessions by exercise name, mirroring pickSets' matching exactly (main:
// subName||name, sup: supSubName||supName). Restricting a scan to sessionsByName.get(name)
// is equivalent to scanning the full array and filtering via pickSets, since sessions
// missing the name always produce null from pickSets.
export function buildSessionsByName(sessions){
  const map = new Map();
  if(!sessions) return map;
  for(const sess of sessions){
    if(!sess.exercises) continue;
    const namesInSession = new Set();
    for(const entry of sess.exercises){
      const mainName = entry.subName || entry.name;
      if(mainName) namesInSession.add(mainName);
      const supName = entry.supSubName || entry.supName;
      if(supName) namesInSession.add(supName);
    }
    for(const name of namesInSession){
      let bucket = map.get(name);
      if(!bucket){ bucket = []; map.set(name, bucket); }
      bucket.push(sess);
    }
  }
  return map;
}

export function execShiftMap(sess){
  const map = new Map();
  if(!sess || !sess.exercises) return map;
  const executed = [];
  sess.exercises.forEach((e, i) => { if(e.firstSetAt) executed.push({i, ts: e.firstSetAt}); });
  if(!executed.length) return map;
  const byTime = [...executed].sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
  const execIndices = executed.map(e => e.i).sort((a, b) => a - b);
  byTime.forEach((item, execRank) => {
    const expectedRank = execIndices.indexOf(item.i);
    const shift = Math.max(-3, Math.min(3, execRank - expectedRank));
    map.set(item.i, shift);
  });
  return map;
}

// Pure data. Finds the most recent session (excluding the one being edited) where this
// exercise + machine variant was logged with at least one weight.
// perSet is INDEX-ALIGNED with the logged set rows: empty sets are preserved as null so
// callers can map values 1:1 onto the current set rows. Returns null when there's no history.
export function prevLoadData(sessions, name, machine, opts){
  const { currentKey = null, machineFilter = false, execOrder = false } = opts;
  if(!sessions || !sessions.length) return null;
  let bestDate = "";
  let bestSets = null;
  let bestSess = null;
  let bestEntryIdx = -1;
  for(const sess of sessions){
    if(currentKey && (sess.date + "_" + sess.dayKey) === currentKey) continue;
    if(!sess.exercises || !sess.date) continue;
    for(let ei = 0; ei < sess.exercises.length; ei++){
      const entry = sess.exercises[ei];
      const sets = pickSets(entry, name, machine, machineFilter);
      if(!sets || !sets.length) continue;
      if(!sets.some(s => s && s.weight != null && s.weight !== "")) continue;
      if(sess.date > bestDate){ bestDate = sess.date; bestSets = sets; bestSess = sess; bestEntryIdx = ei; }
    }
  }
  if(!bestSets) return null;

  const perSet = bestSets.map(s => ({
    weight:   (s && s.weight   != null && s.weight !== "") ? s.weight   : null,
    reps:     (s && s.reps     != null) ? s.reps     : null,
    repsDone: (s && s.repsDone != null) ? s.repsDone : null
  }));

  // 1-based execution rank of that entry in its session, only when it ran out of plan order.
  let execRank = null;
  if(execOrder && bestSess && bestEntryIdx >= 0){
    const sm = execShiftMap(bestSess);
    const shift = sm.get(bestEntryIdx);
    if(shift != null && shift !== 0){
      const executed = [];
      bestSess.exercises.forEach((e, i) => { if(e.firstSetAt) executed.push({i, ts: e.firstSetAt}); });
      const byTime = [...executed].sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
      const r = byTime.findIndex(x => x.i === bestEntryIdx);
      if(r >= 0) execRank = r + 1;
    }
  }

  return { perSet, date: bestDate, execRank };
}

export function exerciseTopHistory(sessions, name, opts){
  const { since = null, machine, execOrder = false, cfg, machineFilter = false } = opts;
  if(!sessions || !sessions.length) return [];
  const map = new Map();
  const eoActive = execOrder;
  for(const sess of sessions){
    if(!sess.exercises || !sess.date) continue;
    if(since && sess.date < since) continue;
    const sm = eoActive ? execShiftMap(sess) : null;
    for(let ei = 0; ei < sess.exercises.length; ei++){
      const entry = sess.exercises[ei];
      const sets = pickSets(entry, name, machine, machineFilter);
      if(!sets || !sets.length) continue;
      const nums = sets.map(s => s.weight).filter(w => typeof w === "number");
      if(!nums.length) continue;
      let top = Math.max(...nums);
      if(eoActive && sm){
        const shift = sm.has(ei) ? sm.get(ei) : 0;
        if(shift !== 0) top = top * orderFactor(shift, cfg);
      }
      const prev = map.get(sess.date);
      if(!prev || top > prev) map.set(sess.date, top);
    }
  }
  return Array.from(map, ([date, top]) => ({date, top})).sort((a, b) => a.date < b.date ? -1 : 1);
}

export function isStalled(sessions, name, opts){
  const hist = exerciseTopHistory(sessions, name, opts);
  if(hist.length <= STALL_SESSIONS) return false;
  const window = hist.slice(-STALL_SESSIONS);
  const before = hist.slice(0, -STALL_SESSIONS);
  const windowMax = Math.max(...window.map(h => h.top));
  const beforeMax = Math.max(...before.map(h => h.top));
  return windowMax <= beforeMax;
}

// All-time heaviest logged weight for this exercise + machine variant, excluding today.
// Mirrors prevLoadData's matching rules (subName/supSubName fallback + matchVariant).
export function bestWeightEver(sessions, name, machine, opts){
  const { currentKey = null, machineFilter = false } = opts;
  if(!sessions || !sessions.length) return null;
  let best = null;
  for(const sess of sessions){
    if(currentKey && (sess.date + "_" + sess.dayKey) === currentKey) continue;
    if(!sess.exercises) continue;
    for(const entry of sess.exercises){
      const sets = pickSets(entry, name, machine, machineFilter);
      if(!sets) continue;
      for(const s of sets){
        const w = (s && typeof s.weight === "number") ? s.weight : null;
        if(w != null && (best == null || w > best)) best = w;
      }
    }
  }
  return best;
}
