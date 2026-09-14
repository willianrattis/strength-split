export const UNIT_CYCLE = ["kg","lb","placas"];
export const UNIT_ABBR  = { kg:"kg", lb:"lb", placas:"pl" };
export const UNIT_BTN   = { kg:"KG", lb:"LB", placas:"PL" };
export const UNIT_STEP  = { kg:2.5, lb:5, placas:1 };

export const LB_TO_KG = 0.45359237;

// Assumed mass of one plate on a stack machine. Real stacks vary (4.5–7 kg), so this is
// a deliberate approximation that keeps a plate-logged history comparable with kg/lb
// instead of unusable. Single source of truth — if this ever becomes per-machine, it
// changes here.
export const PLATE_KG = 5;

const TO_KG = { kg: 1, lb: LB_TO_KG, placas: PLATE_KG };

// Converts `w` from unit `from` to unit `to`. Returns null only for a non-finite input
// or an unknown unit string.
export function convertWeight(w, from, to){
  if(typeof w !== "number" || !isFinite(w)) return null;
  const f = from || "kg", t = to || "kg";
  if(f === t) return w;
  const fk = TO_KG[f], tk = TO_KG[t];
  if(fk == null || tk == null) return null;
  return w * fk / tk;
}

// Display granularity for a derived/averaged reference value: half a kg or lb, whole
// plates. Distinct from UNIT_STEP, which is the increment for ADDING weight to a bar —
// snapping a reference to 2.5 kg throws away ~1 kg of real signal.
export function roundForDisplay(w, unit){
  if(typeof w !== "number" || !isFinite(w)) return null;
  const step = unit === "placas" ? 1 : 0.5;
  return Math.round(Math.round(w / step) * step * 100) / 100;
}
