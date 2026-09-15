import { describe, it, expect } from "vitest";
import {
  PROGRAM_VERSION, LETTERS,
  weekdayExerciseIds, deriveProgram, workoutForWeekday,
  restWeekdays, isProgramConsistent, weekPattern, reconcileProgram,
  workoutByLetter, siblingWeekdays, orderPatches, addToWorkoutPatch, removeFromWorkoutPatch,
  planSetCount, setWorkoutWeekdays, movePatch,
  appendToWeekdaysPatch, replaceInWorkoutPatches, nextLetter, addWorkout, newExerciseDoc,
} from "../src/domain/program.js";

// Deep-clones a Map<id, ex> catalog, including each exercise's nested arrays/objects,
// so a test can apply a patch without touching the original fixture.
function cloneCatalog(catalog){
  return new Map([...catalog].map(([id, ex]) => [id, JSON.parse(JSON.stringify(ex))]));
}

describe("LETTERS", () => {
  it("is the A-G assignment order", () => {
    expect(LETTERS).toEqual(["A","B","C","D","E","F","G"]);
  });
});

function abcCatalog(){
  return new Map([
    ["supino", { name:"Supino", muscle:"Peito", active:true, days:[0,3], orderByDay:{0:1,3:1} }],
    ["agacho", { name:"Agachamento", muscle:"Perna", active:true, days:[1,4], orderByDay:{1:1,4:1} }],
    ["remada", { name:"Remada", muscle:"Costas", active:true, days:[2,5], orderByDay:{2:1,5:1} }],
  ]);
}

describe("weekdayExerciseIds", () => {
  it("orders ids like rebuildUserDays for a given weekday", () => {
    const catalog = new Map([
      ["b", { name:"B-ex", active:true, days:[0], orderByDay:{0:2} }],
      ["a", { name:"A-ex", active:true, days:[0], orderByDay:{0:1} }],
    ]);
    expect(weekdayExerciseIds(catalog, 0)).toEqual(["a","b"]);
  });

  it("ignores exercises inactive or missing the weekday", () => {
    const catalog = new Map([
      ["inactive", { name:"X", active:false, days:[0] }],
      ["noActive", { name:"Y", days:[0] }],
      ["otherDay", { name:"Z", active:true, days:[1] }],
    ]);
    expect(weekdayExerciseIds(catalog, 0)).toEqual([]);
  });
});

describe("deriveProgram — ABC over 6 days", () => {
  it("produces 3 workouts with the right weekdays", () => {
    const program = deriveProgram(abcCatalog());
    expect(program.version).toBe(PROGRAM_VERSION);
    expect(program.workouts).toHaveLength(3);
    expect(program.workouts.map(w => w.letter)).toEqual(["A","B","C"]);
    expect(program.workouts[0].weekdays).toEqual([0,3]);
    expect(program.workouts[1].weekdays).toEqual([1,4]);
    expect(program.workouts[2].weekdays).toEqual([2,5]);
  });

  it("weekPattern is ABCABC–", () => {
    expect(weekPattern(deriveProgram(abcCatalog()))).toBe("ABCABC–");
  });

  it("restWeekdays is [6]", () => {
    expect(restWeekdays(deriveProgram(abcCatalog()))).toEqual([6]);
  });
});

