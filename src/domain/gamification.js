export const GAMIF_TITLES = [
  [1,"Novato"],[6,"Iniciante"],[11,"Praticante"],[16,"Dedicado"],
  [21,"Consistente"],[26,"Avançado"],[31,"Veterano"],[36,"Mestre"],
  [41,"Lenda"],[46,"Elite"]
];
export const BADGE_IDS = ["consistencia", "levantador", "madrugador"];

export function gamifTitle(level){
  let t = "Novato";
  for(const [min, name] of GAMIF_TITLES){ if(level >= min) t = name; }
  return t;
}
export function gamifXpForLevel(n){ return Math.round(100 * Math.pow(n, 1.5)); }

export function computeGamification(sessions, startDate, today = new Date()){
  const emptyBadges = BADGE_IDS.map(id => ({ id, earned:false, earnedDate:null }));
  if(!sessions || !sessions.length) return { totalXP:0, level:1, title:"Novato", xpIntoLevel:0, xpForNextLevel:gamifXpForLevel(2), trainedDays:0, missedDays:0, badges:emptyBadges };
  // Build date→{done,total,volume,earliestHour} map (O(N) over sessions)
  const dateMap = {};
  let earliest = null;
  for(const s of sessions){
    if(!s.date || !s.exercises) continue;
    if(!earliest || s.date < earliest) earliest = s.date;
    if(!dateMap[s.date]) dateMap[s.date] = { done:0, total:0, volume:0, earliestHour:24 };
    const entry = dateMap[s.date];
    for(const ex of s.exercises){
      // firstSetAt → earliestHour
      if(ex.firstSetAt){
        const d = new Date(ex.firstSetAt);
        if(!isNaN(d.getTime())){ const h = d.getHours(); if(h < entry.earliestHour) entry.earliestHour = h; }
      }
      const countSets = (sets) => {
        if(!sets) return;
        for(const set of sets){
          entry.total++;
          if(set.done){
            entry.done++;
            if(set.weight != null && set.weight !== ""){
              const w = Number(set.weight);
              if(!isNaN(w)){
                const r = set.repsDone != null ? set.repsDone : set.reps;
                if(typeof r === "number" && r > 0) entry.volume += w * r;
              }
            }
          }
        }
      };
      countSets(ex.main);
      countSets(ex.sup);
    }
  }
  if(!earliest) return { totalXP:0, level:1, title:"Novato", xpIntoLevel:0, xpForNextLevel:gamifXpForLevel(2), trainedDays:0, missedDays:0, badges:emptyBadges };
  // Walk date range from earliest to today
  const end = new Date(today.getTime()); end.setHours(0,0,0,0);
  const validStart = (typeof startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) ? startDate : earliest;
  const cur = new Date(validStart + "T00:00:00"); cur.setHours(0,0,0,0);
  let totalXP = 0, trainedDays = 0, missedDays = 0;
  let streak = 0;
  let badgeConsistencia = { earned:false, earnedDate:null };
  let badgeLevantador = { earned:false, earnedDate:null };
  let badgeMadrugador = { earned:false, earnedDate:null };
  while(cur <= end){
    const key = cur.getFullYear() + "-" + String(cur.getMonth()+1).padStart(2,"0") + "-" + String(cur.getDate()).padStart(2,"0");
    const entry = dateMap[key];
    if(entry && entry.total > 0){
      const ratio = entry.done / entry.total;
      if(ratio > 0){
        totalXP += Math.round(100 * Math.min(ratio, 1)) + (ratio >= 1 ? 25 : 0);
        trainedDays++;
        streak++;
        if(!badgeConsistencia.earned && streak >= 7){ badgeConsistencia = { earned:true, earnedDate:key }; }
        if(!badgeLevantador.earned && entry.volume >= 1000){ badgeLevantador = { earned:true, earnedDate:key }; }
        if(!badgeMadrugador.earned && entry.earliestHour < 6){ badgeMadrugador = { earned:true, earnedDate:key }; }
      } else {
        totalXP = Math.max(0, totalXP - 20);
        missedDays++;
        streak = 0;
      }
    } else {
      totalXP = Math.max(0, totalXP - 20);
      missedDays++;
      streak = 0;
    }
    cur.setDate(cur.getDate() + 1);
  }
  // Determine level (cap 50)
  let level = 1;
  for(let n = 2; n <= 50; n++){
    if(totalXP >= gamifXpForLevel(n)) level = n;
    else break;
  }
  const xpIntoLevel = totalXP - gamifXpForLevel(level);
  const xpForNextLevel = level < 50 ? gamifXpForLevel(level + 1) - gamifXpForLevel(level) : 0;
  const badges = [
    { id:"consistencia", ...badgeConsistencia },
    { id:"levantador", ...badgeLevantador },
    { id:"madrugador", ...badgeMadrugador }
  ];
  return { totalXP, level, title:gamifTitle(level), xpIntoLevel, xpForNextLevel, trainedDays, missedDays, badges };
}
