export const UNIT_CYCLE = ["kg","lb","placas"];
export const UNIT_ABBR  = { kg:"kg", lb:"lb", placas:"pl" };
export const UNIT_BTN   = { kg:"KG", lb:"LB", placas:"PL" };
export const UNIT_STEP  = { kg:2.5, lb:5, placas:1 };

export const LB_TO_KG = 0.45359237;

// Converts `w` from unit `from` to unit `to`. Returns null when the units are not
// comparable: "placas" is a machine-specific plate count with no fixed mass, so it
// only ever converts to itself.
export function convertWeight(w, from, to){
  if(typeof w !== "number" || !isFinite(w)) return null;
  const f = from || "kg", t = to || "kg";
  if(f === t) return w;
  if(f === "placas" || t === "placas") return null;
  if(f === "lb" && t === "kg") return w * LB_TO_KG;
  if(f === "kg" && t === "lb") return w / LB_TO_KG;
  return null;
}