describe("deriveProgram — grouping", () => {
  it("splits two weekdays with the same exercises in a different order into two workouts", () => {
    const catalog = new Map([
      ["a", { name:"A-ex", muscle:"M1", active:true, days:[0,1], orderByDay:{0:1,1:2} }],
      ["b", { name:"B-ex", muscle:"M2", active:true, days:[0,1], orderByDay:{0:2,1:1} }],
    ]);
    const program = deriveProgram(catalog);
    expect(program.workouts).toHaveLength(2);
    expect(program.workouts[0].weekdays).toEqual([0]);
    expect(program.workouts[1].weekdays).toEqual([1]);
  });

  it("ignores an inactive exercise; a weekday left with only inactive exercises is rest", () => {
    const catalog = new Map([
      ["off", { name:"Off", active:false, days:[0] }],
      ["noFlag", { name:"NoFlag", days:[0] }],
      ["on", { name:"On", muscle:"M", active:true, days:[1] }],
    ]);
    const program = deriveProgram(catalog);
    expect(program.workouts).toHaveLength(1);
    expect(program.workouts[0].weekdays).toEqual([1]);
    expect(restWeekdays(program)).toContain(0);
  });

  it("assigns letters by lowest weekday — a group starting Tue gets B if Mon is A", () => {
    const catalog = new Map([
      ["mon", { name:"Mon-ex", muscle:"M1", active:true, days:[0] }],
      ["tue", { name:"Tue-ex", muscle:"M2", active:true, days:[1] }],
    ]);
    const program = deriveProgram(catalog);
    expect(workoutForWeekday(program, 0).letter).toBe("A");
    expect(workoutForWeekday(program, 1).letter).toBe("B");
  });

  it("focus lists distinct muscles in exercise order", () => {
    const catalog = new Map([
      ["e1", { name:"E1", muscle:"Peito", active:true, days:[0], orderByDay:{0:1} }],
      ["e2", { name:"E2", muscle:"Perna", active:true, days:[0], orderByDay:{0:2} }],
      ["e3", { name:"E3", muscle:"Peito", active:true, days:[0], orderByDay:{0:3} }],
    ]);
    const program = deriveProgram(catalog);
    expect(program.workouts[0].focus).toEqual(["Peito","Perna"]);
  });

  it("label prefers previous over dayCustomizations tag", () => {
    const catalog = new Map([["e", { name:"E", muscle:"M", active:true, days:[0] }]]);
    const previous = { version:1, workouts:[{ letter:"A", label:"Peito antigo", focus:["M"], weekdays:[0] }] };
    const program = deriveProgram(catalog, { dayCustomizations:{ 0:{ tag:"Peito novo" } }, previous });
    expect(program.workouts[0].label).toBe("Peito antigo");
  });

  it("label falls back to a trimmed dayCustomizations tag when previous has none", () => {
    const catalog = new Map([["e", { name:"E", muscle:"M", active:true, days:[0] }]]);
    const program = deriveProgram(catalog, { dayCustomizations:{ 0:{ tag:"  Peito  " } } });
    expect(program.workouts[0].label).toBe("Peito");
  });

  it("label falls back to empty string when neither previous nor tag is available", () => {
    const catalog = new Map([["e", { name:"E", muscle:"M", active:true, days:[0] }]]);
    const program = deriveProgram(catalog);
    expect(program.workouts[0].label).toBe("");
  });

  it("is deterministic and never mutates its inputs", () => {
    const catalog = abcCatalog();
    const dayCustomizations = { 0:{ tag:"Peito" } };
    const snapshotCatalog = JSON.stringify([...catalog]);
    const snapshotCustom = JSON.stringify(dayCustomizations);
    const p1 = deriveProgram(catalog, { dayCustomizations });
    const p2 = deriveProgram(catalog, { dayCustomizations });
    expect(p1).toEqual(p2);
    expect(JSON.stringify([...catalog])).toBe(snapshotCatalog);
    expect(JSON.stringify(dayCustomizations)).toBe(snapshotCustom);
  });
});

describe("workoutForWeekday", () => {
  it("returns null on a rest day", () => {
    const program = deriveProgram(abcCatalog());
    expect(workoutForWeekday(program, 6)).toBeNull();
  });

  it("returns the workout covering a scheduled weekday", () => {
    const program = deriveProgram(abcCatalog());
    expect(workoutForWeekday(program, 3).letter).toBe("A");
  });
});

