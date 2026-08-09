// Sentinel for exercises with no explicit order in a given day.
// Must stay finite: Infinity - Infinity is NaN and would corrupt the sort.
export const ORDER_UNSET = 1e9;
export const orderForDay = (ex, dk) =>
  (ex.orderByDay && ex.orderByDay[dk] != null) ? ex.orderByDay[dk] : ORDER_UNSET;

// Total order: explicit order, then name, then docId. The docId tail guarantees
// determinism even for two exercises with the same order and the same name.
export const cmpExOrder = (oa, na, ia, ob, nb, ib) =>
  (oa - ob)
  || String(na || "").localeCompare(String(nb || ""), "pt-BR")
  || String(ia ?? "").localeCompare(String(ib ?? ""));
