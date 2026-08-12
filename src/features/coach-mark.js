import { state } from "../core/state.js";
import { $viewTreino, $daysToolbar } from "../core/dom.js";
import { hasSeenTip, markTipSeen } from "./tips.js";

// Generic dismissible one-time coach-mark. No-ops if this tip was already seen,
// or if a coach-mark for this id is already sitting in the DOM (calling this
// repeatedly from multiple settle points is expected — see maybeShowModeTip).
export function showCoachMark(id, afterEl, html){
  if(!afterEl || hasSeenTip(id)) return;
  const domId = `coachMark-${id}`;
  if(document.getElementById(domId)) return;
  const el = document.createElement("div");
  el.className = "coach-mark";
  el.id = domId;
  el.innerHTML = `<span>${html}</span><button class="coach-mark-close" type="button" title="Dispensar">×</button>`;
  afterEl.insertAdjacentElement("afterend", el);
  el.querySelector(".coach-mark-close").addEventListener("click", () => {
    markTipSeen(id);
    el.remove();
  });
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
  showCoachMark("modeToggle", $daysToolbar,
    "Toque em <b>Carga</b> para registrar peso e repetições — é assim que o app sugere carga e mostra sua evolução. No <b>Compacto</b>, você só marca as séries feitas.");
}