describe("isProgramConsistent", () => {
  it("is true for deriveProgram's own output", () => {
    const catalog = abcCatalog();
    expect(isProgramConsistent(deriveProgram(catalog), catalog)).toBe(true);
  });

  it("is true for an empty catalog", () => {
    const catalog = new Map();
    const program = deriveProgram(catalog);
    expect(program).toEqual({ version:1, workouts:[] });
    expect(isProgramConsistent(program, catalog)).toBe(true);
  });

  it("is false on the wrong version", () => {
    const catalog = abcCatalog();
    const program = { ...deriveProgram(catalog), version:2 };
    expect(isProgramConsistent(program, catalog)).toBe(false);
  });

  it("is false on a duplicate letter", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    program.workouts[1].letter = "A";
    expect(isProgramConsistent(program, catalog)).toBe(false);
  });

  it("is false when a weekday appears in two workouts", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    program.workouts[1].weekdays.push(0);
    expect(isProgramConsistent(program, catalog)).toBe(false);
  });

  it("is false when a workout's weekdays have diverged from the catalog", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    // Give Thursday (weekday 3) an extra exercise Monday doesn't have, so the
    // "A" workout's two weekdays no longer share an identical exercise list.
    catalog.set("extra", { name:"Extra", muscle:"M", active:true, days:[3] });
    expect(isProgramConsistent(program, catalog)).toBe(false);
  });

  it("is false when a non-empty weekday is missing from the program", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    program.workouts.pop(); // drops the "C" workout (weekdays 2,5), both non-empty in the catalog
    expect(isProgramConsistent(program, catalog)).toBe(false);
  });

  it("is false when a workout has empty weekdays", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    program.workouts.push({ letter:"D", label:"", focus:[], weekdays:[] });
    expect(isProgramConsistent(program, catalog)).toBe(false);
  });
});

describe("reconcileProgram", () => {
  it("keeps the same reference and changed:false when the stored program is still consistent", () => {
    const catalog = abcCatalog();
    const stored = deriveProgram(catalog);
    const { program, changed } = reconcileProgram(stored, catalog);
    expect(program).toBe(stored);
    expect(changed).toBe(false);
  });

  it("derives fresh and reports changed:true when nothing is stored", () => {
    const catalog = abcCatalog();
    const { program, changed } = reconcileProgram(null, catalog);
    expect(program).toEqual(deriveProgram(catalog));
    expect(changed).toBe(true);
  });

  it("re-derives a stale stored program, carrying its label forward, and reports changed:true", () => {
    const catalog = abcCatalog();
    const stored = deriveProgram(catalog);
    stored.workouts[0].label = "Peito antigo";
    // Diverge the catalog from what `stored` describes: give Thursday (weekday 3,
    // grouped with Monday under "A") an extra exercise so the stored program is stale.
    catalog.set("extra", { name:"Extra", muscle:"M", active:true, days:[3] });
    expect(isProgramConsistent(stored, catalog)).toBe(false);

    const { program, changed } = reconcileProgram(stored, catalog);
    expect(changed).toBe(true);
    expect(program).not.toBe(stored);
    expect(program.workouts[0].label).toBe("Peito antigo");
  });
});

describe("workoutByLetter", () => {
  it("returns the workout with that letter, or null", () => {
    const program = deriveProgram(abcCatalog());
    expect(workoutByLetter(program, "B").weekdays).toEqual([1,4]);
    expect(workoutByLetter(program, "Z")).toBeNull();
  });
});

describe("siblingWeekdays", () => {
  it("gives every weekday of Mon's workout in an ABC 6-day catalog", () => {
    const program = deriveProgram(abcCatalog());
    expect(siblingWeekdays(program, 0)).toEqual([0,3]);
  });

  it("gives just [weekday] on a rest day", () => {
    const program = deriveProgram(abcCatalog());
    expect(siblingWeekdays(program, 6)).toEqual([6]);
  });

  it("gives just [weekday] when there is no program", () => {
    expect(siblingWeekdays(null, 2)).toEqual([2]);
  });
});

