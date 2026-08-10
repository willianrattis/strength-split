import { stripDiacritics } from "./text.js";
import { muscleHeuristic } from "./muscles.js";

export function computeWrapped(sessions, year, muscleIdx){
  if(!sessions || !sessions.length) return null;
  const yStr = String(year);
  const resolveMuscle = name => {
    const k = stripDiacritics(String(name || ""));
    return muscleIdx.get(k) || muscleHeuristic(k) || "outro";
  };

  let sessionsCount = 0;
  const trainedDates = new Set();
  let totalReps = 0, totalVolume = 0, totalSets = 0;
  const byMuscle = {};   // muscle -> {sets, reps}
  const byExercise = {}; // normKey -> {display, reps, maxWeight, maxWeightDate, firstTop, lastTop}

  for(const s of sessions){
    if(!s.date || !s.date.startsWith(yStr) || !s.exercises) continue;
    let sessionHasDone = false;

    const processEntry = (performedName, muscle, sets, sDate) => {
      if(!sets) return;
      const m = muscle || "outro";
      const normKey = stripDiacritics(String(performedName||""));
      if(!normKey) return;
      for(const set of sets){
        if(!set.done) continue;
        sessionHasDone = true;
        const reps = set.repsDone != null ? Number(set.repsDone) : Number(set.reps);
        const r = (!isNaN(reps) && reps > 0) ? reps : 0;
        const wRaw = set.weight;
        const w = (wRaw != null && wRaw !== "") ? Number(wRaw) : NaN;
        const validW = !isNaN(w);

        totalSets++;
        totalReps += r;
        if(validW && r > 0) totalVolume += w * r;

        // byMuscle
        if(!byMuscle[m]) byMuscle[m] = {sets:0, reps:0};
        byMuscle[m].sets++;
        byMuscle[m].reps += r;

        // byExercise
        if(!byExercise[normKey]) byExercise[normKey] = {display:performedName, reps:0, maxWeight:-Infinity, maxWeightDate:null, firstTop:null, lastTop:null};
        const be = byExercise[normKey];
        be.reps += r;
        if(validW){
          if(w > be.maxWeight){ be.maxWeight = w; be.maxWeightDate = sDate; }
          if(!be.firstTop || sDate < be.firstTop.date){ be.firstTop = {date:sDate, weight:w}; }
          else if(sDate === be.firstTop.date && w > be.firstTop.weight){ be.firstTop.weight = w; }
          if(!be.lastTop || sDate > be.lastTop.date){ be.lastTop = {date:sDate, weight:w}; }
          else if(sDate === be.lastTop.date && w > be.lastTop.weight){ be.lastTop.weight = w; }
        }
      }
    };

    for(const ex of s.exercises){
      const mainName = ex.subName || ex.name;
      const mainMuscle = ex.subMuscle || resolveMuscle(mainName);
      processEntry(mainName, mainMuscle, ex.main, s.date);
      if(ex.sup && (ex.supSubName || ex.supName)){
        const supEffName = ex.supSubName || ex.supName;
        const supMuscle = ex.supSubMuscle || resolveMuscle(supEffName);
        processEntry(supEffName, supMuscle, ex.sup, s.date);
      }
    }
    if(sessionHasDone){ sessionsCount++; trainedDates.add(s.date); }
  }

  if(trainedDates.size === 0) return null;

  // Derive topMuscle
  let topMuscle = null, topMuscleSets = -1, topMuscleReps = -1;
  for(const [m, v] of Object.entries(byMuscle)){
    if(v.sets > topMuscleSets || (v.sets === topMuscleSets && v.reps > topMuscleReps)){
      topMuscle = m; topMuscleSets = v.sets; topMuscleReps = v.reps;
    }
  }

  // Derive heaviest
  let heaviest = null;
  for(const be of Object.values(byExercise)){
    if(be.maxWeight > -Infinity){
      if(!heaviest || be.maxWeight > heaviest.weight){
        heaviest = {exercise:be.display, weight:be.maxWeight, date:be.maxWeightDate};
      }
    }
  }

  // Derive mostProgressed
  let mostProgressed = null;
  for(const be of Object.values(byExercise)){
    if(be.firstTop && be.lastTop && be.firstTop.date !== be.lastTop.date){
      const delta = be.lastTop.weight - be.firstTop.weight;
      if(delta > 0 && (!mostProgressed || delta > mostProgressed.delta)){
        mostProgressed = {exercise:be.display, from:be.firstTop.weight, to:be.lastTop.weight, delta};
      }
    }
  }

  // repsByMuscle sorted desc by reps
  const repsByMuscle = Object.entries(byMuscle)
    .map(([m, v]) => ({muscle:m, reps:v.reps, sets:v.sets}))
    .sort((a,b) => b.reps - a.reps);

  // topExercisesByReps top 3
  const topExercisesByReps = Object.values(byExercise)
    .map(be => ({name:be.display, reps:be.reps}))
    .sort((a,b) => b.reps - a.reps)
    .slice(0,3);

  return {
    sessionsCount, trainedDates: trainedDates.size, totalReps, totalVolume, totalSets,
    topMuscle, topMuscleSets, topMuscleReps,
    heaviest, mostProgressed, repsByMuscle, topExercisesByReps
  };
}
