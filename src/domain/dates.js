export function todayWeekdayIdx(d = new Date()){
  const g = d.getDay(); // 0=Sun,1=Mon...6=Sat
  return g === 0 ? 6 : g - 1; // Mon=0 … Sun=6
}

export function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function formatDate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function getWeekMonday(offset = 0){
  const now = new Date();
  const dow = now.getDay(); // 0=Sun,1=Mon...6=Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow; // days to subtract to get Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon + (offset * 7));
  return monday;
}

export function dateForDay(dayKey, offset = 0){
  const mon = getWeekMonday(offset);
  const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + dayKey);
  return formatDate(d);
}

export function sessionId(date, dayKey){ return `${date}_${dayKey}`; }

export function fmtDateBR(iso){
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function shortDate(iso, now = new Date()){
  if(!iso || iso.length < 10) return iso || "";
  const y = iso.slice(0, 4), m = iso.slice(5, 7), d = iso.slice(8, 10);
  const curY = String(now.getFullYear());
  return y !== curY ? `${d}/${m}/${y.slice(2)}` : `${d}/${m}`;
}
