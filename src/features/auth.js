import { signInWithPopup, signOut } from "firebase/auth";
import { state } from "../core/state.js";
import { $loginBtn, $settingsLogoutBtn, $panel, $strip } from "../core/dom.js";
import { auth, provider } from "../core/firebase.js";
import { initializeFeatureFlags } from "../core/flags.js";
import { loadPref } from "./prefs.js";
import { setSync } from "./shell.js";
import { renderStrip, skeletonStrip, skeletonPanel } from "./day/render.js";
import { loadDay } from "./day/session-io.js";
import { rebuildUserDays, loadExercises } from "./exercises/crud.js";
import { loadDayCustomizations } from "./exercises/day-customization.js";
import { loadPlans } from "./plans/index.js";

export async function initApp(u){
  await Promise.all([
    initializeFeatureFlags(),
    loadPref(),
    loadDayCustomizations(),
    loadExercises(u.uid),
    loadPlans(),
  ]);
  rebuildUserDays();
  renderStrip();
  await loadDay(state.current);
}
export function initWithTimeout(u, ms = 15000){
  return Promise.race([
    initApp(u),
    new Promise((_, rej) => setTimeout(() => rej(new Error("init timeout")), ms)),
  ]);
}
export function renderInitError(){
  $panel.innerHTML = `<div class="evo-empty">
    <span class="big">Não foi possível carregar</span>
    <p style="color:var(--muted);font-size:13px;margin:8px 0 14px">Verifique sua conexão e tente novamente.</p>
    <button class="ex-new-btn" id="initRetryBtn">Tentar novamente</button></div>`;
  document.getElementById("initRetryBtn").addEventListener("click", () => {
    $strip.innerHTML = skeletonStrip();
    $panel.innerHTML = skeletonPanel();
    initWithTimeout(state.user).catch(e => { console.error(e); renderInitError(); });
  });
}

export function init(){
  $loginBtn.addEventListener("click", () => {
    signInWithPopup(auth, provider).catch(err => {
      alert("Erro no login: " + err.message);
    });
  });

  $settingsLogoutBtn.addEventListener("click", () => signOut(auth));

  window.addEventListener("online", ()=>{ if(state.user) setSync("live","sincronizado"); });
  window.addEventListener("offline", ()=>{ setSync("offline","offline — salvando local"); });
}