function orderCatalog(){
  return new Map([
    ["e1", { name:"Supino", muscle:"Peito", active:true, days:[0,3], orderByDay:{0:1,3:1,1:9} }],
    ["e2", { name:"Supino Inclinado", muscle:"Peito", active:true, days:[0,3], orderByDay:{0:2,3:2} }],
  ]);
}

describe("orderPatches", () => {
  it("sets the new index on every sibling weekday and preserves unrelated keys", () => {
    const catalog = orderCatalog();
    const program = deriveProgram(catalog);
    const catalogSnapshot = JSON.stringify([...catalog]);
    const patches = orderPatches(catalog, program, 0, ["e2","e1"]);
    expect(patches.get("e2")).toEqual({ 0:0, 3:0 });
    expect(patches.get("e1")).toEqual({ 0:1, 3:1, 1:9 }); // Tue (1) key preserved
    expect(JSON.stringify([...catalog])).toBe(catalogSnapshot); // inputs untouched
  });

  it("keeps the program consistent and reorders the target weekday once applied", () => {
    const catalog = orderCatalog();
    const program = deriveProgram(catalog);
    const patches = orderPatches(catalog, program, 0, ["e2","e1"]);
    const applied = cloneCatalog(catalog);
    patches.forEach((orderByDay, id) => { applied.get(id).orderByDay = orderByDay; });
    expect(isProgramConsistent(program, applied)).toBe(true);
    expect(weekdayExerciseIds(applied, 0)).toEqual(["e2","e1"]);
  });
});

describe("addToWorkoutPatch", () => {
  it("appends the new exercise at the end of every workout weekday", () => {
    const catalog = orderCatalog();
    catalog.set("e3", { name:"Tríceps", muscle:"Braço", active:true, days:[] });
    const program = deriveProgram(catalog);
    const patch = addToWorkoutPatch(catalog, program, "A", "e3");
    // e1/e2 sit at order 1/2 (not 0-indexed) on both weekdays, so the new
    // exercise lands one past the highest existing order, not the sibling count.
    expect(patch).toEqual({ days:[0,3], orderByDay:{0:3,3:3} });
  });

  it("skips over a gap in existing orders instead of colliding", () => {
    const catalog = new Map([
      ["x", { name:"X", muscle:"M", active:true, days:[0], orderByDay:{0:0} }],
      ["y", { name:"Y", muscle:"M", active:true, days:[0], orderByDay:{0:1} }],
      ["z", { name:"Z", muscle:"M", active:true, days:[0], orderByDay:{0:3} }], // gap at 2
      ["w", { name:"W", muscle:"M", active:true, days:[] }],
    ]);
    const program = deriveProgram(catalog);
    const patch = addToWorkoutPatch(catalog, program, "A", "w");
    expect(patch).toEqual({ days:[0], orderByDay:{0:4} });
    const applied = cloneCatalog(catalog);
    applied.get("w").days = patch.days;
    applied.get("w").orderByDay = patch.orderByDay;
    expect(weekdayExerciseIds(applied, 0)).toEqual(["x","y","z","w"]);
  });

  it("keeps the program consistent once applied", () => {
    const catalog = orderCatalog();
    catalog.set("e3", { name:"Tríceps", muscle:"Braço", active:true, days:[] });
    const program = deriveProgram(catalog);
    const patch = addToWorkoutPatch(catalog, program, "A", "e3");
    const applied = cloneCatalog(catalog);
    applied.get("e3").days = patch.days;
    applied.get("e3").orderByDay = patch.orderByDay;
    expect(isProgramConsistent(program, applied)).toBe(true);
    expect(weekdayExerciseIds(applied, 3)).toContain("e3");
  });

  it("returns null when the exercise is already on every weekday of the workout", () => {
    const catalog = orderCatalog();
    const program = deriveProgram(catalog);
    expect(addToWorkoutPatch(catalog, program, "A", "e1")).toBeNull();
  });

  it("returns null for an unknown letter", () => {
    const catalog = orderCatalog();
    const program = deriveProgram(catalog);
    expect(addToWorkoutPatch(catalog, program, "Z", "e1")).toBeNull();
  });
});

