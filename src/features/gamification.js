import { esc } from "../domain/text.js";
import { computeGamification } from "../domain/gamification.js";
import { state } from "../core/state.js";
import { $gamifModal } from "../core/dom.js";

// Presentation for BADGE_IDS in src/domain/gamification.js — ids and order must match.
const BADGES = [
  { id:"consistencia", name:"Consistência", desc:"Treinou 7 dias seguidos",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M9 16l2 2 4-4"/></svg>' },
  { id:"levantador", name:"Levantador", desc:"1.000 kg de volume em um dia",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M2 8h4"/><path d="M2 16h4"/><path d="M18 8h4"/><path d="M18 16h4"/><path d="M6 12h12"/></svg>' },
  { id:"madrugador", name:"Madrugador", desc:"Treinou antes das 6h",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="5"/></svg>' }
];

export function showGamifToast(name){
  if(!document.body.classList.contains("flag-gamification")) return;
  let $t = document.getElementById("gamifToast");
  if(!$t){
    $t = document.createElement("div");
    $t.id = "gamifToast";
    $t.className = "gamif-toast";
    document.body.appendChild($t);
  }
  $t.textContent = `\u{1F3C6} Conquista: ${name}`;
  $t.classList.remove("show");
  void $t.offsetWidth; // reflow
  $t.classList.add("show");
  clearTimeout(state._gamifToastTimer);
  state._gamifToastTimer = setTimeout(() => $t.classList.remove("show"), 3500);
}

export function refreshGamification(){
  const prevEarned = state.gamification && state.gamification.badges
    ? new Set(state.gamification.badges.filter(b => b.earned).map(b => b.id))
    : null;
  state.gamification = computeGamification(state.allSessions, state.gamifStartDate);
  renderGamifChip();
  // Detect newly earned badges (only if we had a previous snapshot, i.e. not initial load)
  if(prevEarned && state.gamification.badges){
    for(const b of state.gamification.badges){
      if(b.earned && !prevEarned.has(b.id)){
        const def = BADGES.find(d => d.id === b.id);
        if(def) showGamifToast(def.name);
      }
    }
  }
}

export function renderGamifChip(){
  if(!state.gamification) return;
  const $label = document.getElementById("gamifChipLabel");
  const $fill = document.getElementById("gamifChipFill");
  if(!$label || !$fill) return;
  $label.textContent = `Nv ${state.gamification.level} · ${state.gamification.title}`;
  const pct = state.gamification.xpForNextLevel > 0 ? Math.min(100, Math.round(state.gamification.xpIntoLevel / state.gamification.xpForNextLevel * 100)) : 100;
  $fill.style.width = pct + "%";
  const $chip = document.getElementById("gamifChip");
  if($chip && $chip.classList.contains("loading")){
    $chip.classList.remove("loading");
    $chip.classList.add("revealed");
    setTimeout(() => $chip.classList.remove("revealed"), 320);
  }
}

export function renderGamifModal(){
  if(!state.gamification) return;
  const g = state.gamification;
  document.getElementById("gamifLevelBig").textContent = g.level;
  document.getElementById("gamifTitleBig").textContent = g.title;
  const pct = g.xpForNextLevel > 0 ? Math.min(100, Math.round(g.xpIntoLevel / g.xpForNextLevel * 100)) : 100;
  document.getElementById("gamifXpFill").style.width = pct + "%";
  document.getElementById("gamifXpText").textContent = g.level < 50
    ? `${g.xpIntoLevel} / ${g.xpForNextLevel} XP para o próximo nível`
    : `Nível máximo alcançado!`;
  document.getElementById("gamifTotalXp").textContent = g.totalXP.toLocaleString("pt-BR");
  document.getElementById("gamifTrained").textContent = g.trainedDays;
  document.getElementById("gamifMissed").textContent = g.missedDays;
  // Badges
  const $sec = document.getElementById("gamifBadgesSection");
  if(!g.badges){ $sec.style.display = "none"; return; }
  let html = '<div class="gamif-badges-label">Conquistas</div><div class="gamif-badges-grid">';
  for(const b of g.badges){
    const def = BADGES.find(d => d.id === b.id);
    if(!def) continue;
    const locked = !b.earned;
    let dateStr = "";
    if(b.earnedDate){
      const [y,m,d] = b.earnedDate.split("-");
      dateStr = `em ${d}/${m}/${y}`;
    }
    html += `<div class="gamif-badge${locked ? " locked" : ""}">
      <div class="gamif-badge-icon">${def.icon}</div>
      <div class="gamif-badge-name">${esc(def.name)}</div>
      ${locked ? `<div class="gamif-badge-desc">${esc(def.desc)}</div>` : `<div class="gamif-badge-date">${dateStr}</div>`}
    </div>`;
  }
  html += '</div>';
  $sec.innerHTML = html;
  $sec.style.display = "";
}

export function init(){
  // Chip click → open modal
  document.getElementById("gamifChip").addEventListener("click", () => {
    renderGamifModal();
    $gamifModal.classList.add("open");
  });
  $gamifModal.addEventListener("click", e => { if(e.target === $gamifModal) $gamifModal.classList.remove("open"); });
}
