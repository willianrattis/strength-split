import { state } from "../state.js";

export function lockBodyScroll(){
  state._modalScrollY = window.scrollY;
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${state._modalScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
}
export function unlockBodyScroll(){
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  window.scrollTo(0, state._modalScrollY);
}

export function init(){
  // Observe all modal overlays for .open class changes. Overlays can stack
  // (e.g. the apply-plan modal opened on top of onboarding) — track how many
  // are open so the body only unlocks once the last one closes, instead of a
  // naive per-overlay toggle re-locking/unlocking on every mutation.
  const _allOverlays = document.querySelectorAll(".modal-overlay");
  let _locked = false;
  const _modalObserver = new MutationObserver(mutations => {
    if(!mutations.some(m => m.attributeName === "class")) return;
    const anyOpen = Array.from(_allOverlays).some(ov => ov.classList.contains("open"));
    if(anyOpen && !_locked){ lockBodyScroll(); _locked = true; }
    else if(!anyOpen && _locked){ unlockBodyScroll(); _locked = false; }
  });
  _allOverlays.forEach(ov => _modalObserver.observe(ov, { attributes:true }));

  // Drag-to-dismiss on .modal elements
  _allOverlays.forEach(overlay => {
    const modal = overlay.querySelector(".modal");
    if(!modal) return;
    let startY = 0, currentY = 0, dragging = false;
    const THRESHOLD = 100;

    function findCloseAction(){
      // close the modal using the same path as overlay click
      overlay.classList.remove("open");
    }

    modal.addEventListener("touchstart", e => {
      const t = e.touches[0];
      // Only start drag on the grab handle zone (top 28px) OR when scrolled to top
      const rect = modal.getBoundingClientRect();
      const touchInHandle = (t.clientY - rect.top) < 28;
      if(!touchInHandle && modal.scrollTop > 0) return;
      startY = t.clientY;
      currentY = startY;
      dragging = true;
      modal.style.transition = "none";
    }, { passive: true });

    modal.addEventListener("touchmove", e => {
      if(!dragging) return;
      currentY = e.touches[0].clientY;
      const dy = currentY - startY;
      if(dy < 0){ // dragging up — ignore
        modal.style.transform = "";
        return;
      }
      // If user started scrolling content, abort drag
      if(modal.scrollTop > 0){
        dragging = false;
        modal.style.transform = "";
        modal.style.transition = "";
        return;
      }
      modal.style.transform = `translateY(${dy}px)`;
    }, { passive: true });

    modal.addEventListener("touchend", () => {
      if(!dragging) return;
      dragging = false;
      const dy = currentY - startY;
      modal.style.transition = "transform .25s ease";
      if(dy > THRESHOLD){
        modal.style.transform = "translateY(100%)";
        setTimeout(() => {
          findCloseAction();
          modal.style.transform = "";
          modal.style.transition = "";
        }, 250);
      } else {
        modal.style.transform = "";
        setTimeout(() => { modal.style.transition = ""; }, 250);
      }
    }, { passive: true });
  });
}