describe("removeFromWorkoutPatch", () => {
  function sharedCatalog(){
    return new Map([
      ["e1", { name:"Supino", muscle:"Peito", active:true, days:[0,3,1], orderByDay:{0:1,3:1,1:1} }],
      ["e2", { name:"Supino Inclinado", muscle:"Peito", active:true, days:[0,3], orderByDay:{0:2,3:2} }],
      ["eb", { name:"Remada", muscle:"Costas", active:true, days:[1], orderByDay:{1:2} }],
    ]);
  }

  it("removes the exercise from both workout weekdays but keeps an unrelated one", () => {
    const catalog = sharedCatalog();
    const program = deriveProgram(catalog);
    expect(workoutByLetter(program, "B").weekdays).toEqual([1]); // e1 also anchors workout B on Tue
    const patch = removeFromWorkoutPatch(catalog, program, "A", "e1");
    expect(patch.days).toEqual([1]);
    expect(patch.orderByDay).toEqual({ 1:1 });
  });

  it("keeps the program consistent once applied", () => {
    const catalog = sharedCatalog();
    const program = deriveProgram(catalog);
    const patch = removeFromWorkoutPatch(catalog, program, "A", "e1");
    const applied = cloneCatalog(catalog);
    applied.get("e1").days = patch.days;
    applied.get("e1").orderByDay = patch.orderByDay;
    expect(isProgramConsistent(program, applied)).toBe(true);
    expect(weekdayExerciseIds(applied, 0)).toEqual(["e2"]);
    expect(weekdayExerciseIds(applied, 1)).toContain("e1"); // workout B untouched
  });

  it("returns null when the exercise isn't on any weekday of the workout", () => {
    const catalog = sharedCatalog();
    const program = deriveProgram(catalog);
    expect(removeFromWorkoutPatch(catalog, program, "A", "eb")).toBeNull();
  });
});

// Applies a patches Map<id, {days, orderByDay}> to a cloned catalog for consistency checks.
function applyPatches(catalog, patches){
  const applied = cloneCatalog(catalog);
  patches.forEach((patch, id) => {
    const ex = applied.get(id);
    if(!ex) return;
    ex.days = patch.days;
    ex.orderByDay = patch.orderByDay;
  });
  return applied;
}

