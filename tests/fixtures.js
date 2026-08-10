// Shared test builders. No assertions here.

export function makeSet({ done = false, reps = 10, weight = null, repsDone = null, doneAt = null, fromSug = false } = {}){
  return { done, reps, weight, repsDone, doneAt, fromSug };
}

export function makeDay({ name = "Segunda", ex = [] } = {}){
  return { name, ex };
}

// One plan exercise entry as consumed by day.ex[] (emptySession / reconcileSession / deloadDue).
export function makeExercise({ _id = null, name = "Supino reto", reps = [10, 10, 10], superset = null } = {}){
  return { _id, name, reps, superset };
}

export function makeEntry({
  exId = null, name = "Supino reto", subName = null, subMuscle = null, machine = null,
  supName = null, supSubName = null, supSubMuscle = null, supMachine = null,
  firstSetAt = null, main = [], sup = null
} = {}){
  return { exId, name, subName, subMuscle, machine, supName, supSubName, supSubMuscle, supMachine, firstSetAt, main, sup };
}

export function makeSession({ date = "2026-01-05", dayKey = 0, dayName = "Segunda", exercises = [] } = {}){
  return { date, dayKey, dayName, exercises };
}
