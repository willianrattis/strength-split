import { state } from "../core/state.js";
import { $viewTreino, $daysToolbar, $modeCompact, $modeLoad } from "../core/dom.js";
import { hasSeenTip, markTipSeen } from "./tips.js";

// Reusable one-time contextual popover. `anchorEl` must be `position:relative` in CSS —
// the popover renders as its absolutely-positioned child, so it floats over the page
// instead of pushing content down. No-ops if this tip was already seen, or if a popover
// for this id is already in the DOM. `dismissEls` are extra elements that, when clicked,
// dismiss the popover in addition to its own close button and an outside tap.
export function showCoachPopover(id, anchorEl, html, dismissEls = []){
  if(!anchorEl || hasSeenTip(id)) return;
  const domId = `coachPopover-${id}`;
  if(document.getElementById(domId)) return;
  const el = document.createElement("div");
  el.className = "coach-popover";
  el.id = domId;
  el.innerHTML = `
    <span class="coach-popover-caret"></span>
    <button class="coach-popover-close" type="button" title="Dispensar">×</button>
    <span>${html}</span>
  `;
  anchorEl.appendChild(el);

  function dismiss(){
    markTipSeen(id);
    el.remove();
    dismissEls.forEach(btn => btn && btn.removeEventListener("click", dismiss));
    document.removeEventListener("click", onOutsideClick, true);
  }
  el.querySelector(".coach-popover-close").addEventListener("click", dismiss);
  dismissEls.forEach(btn => btn && btn.addEventListener("click", dismiss));

  function onOutsideClick(e){
    if(!anchorEl.contains(e.target)) dismiss();
  }
  // Deferred so the click that triggered this render doesn't immediately dismiss it.
  setTimeout(() => document.addEventListener("click", onOutsideClick, true), 0);
}

export function maybeShowModeTip(){
  if(hasSeenTip("modeToggle") || state.needsOnboarding) return;
  if($viewTreino.style.display === "none") return;
  // Mutual exclusion with the first-session nudge (day/render.js's showFirstRunHint):
  // don't show if it's currently on screen, and don't race ahead of it while its own
  // "is this account really new?" full-history check is still unresolved — otherwise
  // a brand-new account could see this tip before the first-run nudge ever gets its
  // chance.
  if(document.getElementById("firstRunHint")) return;
  if(!hasSeenTip("firstRun") && state.sessionsLoadedSince !== "ALL" && (state.allSessions?.length ?? 0) === 0) return;
  showCoachPopover("modeToggle", $daysToolbar,
    "<b>Carga</b> registra peso e repetições — é o que gera sugestões e evolução.",
    [$modeCompact, $modeLoad]);
}
