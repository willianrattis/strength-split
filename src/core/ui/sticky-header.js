import { $strip, $viewTreino } from "../dom.js";

// Shared with renderStrip() in main.js — relocated here (rather than left in
// main.js) because it is also needed by updateCondensed() below, and modules
// under core/ui may not import main.js.
export function centerActiveDay(behavior){
  if(!$strip) return;
  const btn = $strip.querySelector('.day-btn[aria-selected="true"]');
  if(!btn) return;
  const cr = $strip.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  const delta = (br.left - cr.left) - (cr.width - br.width) / 2;
  $strip.scrollTo({ left: $strip.scrollLeft + delta, behavior: behavior || "auto" });
}

export function init(){
  const $days = document.querySelector("nav.days");
  const mql = window.matchMedia("(max-width:600px)");
  let ticking = false;

  function updateCondensed(){
    if(!mql.matches || $viewTreino.style.display === "none"){
      $days.classList.remove("condensed");
      return;
    }
    const sy = window.scrollY;
    if(sy > 48 && !$days.classList.contains("condensed")){
      $days.classList.add("condensed");
      centerActiveDay();
    } else if(sy < 16 && $days.classList.contains("condensed")){
      $days.classList.remove("condensed");
      centerActiveDay();
    }
  }

  window.addEventListener("scroll", () => {
    if(!ticking){
      ticking = true;
      requestAnimationFrame(() => { updateCondensed(); ticking = false; });
    }
  }, { passive: true });

  // Reset on media query change
  mql.addEventListener("change", () => updateCondensed());

  // Expose for showTab to call
  window._updateCondensed = updateCondensed;
}
