import { $strip } from "../dom.js";

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
  let ticking = false;
  window.addEventListener("scroll", () => {
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(() => { $days.classList.toggle("stuck", window.scrollY > 4); ticking = false; });
  }, { passive:true });
}
