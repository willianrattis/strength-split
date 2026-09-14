import { state } from "../../core/state.js";
import { $panel } from "../../core/dom.js";
import { reconcileSession } from "../../core/adapters.js";
import { reorderExerciseInDay } from "../exercises/dnd.js";
import { scheduleSave } from "./session-io.js";
import { renderDay, renderStrip } from "./render.js";

// A touch that became a drag must not also open train mode. Set on a completed
// drag; the row's click handler consumes it as the very first thing it does.
let _suppressClick = false;
export function consumeDragClick(){ const s = _suppressClick; _suppressClick = false; return s; }

// Reordering the plan without realigning the session would leave logged loads
// pinned to the old array index instead of following the exercise. reconcileSession
// must run right after the reorder, before any render — same call shape loadDay()
// uses in session-io.js (dayKey there is always state.current, same as here).
async function applyReorder(fromId, toId, before){
  if(!fromId || !toId || fromId === toId) return;
  await reorderExerciseInDay(state.current, fromId, toId, before);
  state.session = reconcileSession(state.session, state.current);
  scheduleSave();
  renderDay();
  renderStrip();
}

// Called from render.js's attachHandlers() after each non-train render, not at
// module load — mirrors features/exercises/dnd.js's initDragAndDrop, with two
// differences: no drag handle (the row is already one big tap target, and a handle
// would re-clutter it), and long-press touch must suppress the row's own click.
export function initAgendaDnd(){
  const rows = $panel.querySelectorAll(".row[draggable]");
  let dragId = null;

  rows.forEach(row => {
    if(!row.dataset.id) return;   // no _id to address — leave it undraggable

    // HTML5 DnD (desktop)
    row.addEventListener("dragstart", e => {
      dragId = row.dataset.id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.id);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      $panel.querySelectorAll(".drag-over-top,.drag-over-bottom").forEach(x => x.classList.remove("drag-over-top", "drag-over-bottom"));
    });
    row.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      row.classList.toggle("drag-over-top", e.clientY < mid);
      row.classList.toggle("drag-over-bottom", e.clientY >= mid);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-top", "drag-over-bottom");
    });
    row.addEventListener("drop", e => {
      e.preventDefault();
      row.classList.remove("drag-over-top", "drag-over-bottom");
      const fromId = e.dataTransfer.getData("text/plain");
      if(fromId === row.dataset.id) return;
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      applyReorder(fromId, row.dataset.id, before);
    });

    // Long-press touch fallback (mobile), anywhere on the row — the iOS list
    // convention. 250ms mirrors the Exercícios tab's handle-based drag.
    let touchClone = null;
    let touchActive = false;
    let longPressTimer = null;

    row.addEventListener("touchstart", e => {
      dragId = row.dataset.id;
      longPressTimer = setTimeout(() => {
        touchActive = true;
        row.classList.add("dragging");
        touchClone = row.cloneNode(true);
        touchClone.style.cssText = `position:fixed;left:16px;right:16px;width:${row.offsetWidth}px;opacity:.7;pointer-events:none;z-index:200;transform:scale(.97)`;
        touchClone.style.top = e.touches[0].clientY - row.offsetHeight / 2 + "px";
        document.body.appendChild(touchClone);
      }, 250);
    }, { passive: true });

    row.addEventListener("touchmove", e => {
      if(!touchActive){ clearTimeout(longPressTimer); return; }
      e.preventDefault();
      const y = e.touches[0].clientY;
      if(touchClone) touchClone.style.top = y - row.offsetHeight / 2 + "px";
      $panel.querySelectorAll(".drag-over-top,.drag-over-bottom").forEach(x => x.classList.remove("drag-over-top", "drag-over-bottom"));
      const target = document.elementFromPoint(e.touches[0].clientX, y);
      const item = target?.closest?.(".row");
      if(item && item.dataset.id && item.dataset.id !== dragId){
        const rect = item.getBoundingClientRect();
        item.classList.toggle("drag-over-top", y < rect.top + rect.height / 2);
        item.classList.toggle("drag-over-bottom", y >= rect.top + rect.height / 2);
      }
    }, { passive: false });

    row.addEventListener("touchend", e => {
      clearTimeout(longPressTimer);
      if(!touchActive) return;
      touchActive = false;
      row.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
      $panel.querySelectorAll(".drag-over-top,.drag-over-bottom").forEach(x => x.classList.remove("drag-over-top", "drag-over-bottom"));

      _suppressClick = true;
      const y = e.changedTouches[0].clientY;
      const target = document.elementFromPoint(e.changedTouches[0].clientX, y);
      const item = target?.closest?.(".row");
      if(item && item.dataset.id && item.dataset.id !== dragId){
        const rect = item.getBoundingClientRect();
        applyReorder(dragId, item.dataset.id, y < rect.top + rect.height / 2);
      }
    });

    row.addEventListener("touchcancel", () => {
      clearTimeout(longPressTimer);
      touchActive = false;
      row.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
    });
  });
}
