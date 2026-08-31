import { onAuthStateChanged } from "firebase/auth";

import { state, resetUserState } from "./core/state.js";
import { $authBox, $appContent, $gateWrap, $strip, $panel } from "./core/dom.js";
import { auth } from "./core/firebase.js";
import { teardownFeatureFlags } from "./core/flags.js";
import * as modal from "./core/ui/modal.js";
import * as stickyHeader from "./core/ui/sticky-header.js";
import * as authModule from "./features/auth.js";
import { initWithTimeout, renderInitError } from "./features/auth.js";
import { applyTheme, applyModeButtons, setSync } from "./features/shell.js";
import * as shell from "./features/shell.js";
import * as settings from "./features/settings.js";
import * as profileModal from "./features/profile-modal.js";
import * as gamification from "./features/gamification.js";
import * as wrapped from "./features/wrapped.js";
import * as evolution from "./features/evolution.js";
import * as exportData from "./features/export.js";
import * as sharePdf from "./features/share-pdf.js";
import { renderStrip, skeletonStrip, skeletonPanel } from "./features/day/render.js";
import * as dayRender from "./features/day/render.js";
import * as dayQuickEdit from "./features/day/quick-edit.js";
import * as substitutionModal from "./features/day/substitution-modal.js";
import * as machineModal from "./features/day/machine-modal.js";
import * as train from "./features/train/index.js";
import * as exercisesList from "./features/exercises/list.js";
import * as flagState from "./features/flag-state.js";
import { initOnboarding } from "./features/onboarding.js";
import { initHowItWorks } from "./features/how-it-works.js";
import { setGamifChipLoading } from "./features/flag-state.js";
import { capturePendingSharedPlan, initPlanImport } from "./features/plans/plan-import.js";
import { initPlanBuilder } from "./features/plans/plan-builder.js";

// Captured before auth resolves — a shared link must survive login, and the
// fragment needs to be off the URL before anything else runs.
capturePendingSharedPlan();

// ========= Auth (loginBtn/logout/online-offline wiring + initApp/initWithTimeout/renderInitError live in features/auth.js) =========
onAuthStateChanged(auth, async u => {
  resetUserState();
  state.user = u;
  setGamifChipLoading(true);
  if(u){
    $authBox.textContent = (u.displayName||u.email||"").split(" ")[0];
    $gateWrap.style.display = "none";
    $appContent.style.display = "";
    $strip.innerHTML = skeletonStrip();
    $panel.innerHTML = skeletonPanel();
    setSync("live", "sincronizado");
    if(window.SSSplash) window.SSSplash.ready();
    try {
      await initWithTimeout(u);
    } catch(e) {
      console.error("init:", e);
      renderInitError();
    }
  } else {
    $authBox.textContent = "";
    $gateWrap.style.display = "block";
    $appContent.style.display = "none";
    setSync("", "aguardando login");
    if(window.SSSplash) window.SSSplash.ready();
    teardownFeatureFlags();
  }
});

// ========= Bootstrap =========
modal.init();
stickyHeader.init();
authModule.init();
shell.init();
settings.init();
profileModal.init();
gamification.init();
wrapped.init();
evolution.init();
exportData.init();
sharePdf.init();
dayRender.init();
dayQuickEdit.init();
substitutionModal.init();
machineModal.init();
train.init();
exercisesList.init();
flagState.init();
initOnboarding();
initHowItWorks();
initPlanImport();
initPlanBuilder();

applyTheme();
applyModeButtons();
renderStrip();
