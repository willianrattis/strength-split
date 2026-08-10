import { DELOAD_WEEKS_MAX, STALL_RATIO, MIN_TRACKED, MIN_TOTAL_SESSIONS } from "./tuning.js";
import { lastMachineFor } from "./machines.js";
import { isStalled } from "./history.js";

export function isDeloadActive(lastDeloadDate, today){
  if(!lastDeloadDate) return false;
  return (Date.parse(today) - Date.parse(lastDeloadDate)) < 7 * 864e5;
}

export function deloadDue(sessions, opts){
  const { lastDeloadDate = null, today, days, age = null, machineFilter = false, execOrder = false, cfg } = opts;
  if((sessions?.length || 0) < MIN_TOTAL_SESSIONS) return { due: false };
  let earliest = today;
  for(const s of sessions){ if(s.date && s.date < earliest) earliest = s.date; }
  const cycleStart = lastDeloadDate || earliest;
  const weeksSince = Math.floor((Date.parse(today) - Date.parse(cycleStart)) / (7 * 864e5));

  const entries = [];
  const seen = new Set();
  for(const k in days){
    const d = days[k];
    if(!d.ex) continue;
    d.ex.forEach(e => {
      if(!seen.has("m:" + e.name)){ seen.add("m:" + e.name); entries.push({name: e.name, isSup: false}); }
      if(e.superset && !seen.has("s:" + e.superset.name)){ seen.add("s:" + e.superset.name); entries.push({name: e.superset.name, isSup: true}); }
    });
  }
  const tracked = entries.length;
  let stalled = 0;
  entries.forEach(({name, isSup}) => {
    const machine = machineFilter ? lastMachineFor(sessions, name, isSup) : undefined;
    if(isStalled(sessions, name, { since: cycleStart, machine, execOrder, cfg, machineFilter })) stalled++;
  });

  const weeksMax = age ? (age>=55 ? 3 : age>=40 ? 4 : DELOAD_WEEKS_MAX) : DELOAD_WEEKS_MAX;
  if(weeksSince >= weeksMax){
    return { due: true, reason: `${weeksSince} semanas sem descarga` };
  }
  if(tracked >= MIN_TRACKED && stalled / tracked >= STALL_RATIO){
    return { due: true, reason: `${stalled} de ${tracked} exercícios estagnados` };
  }
  return { due: false };
}
