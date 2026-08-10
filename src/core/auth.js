import { signInWithPopup, signOut } from "firebase/auth";
import { state } from "./state.js";
import { $loginBtn, $settingsLogoutBtn } from "./dom.js";
import { auth, provider } from "./firebase.js";
import { setSync } from "../features/shell.js";

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
