import { describe, it, expect } from "vitest";
import { esc, stripDiacritics, normMachine, sameMachine } from "../src/domain/text.js";

describe("esc", () => {
  it("maps &, <, >, \", ' to entities", () => {
    expect(esc("&")).toBe("&amp;");
    expect(esc("<")).toBe("&lt;");
    expect(esc(">")).toBe("&gt;");
    expect(esc('"')).toBe("&quot;");
    expect(esc("'")).toBe("&#39;");
  });

  it("escapes & first so it is not double-escaped", () => {
    expect(esc("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("returns \"\" for null/undefined, and \"0\" for 0", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc(0)).toBe("0");
  });

  it("is not idempotent when applied twice", () => {
    expect(esc(esc("&"))).toBe("&amp;amp;");
  });
});

describe("stripDiacritics", () => {
  it("lowercases and strips accents", () => {
    expect(stripDiacritics("Tríceps Testa")).toBe("triceps testa");
  });
});

describe("normMachine", () => {
  it("trims, lowercases and strips accents", () => {
    expect(normMachine(" Máquina 3 ")).toBe("maquina 3");
  });

  it("returns null for empty/null/undefined", () => {
    expect(normMachine("")).toBeNull();
    expect(normMachine(null)).toBeNull();
    expect(normMachine(undefined)).toBeNull();
  });
});

describe("sameMachine", () => {
  it("treats differently-formatted equal machines as equal", () => {
    expect(sameMachine("Máquina 3", " maquina 3 ")).toBe(true);
  });

  it("treats null/null as equal", () => {
    expect(sameMachine(null, null)).toBe(true);
  });
});
