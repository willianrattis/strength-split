// Keeps the mobile screen awake while the app is open (Screen Wake Lock API).
// Degrades to a silent no-op where unsupported (older iOS, desktop Firefox) or
// outside a secure context. Requires HTTPS/localhost — GitHub Pages qualifies.

let lock = null;

async function acquire(){
  if(lock) return;
  if(!("wakeLock" in navigator)) return;
  if(document.visibilityState !== "visible") return;
  try {
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => { lock = null; });
  } catch {
    // Unsupported, denied, or no active gesture yet — stay a no-op.
    lock = null;
  }
}

export function initWakeLock(){
  acquire();

  // The lock is auto-released when the tab is hidden; re-acquire on return.
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") acquire();
  });

  // Some browsers only grant the lock after a user gesture — retry once on the
  // first interaction if we still don't hold it.
  const onFirstInteraction = () => {
    if(!lock) acquire();
  };
  window.addEventListener("pointerdown", onFirstInteraction, { once: true });
  window.addEventListener("keydown", onFirstInteraction, { once: true });
}