describe("setWorkoutWeekdays", () => {
  it("removes a weekday: the workout's exercises lose that day, it becomes rest, program stays consistent", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    const result = setWorkoutWeekdays(catalog, program, "A", [0]);
    expect(result.program.workouts.find(w => w.letter === "A").weekdays).toEqual([0]);
    expect(result.patches.get("supino").days).toEqual([0]);
    expect(result.patches.get("supino").orderByDay[3]).toBeUndefined();

    const applied = applyPatches(catalog, result.patches);
    expect(weekdayExerciseIds(applied, 3)).toEqual([]);
    expect(isProgramConsistent(result.program, applied)).toBe(true);
  });

  it("adds a rest weekday: exercises gain it with the reference weekday's order", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    const result = setWorkoutWeekdays(catalog, program, "A", [0,3,6]);
    expect(result.program.workouts.find(w => w.letter === "A").weekdays).toEqual([0,3,6]);
    const patch = result.patches.get("supino");
    expect(patch.days).toEqual([0,3,6]);
    expect(patch.orderByDay[6]).toBe(patch.orderByDay[0]);

    const applied = applyPatches(catalog, result.patches);
    expect(isProgramConsistent(result.program, applied)).toBe(true);
  });

  it("stealing another workout's weekday moves its exercises over and shrinks it", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    const result = setWorkoutWeekdays(catalog, program, "A", [0,1,3]);
    const A = result.program.workouts.find(w => w.letter === "A");
    const B = result.program.workouts.find(w => w.letter === "B");
    expect(A.weekdays).toEqual([0,1,3]);
    expect(B.weekdays).toEqual([4]);
    expect(result.patches.get("supino").days).toEqual([0,1,3]);
    expect(result.patches.get("agacho").days).toEqual([4]);

    const applied = applyPatches(catalog, result.patches);
    expect(isProgramConsistent(result.program, applied)).toBe(true);
  });

  it("absorbing every remaining weekday of another workout removes it from the program", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    const result = setWorkoutWeekdays(catalog, program, "A", [0,1,3,4]);
    expect(result.program.workouts.find(w => w.letter === "B")).toBeUndefined();
    expect(result.patches.get("agacho").days).toEqual([]);

    const applied = applyPatches(catalog, result.patches);
    expect(isProgramConsistent(result.program, applied)).toBe(true);
  });

  it("an exercise shared by two workouts keeps the target weekday once, at the target's index", () => {
    const catalog = new Map([
      ["shared", { name:"Shared", muscle:"M", active:true, days:[0,3,1,4], orderByDay:{0:1,3:1,1:5,4:5} }],
      ["aOnly", { name:"AOnly", muscle:"M", active:true, days:[0,3], orderByDay:{0:2,3:2} }],
      ["bOnly", { name:"BOnly", muscle:"M", active:true, days:[1,4], orderByDay:{1:1,4:1} }],
    ]);
    const program = deriveProgram(catalog);
    const result = setWorkoutWeekdays(catalog, program, "A", [0,1,3]);
    const patch = result.patches.get("shared");
    expect(patch.days).toEqual([0,1,3,4]);
    expect(patch.orderByDay[1]).toBe(1); // A's Monday order for "shared", not re-derived from B

    const applied = applyPatches(catalog, result.patches);
    expect(isProgramConsistent(result.program, applied)).toBe(true);
  });

  it("returns empty patches and a deep-equal program when nextWeekdays matches the current weekdays", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    const result = setWorkoutWeekdays(catalog, program, "A", [3,0]);
    expect(result.patches.size).toBe(0);
    expect(result.program).toEqual(program);
  });

  it("returns null for an unknown letter or an empty/invalid weekdays list", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    expect(setWorkoutWeekdays(catalog, program, "Z", [0])).toBeNull();
    expect(setWorkoutWeekdays(catalog, program, "A", [])).toBeNull();
    expect(setWorkoutWeekdays(catalog, program, "A", [7,-1])).toBeNull();
  });

  it("does not mutate the catalog or program inputs", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    const catalogSnapshot = JSON.stringify([...catalog]);
    const programSnapshot = JSON.stringify(program);
    setWorkoutWeekdays(catalog, program, "A", [0,1,3,4]);
    expect(JSON.stringify([...catalog])).toBe(catalogSnapshot);
    expect(JSON.stringify(program)).toBe(programSnapshot);
  });
});

describe("movePatch", () => {
  function movableCatalog(){
    return new Map([
      ["a1", { name:"A1", muscle:"M", active:true, days:[0,3], orderByDay:{0:1,3:1} }],
      ["a2", { name:"A2", muscle:"M", active:true, days:[0,3], orderByDay:{0:2,3:2} }],
      ["b1", { name:"B1", muscle:"M", active:true, days:[1,4], orderByDay:{1:1,4:1} }],
    ]);
  }

  it("moves an exercise off the source workout onto the end of the target's weekdays", () => {
    const catalog = abcCatalog(); // A=supino Mon/Thu, B=agacho Tue/Fri (order 1 on both)
    const program = deriveProgram(catalog);
    const patch = movePatch(catalog, program, "A", "B", "supino");
    expect(patch.days).toEqual([1,4]);
    expect(patch.orderByDay[1]).toBeGreaterThan(0); // lands after agacho on Tue
    expect(patch.orderByDay[4]).toBeGreaterThan(0); // and on Fri
  });

  it("keeps the program consistent once applied", () => {
    const catalog = movableCatalog();
    const program = deriveProgram(catalog);
    const patch = movePatch(catalog, program, "A", "B", "a2");
    const applied = cloneCatalog(catalog);
    applied.get("a2").days = patch.days;
    applied.get("a2").orderByDay = patch.orderByDay;
    expect(isProgramConsistent(program, applied)).toBe(true);
    expect(weekdayExerciseIds(applied, 1)).toEqual(["b1","a2"]);
    expect(weekdayExerciseIds(applied, 0)).toEqual(["a1"]);
  });

  it("returns null for the same letter, an exercise not on the source workout, or an unknown letter", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    expect(movePatch(catalog, program, "A", "A", "supino")).toBeNull();
    expect(movePatch(catalog, program, "A", "B", "agacho")).toBeNull(); // agacho isn't on A
    expect(movePatch(catalog, program, "Z", "B", "supino")).toBeNull();
    expect(movePatch(catalog, program, "A", "Z", "supino")).toBeNull();
  });
});

