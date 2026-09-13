import { normMachine, sameMachine } from "./text.js";

export function lastMachineFor(sessions, name, isSup=false){
  if(!sessions || !sessions.length) return null;
  const sorted = [...sessions].sort((a,b) => (b.date||"").localeCompare(a.date||""));
  for(const sess of sorted){
    if(!sess.exercises) continue;
    for(const entry of sess.exercises){
      if(isSup){
        if((entry.supSubName || entry.supName) === name && entry.supMachine) return entry.supMachine;
      } else {
        const eName = entry.subName || entry.name;
        if(eName === name && entry.machine) return entry.machine;
      }
    }
  }
  return null;
}

// The unit this exercise was last logged in ON THIS MACHINE. Derived, not stored — it
// mirrors lastMachineFor exactly, so a user who has ever logged the exercise on that
// machine gets their unit back without a new Firestore structure or a migration.
export function lastUnitFor(sessions, name, machine, isSup = false){
  if(!sessions || !sessions.length || !machine) return null;
  const sorted = [...sessions].sort((a,b) => (b.date||"").localeCompare(a.date||""));
  for(const sess of sorted){
    if(!sess.exercises) continue;
    for(const entry of sess.exercises){
      if(isSup){
        if((entry.supSubName || entry.supName) === name && sameMachine(entry.supMachine, machine) && entry.supUnit) return entry.supUnit;
      } else {
        if((entry.subName || entry.name) === name && sameMachine(entry.machine, machine) && entry.unit) return entry.unit;
      }
    }
  }
  return null;
}

// All machines the user ever tagged, ranked by frequency desc. Returns display strings, deduped via normMachine.
export function usedMachinesRanked(sessions){
  const count = new Map();
  if(sessions) for(const s of sessions){
    if(!s.exercises) continue;
    for(const e of s.exercises){
      for(const m of [e.machine, e.supMachine]){
        const nk = normMachine(m);
        if(!nk) continue;
        const cur = count.get(nk);
        if(cur) cur.n++; else count.set(nk, {display:m, n:1});
      }
    }
  }
  return [...count.values()].sort((a,b) => b.n - a.n).map(x => x.display);
}

export const matchVariant = (entryMachine, machine, machineFilterActive) =>
  machine === undefined || !machineFilterActive || sameMachine(entryMachine, machine);
