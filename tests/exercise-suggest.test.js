import { describe, it, expect } from "vitest";
import { movementFamily, suggestExercises } from "../src/domain/exercise-suggest.js";

const LIB = [
  { name: "Supino reto com barra", muscle: "peito", type: "comp" },
  { name: "Supino reto com halter", muscle: "peito", type: "comp" },
  { name: "Supino inclinado com barra", muscle: "peito", type: "comp" },
  { name: "Supino máquina", muscle: "peito", type: "comp" },
  { name: "Crucifixo reto com halter", muscle: "peito", type: "iso" },
  { name: "Crossover polia alta", muscle: "peito", type: "iso" },
  { name: "Voador", muscle: "peito", type: "iso" },
  { name: "Tríceps corda", muscle: "tríceps", type: "iso" },
  { name: "Tríceps testa", muscle: "tríceps", type: "iso" },
  { name: "Tríceps francês", muscle: "tríceps", type: "iso" },
];

describe("movementFamily", () => {
  it("normalizes accents, case and extra spaces", () => {
    expect(movementFamily("SUPINO   RETO com Barra")).toBe("supino reto");
    expect(movementFamily("Tríceps Corda")).toBe(movementFamily("triceps corda"));
  });

  it("returns the single word for a one-word name", () => {
    expect(movementFamily("Voador")).toBe("voador");
  });
});

describe("suggestExercises", () => {
  it("returns [] for empty or invalid focus", () => {
    expect(suggestExercises(LIB, [])).toEqual([]);
    expect(suggestExercises(LIB, null)).toEqual([]);
    expect(suggestExercises(LIB, undefined)).toEqual([]);
  });

  it("1 focus muscle → 5 items: 3 comps then 2 isos, skipping a same-family comp", () => {
    const out = suggestExercises(LIB, ["peito"]);
    expect(out.map(o => o.name)).toEqual([
      "Supino reto com barra",
      "Supino inclinado com barra",
      "Supino máquina",
      "Crucifixo reto com halter",
      "Crossover polia alta",
    ]);
    expect(out.every(o => o.muscle === "peito")).toBe(true);
  });

  it("2 focus muscles → 3 + 3; a muscle with no comps is filled entirely with isos", () => {
    const out = suggestExercises(LIB, ["peito", "tríceps"]);
    const peito = out.filter(o => o.muscle === "peito");
    const triceps = out.filter(o => o.muscle === "tríceps");
    expect(peito.length).toBe(3);
    expect(triceps.length).toBe(3);
    expect(triceps.every(o => o.type === "iso")).toBe(true);
    expect(triceps.map(o => o.name)).toEqual(["Tríceps corda", "Tríceps testa", "Tríceps francês"]);
    // focus order preserved
    expect(out.indexOf(peito[0])).toBeLessThan(out.indexOf(triceps[0]));
  });

  it("3 focus muscles → 2 per muscle", () => {
    const out = suggestExercises(LIB, ["peito", "tríceps", "costas"]);
    expect(out.filter(o => o.muscle === "peito").length).toBe(2);
    expect(out.filter(o => o.muscle === "tríceps").length).toBe(2);
    expect(out.filter(o => o.muscle === "costas").length).toBe(0);
  });

  it("exclude removes names case/accent-insensitively", () => {
    const out = suggestExercises(LIB, ["peito"], { exclude: ["supino RETO com BARRA", "crucifixo reto com halter"] });
    expect(out.map(o => o.name)).not.toContain("Supino reto com barra");
    expect(out.map(o => o.name)).not.toContain("Crucifixo reto com halter");
  });

  it("exclude also blocks the same movement family, not just the exact name", () => {
    const out = suggestExercises(LIB, ["peito"], { exclude: ["Supino reto com barra"] });
    expect(out.map(o => o.name)).not.toContain("Supino reto com barra");
    expect(out.map(o => o.name)).not.toContain("Supino reto com halter");
  });

  it("offset yields a different first comp, and wraps past the list length", () => {
    const out0 = suggestExercises(LIB, ["peito"], { offset: 0 });
    const out1 = suggestExercises(LIB, ["peito"], { offset: 1 });
    expect(out0[0].name).not.toBe(out1[0].name);

    const wrapped = suggestExercises(LIB, ["peito"], { offset: 4 }); // 4 comps → wraps to offset 0
    expect(wrapped[0].name).toBe(out0[0].name);
  });

  it("returns fewer items with no duplicates when the library is short", () => {
    const shortLib = [
      { name: "Rosca direta", muscle: "bíceps", type: "iso" },
    ];
    const out = suggestExercises(shortLib, ["bíceps"]);
    expect(out.length).toBe(1);
    expect(out[0].name).toBe("Rosca direta");
    const names = out.map(o => o.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives comps [8,8,8,8] and isos [12,12,12], as fresh array instances", () => {
    const out = suggestExercises(LIB, ["peito"]);
    const comp = out.find(o => o.type === "comp");
    const iso = out.find(o => o.type === "iso");
    expect(comp.reps).toEqual([8, 8, 8, 8]);
    expect(iso.reps).toEqual([12, 12, 12]);

    const out2 = suggestExercises(LIB, ["peito"]);
    expect(out.find(o => o.type === "comp").reps).not.toBe(out2.find(o => o.type === "comp").reps);
  });

  it("never mutates its inputs", () => {
    const libSnapshot = JSON.stringify(LIB);
    const focus = ["peito", "tríceps"];
    const focusSnapshot = JSON.stringify(focus);
    const exclude = ["Voador"];
    const excludeSnapshot = JSON.stringify(exclude);
    suggestExercises(LIB, focus, { exclude });
    expect(JSON.stringify(LIB)).toBe(libSnapshot);
    expect(JSON.stringify(focus)).toBe(focusSnapshot);
    expect(JSON.stringify(exclude)).toBe(excludeSnapshot);
  });

  it("is deterministic: same input twice deep-equals", () => {
    const a = suggestExercises(LIB, ["peito", "tríceps"], { offset: 2, exclude: ["Voador"] });
    const b = suggestExercises(LIB, ["peito", "tríceps"], { offset: 2, exclude: ["Voador"] });
    expect(a).toEqual(b);
  });

  it("ignores duplicate focus keys", () => {
    const out = suggestExercises(LIB, ["peito", "peito"]);
    // treated as a single focus muscle → perMuscle=5, not 3
    expect(out.length).toBe(5);
  });
});