describe("planSetCount", () => {
  it("sums reps.length across plain exercises", () => {
    const dayEx = [{ reps:[10,10,8] }, { reps:[12,12] }];
    expect(planSetCount(dayEx)).toBe(5);
  });

  it("adds the superset's own reps.length", () => {
    const dayEx = [{ reps:[10,10], superset:{ reps:[15,15,15] } }];
    expect(planSetCount(dayEx)).toBe(5);
  });

  it("treats a missing reps array as 0 sets", () => {
    const dayEx = [{ name:"No reps" }, { reps:[10] }];
    expect(planSetCount(dayEx)).toBe(1);
  });

  it("is 0 for an empty or undefined list", () => {
    expect(planSetCount([])).toBe(0);
    expect(planSetCount(undefined)).toBe(0);
    expect(planSetCount(null)).toBe(0);
  });
});

describe("appendToWeekdaysPatch", () => {
  it("uses index 0 on a rest weekday with nothing else on it", () => {
    const catalog = new Map([["x", { name:"X", muscle:"M", active:true, days:[], orderByDay:{} }]]);
    expect(appendToWeekdaysPatch(catalog, [6], "x")).toEqual({ days:[6], orderByDay:{6:0} });
  });

  it("skips over a gap in existing orders", () => {
    const catalog = new Map([
      ["a", { name:"A", muscle:"M", active:true, days:[0], orderByDay:{0:0} }],
      ["b", { name:"B", muscle:"M", active:true, days:[0], orderByDay:{0:3} }], // gap at 1,2
      ["x", { name:"X", muscle:"M", active:true, days:[], orderByDay:{} }],
    ]);
    expect(appendToWeekdaysPatch(catalog, [0], "x")).toEqual({ days:[0], orderByDay:{0:4} });
  });

  it("returns null when already on every requested weekday", () => {
    const catalog = new Map([["x", { name:"X", muscle:"M", active:true, days:[0,3], orderByDay:{0:0,3:0} }]]);
    expect(appendToWeekdaysPatch(catalog, [0,3], "x")).toBeNull();
  });
});

describe("replaceInWorkoutPatches", () => {
  it("moves the new id to the old id's position on every weekday of the workout", () => {
    const catalog = abcCatalog();
    catalog.set("newEx", { name:"Novo", muscle:"Peito", active:true, days:[], orderByDay:{} });
    const program = deriveProgram(catalog);
    const patches = replaceInWorkoutPatches(catalog, program, "A", "supino", "newEx");
    expect(patches.get("supino")).toEqual({ days:[], orderByDay:{} });
    expect(patches.get("newEx")).toEqual({ days:[0,3], orderByDay:{0:1,3:1} }); // supino's own order on both

    const applied = applyPatches(catalog, patches);
    expect(isProgramConsistent(program, applied)).toBe(true);
    expect(weekdayExerciseIds(applied, 0)).toEqual(["newEx"]);
  });

  it("moves newId rather than duplicating it when it's already on one of the workout's weekdays", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog); // derived before "extra" exists, so A stays [0,3]
    catalog.set("extra", { name:"Extra", muscle:"Peito", active:true, days:[0], orderByDay:{0:9} });
    const patches = replaceInWorkoutPatches(catalog, program, "A", "supino", "extra");
    expect(patches.get("extra")).toEqual({ days:[0,3], orderByDay:{0:1,3:1} });
  });

  it("returns null when the letter is unknown, ids are equal, oldId isn't on the workout, or newId is missing", () => {
    const catalog = abcCatalog();
    const program = deriveProgram(catalog);
    expect(replaceInWorkoutPatches(catalog, program, "Z", "supino", "agacho")).toBeNull();
    expect(replaceInWorkoutPatches(catalog, program, "A", "supino", "supino")).toBeNull();
    expect(replaceInWorkoutPatches(catalog, program, "A", "agacho", "remada")).toBeNull(); // agacho isn't on A
    expect(replaceInWorkoutPatches(catalog, program, "A", "supino", "unknownId")).toBeNull();
  });
});

