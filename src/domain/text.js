export function stripDiacritics(s){ return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }

// Escapes user-controlled strings for interpolation into innerHTML template
// literals — safe for both text nodes and quoted attribute values.
// & must be replaced first or the later entities get double-escaped.
export const esc = v => String(v ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export const normMachine = s => s ? stripDiacritics(String(s).trim().toLowerCase()) : null;
export const sameMachine = (a,b) => normMachine(a) === normMachine(b);
