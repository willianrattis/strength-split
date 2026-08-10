import { UNIT_STEP } from "./units.js";
import { equipmentOf } from "./equipment.js";
import { orderFactor, projectLoad, snapLoad } from "./autoreg.js";
import { execShiftMap, pickSets } from "./history.js";

export function suggestLoads(sessions, name, unit, machine, opts){
  const { currentKey = null, machineFilter = false, execOrder = false, cfg, muscle, profileActive = false, profile = null } = opts;
  if(!sessions || !sessions.length) return null;
  const u = unit || "kg";
  const step = UNIT_STEP[u] || 2.5;
  let best = null;
  let bestDate = "";
  let bestShift = 0;
  // order-aware: also track latest in-order candidate
  let ioSets = null, ioDate = "", ioEntryIdx = -1;
  const eoActive = execOrder;
  for(const sess of sessions){
    if(currentKey && (sess.date + "_" + sess.dayKey) === currentKey) continue;
    if(!sess.exercises) continue;
    const sm = eoActive ? execShiftMap(sess) : null;
    for(let ei = 0; ei < sess.exercises.length; ei++){
      const entry = sess.exercises[ei];
      const sets = pickSets(entry, name, machine, machineFilter);
      if(!sets || !sets.length) continue;
      if(!sets.some(s => typeof s.weight === "number")) continue;
      if(sess.date > bestDate){
        bestDate = sess.date; best = sets;
        bestShift = (sm && sm.has(ei)) ? sm.get(ei) : 0;
      }
      if(eoActive && sm){
        const s = sm.has(ei) ? sm.get(ei) : 0;
        if(s === 0 && sess.date > ioDate){ ioDate = sess.date; ioSets = sets; }
      }
    }
  }
  if(!best) return null;

  // order-aware baseline selection
  let useNormalization = false;
  if(eoActive && ioSets && ioDate){
    const dLatest = new Date(bestDate), dIo = new Date(ioDate);
    const diffDays = (dLatest - dIo) / (1000 * 60 * 60 * 24);
    if(diffDays <= 35){ best = ioSets; bestDate = ioDate; bestShift = 0; }
    else { useNormalization = true; }
  } else if(eoActive && bestShift !== 0){
    useNormalization = true;
  }

  // B3 — Injury gate
  if(profileActive && muscle && profile.injuries[muscle]){
    const suggestions = best.map(s => typeof s.weight === "number" ? s.weight : null);
    return { loads: suggestions, dir: "→", date: bestDate, limited: true };
  }

  const equip = equipmentOf(name);
  const exp = profileActive && profile.experience ? profile.experience : null;

  // adv gate: freeze the whole exercise if any numeric-weight set missed target
  let advGateKeep = false;
  if(exp === "adv"){
    let allHit = true;
    for(const s of best){
      if(typeof s.weight !== "number") continue;
      const didReps = s.repsDone ?? (s.done ? s.reps : null);
      if(didReps == null || didReps < s.reps){ allHit = false; break; }
    }
    if(!allHit) advGateKeep = true;
  }

  let hasUp = false, hasDown = false;
  const oFactor = useNormalization ? orderFactor(bestShift, cfg) : 1;
  const suggestions = best.map(s => {
    const w = s.weight;
    if(typeof w !== "number") return null;
    if(advGateKeep) return w;
    const baseW = useNormalization ? w * oFactor : w;
    const didReps = s.repsDone ?? (s.done ? s.reps : null);
    const out = projectLoad(baseW, didReps, s.reps, equip, u, step, 0, cfg);
    let final = out;
    if(useNormalization && final != null) final = snapLoad(equip, u, step, final, false);
    if(final != null && final > w) hasUp = true;
    if(final != null && final < w) hasDown = true;
    return final;
  });
  const dir = (hasUp && hasDown) ? "↕" : hasUp ? "↑" : hasDown ? "↓" : "→";
  return { loads: suggestions, dir, date: bestDate };
}