describe("nextLetter", () => {
  it("returns D after an ABC program", () => {
    expect(nextLetter(deriveProgram(abcCatalog()))).toBe("D");
  });

  it("returns null when all 7 letters are used", () => {
    const workouts = LETTERS.map((letter, i) => ({ letter, label:"", focus:[], weekdays:[i] }));
    expect(nextLetter({ version:1, workouts })).toBeNull();
  });

  it("fills a gap: A and C used → B", () => {
    const program = { version:1, workouts:[
      { letter:"A", label:"", focus:[], weekdays:[0] },
      { letter:"C", label:"", focus:[], weekdays:[2] },
    ] };
    expect(nextLetter(program)).toBe("B");
  });
});

describe("addWorkout", () => {
  it("adds a new workout with the next letter on a free weekday", () => {
    const program = deriveProgram(abcCatalog()); // A/B/C use 0,1,2,3,4,5 — Sunday (6) is free
    const result = addWorkout(program, { label:"Extra", focus:["perna"], weekdays:[6] });
    expect(result.workouts).toHaveLength(4);
    expect(result.workouts.find(w => w.letter === "D")).toEqual({
      letter:"D", label:"Extra", focus:["perna"], weekdays:[6],
    });
  });

  it("returns null when a requested weekday already belongs to a workout", () => {
    const program = deriveProgram(abcCatalog());
    expect(addWorkout(program, { weekdays:[0] })).toBeNull(); // Monday is A's
  });

  it("returns null for an empty or invalid weekdays list", () => {
    const program = deriveProgram(abcCatalog());
    expect(addWorkout(program, { weekdays:[] })).toBeNull();
    expect(addWorkout(program, { weekdays:[7,-1] })).toBeNull();
  });

  it("returns null when there is no letter left", () => {
    const workouts = LETTERS.map((letter, i) => ({ letter, label:"", focus:[], weekdays:[i] }));
    expect(addWorkout({ version:1, workouts }, { weekdays:[6] })).toBeNull();
  });

  it("does not mutate its inputs", () => {
    const program = deriveProgram(abcCatalog());
    const snapshot = JSON.stringify(program);
    addWorkout(program, { label:"Extra", weekdays:[6] });
    expect(JSON.stringify(program)).toBe(snapshot);
  });
});

describe("newExerciseDoc", () => {
  it("defaults reps to [10,10,10] and fills in the rest of the catalog shape", () => {
    const doc = newExerciseDoc({ name:"Supino", muscle:"peito" });
    expect(doc).toEqual({
      name:"Supino", muscle:"peito", reps:[10,10,10],
      badges:[], grip:null, note:null, active:true, days:[], orderByDay:{}, superset:null,
    });
  });

  it("copies a custom reps array rather than sharing the reference", () => {
    const reps = [8,8,8];
    const doc = newExerciseDoc({ name:"Supino", muscle:"peito", reps });
    expect(doc.reps).toEqual(reps);
    expect(doc.reps).not.toBe(reps);
  });
});
