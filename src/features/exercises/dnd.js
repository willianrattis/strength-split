import { state } from "../../core/state.js";
import { $exList } from "../../core/dom.js";
import { activeDays } from "../../core/adapters.js";
import { saveExerciseDoc, rebuildUserDays } from "./crud.js";
import { renderExList } from "./list.js";

// Called from renderExList after each re-render, not at module load.
export function initDragAndDrop(){
  const items = $exList.querySelectorAll(".ex-list-item[draggable]");
  let dragId = null;

  items.forEach(el => {
    // HTML5 DnD
    el.addEventListener("dragstart", e => {
      dragId = el.dataset.id;
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", el.dataset.id);
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      $exList.querySelectorAll(".drag-over-top,.drag-over-bottom").forEach(x => x.classList.remove("drag-over-top","drag-over-bottom"));
    });
    el.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      el.classList.toggle("drag-over-top", e.clientY < mid);
      el.classList.toggle("drag-over-bottom", e.clientY >= mid);
    });
    el.addEventListener("dragleave", () => {
      el.classList.remove("drag-over-top","drag-over-bottom");
    });
    el.addEventListener("drop", e => {
      e.preventDefault();
      el.classList.remove("drag-over-top","drag-over-bottom");
      const fromId = e.dataTransfer.getData("text/plain");
      if(fromId === el.dataset.id) return;
      const rect = el.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      reorderExercise(fromId, el.dataset.id, before);
    });

    // Touch fallback
    let touchClone = null;
    let touchActive = false;
    let longPressTimer = null;

    const handle = el.querySelector(".drag-handle");
    if(!handle) return;

    handle.addEventListener("touchstart", e => {
      dragId = el.dataset.id;
      longPressTimer = setTimeout(() => {
        touchActive = true;
        el.classList.add("dragging");
        touchClone = el.cloneNode(true);
        touchClone.style.cssText = `position:fixed;left:16px;right:16px;width:${el.offsetWidth}px;opacity:.7;pointer-events:none;z-index:200;transform:scale(.97)`;
        touchClone.style.top = e.touches[0].clientY - el.offsetHeight/2 + "px";
        document.body.appendChild(touchClone);
      }, 250);
    }, {passive:true});

    handle.addEventListener("touchmove", e => {
      if(!touchActive){ clearTimeout(longPressTimer); return; }
      e.preventDefault();
      const y = e.touches[0].clientY;
      if(touchClone) touchClone.style.top = y - el.offsetHeight/2 + "px";
      // highlight drop target
      $exList.querySelectorAll(".drag-over-top,.drag-over-bottom").forEach(x => x.classList.remove("drag-over-top","drag-over-bottom"));
      const target = document.elementFromPoint(e.touches[0].clientX, y);
      const item = target?.closest?.(".ex-list-item");
      if(item && item.dataset.id !== dragId){
        const rect = item.getBoundingClientRect();
        item.classList.toggle("drag-over-top", y < rect.top + rect.height/2);
        item.classList.toggle("drag-over-bottom", y >= rect.top + rect.height/2);
      }
    }, {passive:false});

    handle.addEventListener("touchend", e => {
      clearTimeout(longPressTimer);
      if(!touchActive) return;
      touchActive = false;
      el.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
      $exList.querySelectorAll(".drag-over-top,.drag-over-bottom").forEach(x => x.classList.remove("drag-over-top","drag-over-bottom"));

      const y = e.changedTouches[0].clientY;
      const target = document.elementFromPoint(e.changedTouches[0].clientX, y);
      const item = target?.closest?.(".ex-list-item");
      if(item && item.dataset.id !== dragId){
        const rect = item.getBoundingClientRect();
        reorderExercise(dragId, item.dataset.id, y < rect.top + rect.height/2);
      }
    });

    handle.addEventListener("touchcancel", () => {
      clearTimeout(longPressTimer);
      touchActive = false;
      el.classList.remove("dragging");
      if(touchClone){ touchClone.remove(); touchClone = null; }
    });
  });
}

// Recomputes and persists orderByDay[dk] for every exercise in `ordered` (fromId
// already moved to its new index). Shared by both reorder entry points below.
async function persistDayOrder(dk, ordered){
  const promises = [];
  ordered.forEach((id, i) => {
    const ex = state.exercisesCatalog.get(id);
    if(!ex) return;
    if(!ex.orderByDay) ex.orderByDay = {};
    ex.orderByDay[dk] = i;
    promises.push(saveExerciseDoc(id, { orderByDay: ex.orderByDay }));
  });
  await Promise.all(promises);
}

function reinsert(ordered, fromId, toId, before){
  const fromIdx = ordered.indexOf(fromId);
  if(fromIdx >= 0) ordered.splice(fromIdx, 1);
  let toIdx = ordered.indexOf(toId);
  if(!before) toIdx++;
  ordered.splice(toIdx, 0, fromId);
}

export async function reorderExercise(fromId, toId, before){
  if(state.exFilterDay === null) return;
  const dk = state.exFilterDay;

  // Current order: scraped from the rendered, already-sorted draggable list —
  // this can include inactive exercises when "Inativos" is toggled on, which
  // activeDays() deliberately excludes, so it can't be swapped for that.
  const ordered = [];
  $exList.querySelectorAll(".ex-list-item").forEach(el => ordered.push(el.dataset.id));
  reinsert(ordered, fromId, toId, before);

  await persistDayOrder(dk, ordered);
  rebuildUserDays();
  renderExList();
}

// Same reorder, driven by the in-memory day plan instead of the Exercícios tab's
// DOM — for callers (e.g. day/quick-edit.js) reordering a day that isn't the one
// currently rendered/filtered in that tab.
export async function reorderExerciseInDay(dk, fromId, toId, before){
  const ordered = activeDays()[dk].ex.map(e => e._id);
  reinsert(ordered, fromId, toId, before);
  await persistDayOrder(dk, ordered);
  rebuildUserDays();
}
