// A schedule is a length-7 array: schedule[weekday] = dayTypeIdx | null (null = rest).

/** Default weekdays per type count: 1→[[0,2,4]], 2→[[0,3],[1,4]], 3→[[0,3],[1,4],[2,5]], 4→[[0],[1],[3],[4]], 5..7→[[0],[1],…]. >7 → first 7 get one weekday each, rest []. */
export function suggestedWeekdays(typeCount){
  if(!Number.isInteger(typeCount) || typeCount <= 0) return [];
  if(typeCount === 1) return [[0,2,4]];
  if(typeCount === 2) return [[0,3],[1,4]];
  if(typeCount === 3) return [[0,3],[1,4],[2,5]];
  if(typeCount === 4) return [[0],[1],[3],[4]];
  const out = [];
  for(let i = 0; i < typeCount; i++) out.push(i < 7 ? [i] : []);
  return out;
}

/** Schedule from plan.days[i].weekdays when ANY day has a valid non-empty weekdays array; else from suggestedWeekdays(days.length). Invalid ints (not 0-6) ignored; a weekday claimed twice keeps the first type. */
export function scheduleFromPlan(plan){
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const hasWeekdays = days.some(d => Array.isArray(d?.weekdays) && d.weekdays.length > 0);
  const schedule = new Array(7).fill(null);
  const source = hasWeekdays
    ? days.map(d => (Array.isArray(d?.weekdays) ? d.weekdays : []))
    : suggestedWeekdays(days.length);
  source.forEach((weekdays, dayTypeIdx) => {
    weekdays.forEach(wd => {
      if(!Number.isInteger(wd) || wd < 0 || wd > 6) return;
      if(schedule[wd] === null) schedule[wd] = dayTypeIdx;
    });
  });
  return schedule;
}

/** [{dayTypeIdx, weekday}] ascending by weekday, skipping nulls. */
export function scheduleToMapping(schedule){
  const mapping = [];
  (schedule || []).forEach((dayTypeIdx, weekday) => {
    if(dayTypeIdx === null || dayTypeIdx === undefined) return;
    mapping.push({ dayTypeIdx, weekday });
  });
  return mapping;
}

/** null if valid; else pt-BR message. Rules: length 7; each entry null or int in [0,typeCount); every type used ≥1 time → "O treino {letter} não está em nenhum dia." (letter = plan.days[i].type passed via `types` array). */
export function validateSchedule(schedule, types){
  const typeCount = types.length;
  if(!Array.isArray(schedule) || schedule.length !== 7) return "A agenda precisa cobrir os 7 dias da semana.";
  for(const v of schedule){
    if(v !== null && !(Number.isInteger(v) && v >= 0 && v < typeCount)) return "A agenda tem um treino inválido.";
  }
  const used = new Set(schedule.filter(v => v !== null));
  for(let i = 0; i < typeCount; i++){
    if(!used.has(i)) return `O treino ${types[i]} não está em nenhum dia.`;
  }
  return null;
}

/** New plan object with days[i].weekdays = ascending weekdays assigned to i (possibly []). Inputs untouched. */
export function applyScheduleToPlan(plan, schedule){
  const days = (plan?.days || []).map((d, i) => {
    const weekdays = [];
    (schedule || []).forEach((dayTypeIdx, wd) => { if(dayTypeIdx === i) weekdays.push(wd); });
    return { ...d, weekdays };
  });
  return { ...plan, days };
}

/** 7-char pattern for a plan's schedule: plan.days[i].type per weekday, "–" for rest. */
export function planWeekPattern(plan){
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const schedule = scheduleFromPlan(plan);
  return schedule.map(dayTypeIdx => {
    if(dayTypeIdx === null || dayTypeIdx === undefined) return "–";
    const type = days[dayTypeIdx]?.type;
    return type ? String(type)[0] : "–";
  }).join("");
}
