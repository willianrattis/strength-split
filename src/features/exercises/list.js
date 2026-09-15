import { $subViewHome, $subViewWorkout, $progBack } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { renderPlansSection } from "../plans/index.js";
import { renderProgramHome } from "../program/home.js";
import { renderWorkoutDetail } from "../program/workout.js";

export function renderExercicios(){
  if(state.exSubTab !== "home" && state.exSubTab !== "workout" && state.exSubTab !== "plans") state.exSubTab = "home";

  $subViewHome.style.display = state.exSubTab==="home" ? "" : "none";
  $subViewWorkout.style.display = state.exSubTab==="workout" ? "" : "none";
  document.getElementById("subViewPlans").style.display = state.exSubTab==="plans" ? "" : "none";
  $progBack.hidden = state.exSubTab === "home";
  if(state.exSubTab==="home"){ renderProgramHome(); }
  else if(state.exSubTab==="workout"){ renderWorkoutDetail(); }
  else { renderPlansSection(); }
}
// Exposed so shell.js's showTab can render this view without importing this
// exercises-view code — shell.js isn't touched in this phase, so the window hook
// mechanism from 0.d-3a/3b stays.
window._renderExercicios = renderExercicios;

export function init(){
  document.getElementById("progBack").addEventListener("click", () => {
    state.exSubTab = "home"; state.exWorkoutLetter = null;
    renderExercicios(); window.scrollTo(0,0);
  });
}
