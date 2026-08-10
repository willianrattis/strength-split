import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase.js";

const FeatureFlags = (() => {
  let flags = {};
  let unsub = null;
  let initialized = false;
  const LS_KEY = "ss_featureFlags";

  function applyFlagBindings() {
    document.querySelectorAll("[data-flag]").forEach(el => {
      el.style.display = isFeatureEnabled(el.dataset.flag) ? "" : "none";
    });
  }

  function isFeatureEnabled(name) {
    return flags[name] === true;
  }

  function getAllFlags() {
    return { ...flags };
  }

  async function initializeFeatureFlags() {
    if (initialized) return;
    initialized = true;
    try {
      const ref = doc(db, "config", "featureFlags");
      unsub = onSnapshot(ref, snap => {
        flags = snap.exists() ? snap.data() : {};
        try { localStorage.setItem(LS_KEY, JSON.stringify(flags)); } catch(_) {}
        window.dispatchEvent(new CustomEvent("flagsUpdated"));
        applyFlagBindings();
      }, err => {
        console.error("FeatureFlags: onSnapshot error", err);
        try {
          const cached = localStorage.getItem(LS_KEY);
          if (cached) {
            flags = JSON.parse(cached);
            window.dispatchEvent(new CustomEvent("flagsUpdated"));
            applyFlagBindings();
          }
        } catch(_) {}
      });
    } catch (err) {
      console.error("FeatureFlags: init error", err);
    }
  }

  function teardownFeatureFlags() {
    if (unsub) { unsub(); unsub = null; }
    flags = {};
    initialized = false;
    applyFlagBindings();
  }

  return { initializeFeatureFlags, teardownFeatureFlags, isFeatureEnabled, getAllFlags };
})();

export const { initializeFeatureFlags, teardownFeatureFlags, isFeatureEnabled, getAllFlags } = FeatureFlags;
