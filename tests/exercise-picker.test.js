import { describe, it, expect } from "vitest";
import { nameKey, pickerResults, findUserDocByName, defaultRepsFor } from "../src/domain/exercise-picker.js";

describe("nameKey", () => {
  it("trims, lowercases, strips accents and collapses internal whitespace", () => {
    expect(nameKey("  Supino  Reto ")).toBe(nameKey("supino reto"));
    expect(nameKey("  Supino  Reto ")).toBe("supino reto");
  });

  it("strips accents", () => {
    expect(nameKey("Tríceps")).toBe(nameKey("triceps"));
    expect(nameKey("Tríceps")).toBe("triceps");
  });
});

const library = [
  { name: "Supino reto com barra", muscle: "peito", type: "comp" },
  { name: "Supino inclinado com barra", muscle: "peito", type: "comp" },
  { name: "Crucifixo reto com halter", muscle: "peito", type: "iso" },
  { name: "Elevação lateral", muscle: "ombro", type: "iso" },
  { name: "Desenvolvimento militar", muscle: "ombro", type: "comp" },
  { name: "Rosca direta", muscle: "bíceps", type: "iso" },
  { name: "Remada curvada", muscle: "costas", type: "comp" },
];

const muscleLabels = { peito: "Peito", costas: "Costas", ombro: "Ombro", "bíceps": "Bíceps" };
const muscleOrder = ["peito", "costas", "ombro", "bíceps"];

describe("pickerResults — merge", () => {
  it("merges a user doc matching a library entry (case-insensitive) into one item with userId", () => {
    const userCatalog = new Map([
      ["u1", { name: "supino reto com barra", muscle: "peito", active: true }],
    ]);
    const results = pickerResults(library, userCatalog, [], {});
    const peito = results.find(g => g.muscle === "peito").items;
    const matches = peito.filter(it => it.key === nameKey("Supino reto com barra"));
    expect(matches).toHaveLength(1);
    expect(matches[0].userId).toBe("u1");
    expect(matches[0].type).toBe("comp"); // library's type wins for a merged item
  });

  it("keeps a user-only exercise, defaulting its type to iso", () => {
    const userCatalog = new Map([
      ["u2", { name: "Remada Pendlay", muscle: "costas", active: true }],
    ]);
    const results = pickerResults(library, userCatalog, [], {});
    const costas = results.find(g => g.muscle === "costas").items;
    const pendlay = costas.find(it => it.name === "Remada Pendlay");
    expect(pendlay).toBeTruthy();
    expect(pendlay.type).toBe("iso");
    expect(pendlay.userId).toBe("u2");
  });

  it("skips user docs with no name", () => {
    const userCatalog = new Map([["u3", { muscle: "peito", active: true }]]);
    expect(() => pickerResults(library, userCatalog, [], {})).not.toThrow();
  });
});

describe("pickerResults — query", () => {
  it("matches a name fragment without accents", () => {
    const results = pickerResults(library, new Map(), [], { query: "elevacao" });
    const names = results.flatMap(g => g.items.map(it => it.name));
    expect(names).toEqual(["Elevação lateral"]);
  });

  it("matches by muscle label", () => {
    const results = pickerResults(library, new Map(), [], { query: "biceps", muscleLabels });
    const names = results.flatMap(g => g.items.map(it => it.name));
    expect(names).toEqual(["Rosca direta"]);
    expect(results[0].muscle).toBe("bíceps");
  });
});

describe("pickerResults — filtering and ordering", () => {
  it("filters by muscles", () => {
    const results = pickerResults(library, new Map(), [], { muscles: ["ombro"] });
    expect(results).toHaveLength(1);
    expect(results[0].muscle).toBe("ombro");
    expect(results[0].items.map(it => it.name)).toEqual(["Desenvolvimento militar", "Elevação lateral"]);
  });

  it("orders groups by muscleOrder, unknown muscles last alphabetically", () => {
    const results = pickerResults(library, new Map(), [], { muscleOrder });
    expect(results.map(g => g.muscle)).toEqual(["peito", "costas", "ombro", "bíceps"]);
  });

  it("puts unranked muscles after ranked ones", () => {
    const withExtra = [...library, { name: "Panturrilha em pé", muscle: "panturrilha", type: "iso" }];
    const results = pickerResults(withExtra, new Map(), [], { muscleOrder: ["ombro"] });
    expect(results.map(g => g.muscle)).toEqual(["ombro", "bíceps", "costas", "panturrilha", "peito"]);
  });

  it("sorts comp before iso within a group, then pt-BR name order", () => {
    const results = pickerResults(library, new Map(), [], {});
    const peito = results.find(g => g.muscle === "peito").items;
    expect(peito.map(it => it.name)).toEqual([
      "Supino inclinado com barra", // comp, alphabetically first among comps
      "Supino reto com barra",      // comp
      "Crucifixo reto com halter",  // iso
    ]);
  });
});

describe("pickerResults — inWorkout", () => {
  it("flags items already in the target workout, case/accent-insensitively", () => {
    const results = pickerResults(library, new Map(), ["Elevacao Lateral"], {});
    const ombro = results.find(g => g.muscle === "ombro").items;
    const elevacao = ombro.find(it => it.name === "Elevação lateral");
    const desenvolvimento = ombro.find(it => it.name === "Desenvolvimento militar");
    expect(elevacao.inWorkout).toBe(true);
    expect(desenvolvimento.inWorkout).toBe(false);
  });
});

describe("findUserDocByName", () => {
  it("prefers an active doc when two share a key", () => {
    const userCatalog = new Map([
      ["inactive1", { name: "Supino Reto", muscle: "peito", active: false }],
      ["active1", { name: "supino reto", muscle: "peito", active: true }],
    ]);
    expect(findUserDocByName(userCatalog, "SUPINO RETO")).toBe("active1");
  });

  it("falls back to an inactive match when no active one exists", () => {
    const userCatalog = new Map([
      ["inactive1", { name: "Supino Reto", muscle: "peito", active: false }],
    ]);
    expect(findUserDocByName(userCatalog, "supino reto")).toBe("inactive1");
  });

  it("returns null when there is no match", () => {
    expect(findUserDocByName(new Map(), "Anything")).toBeNull();
    const userCatalog = new Map([["a", { name: "Agachamento", muscle: "perna", active: true }]]);
    expect(findUserDocByName(userCatalog, "Supino")).toBeNull();
  });
});

describe("defaultRepsFor", () => {
  it("gives comps [8,8,8,8]", () => {
    expect(defaultRepsFor(library, "Supino reto com barra")).toEqual([8, 8, 8, 8]);
  });

  it("gives isolations [12,12,12]", () => {
    expect(defaultRepsFor(library, "Crucifixo reto com halter")).toEqual([12, 12, 12]);
  });

  it("matches case/accent-insensitively", () => {
    expect(defaultRepsFor(library, "SUPINO reto COM barra")).toEqual([8, 8, 8, 8]);
  });

  it("falls back to [12,12,12] when the name isn't in the library", () => {
    expect(defaultRepsFor(library, "Exercício desconhecido")).toEqual([12, 12, 12]);
  });

  it("returns a fresh array each call", () => {
    const a = defaultRepsFor(library, "Supino reto com barra");
    const b = defaultRepsFor(library, "Supino reto com barra");
    expect(a).not.toBe(b);
  });
});
