import { describe, it, expect } from "vitest";
import { ORDER_UNSET, orderForDay, cmpExOrder } from "../src/domain/order.js";

describe("ORDER_UNSET", () => {
  it("is 1e9 and finite", () => {
    expect(ORDER_UNSET).toBe(1e9);
    expect(Number.isFinite(ORDER_UNSET)).toBe(true);
  });

  it("self-subtraction is 0, not NaN", () => {
    expect(ORDER_UNSET - ORDER_UNSET).toBe(0);
  });
});

describe("orderForDay", () => {
  it("returns the per-day order when set, including 0", () => {
    expect(orderForDay({ orderByDay: { 0: 5 } }, 0)).toBe(5);
    expect(orderForDay({ orderByDay: { 0: 0 } }, 0)).toBe(0);
  });

  it("returns ORDER_UNSET when the key is missing", () => {
    expect(orderForDay({ orderByDay: { 0: 5 } }, 1)).toBe(ORDER_UNSET);
  });

  it("returns ORDER_UNSET when orderByDay is absent", () => {
    expect(orderForDay({}, 0)).toBe(ORDER_UNSET);
  });

  it("returns ORDER_UNSET when the value is null", () => {
    expect(orderForDay({ orderByDay: { 0: null } }, 0)).toBe(ORDER_UNSET);
  });
});

describe("cmpExOrder", () => {
  it("explicit order wins over name", () => {
    expect(cmpExOrder(1, "Z", "id1", 2, "A", "id2")).toBeLessThan(0);
  });

  it("falls back to pt-BR name collation when order is equal", () => {
    expect(cmpExOrder(1, "Água", "id1", 1, "Barra", "id2")).toBeLessThan(0);
    expect(cmpExOrder(1, "Barra", "id1", 1, "Água", "id2")).toBeGreaterThan(0);
  });

  it("falls back to docId when order and name are equal", () => {
    expect(cmpExOrder(1, "X", "a", 1, "X", "b")).toBeLessThan(0);
    expect(cmpExOrder(1, "X", "b", 1, "X", "a")).toBeGreaterThan(0);
  });

  it("sorts deterministically regardless of input order", () => {
    const a = { order: 1, name: "X", id: "a" };
    const b = { order: 1, name: "X", id: "b" };
    const sortFn = (x, y) => cmpExOrder(x.order, x.name, x.id, y.order, y.name, y.id);
    const sorted1 = [a, b].sort(sortFn).map(e => e.id);
    const sorted2 = [b, a].sort(sortFn).map(e => e.id);
    expect(sorted1).toEqual(["a", "b"]);
    expect(sorted2).toEqual(["a", "b"]);
  });

  it("lands unordered exercises after ordered ones", () => {
    // a has no explicit order (ORDER_UNSET), b has order 5 — b must sort first
    // even though "A" would alphabetically precede "Z".
    expect(cmpExOrder(ORDER_UNSET, "A", "id1", 5, "Z", "id2")).toBeGreaterThan(0);
  });
});
