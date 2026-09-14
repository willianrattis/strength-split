import { UNIT_STEP, convertWeight, roundForDisplay } from "./units.js";
import { equipmentOf } from "./equipment.js";
import { orderFactor, projectLoad, snapLoad } from "./autoreg.js";
import { execShiftMap, matchSide } from "./history.js";

export function suggestLoads(sessions, name, unit, machine, opts){
  const { currentKey = null, machineFilter = false, execOrder = false, cfg, muscle, profileActive = false, profile = null, targetUnit = null } = opts;
  if(!sessions || !sessions.length) return null;
  const u = unit || "kg";
  const step = UNIT_STEP[u] || 2.5;
  let best = null;
  let bestDate = "";
  let bestShift = 0;
  let bestUnit = null;
  // order-aware: also track latest in-order candidate
  let ioSets = null, ioDate = "", ioUnit = null;
  const eoActive = execOrder;
  for(const sess of sessions){
    if(currentKey && (sess.date + "_" + sess.dayKey) === currentKey) continue;
    if(!sess.exercises) continue;
    const sm = eoActive ? execShiftMap(sess) : null;
    for(let ei = 0; ei < sess.exercises.length; ei++){
      const entry = sess.exercises[ei];
      const side = matchSide(entry, name, machine, machineFilter);
      if(!side) continue;
      const sets = side === "main" ? entry.main : entry.sup;
      const entryUnit = side === "main" ? entry.unit : entry.supUnit;
      if(!sets || !sets.length) continue;
      if(!sets.some(s => typeof s.weight === "number")) continue;
      if(sess.date > bestDate){
        bestDate = sess.date; best = sets; bestUnit = entryUnit;
        bestShift = (sm && sm.has(ei)) ? sm.get(ei) : 0;
      }
      if(eoActive && sm){
        const s = sm.has(ei) ? sm.get(ei) : 0;
        if(s === 0 && sess.date > ioDate){ ioDate = sess.date; ioSets = sets; ioUnit = entryUnit; }
      }
    }
  }
  if(!best) return null;

  // order-aware baseline selection
  let useNormalization = false;
  if(eoActive && ioSets && ioDate){
    const dLatest = new Date(bestDate), dIo = new Date(ioDate);
    const diffDays = (dLatest - dIo) / (1000 * 60 * 60 * 24);
    if(diffDays <= 35){ best = ioSets; bestDate = ioDate; bestShift = 0; bestUnit = ioUnit; }
    else { useNormalization = true; }
  } else if(eoActive && bestShift !== 0){
    useNormalization = true;
  }

  // Stored weights are unit-less numbers; the entry's own unit is the truth. A legacy
  // entry has none — assume it was already logged in the unit being rendered.
  const baseSets = targetUnit
    ? best.map(s => {
        if(!s || typeof s.weight !== "number") return s;
        const c = convertWeight(s.weight, bestUnit || targetUnit, targetUnit);
        return { ...s, weight: c == null ? null : roundForDisplay(c, targetUnit) };
      })
    : best;

  // B3 — Injury gate
  if(profileActive && muscle && profile.injuries[muscle]){
    const suggestions = baseSets.map(s => typeof s.weight === "number" ? s.weight : null);
    return { loads: suggestions, dir: "→", date: bestDate, limited: true };
  }

  const equip = equipmentOf(name);
  const exp = profileActive && profile.experience ? profile.experience : null;

  // adv gate: freeze the whole exercise if any numeric-weight set missed target
  let advGateKeep = false;
  if(exp === "adv"){
    let allHit = true;
    for(const s of baseSets){
      if(typeof s.weight !== "number") continue;
      const didReps = s.repsDone ?? (s.done ? s.reps : null);
      if(didReps == null || didReps < s.reps){ allHit = false; break; }
    }
    if(!allHit) advGateKeep = true;
  }

  let hasUp = false, hasDown = false;
  const oFactor = useNormalization ? orderFactor(bestShift, cfg) : 1;
  const suggestions = baseSets.map(s => {
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
