import { lastMachineFor } from "./machines.js";

export function emptySession(dayKey, { day, date, sessions = null, machinesActive = false }){
  if(!day.ex.length) return { date, dayKey, dayName: day.name, exercises: [] };
  return {
    date,
    dayKey,
    dayName: day.name,
    exercises: day.ex.map(e => {
      const effectiveName = e.name;
      const supName = e.superset ? e.superset.name : null;
      return {
        exId: e._id ?? null,
        name: e.name,
        subName: null,
        subMuscle: null,
        machine: machinesActive ? lastMachineFor(sessions, effectiveName) : null,
        supName,
        supSubName: null,
        supSubMuscle: null,
        supMachine: machinesActive && supName ? lastMachineFor(sessions, supName, true) : null,
        firstSetAt: null,
        main: e.reps.map(r => ({done:false, reps:r, weight:null, repsDone:null, doneAt:null, fromSug:false})),
        sup: e.superset ? e.superset.reps.map(r => ({done:false, reps:r, weight:null, repsDone:null, doneAt:null, fromSug:false})) : null
      };
    })
  };
}

export function reconcileSession(prev, dayKey, opts){
  const { day } = opts;
  const fresh = emptySession(dayKey, opts);
  if(!day.ex.length) return fresh;
  if(!prev || !Array.isArray(prev.exercises)) return fresh;

  const olds = prev.exercises;
  const used = new Set();

  const indexBy = key => {
    const m = new Map();
    olds.forEach((o, idx) => {
      if(!o) return;
      const k = o[key];
      if(k == null || k === "") return;
      if(!m.has(k)) m.set(k, []);
      m.get(k).push(idx);
    });
    return m;
  };
  const byId = indexBy("exId");
  const byName = indexBy("name");

  // consumes at most one unused entry per key (handles duplicate names)
  const take = (map, key) => {
    if(key == null) return null;
    const list = map.get(key);
    if(!list) return null;
    for(const idx of list){
      if(!used.has(idx)){ used.add(idx); return olds[idx]; }
    }
    return null;
  };

  // pass 1: exId (sessions saved after this change)
  const matched = day.ex.map(e => take(byId, e._id));
  // pass 2: name fallback (legacy sessions with no exId)
  day.ex.forEach((e, i) => { if(!matched[i]) matched[i] = take(byName, e.name); });

  fresh.exercises = day.ex.map((e, i) => {
    const old = matched[i] || null;
    // doneAt must be carried here or it is dropped on every reload of the day.
    const merge = arr => (old && Array.isArray(old.main))
      ? arr.map((cell, j) => old.main[j] ? {...cell, done:!!old.main[j].done, weight:old.main[j].weight ?? null, repsDone:old.main[j].repsDone ?? null, doneAt:old.main[j].doneAt ?? null, fromSug:!!old.main[j].fromSug} : cell)
      : arr;
    const mergeSup = arr => (old && old.sup && Array.isArray(old.sup))
      ? arr.map((cell, j) => old.sup[j] ? {...cell, done:!!old.sup[j].done, weight:old.sup[j].weight ?? null, repsDone:old.sup[j].repsDone ?? null, doneAt:old.sup[j].doneAt ?? null, fromSug:!!old.sup[j].fromSug} : cell)
      : arr;
    return {
      exId: e._id ?? null,
      name: e.name,
      subName: old && old.subName ? old.subName : null,
      subMuscle: old && old.subMuscle ? old.subMuscle : null,
      machine: old && old.machine != null ? old.machine : null,
      supName: e.superset ? e.superset.name : null,
      supSubName: e.superset && old && old.supSubName ? old.supSubName : null,
      supSubMuscle: e.superset && old && old.supSubMuscle ? old.supSubMuscle : null,
      supMachine: old && old.supMachine != null ? old.supMachine : null,
      firstSetAt: old && old.firstSetAt ? old.firstSetAt : null,
      main: merge(e.reps.map(r => ({done:false, reps:r, weight:null, repsDone:null, doneAt:null, fromSug:false}))),
      sup: e.superset ? mergeSup(e.superset.reps.map(r => ({done:false, reps:r, weight:null, repsDone:null, doneAt:null, fromSug:false}))) : null
    };
  });
  return fresh;
}
