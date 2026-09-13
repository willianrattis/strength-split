import { normMachine } from "./text.js";
import { convertWeight, roundForDisplay } from "./units.js";

// Cross-machine average for an exercise: one entry per machine variant (most recent
// session per machine), converted to a common unit, then averaged set-by-set.
// perSet is INDEX-ALIGNED with the current set rows, exactly like prevLoadData's perSet.
export function avgAcrossMachines(sessions, name, opts = {}){
  const { isSup = false, currentKey = null, targetUnit = "kg" } = opts;
  if(!sessions || !sessions.length) return null;

  // One candidate per machine: the most recent session that logged this exercise on it.
  const byMachine = new Map();
  for(const sess of sessions){
    if(currentKey && (sess.date + "_" + sess.dayKey) === currentKey) continue;
    if(!sess.exercises) continue;
    for(const entry of sess.exercises){
      const entryName = isSup ? (entry.supSubName || entry.supName) : (entry.subName || entry.name);
      if(entryName !== name) continue;
      const machine = isSup ? entry.supMachine : entry.machine;
      if(!machine) continue;
      const sets = isSup ? entry.sup : entry.main;
      if(!sets || !sets.length) continue;
      if(!sets.some(s => s && typeof s.weight === "number")) continue;

      const key = normMachine(machine);
      const cur = byMachine.get(key);
      if(!cur || sess.date > cur.date){
        byMachine.set(key, { machine, date: sess.date, unit: isSup ? entry.supUnit : entry.unit, sets });
      }
    }
  }
  if(!byMachine.size) return null;

  // Convert every candidate to targetUnit, dropping any whose unit string convertWeight
  // doesn't recognize rather than partially averaging an uninterpretable value.
  const survivors = [];
  for(const cand of byMachine.values()){
    const unit = cand.unit || targetUnit;
    let incompatible = false;
    const sets = cand.sets.map(s => {
      let weight = null;
      if(s && typeof s.weight === "number"){
        const w = convertWeight(s.weight, unit, targetUnit);
        if(w == null) incompatible = true;
        else weight = w;
      }
      return {
        weight,
        reps: (s && typeof s.reps === "number") ? s.reps : null,
        repsDone: (s && typeof s.repsDone === "number") ? s.repsDone : null
      };
    });
    if(incompatible) continue;
    survivors.push({ machine: cand.machine, date: cand.date, sets });
  }
  if(!survivors.length) return null;

  const maxLen = Math.max(...survivors.map(e => e.sets.length));
  const perSet = [];
  for(let i = 0; i < maxLen; i++){
    const weights = [], repsArr = [], repsDoneArr = [];
    survivors.forEach(e => {
      const cell = e.sets[i];
      if(!cell) return;
      if(typeof cell.weight === "number") weights.push(cell.weight);
      if(typeof cell.reps === "number") repsArr.push(cell.reps);
      if(typeof cell.repsDone === "number") repsDoneArr.push(cell.repsDone);
    });
    if(!weights.length){ perSet.push(null); continue; }
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const w = roundForDisplay(mean, targetUnit);
    perSet.push({
      weight: w,
      reps: repsArr.length ? Math.round(repsArr.reduce((a, b) => a + b, 0) / repsArr.length) : null,
      repsDone: repsDoneArr.length ? Math.round(repsDoneArr.reduce((a, b) => a + b, 0) / repsDoneArr.length) : null
    });
  }
  if(perSet.every(p => p === null)) return null;

  const machines = survivors
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(e => e.machine);

  return { perSet, machines, unit: targetUnit };
}
