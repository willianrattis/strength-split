import { stripDiacritics } from "./text.js";

export function equipmentOf(name){
  const n = stripDiacritics(String(name||""));
  if(n.includes("halter")) return "halter";
  if(n.includes("barra") && !n.includes("barra fixa")) return "barra";
  return "outro";
}
