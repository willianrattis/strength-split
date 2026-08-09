import { stripDiacritics } from "./text.js";

export function equipmentOf(name){
  const n = stripDiacritics(String(name||""));
  if(n.includes("halter")) return "halter";
  if(n.includes("barra") && !n.includes("barra fixa")) return "barra";
  return "outro";
}

export function buildExTypeMap(catalog) {
  const m = new Map();
  catalog.forEach(e => m.set(stripDiacritics(e.name), e.type));
  return m;
}
export function exTypeOf(map, name) {
  return map.get(stripDiacritics(String(name || ""))) || "iso";
}
