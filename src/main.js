import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, setDoc, getDoc, collection, getDocs, addDoc, deleteDoc, serverTimestamp, onSnapshot,
  query, orderBy, limit
} from "firebase/firestore";
import Chart from "chart.js/auto";
import { jsPDF } from "jspdf";
window.jspdf = { jsPDF };

import { stripDiacritics, esc, normMachine, sameMachine } from "./domain/text.js";
import { formatDate, todayStr, getWeekMonday, dateForDay, sessionId, fmtDateBR, shortDate } from "./domain/dates.js";
import { equipmentOf, buildExTypeMap } from "./domain/equipment.js";
import { ORDER_UNSET, orderForDay, cmpExOrder } from "./domain/order.js";
import { lastMachineFor as domainLastMachineFor, usedMachinesRanked as domainUsedMachinesRanked, matchVariant as domainMatchVariant } from "./domain/machines.js";
import { emptySession as domainEmptySession, reconcileSession as domainReconcileSession } from "./domain/session.js";
import { UNIT_CYCLE, UNIT_ABBR, UNIT_BTN, UNIT_STEP } from "./domain/units.js";
import { autoregCfg as domainAutoregCfg, projectLoad as domainProjectLoad } from "./domain/autoreg.js";
import { profileAge as domainProfileAge } from "./domain/profile.js";
import { prevLoadData as domainPrevLoadData, exerciseTopHistory as domainExerciseTopHistory, bestWeightEver as domainBestWeightEver } from "./domain/history.js";
import { suggestLoads as domainSuggestLoads } from "./domain/suggestion.js";
import { isDeloadActive as domainIsDeloadActive, deloadDue as domainDeloadDue } from "./domain/deload.js";
import { computeGamification } from "./domain/gamification.js";
import { buildMuscleIndex as domainBuildMuscleIndex } from "./domain/muscles.js";
import { computeWrapped as domainComputeWrapped } from "./domain/wrapped.js";
import { state } from "./core/state.js";
import {
  $authBox, $loginBtn, $appContent, $gateWrap, $strip, $panel, $sync, $weekPrev, $weekNext, $weekLabel,
  $modeCompact, $modeLoad, $themeBtn, $tabTreino, $tabExercicios, $tabEvolucao, $viewTreino, $viewExercicios,
  $viewEvolucao, $dayCustomSection, $exFilterBar, $exList, $exModal, $exModalInner, $plansSection, $planModal,
  $planModalInner, $applyPlanModal, $applyPlanModalInner, $dayEditModal, $dayEditModalBody, $evoSelect,
  $evoMachineSelect, $evoBody, $settingsModal, $settingsThemeToggle, $settingsLogoutBtn, $bnTreino,
  $bnExercicios, $bnEvolucao, $bnConfig, $profileModal, $profileModalInner, $gamifModal, $wrappedOverlay,
  $wrappedSlides, $wrappedProgress, $wrappedYearPills, $trainBar, $trainSegs, $trainCount, $trainFocus,
  $subModal, $subModalInner, $machineModal, $machineModalInner, $btnSharePdf
} from "./core/dom.js";

const firebaseConfig = {
  apiKey: "AIzaSyCpq7zytWeXpjEhIFaiqHZKbODcM-ZYhKU",
  authDomain: "strength-split.firebaseapp.com",
  projectId: "strength-split",
  storageBucket: "strength-split.firebasestorage.app",
  messagingSenderId: "188488203799",
  appId: "1:188488203799:web:33f3ec2637257820436652",
  measurementId: "G-HP9J5WG1FY"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const provider = new GoogleAuthProvider();

// ========= Feature Flags =========
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

const { initializeFeatureFlags, teardownFeatureFlags, isFeatureEnabled, getAllFlags } = FeatureFlags;

function applyPeriodizationState(){
  const available = isFeatureEnabled("periodization");
  const active = available && state.periodizationEnabled;
  document.body.classList.toggle("flag-periodization-available", available);
  document.body.classList.toggle("flag-periodization", active);
}
function applyMachinesState(){
  const available = isFeatureEnabled("machines");
  const active = available && state.machinesEnabled;
  document.body.classList.toggle("flag-machines-available", available);
  document.body.classList.toggle("flag-machines", active);
}
function applyProfileState(){
  const available = isFeatureEnabled("profile");
  const active = available && state.profileEnabled;
  document.body.classList.toggle("flag-profile-available", available);
  document.body.classList.toggle("flag-profile", active);
}
function applyAutoregState(){
  const available = isFeatureEnabled("autoreg");
  const active = available && state.autoregEnabled;
  document.body.classList.toggle("flag-autoreg-available", available);
  document.body.classList.toggle("flag-autoreg", active);
}
function applyExecOrderState(){
  const available = isFeatureEnabled("execOrder");
  const active = available && state.execOrderEnabled;
  document.body.classList.toggle("flag-exec-order-available", available);
  document.body.classList.toggle("flag-exec-order", active);
}
function setGamifChipLoading(on){
  const $chip = document.getElementById("gamifChip");
  if($chip) $chip.classList.toggle("loading", !!on);
}
function applyGamificationState(){
  const available = isFeatureEnabled("gamification");
  const active = available && state.gamificationEnabled;
  document.body.classList.toggle("flag-gamification-available", available);
  document.body.classList.toggle("flag-gamification", active);
  if(active){
    if(state.gamification) renderGamifChip();
    else setGamifChipLoading(true);
  }
}
window.addEventListener("flagsUpdated", () => {
  applyPeriodizationState();
  applyMachinesState();
  applyProfileState();
  applyAutoregState();
  applyExecOrderState();
  applyGamificationState();
});

// ========= Catálogo do treino =========
const DAYS = [
  { abbr:"Seg", name:"Segunda", tag:"Ombro · Costas", focus:"Ombro lateral/posterior · Costas", ex:[
    {name:"Elevação lateral com halter", muscle:"ombro", reps:[8,8,8,8], badges:["drop"]},
    {name:"Crucifixo invertido com halter", muscle:"ombro", reps:[12,10,10,8], note:"Apoiar o peito no banco da remada cavalinho."},
    {name:"Remada Hammer (anilhas)", muscle:"costas", reps:[12,10,10,8], badges:["iso"]},
    {name:"Remada unilateral com halter", muscle:"costas", reps:[8,8,8,8], note:"No banco inclinado."},
    {name:"Pulley frente — pegada supinada", muscle:"costas", reps:[12,10,10,8]},
  ]},
  { abbr:"Ter", name:"Terça", tag:"Posterior", focus:"Ombro frontal · Posterior de coxa · Glúteo", ex:[
    {name:"Elevação frontal com anilha", muscle:"ombro", reps:[8,8,8,8]},
    {name:"Cadeira abdutora", muscle:"perna", reps:[12,10,8,8], badges:["iso"]},
    {name:"Meio terra sumô", muscle:"perna", reps:[12,10,8,8]},
    {name:"Flexora sentado", muscle:"perna", reps:[12,10,10,8], badges:["iso","fast"]},
    {name:"Leg 45 unilateral", muscle:"perna", reps:[12,10,8,6]},
    {name:"Panturrilha sentado", muscle:"perna", reps:[15,15,15]},
  ]},
  { abbr:"Qua", name:"Quarta", tag:"Peito", focus:"Peito · Ombro", ex:[
    {name:"Supino vertical inclinado", muscle:"peito", reps:[12,10,8,8,8]},
    {name:"Peck deck", muscle:"peito", reps:[15,12,10,8,8]},
    {name:"Supino inclinado com barra", muscle:"peito", reps:[12,10,8,8,6]},
    {name:"Elevação frontal com anilha", muscle:"ombro", reps:[6,6,6,6,6],
      superset:{name:"Elevação lateral com halter (sentado)", muscle:"ombro", reps:[12,10,10,8,8]}},
    {name:"Desenvolvimento máquina", muscle:"ombro", reps:[12,10,8,8,8]},
  ]},
  { abbr:"Qui", name:"Quinta", tag:"Braços", focus:"Posterior de ombro · Tríceps · Bíceps", ex:[
    {name:"Face pull no Cross", muscle:"ombro", reps:[12,10,10,8,8], badges:["iso"],
      superset:{name:"Elevação lateral com halter", muscle:"ombro", reps:[8,8,8,8,8]}},
    {name:"Tríceps pulley com barra", muscle:"tríceps", reps:[9,9,9,9],
      superset:{name:"Rosca W", muscle:"bíceps", reps:[9,9,9,9]}},
    {name:"Tríceps francês com halter", muscle:"tríceps", reps:[8,8,8,8],
      superset:{name:"Rosca no Cross", muscle:"bíceps", reps:[8,8,8,8]}},
    {name:"Tríceps corda", muscle:"tríceps", reps:[12,10,10,8], badges:["iso"],
      superset:{name:"Martelo simultâneo com halter", muscle:"bíceps", reps:[12,10,8,8]}},
  ]},
  { abbr:"Sex", name:"Sexta", tag:"Pernas", focus:"Quadríceps · Adutor", ex:[
    {name:"Cadeira extensora", muscle:"perna", reps:[12,12,12,12], badges:["iso","fast"], note:"Por série: 6 mov. com isometria + 6 acelerando."},
    {name:"Búlgaro com carga ipsilateral", muscle:"perna", reps:[12,10,8,8]},
    {name:"Leg 45", muscle:"perna", reps:[12,10,8,6]},
    {name:"Cadeira adutora", muscle:"perna", reps:[15,12,10,8]},
    {name:"Panturrilha sentado", muscle:"perna", reps:[15,15,15]},
  ]},
];
const BADGE_LABEL = {drop:"Drop-set em todas", iso:"Isometria 2s", fast:"Acelerar na fadiga"};

// ========= Periodization tuning =========
const DELOAD_FACTOR = 0.55;

// ========= Plan Templates =========
const PLAN_TEMPLATES = [
  { templateKey:"AB", name:"AB \u00b7 Superiores / Inferiores", days:[
    { type:"A", label:"Superiores", exercises:[
      {name:"Supino reto com barra", muscle:"peito", reps:[8,8,8]},
      {name:"Remada curvada com barra", muscle:"costas", reps:[8,8,8]},
      {name:"Desenvolvimento com halteres", muscle:"ombro", reps:[8,8,8]},
      {name:"Eleva\u00e7\u00e3o lateral", muscle:"ombro", reps:[12,12,12]},
      {name:"Rosca direta barra W", muscle:"b\u00edceps", reps:[10,10,10]},
      {name:"Tr\u00edceps franc\u00eas (testa)", muscle:"tr\u00edceps", reps:[10,10,10]},
    ]},
    { type:"B", label:"Inferiores", exercises:[
      {name:"Agachamento livre", muscle:"perna", reps:[8,8,8]},
      {name:"Leg press 45\u00b0", muscle:"perna", reps:[10,10,10]},
      {name:"Cadeira flexora", muscle:"perna", reps:[10,10,10]},
      {name:"Cadeira extensora", muscle:"perna", reps:[12,12,12]},
      {name:"Panturrilha em p\u00e9 (m\u00e1quina)", muscle:"perna", reps:[12,12,12,12]},
    ]},
  ]},
  { templateKey:"ABC", name:"ABC \u00b7 Push / Pull / Legs", days:[
    { type:"A", label:"Push", exercises:[
      {name:"Supino reto com barra", muscle:"peito", reps:[8,8,8]},
      {name:"Supino inclinado com halteres", muscle:"peito", reps:[10,10,10]},
      {name:"Desenvolvimento militar halteres", muscle:"ombro", reps:[8,8,8]},
      {name:"Eleva\u00e7\u00e3o lateral", muscle:"ombro", reps:[12,12,12]},
      {name:"Tr\u00edceps corda no crossover", muscle:"tr\u00edceps", reps:[10,10,10]},
    ]},
    { type:"B", label:"Pull", exercises:[
      {name:"Barra fixa (ou puxada alta)", muscle:"costas", reps:[8,8,8]},
      {name:"Remada sentada (tri\u00e2ngulo)", muscle:"costas", reps:[10,10,10]},
      {name:"Face pull (corda)", muscle:"ombro", reps:[12,12,12]},
      {name:"Rosca direta barra W", muscle:"b\u00edceps", reps:[10,10,10]},
      {name:"Rosca martelo", muscle:"b\u00edceps", reps:[10,10,10]},
    ]},
    { type:"C", label:"Legs", exercises:[
      {name:"Agachamento barra livre", muscle:"perna", reps:[8,8,8]},
      {name:"Leg press 45\u00b0", muscle:"perna", reps:[10,10,10]},
      {name:"Stiff (terra romeno)", muscle:"perna", reps:[10,10,10]},
      {name:"Cadeira extensora", muscle:"perna", reps:[12,12,12]},
      {name:"Panturrilha sentado", muscle:"perna", reps:[12,12,12,12]},
    ]},
  ]},
  { templateKey:"ABCD", name:"ABCD \u00b7 Upper/Lower com \u00eanfases", days:[
    { type:"A", label:"Superiores A (for\u00e7a)", exercises:[
      {name:"Supino reto com barra", muscle:"peito", reps:[6,6,6]},
      {name:"Remada curvada barra", muscle:"costas", reps:[6,6,6]},
      {name:"Desenvolvimento militar barra", muscle:"ombro", reps:[8,8,8]},
      {name:"Eleva\u00e7\u00e3o lateral", muscle:"ombro", reps:[12,12,12]},
      {name:"Rosca direta", muscle:"b\u00edceps", reps:[10,10,10]},
      {name:"Tr\u00edceps testa", muscle:"tr\u00edceps", reps:[10,10,10]},
    ]},
    { type:"B", label:"Inferiores A (quadr\u00edceps)", exercises:[
      {name:"Agachamento livre", muscle:"perna", reps:[8,8,8]},
      {name:"Leg press 45\u00b0", muscle:"perna", reps:[10,10,10]},
      {name:"Afundo com halteres", muscle:"perna", reps:[10,10,10], note:"cada perna"},
      {name:"Cadeira extensora", muscle:"perna", reps:[12,12,12]},
      {name:"Panturrilha em p\u00e9", muscle:"perna", reps:[12,12,12,12]},
    ]},
    { type:"C", label:"Superiores B (volume)", exercises:[
      {name:"Supino inclinado halteres", muscle:"peito", reps:[8,8,8]},
      {name:"Barra fixa supinada", muscle:"costas", reps:[8,8,8]},
      {name:"Eleva\u00e7\u00e3o lateral na polia", muscle:"ombro", reps:[12,12,12]},
      {name:"Crucifixo reto (m\u00e1quina)", muscle:"peito", reps:[12,12,12]},
      {name:"Rosca martelo", muscle:"b\u00edceps", reps:[10,10,10]},
      {name:"Tr\u00edceps franc\u00eas unilateral", muscle:"tr\u00edceps", reps:[10,10,10]},
    ]},
    { type:"D", label:"Inferiores B (posterior/gl\u00fateo)", exercises:[
      {name:"Levantamento terra romeno", muscle:"perna", reps:[8,8,8]},
      {name:"Cadeira flexora", muscle:"perna", reps:[10,10,10]},
      {name:"Gl\u00fateo na polia (coice)", muscle:"perna", reps:[12,12,12]},
      {name:"Cadeira abdutora", muscle:"perna", reps:[12,12,12]},
      {name:"Panturrilha sentado", muscle:"perna", reps:[12,12,12,12]},
    ]},
  ]},
  { templateKey:"ABCDE", name:"ABCDE \u00b7 Divis\u00e3o por grupo (5\u00d7/sem)", days:[
    { type:"A", label:"Peito", exercises:[
      {name:"Supino reto barra", muscle:"peito", reps:[8,8,8,8]},
      {name:"Supino inclinado halteres", muscle:"peito", reps:[10,10,10,10]},
      {name:"Crucifixo m\u00e1quina", muscle:"peito", reps:[12,12,12]},
      {name:"Crossover polia alta", muscle:"peito", reps:[12,12,12]},
    ]},
    { type:"B", label:"Costas", exercises:[
      {name:"Barra fixa (ou puxada alta)", muscle:"costas", reps:[8,8,8,8]},
      {name:"Remada cavalinho (barra T)", muscle:"costas", reps:[8,8,8,8]},
      {name:"Puxada aberta (pulley frente)", muscle:"costas", reps:[10,10,10]},
      {name:"Face pull", muscle:"ombro", reps:[12,12,12]},
      {name:"Remada baixa (cord\u00e3o)", muscle:"costas", reps:[12,12,12]},
    ]},
    { type:"C", label:"Pernas", exercises:[
      {name:"Agachamento barra livre", muscle:"perna", reps:[8,8,8,8]},
      {name:"Leg press 45\u00b0", muscle:"perna", reps:[10,10,10,10]},
      {name:"Stiff", muscle:"perna", reps:[10,10,10,10]},
      {name:"Cadeira extensora", muscle:"perna", reps:[12,12,12]},
      {name:"Cadeira flexora", muscle:"perna", reps:[12,12,12]},
      {name:"Panturrilha sentado", muscle:"perna", reps:[15,15,15,15]},
    ]},
    { type:"D", label:"Ombros", exercises:[
      {name:"Desenvolvimento militar barra", muscle:"ombro", reps:[8,8,8,8]},
      {name:"Eleva\u00e7\u00e3o lateral", muscle:"ombro", reps:[12,12,12,12]},
      {name:"Crucifixo invertido", muscle:"ombro", reps:[12,12,12]},
      {name:"Encolhimento", muscle:"ombro", reps:[10,10,10]},
    ]},
    { type:"E", label:"Bra\u00e7os", exercises:[
      {name:"Rosca direta barra W", muscle:"b\u00edceps", reps:[10,10,10,10]},
      {name:"Rosca martelo", muscle:"b\u00edceps", reps:[10,10,10,10]},
      {name:"Tr\u00edceps testa (barra EZ)", muscle:"tr\u00edceps", reps:[10,10,10,10]},
      {name:"Tr\u00edceps corda no crossover", muscle:"tr\u00edceps", reps:[12,12,12]},
      {name:"Rosca punho (antebra\u00e7o)", muscle:"b\u00edceps", reps:[15,15,15], note:"opcional"},
    ]},
  ]},
];

// ========= Catálogo canônico de exercícios (autocomplete) =========
const EXERCISE_CATALOG = [
  // — Peito —
  {name:"Supino reto com barra",muscle:"peito",type:"comp"},
  {name:"Supino reto com halter",muscle:"peito",type:"comp"},
  {name:"Supino inclinado com barra",muscle:"peito",type:"comp"},
  {name:"Supino inclinado com halter",muscle:"peito",type:"comp"},
  {name:"Supino declinado com barra",muscle:"peito",type:"comp"},
  {name:"Supino declinado com halter",muscle:"peito",type:"comp"},
  {name:"Supino vertical inclinado",muscle:"peito",type:"comp"},
  {name:"Supino máquina",muscle:"peito",type:"comp"},
  {name:"Crucifixo reto com halter",muscle:"peito",type:"iso"},
  {name:"Crucifixo inclinado com halter",muscle:"peito",type:"iso"},
  {name:"Crucifixo no cabo (crossover)",muscle:"peito",type:"iso"},
  {name:"Crossover alto",muscle:"peito",type:"iso"},
  {name:"Crossover baixo",muscle:"peito",type:"iso"},
  {name:"Peck deck",muscle:"peito",type:"iso"},
  {name:"Flexão de braço",muscle:"peito",type:"comp"},
  {name:"Flexão com apoio",muscle:"peito",type:"comp"},
  {name:"Pullover com halter",muscle:"peito",type:"iso"},
  {name:"Pullover na máquina",muscle:"peito",type:"iso"},
  {name:"Chest press máquina",muscle:"peito",type:"comp"},
  {name:"Mergulho no paralelas (peito)",muscle:"peito",type:"comp"},
  {name:"Supino inclinado com halteres",muscle:"peito",type:"comp"},
  {name:"Supino inclinado halteres",muscle:"peito",type:"comp"},
  {name:"Supino reto barra",muscle:"peito",type:"comp"},
  {name:"Crucifixo máquina",muscle:"peito",type:"iso"},
  {name:"Crossover polia alta",muscle:"peito",type:"iso"},
  {name:"Crucifixo reto (máquina)",muscle:"peito",type:"iso"},
  {name:"Supino reto no Smith",muscle:"peito",type:"comp"},
  {name:"Supino inclinado no Smith",muscle:"peito",type:"comp"},
  {name:"Supino declinado na máquina",muscle:"peito",type:"comp"},
  {name:"Supino reto pegada fechada",muscle:"peito",type:"comp"},
  {name:"Crucifixo declinado com halter",muscle:"peito",type:"iso"},
  {name:"Flexão declinada (pés elevados)",muscle:"peito",type:"comp"},
  {name:"Flexão diamante",muscle:"peito",type:"comp"},
  {name:"Supino unilateral com halter",muscle:"peito",type:"comp"},
  {name:"Crucifixo unilateral no cabo",muscle:"peito",type:"iso"},
  {name:"Pullover na polia alta",muscle:"peito",type:"iso"},
  {name:"Supino inclinado na máquina",muscle:"peito",type:"comp"},
  {name:"Supino reto com kettlebell",muscle:"peito",type:"comp"},
  {name:"Chest press unilateral na máquina",muscle:"peito",type:"comp"},
  {name:"Crucifixo na máquina unilateral",muscle:"peito",type:"iso"},
  {name:"Flexão com halteres (peito)",muscle:"peito",type:"comp"},
  {name:"Supino declinado no Smith",muscle:"peito",type:"comp"},
  {name:"Crucifixo declinado no cabo",muscle:"peito",type:"iso"},
  {name:"Supino máquina unilateral",muscle:"peito",type:"comp"},
  {name:"Peck deck unilateral",muscle:"peito",type:"iso"},
  {name:"Mergulho entre bancos (peito)",muscle:"peito",type:"comp"},
  {name:"Flexão hindu",muscle:"peito",type:"comp"},
  {name:"Crossover baixo unilateral",muscle:"peito",type:"iso"},
  {name:"Supino reto unilateral no Smith",muscle:"peito",type:"comp"},
  // — Costas —
  {name:"Puxada frontal aberta",muscle:"costas",type:"comp"},
  {name:"Puxada frontal fechada",muscle:"costas",type:"comp"},
  {name:"Puxada frontal triângulo",muscle:"costas",type:"comp"},
  {name:"Puxada frontal supinada",muscle:"costas",type:"comp"},
  {name:"Pulley frente — pegada supinada",muscle:"costas",type:"comp"},
  {name:"Pulley frente — pegada pronada",muscle:"costas",type:"comp"},
  {name:"Pulley frente — triângulo",muscle:"costas",type:"comp"},
  {name:"Remada curvada com barra",muscle:"costas",type:"comp"},
  {name:"Remada curvada com halter",muscle:"costas",type:"comp"},
  {name:"Remada unilateral com halter",muscle:"costas",type:"comp"},
  {name:"Remada cavalinho",muscle:"costas",type:"comp"},
  {name:"Remada Hammer (anilhas)",muscle:"costas",type:"comp"},
  {name:"Remada baixa no cabo",muscle:"costas",type:"comp"},
  {name:"Remada alta com barra",muscle:"costas",type:"comp"},
  {name:"Remada na máquina",muscle:"costas",type:"comp"},
  {name:"Remada T-bar",muscle:"costas",type:"comp"},
  {name:"Barra fixa (pull-up)",muscle:"costas",type:"comp"},
  {name:"Barra fixa supinada (chin-up)",muscle:"costas",type:"comp"},
  {name:"Pulldown reto no cabo",muscle:"costas",type:"iso"},
  {name:"Serrátil no cabo",muscle:"costas",type:"iso"},
  {name:"Levantamento terra convencional",muscle:"costas",type:"comp"},
  {name:"Levantamento terra romeno",muscle:"costas",type:"comp"},
  {name:"Hiperextensão lombar",muscle:"costas",type:"iso"},
  {name:"Good morning",muscle:"costas",type:"comp"},
  {name:"Barra fixa (ou puxada alta)",muscle:"costas",type:"comp"},
  {name:"Remada sentada (triângulo)",muscle:"costas",type:"comp"},
  {name:"Remada curvada barra",muscle:"costas",type:"comp"},
  {name:"Barra fixa supinada",muscle:"costas",type:"comp"},
  {name:"Remada cavalinho (barra T)",muscle:"costas",type:"comp"},
  {name:"Puxada aberta (pulley frente)",muscle:"costas",type:"comp"},
  {name:"Remada baixa (cordão)",muscle:"costas",type:"comp"},
  {name:"Puxada frontal pegada neutra",muscle:"costas",type:"comp"},
  {name:"Remada unilateral no cabo",muscle:"costas",type:"comp"},
  {name:"Levantamento terra sumô",muscle:"costas",type:"comp"},
  {name:"Puxada unilateral no pulley",muscle:"costas",type:"comp"},
  {name:"Barra fixa neutra",muscle:"costas",type:"comp"},
  {name:"Remada cavalinho pegada supinada",muscle:"costas",type:"comp"},
  {name:"Hiperextensão no banco 45°",muscle:"costas",type:"iso"},
  {name:"Remada curvada pegada supinada",muscle:"costas",type:"comp"},
  {name:"Remada Pendlay com barra",muscle:"costas",type:"comp"},
  {name:"Remada Yates com barra",muscle:"costas",type:"comp"},
  {name:"Levantamento terra trap bar",muscle:"costas",type:"comp"},
  {name:"Remada cavalinho unilateral",muscle:"costas",type:"comp"},
  {name:"Remada no crossover unilateral",muscle:"costas",type:"comp"},
  {name:"Barra fixa com peso",muscle:"costas",type:"comp"},
  {name:"Remada curvada pegada pronada",muscle:"costas",type:"comp"},
  {name:"Levantamento terra déficit",muscle:"costas",type:"comp"},
  {name:"Remada máquina unilateral",muscle:"costas",type:"comp"},
  {name:"Hiperextensão com peso (anilha)",muscle:"costas",type:"iso"},
  {name:"Remada T-bar unilateral",muscle:"costas",type:"comp"},
  {name:"Puxada frontal com barra reta",muscle:"costas",type:"comp"},
  {name:"Good morning com halter",muscle:"costas",type:"comp"},
  {name:"Barra fixa assistida na máquina",muscle:"costas",type:"comp"},
  {name:"Puxada frontal unilateral na máquina",muscle:"costas",type:"comp"},
  {name:"Barra fixa com elástico (assistida)",muscle:"costas",type:"comp"},
  // — Ombro —
  {name:"Desenvolvimento com barra",muscle:"ombro",type:"comp"},
  {name:"Desenvolvimento com halter",muscle:"ombro",type:"comp"},
  {name:"Desenvolvimento máquina",muscle:"ombro",type:"comp"},
  {name:"Desenvolvimento Arnold",muscle:"ombro",type:"comp"},
  {name:"Elevação lateral com halter",muscle:"ombro",type:"iso"},
  {name:"Elevação lateral com halter (sentado)",muscle:"ombro",type:"iso"},
  {name:"Elevação lateral no cabo",muscle:"ombro",type:"iso"},
  {name:"Elevação lateral na máquina",muscle:"ombro",type:"iso"},
  {name:"Elevação frontal com halter",muscle:"ombro",type:"iso"},
  {name:"Elevação frontal com barra",muscle:"ombro",type:"iso"},
  {name:"Elevação frontal com anilha",muscle:"ombro",type:"iso"},
  {name:"Elevação frontal no cabo",muscle:"ombro",type:"iso"},
  {name:"Crucifixo invertido com halter",muscle:"ombro",type:"iso"},
  {name:"Crucifixo invertido na máquina",muscle:"ombro",type:"iso"},
  {name:"Crucifixo invertido no cabo",muscle:"ombro",type:"iso"},
  {name:"Face pull no Cross",muscle:"ombro",type:"iso"},
  {name:"Face pull com corda",muscle:"ombro",type:"iso"},
  {name:"Press militar com barra",muscle:"ombro",type:"comp"},
  {name:"Remada alta com halter",muscle:"ombro",type:"comp"},
  {name:"Ombro máquina lateral",muscle:"ombro",type:"iso"},
  {name:"Desenvolvimento com halteres",muscle:"ombro",type:"comp"},
  {name:"Elevação lateral",muscle:"ombro",type:"iso"},
  {name:"Desenvolvimento militar halteres",muscle:"ombro",type:"comp"},
  {name:"Face pull (corda)",muscle:"ombro",type:"iso"},
  {name:"Desenvolvimento militar barra",muscle:"ombro",type:"comp"},
  {name:"Elevação lateral na polia",muscle:"ombro",type:"iso"},
  {name:"Face pull",muscle:"ombro",type:"iso"},
  {name:"Crucifixo invertido",muscle:"ombro",type:"iso"},
  {name:"Encolhimento",muscle:"ombro",type:"iso"},
  {name:"Elevação lateral unilateral no cabo",muscle:"ombro",type:"iso"},
  {name:"Elevação lateral inclinada (lean-away)",muscle:"ombro",type:"iso"},
  {name:"Press militar no Smith",muscle:"ombro",type:"comp"},
  {name:"Crucifixo invertido no banco 45°",muscle:"ombro",type:"iso"},
  {name:"Remada alta no cabo",muscle:"ombro",type:"comp"},
  {name:"Manguito rotador com elástico",muscle:"ombro",type:"iso"},
  {name:"Rotação externa no cabo",muscle:"ombro",type:"iso"},
  {name:"Desenvolvimento com kettlebell",muscle:"ombro",type:"comp"},
  {name:"Desenvolvimento unilateral com halter",muscle:"ombro",type:"comp"},
  {name:"Elevação lateral com elástico",muscle:"ombro",type:"iso"},
  {name:"Press militar com kettlebell",muscle:"ombro",type:"comp"},
  {name:"Remada alta com kettlebell",muscle:"ombro",type:"comp"},
  {name:"Desenvolvimento sentado com barra",muscle:"ombro",type:"comp"},
  {name:"Elevação lateral deitado",muscle:"ombro",type:"iso"},
  {name:"Face pull unilateral no cabo",muscle:"ombro",type:"iso"},
  {name:"Crucifixo invertido unilateral no cabo",muscle:"ombro",type:"iso"},
  {name:"Remada alta na máquina",muscle:"ombro",type:"comp"},
  {name:"Elevação frontal com kettlebell",muscle:"ombro",type:"iso"},
  {name:"Desenvolvimento na máquina unilateral",muscle:"ombro",type:"comp"},
  {name:"Rotação interna no cabo",muscle:"ombro",type:"iso"},
  {name:"Elevação frontal na máquina",muscle:"ombro",type:"iso"},
  // — Trapézio —
  {name:"Encolhimento com halter",muscle:"trapézio",type:"iso"},
  {name:"Encolhimento com barra",muscle:"trapézio",type:"iso"},
  {name:"Encolhimento na máquina Smith",muscle:"trapézio",type:"iso"},
  {name:"Remada alta com barra (trapézio)",muscle:"trapézio",type:"comp"},
  {name:"Encolhimento com halter inclinado",muscle:"trapézio",type:"iso"},
  {name:"Face pull (trapézio)",muscle:"trapézio",type:"iso"},
  {name:"Encolhimento no cabo",muscle:"trapézio",type:"iso"},
  {name:"Encolhimento com barra atrás do corpo",muscle:"trapézio",type:"iso"},
  {name:"Encolhimento unilateral com halter",muscle:"trapézio",type:"iso"},
  {name:"Remada alta com halteres (trapézio)",muscle:"trapézio",type:"comp"},
  {name:"Encolhimento com kettlebell",muscle:"trapézio",type:"iso"},
  {name:"Remada alta no Smith (trapézio)",muscle:"trapézio",type:"comp"},
  {name:"Encolhimento unilateral no cabo",muscle:"trapézio",type:"iso"},
  // — Bíceps —
  {name:"Rosca direta com barra",muscle:"bíceps",type:"iso"},
  {name:"Rosca direta com halter",muscle:"bíceps",type:"iso"},
  {name:"Rosca alternada com halter",muscle:"bíceps",type:"iso"},
  {name:"Rosca W (barra EZ)",muscle:"bíceps",type:"iso"},
  {name:"Rosca Scott com barra",muscle:"bíceps",type:"iso"},
  {name:"Rosca Scott com halter",muscle:"bíceps",type:"iso"},
  {name:"Rosca Scott na máquina",muscle:"bíceps",type:"iso"},
  {name:"Rosca concentrada",muscle:"bíceps",type:"iso"},
  {name:"Rosca martelo com halter",muscle:"bíceps",type:"iso"},
  {name:"Rosca martelo simultâneo",muscle:"bíceps",type:"iso"},
  {name:"Rosca no cabo",muscle:"bíceps",type:"iso"},
  {name:"Rosca no Cross",muscle:"bíceps",type:"iso"},
  {name:"Rosca inclinada com halter",muscle:"bíceps",type:"iso"},
  {name:"Rosca 21 (barra EZ)",muscle:"bíceps",type:"iso"},
  {name:"Rosca spider com barra EZ",muscle:"bíceps",type:"iso"},
  {name:"Martelo simultâneo com halter",muscle:"bíceps",type:"iso"},
  {name:"Martelo no cabo com corda",muscle:"bíceps",type:"iso"},
  {name:"Rosca W",muscle:"bíceps",type:"iso"},
  {name:"Rosca direta barra W",muscle:"bíceps",type:"iso"},
  {name:"Rosca martelo",muscle:"bíceps",type:"iso"},
  {name:"Rosca direta",muscle:"bíceps",type:"iso"},
  {name:"Rosca Scott unilateral com halter",muscle:"bíceps",type:"iso"},
  {name:"Rosca inclinada unilateral com halter",muscle:"bíceps",type:"iso"},
  {name:"Rosca com elástico",muscle:"bíceps",type:"iso"},
  {name:"Rosca Zottman",muscle:"bíceps",type:"iso"},
  {name:"Rosca drag com barra",muscle:"bíceps",type:"iso"},
  {name:"Rosca Scott no cabo",muscle:"bíceps",type:"iso"},
  {name:"Rosca martelo no banco inclinado",muscle:"bíceps",type:"iso"},
  {name:"Rosca no Cross unilateral",muscle:"bíceps",type:"iso"},
  {name:"Rosca Scott unilateral no cabo",muscle:"bíceps",type:"iso"},
  {name:"Rosca martelo unilateral no cabo",muscle:"bíceps",type:"iso"},
  {name:"Rosca 21 com halter",muscle:"bíceps",type:"iso"},
  {name:"Rosca direta na máquina",muscle:"bíceps",type:"iso"},
  {name:"Rosca concentrada no cabo",muscle:"bíceps",type:"iso"},
  {name:"Rosca com kettlebell",muscle:"bíceps",type:"iso"},
  {name:"Rosca inversa com barra",muscle:"bíceps",type:"iso"},
  {name:"Rosca inversa com barra EZ",muscle:"bíceps",type:"iso"},
  {name:"Rosca bayesiana no cabo",muscle:"bíceps",type:"iso"},
  // — Tríceps —
  {name:"Tríceps pulley com barra",muscle:"tríceps",type:"iso"},
  {name:"Tríceps corda",muscle:"tríceps",type:"iso"},
  {name:"Tríceps corda no crossover",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês com halter",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês com barra EZ",muscle:"tríceps",type:"iso"},
  {name:"Tríceps testa (barra EZ)",muscle:"tríceps",type:"iso"},
  {name:"Tríceps testa com halter",muscle:"tríceps",type:"iso"},
  {name:"Tríceps banco",muscle:"tríceps",type:"iso"},
  {name:"Tríceps coice com halter",muscle:"tríceps",type:"iso"},
  {name:"Tríceps coice no cabo",muscle:"tríceps",type:"iso"},
  {name:"Tríceps mergulho no paralelas",muscle:"tríceps",type:"comp"},
  {name:"Tríceps overhead com corda",muscle:"tríceps",type:"iso"},
  {name:"Tríceps overhead com halter",muscle:"tríceps",type:"iso"},
  {name:"Tríceps supino fechado",muscle:"tríceps",type:"comp"},
  {name:"Tríceps máquina",muscle:"tríceps",type:"iso"},
  {name:"Tríceps pulley inverso",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês (testa)",muscle:"tríceps",type:"iso"},
  {name:"Tríceps testa",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês unilateral",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês no cabo com corda",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês na máquina",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês unilateral com halter",muscle:"tríceps",type:"iso"},
  {name:"Tríceps testa na máquina",muscle:"tríceps",type:"iso"},
  {name:"Tríceps testa unilateral com halter",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês sentado com halter",muscle:"tríceps",type:"iso"},
  {name:"Tríceps supino fechado no Smith",muscle:"tríceps",type:"comp"},
  {name:"Tríceps mergulho no banco",muscle:"tríceps",type:"comp"},
  {name:"Tríceps corda unilateral",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês deitado com halter",muscle:"tríceps",type:"iso"},
  {name:"Tríceps pulley unilateral",muscle:"tríceps",type:"iso"},
  {name:"Tríceps testa no banco declinado",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês com kettlebell",muscle:"tríceps",type:"iso"},
  {name:"Tríceps coice na máquina",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês no crossover unilateral",muscle:"tríceps",type:"iso"},
  {name:"Tríceps pulley unilateral com corda",muscle:"tríceps",type:"iso"},
  {name:"Tríceps mergulho assistido na máquina",muscle:"tríceps",type:"comp"},
  {name:"Tríceps pulley com barra V",muscle:"tríceps",type:"iso"},
  {name:"Tríceps francês unilateral na máquina",muscle:"tríceps",type:"iso"},
  // — Antebraço —
  {name:"Rosca punho com barra",muscle:"antebraço",type:"iso"},
  {name:"Rosca punho com halter",muscle:"antebraço",type:"iso"},
  {name:"Rosca punho invertida com barra",muscle:"antebraço",type:"iso"},
  {name:"Rosca punho invertida com halter",muscle:"antebraço",type:"iso"},
  {name:"Rosca punho (antebraço)",muscle:"antebraço",type:"iso"},
  {name:"Farmer's walk",muscle:"antebraço",type:"comp"},
  {name:"Wrist roller",muscle:"antebraço",type:"iso"},
  {name:"Martelo braquiorradial",muscle:"antebraço",type:"iso"},
  {name:"Rosca punho no cabo",muscle:"antebraço",type:"iso"},
  {name:"Rosca punho invertida no cabo",muscle:"antebraço",type:"iso"},
  {name:"Rosca punho unilateral com halter",muscle:"antebraço",type:"iso"},
  {name:"Extensor de punho com elástico",muscle:"antebraço",type:"iso"},
  {name:"Rosca punho com kettlebell",muscle:"antebraço",type:"iso"},
  {name:"Farmer's walk unilateral",muscle:"antebraço",type:"comp"},
  {name:"Rosca punho na máquina",muscle:"antebraço",type:"iso"},
  {name:"Pinça com anilha",muscle:"antebraço",type:"iso"},
  // — Perna (quadríceps / posterior / adutores) —
  {name:"Agachamento livre com barra",muscle:"perna",type:"comp"},
  {name:"Agachamento frontal",muscle:"perna",type:"comp"},
  {name:"Agachamento no Smith",muscle:"perna",type:"comp"},
  {name:"Agachamento sumô",muscle:"perna",type:"comp"},
  {name:"Agachamento hack",muscle:"perna",type:"comp"},
  {name:"Agachamento goblet",muscle:"perna",type:"comp"},
  {name:"Agachamento búlgaro",muscle:"perna",type:"comp"},
  {name:"Leg press 45",muscle:"perna",type:"comp"},
  {name:"Leg press horizontal",muscle:"perna",type:"comp"},
  {name:"Leg 45",muscle:"perna",type:"comp"},
  {name:"Leg 45 unilateral",muscle:"perna",type:"comp"},
  {name:"Cadeira extensora",muscle:"perna",type:"iso"},
  {name:"Flexora deitado",muscle:"perna",type:"iso"},
  {name:"Flexora sentado",muscle:"perna",type:"iso"},
  {name:"Mesa flexora",muscle:"perna",type:"iso"},
  {name:"Stiff com barra",muscle:"perna",type:"comp"},
  {name:"Stiff com halter",muscle:"perna",type:"comp"},
  {name:"Meio terra sumô",muscle:"perna",type:"comp"},
  {name:"Avanço com halter",muscle:"perna",type:"comp"},
  {name:"Avanço no Smith",muscle:"perna",type:"comp"},
  {name:"Passada com halter",muscle:"perna",type:"comp"},
  {name:"Búlgaro com carga ipsilateral",muscle:"perna",type:"comp"},
  {name:"Búlgaro com halter",muscle:"perna",type:"comp"},
  {name:"Cadeira adutora",muscle:"perna",type:"iso"},
  {name:"Cadeira abdutora",muscle:"perna",type:"iso"},
  {name:"Sissy squat",muscle:"perna",type:"iso"},
  {name:"Hack squat invertido",muscle:"perna",type:"comp"},
  {name:"Afundo no Smith",muscle:"perna",type:"comp"},
  {name:"Prensa unilateral",muscle:"perna",type:"comp"},
  {name:"Agachamento livre",muscle:"perna",type:"comp"},
  {name:"Leg press 45°",muscle:"perna",type:"comp"},
  {name:"Cadeira flexora",muscle:"perna",type:"iso"},
  {name:"Panturrilha em pé (máquina)",muscle:"perna",type:"iso"},
  {name:"Agachamento barra livre",muscle:"perna",type:"comp"},
  {name:"Stiff (terra romeno)",muscle:"perna",type:"comp"},
  {name:"Afundo com halteres",muscle:"perna",type:"comp"},
  {name:"Panturrilha em pé",muscle:"perna",type:"iso"},
  {name:"Glúteo na polia (coice)",muscle:"perna",type:"iso"},
  {name:"Stiff",muscle:"perna",type:"comp"},
  {name:"Agachamento pistol (unilateral)",muscle:"perna",type:"comp"},
  {name:"Leg press horizontal unilateral",muscle:"perna",type:"comp"},
  {name:"Cadeira extensora unilateral",muscle:"perna",type:"iso"},
  {name:"Flexora unilateral sentado",muscle:"perna",type:"iso"},
  {name:"Flexora em pé",muscle:"perna",type:"iso"},
  {name:"Stiff com kettlebell",muscle:"perna",type:"comp"},
  {name:"Levantamento terra romeno unilateral com halter",muscle:"perna",type:"comp"},
  {name:"Avanço reverso com halter",muscle:"perna",type:"comp"},
  {name:"Avanço caminhando com halter",muscle:"perna",type:"comp"},
  {name:"Passada no Smith",muscle:"perna",type:"comp"},
  {name:"Passada com barra",muscle:"perna",type:"comp"},
  {name:"Búlgaro no Smith",muscle:"perna",type:"comp"},
  {name:"Adutora no cabo",muscle:"perna",type:"iso"},
  {name:"Abdutora no cabo",muscle:"perna",type:"iso"},
  {name:"Agachamento Zercher",muscle:"perna",type:"comp"},
  {name:"Agachamento sumô no Smith",muscle:"perna",type:"comp"},
  {name:"Leg press 45 unilateral",muscle:"perna",type:"comp"},
  {name:"Cadeira adutora unilateral",muscle:"perna",type:"iso"},
  {name:"Stiff no Smith",muscle:"perna",type:"comp"},
  {name:"Agachamento hack unilateral",muscle:"perna",type:"comp"},
  {name:"Leg press vertical",muscle:"perna",type:"comp"},
  {name:"Afundo com barra",muscle:"perna",type:"comp"},
  {name:"Passada com kettlebell",muscle:"perna",type:"comp"},
  {name:"Leg press 45 com pés altos",muscle:"perna",type:"comp"},
  {name:"Flexora deitado unilateral",muscle:"perna",type:"iso"},
  {name:"Agachamento sumô com halter",muscle:"perna",type:"comp"},
  {name:"Agachamento Smith unilateral",muscle:"perna",type:"comp"},
  {name:"Agachamento frontal com kettlebell",muscle:"perna",type:"comp"},
  {name:"Stiff unilateral no cabo",muscle:"perna",type:"comp"},
  {name:"Leg press vertical unilateral",muscle:"perna",type:"comp"},
  {name:"Levantamento terra romeno unilateral no cabo",muscle:"perna",type:"comp"},
  {name:"Passada lateral com halter",muscle:"perna",type:"comp"},
  // — Glúteo —
  {name:"Hip thrust com barra",muscle:"glúteo",type:"comp"},
  {name:"Hip thrust na máquina",muscle:"glúteo",type:"comp"},
  {name:"Elevação pélvica no solo",muscle:"glúteo",type:"iso"},
  {name:"Glúteo na máquina",muscle:"glúteo",type:"iso"},
  {name:"Glúteo no cabo (kickback)",muscle:"glúteo",type:"iso"},
  {name:"Coice no cabo",muscle:"glúteo",type:"iso"},
  {name:"Abdução no cabo",muscle:"glúteo",type:"iso"},
  {name:"Abdução com faixa elástica",muscle:"glúteo",type:"iso"},
  {name:"Step-up com halter",muscle:"glúteo",type:"comp"},
  {name:"Ponte glútea unilateral",muscle:"glúteo",type:"iso"},
  {name:"Glúteo quatro apoios",muscle:"glúteo",type:"iso"},
  {name:"Hip thrust unilateral",muscle:"glúteo",type:"iso"},
  {name:"Elevação pélvica no banco",muscle:"glúteo",type:"iso"},
  {name:"Hip thrust no Smith",muscle:"glúteo",type:"comp"},
  {name:"Coice na máquina",muscle:"glúteo",type:"iso"},
  {name:"Abdução na máquina",muscle:"glúteo",type:"iso"},
  {name:"Step-up no banco (peso corporal)",muscle:"glúteo",type:"comp"},
  {name:"Glúteo quatro apoios no cabo",muscle:"glúteo",type:"iso"},
  {name:"Hip thrust com kettlebell",muscle:"glúteo",type:"comp"},
  {name:"Ponte glútea com barra",muscle:"glúteo",type:"iso"},
  {name:"Elevação pélvica unilateral no banco",muscle:"glúteo",type:"iso"},
  {name:"Abdução deitado (peso corporal)",muscle:"glúteo",type:"iso"},
  {name:"Ponte glútea com halter",muscle:"glúteo",type:"iso"},
  {name:"Step-up lateral com halter",muscle:"glúteo",type:"comp"},
  {name:"Abdução com halter (deitado)",muscle:"glúteo",type:"iso"},
  // — Panturrilha —
  {name:"Panturrilha sentado",muscle:"panturrilha",type:"iso"},
  {name:"Panturrilha em pé na máquina",muscle:"panturrilha",type:"iso"},
  {name:"Panturrilha no leg press",muscle:"panturrilha",type:"iso"},
  {name:"Panturrilha no Smith",muscle:"panturrilha",type:"iso"},
  {name:"Panturrilha unilateral com halter",muscle:"panturrilha",type:"iso"},
  {name:"Panturrilha no hack",muscle:"panturrilha",type:"iso"},
  {name:"Gêmeos em pé (donkey calf)",muscle:"panturrilha",type:"iso"},
  {name:"Sóleo sentado",muscle:"panturrilha",type:"iso"},
  {name:"Panturrilha no cabo",muscle:"panturrilha",type:"iso"},
  {name:"Panturrilha unilateral no step (peso corporal)",muscle:"panturrilha",type:"iso"},
  {name:"Sóleo no leg press",muscle:"panturrilha",type:"iso"},
  {name:"Panturrilha com kettlebell em pé",muscle:"panturrilha",type:"iso"},
  {name:"Sóleo no Smith",muscle:"panturrilha",type:"iso"},
  {name:"Panturrilha unilateral no leg press",muscle:"panturrilha",type:"iso"},
  // — Abdômen —
  {name:"Abdominal crunch",muscle:"abdômen",type:"iso"},
  {name:"Abdominal infra",muscle:"abdômen",type:"iso"},
  {name:"Abdominal na máquina",muscle:"abdômen",type:"iso"},
  {name:"Abdominal no cabo (rope crunch)",muscle:"abdômen",type:"iso"},
  {name:"Abdominal bicicleta",muscle:"abdômen",type:"iso"},
  {name:"Prancha frontal",muscle:"abdômen",type:"iso"},
  {name:"Prancha lateral",muscle:"abdômen",type:"iso"},
  {name:"Elevação de pernas suspenso",muscle:"abdômen",type:"iso"},
  {name:"Elevação de pernas no banco",muscle:"abdômen",type:"iso"},
  {name:"Russian twist",muscle:"abdômen",type:"iso"},
  {name:"Oblíquo no cabo",muscle:"abdômen",type:"iso"},
  {name:"Roda abdominal (ab wheel)",muscle:"abdômen",type:"iso"},
  {name:"Leg raise na barra fixa",muscle:"abdômen",type:"iso"},
  {name:"Mountain climber",muscle:"abdômen",type:"iso"},
  {name:"Pallof press no cabo",muscle:"abdômen",type:"iso"},
  {name:"Woodchop no cabo",muscle:"abdômen",type:"iso"},
  {name:"Crunch invertido",muscle:"abdômen",type:"iso"},
  {name:"Sit-up",muscle:"abdômen",type:"iso"},
  {name:"Dragon flag",muscle:"abdômen",type:"iso"},
  {name:"Hollow hold",muscle:"abdômen",type:"iso"},
  {name:"Abdominal supra no banco declinado",muscle:"abdômen",type:"iso"},
  {name:"Abdominal com carga (anilha)",muscle:"abdômen",type:"iso"},
  {name:"Abdominal canivete (V-up)",muscle:"abdômen",type:"iso"},
  {name:"Elevação de pernas deitado no solo",muscle:"abdômen",type:"iso"},
  {name:"Flexão lateral de tronco (side bend) com halter",muscle:"abdômen",type:"iso"},
  {name:"Rotação de tronco na máquina",muscle:"abdômen",type:"iso"},
  {name:"Prancha frontal com carga",muscle:"abdômen",type:"iso"},
  {name:"Abdominal oblíquo no banco (side crunch)",muscle:"abdômen",type:"iso"},
  {name:"Elevação de joelhos no banco romano",muscle:"abdômen",type:"iso"},
  {name:"Rotação de tronco com halter",muscle:"abdômen",type:"iso"},
  {name:"Elevação de pernas no cabo",muscle:"abdômen",type:"iso"},
  {name:"Sit-up com anilha",muscle:"abdômen",type:"iso"},
  {name:"Prancha lateral com carga",muscle:"abdômen",type:"iso"},
];

const _exTypeMap = buildExTypeMap(EXERCISE_CATALOG);

const MACHINE_CATALOG = ["Hammer","Life Fitness","Technogym","Matrix Fitness","Cybex","Nautilus","Movement","Cimerian","Ipiranga","Righetto"];

// ========= Estado em memória =========
// Palliative cap on the session cache. ~750 sessions is several years of
// training; raising it is cheaper than the Phase 5 aggregate work if a real
// user ever hits it. Phase 5 replaces this with aggregates + pagination.
const SESSIONS_FETCH_LIMIT = 750;

const todayIdx = (()=>{ const g=new Date().getDay(); return g===0?6:g-1; })();
state.current = todayIdx;

// ========= DOM =========
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z"/></svg>';
const ICON_TREND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>';

function effectiveTheme(){
  return state.theme || (prefersDark.matches ? "dark" : "light");
}
function applyTheme(){
  const t = effectiveTheme();
  document.documentElement.setAttribute("data-theme", t);
  $themeBtn.innerHTML = t === "dark" ? ICON_SUN : ICON_MOON;
  $themeBtn.title = t === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro";
  if($settingsThemeToggle){
    $settingsThemeToggle.innerHTML = (t === "dark" ? ICON_SUN : ICON_MOON) +
      `<span>${t === "dark" ? "Tema claro" : "Tema escuro"}</span>`;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", t === "dark" ? "#0E0F12" : "#F4F5F7");
  try{
    if(state.theme) localStorage.setItem("ss_theme", state.theme);
    else localStorage.removeItem("ss_theme");
  }catch(_){}
}

function toggleTheme(){
  state.theme = effectiveTheme() === "dark" ? "light" : "dark";
  applyTheme();
  savePref();
  if(state.evoChart && $viewEvolucao.style.display !== "none") renderEvolucao();
}

$themeBtn.addEventListener("click", toggleTheme);
prefersDark.addEventListener("change", () => { if(!state.theme) applyTheme(); });

// ========= Abas principais =========
function showTab(which){
  if(which !== "treino" && state.trainMode) exitTrainMode();
  $tabTreino.classList.toggle("active", which === "treino");
  $tabExercicios.classList.toggle("active", which === "exercicios");
  $tabEvolucao.classList.toggle("active", which === "evolucao");
  $viewTreino.style.display = which === "treino" ? "" : "none";
  $viewExercicios.style.display = which === "exercicios" ? "" : "none";
  $viewEvolucao.style.display = which === "evolucao" ? "" : "none";
  syncBottomNav(which);
  if(window._updateCondensed) window._updateCondensed();
  if(which === "evolucao") initEvolucao();
  if(which === "exercicios") renderExercicios();
}
$tabTreino.addEventListener("click", () => showTab("treino"));
$tabExercicios.addEventListener("click", () => showTab("exercicios"));
$tabEvolucao.addEventListener("click", () => showTab("evolucao"));
document.getElementById("exSubTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-subtab]"); if(!b) return;
  state.exSubTab = b.dataset.subtab; renderExercicios();
});

// ========= Bottom nav (mobile) =========
function syncBottomNav(which){
  $bnTreino.setAttribute("aria-selected", which === "treino");
  $bnExercicios.setAttribute("aria-selected", which === "exercicios");
  $bnEvolucao.setAttribute("aria-selected", which === "evolucao");
}
$bnTreino.addEventListener("click", () => showTab("treino"));
$bnExercicios.addEventListener("click", () => showTab("exercicios"));
$bnEvolucao.addEventListener("click", () => showTab("evolucao"));

// ========= Settings bottom-sheet (mobile) =========
function applyPrevLayoutState(){
  document.body.classList.toggle("layout-prev-column", state.prevLayout === "column" && !state.trainMode);
}
function syncPrevLayoutToggle(){
  document.querySelectorAll('#prevLayoutToggle [data-prevlayout]').forEach(b =>
    b.classList.toggle("active", b.dataset.prevlayout === state.prevLayout));
}
applyPrevLayoutState(); // default before any prefs load

function syncPeriodToggle(){
  const $on = document.querySelector('#periodToggle [data-period="on"]');
  const $off = document.querySelector('#periodToggle [data-period="off"]');
  $on.classList.toggle("active", state.periodizationEnabled);
  $off.classList.toggle("active", !state.periodizationEnabled);
}
function syncMachinesToggle(){
  const $on = document.querySelector('#machinesToggle [data-mach="on"]');
  const $off = document.querySelector('#machinesToggle [data-mach="off"]');
  $on.classList.toggle("active", state.machinesEnabled);
  $off.classList.toggle("active", !state.machinesEnabled);
}
function syncProfileToggle(){
  const $on = document.querySelector('#profileToggle [data-prof="on"]');
  const $off = document.querySelector('#profileToggle [data-prof="off"]');
  $on.classList.toggle("active", state.profileEnabled);
  $off.classList.toggle("active", !state.profileEnabled);
}
function syncAutoregToggle(){
  const $on = document.querySelector('#autoregToggle [data-autoreg="on"]');
  const $off = document.querySelector('#autoregToggle [data-autoreg="off"]');
  $on.classList.toggle("active", state.autoregEnabled);
  $off.classList.toggle("active", !state.autoregEnabled);
}
function syncExecOrderToggle(){
  const $on = document.querySelector('#execOrderToggle [data-execorder="on"]');
  const $off = document.querySelector('#execOrderToggle [data-execorder="off"]');
  $on.classList.toggle("active", state.execOrderEnabled);
  $off.classList.toggle("active", !state.execOrderEnabled);
}
function syncGamificationToggle(){
  const $on = document.querySelector('#gamificationToggle [data-gamif="on"]');
  const $off = document.querySelector('#gamificationToggle [data-gamif="off"]');
  $on.classList.toggle("active", state.gamificationEnabled);
  $off.classList.toggle("active", !state.gamificationEnabled);
}
function syncAutoregSensToggle(){
  document.querySelectorAll('#autoregSensToggle [data-sens]').forEach(b =>
    b.classList.toggle("active", b.dataset.sens === state.autoregSensitivity));
  const desc = document.getElementById("autoregSensDesc");
  if(desc) desc.textContent = ({
    suave: "Só sugere mudança em desvios grandes; prioriza estabilidade.",
    mod:   "Equilíbrio entre reagir ao desempenho e respeitar a fadiga.",
    agr:   "Sobe a carga assim que você supera a meta, mesmo cansado.",
  })[state.autoregSensitivity] || "";
}
function openSettings(){
  syncPrevLayoutToggle();
  syncPeriodToggle();
  syncMachinesToggle();
  syncProfileToggle();
  syncAutoregToggle();
  syncAutoregSensToggle();
  syncExecOrderToggle();
  syncGamificationToggle();
  $settingsModal.classList.add("open");
}
function closeSettings(){ $settingsModal.classList.remove("open"); }
$bnConfig.addEventListener("click", openSettings);
$settingsModal.addEventListener("click", e => { if(e.target === $settingsModal) closeSettings(); });
$settingsThemeToggle.addEventListener("click", toggleTheme);
document.getElementById("prevLayoutToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-prevlayout]");
  if(!btn) return;
  state.prevLayout = btn.dataset.prevlayout === "panel" ? "panel" : "column";
  syncPrevLayoutToggle();
  savePref();
  applyPrevLayoutState();
  // renderDay is required, not optional: seriesHTML branches on the layout in JS.
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("periodToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-period]");
  if(!btn) return;
  state.periodizationEnabled = btn.dataset.period === "on";
  syncPeriodToggle();
  savePref();
  applyPeriodizationState();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("machinesToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-mach]");
  if(!btn) return;
  state.machinesEnabled = btn.dataset.mach === "on";
  syncMachinesToggle();
  savePref();
  applyMachinesState();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("profileToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-prof]");
  if(!btn) return;
  state.profileEnabled = btn.dataset.prof === "on";
  syncProfileToggle();
  savePref();
  applyProfileState();
});
document.getElementById("autoregToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-autoreg]");
  if(!btn) return;
  state.autoregEnabled = btn.dataset.autoreg === "on";
  syncAutoregToggle();
  savePref();
  applyAutoregState();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("autoregSensToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-sens]");
  if(!btn) return;
  state.autoregSensitivity = btn.dataset.sens;
  syncAutoregSensToggle();
  savePref();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("execOrderToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-execorder]");
  if(!btn) return;
  state.execOrderEnabled = btn.dataset.execorder === "on";
  syncExecOrderToggle();
  savePref();
  applyExecOrderState();
  if($viewTreino.style.display !== "none") renderDay();
});
document.getElementById("gamificationToggle").addEventListener("click", e => {
  const btn = e.target.closest("[data-gamif]");
  if(!btn) return;
  state.gamificationEnabled = btn.dataset.gamif === "on";
  if(state.gamificationEnabled && !state.gamifStartDate) state.gamifStartDate = todayStr();
  syncGamificationToggle();
  savePref();
  refreshGamification();
  applyGamificationState();
});
document.getElementById("settingsSubTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-settingstab]"); if(!b) return;
  const tab = b.dataset.settingstab;
  document.querySelectorAll("#settingsSubTabs [data-settingstab]").forEach(x =>
    x.classList.toggle("active", x.dataset.settingstab === tab));
  document.querySelectorAll('#settingsModalInner [data-settingspanel]').forEach(p =>
    p.classList.toggle("active", p.dataset.settingspanel === tab));
});
document.getElementById("settingsProfileEditRow").addEventListener("click", () => {
  closeSettings();
  openProfileModal();
});
document.getElementById("settingsExportRow").addEventListener("click", exportUserData);
$settingsLogoutBtn.addEventListener("click", () => signOut(auth));
document.getElementById("settingsBtnDesktop").addEventListener("click", openSettings);

// ========= Profile modal =========
$profileModal.addEventListener("click", e => { if(e.target === $profileModal) closeProfileModal(); });
function closeProfileModal(){ $profileModal.classList.remove("open"); }
function openProfileModal(){
  const SEX_OPTS = [{val:"m",label:"M"},{val:"f",label:"F"},{val:null,label:"Prefiro não dizer"}];
  const EXP_OPTS = [{val:"beg",label:"Iniciante · 0–1a"},{val:"int",label:"Intermediário · 1–3a"},{val:"adv",label:"Avançado · +3a"}];

  let html = `<h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0 0 6px">Perfil de treino</h3>`;
  html += `<p style="font-size:12px;color:var(--muted);margin:0 0 18px;line-height:1.4">Opcional. Melhora a precisão das sugestões de carga. Deixe em branco o que não quiser informar.</p>`;

  // Data de nascimento
  const todayISO = new Date().toISOString().slice(0,10);
  const ageHint = profileAge();
  html += `<label style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:4px;display:block">Data de nascimento</label>`;
  html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><input id="profBirth" type="date" value="${state.profile.birthDate ?? ""}" max="${todayISO}" style="width:150px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:14px;font-family:var(--body)">`;
  html += `<span id="profAgeHint" style="font-size:12px;color:var(--faint)">${ageHint != null ? "("+ageHint+" anos)" : ""}</span></div>`;

  // Sexo
  html += `<label style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:6px;display:block">Sexo</label>`;
  html += `<div id="profSex" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">`;
  SEX_OPTS.forEach(o => {
    const active = state.profile.sex === o.val;
    html += `<button type="button" class="sub-chip${active?" active":""}" data-val="${o.val}" style="padding:6px 14px;font-size:12px;border-radius:20px;border:1px solid ${active?"var(--accent)":"var(--border)"};background:${active?"var(--accent-soft)":"var(--surface-2)"};color:${active?"var(--accent)":"var(--text)"};cursor:pointer;font-family:var(--body);font-weight:500">${o.label}</button>`;
  });
  html += `</div>`;

  // Peso corporal
  html += `<label style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:4px;display:block">Peso corporal (kg)</label>`;
  html += `<input id="profWeight" type="text" inputmode="decimal" placeholder="—" value="${state.profile.bodyweight != null ? state.profile.bodyweight : ""}" style="width:100px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:14px;font-family:var(--body);margin-bottom:14px">`;

  // Experiência
  html += `<label style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:6px;display:block">Experiência</label>`;
  html += `<div id="profExp" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">`;
  EXP_OPTS.forEach(o => {
    const active = state.profile.experience === o.val;
    html += `<button type="button" class="sub-chip${active?" active":""}" data-val="${o.val}" style="padding:6px 14px;font-size:12px;border-radius:20px;border:1px solid ${active?"var(--accent)":"var(--border)"};background:${active?"var(--accent-soft)":"var(--surface-2)"};color:${active?"var(--accent)":"var(--text)"};cursor:pointer;font-family:var(--body);font-weight:500">${o.label}</button>`;
  });
  html += `</div>`;

  // Lesões/limitações
  html += `<label style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:6px;display:block">Lesões / limitações</label>`;
  html += `<p style="font-size:11px;color:var(--muted);margin:0 0 8px;line-height:1.3">O app evita sugerir aumento de carga nos grupos marcados.</p>`;
  html += `<div id="profInjuries" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">`;
  MUSCLE_ORDER.forEach(k => {
    const active = !!state.profile.injuries[k];
    html += `<button type="button" class="sub-chip${active?" active":""}" data-muscle="${k}" style="padding:5px 12px;font-size:11px;border-radius:20px;border:1px solid ${active?"var(--accent)":"var(--border)"};background:${active?"var(--accent-soft)":"var(--surface-2)"};color:${active?"var(--accent)":"var(--text)"};cursor:pointer;font-family:var(--body);font-weight:500">${MUSCLE_LABEL[k]}</button>`;
  });
  html += `</div>`;

  $profileModalInner.innerHTML = html;
  $profileModal.classList.add("open");

  // — Bind listeners —
  // Birth date
  document.getElementById("profBirth").addEventListener("change", e => {
    const v = e.target.value;
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
      const yr = parseInt(v.slice(0,4),10);
      if(yr >= 1920 && v <= new Date().toISOString().slice(0,10)){
        state.profile.birthDate = v;
      } else { state.profile.birthDate = null; }
    } else { state.profile.birthDate = null; }
    const hint = document.getElementById("profAgeHint");
    const a = profileAge();
    if(hint) hint.textContent = a != null ? "("+a+" anos)" : "";
    scheduleProfileSave();
  });

  // Sex chips
  document.getElementById("profSex").addEventListener("click", e => {
    const btn = e.target.closest("[data-val]");
    if(!btn) return;
    const val = btn.dataset.val === "null" ? null : btn.dataset.val;
    state.profile.sex = val;
    btn.parentNode.querySelectorAll(".sub-chip").forEach(c => {
      const isActive = c === btn;
      c.classList.toggle("active", isActive);
      c.style.borderColor = isActive ? "var(--accent)" : "var(--border)";
      c.style.background = isActive ? "var(--accent-soft)" : "var(--surface-2)";
      c.style.color = isActive ? "var(--accent)" : "var(--text)";
    });
    scheduleProfileSave();
  });

  // Weight
  document.getElementById("profWeight").addEventListener("input", e => {
    const v = e.target.value.replace(/[^0-9.,]/g,"").replace(",",".");
    e.target.value = v;
    const n = parseFloat(v);
    state.profile.bodyweight = (n > 0 && isFinite(n)) ? Math.round(n * 10) / 10 : null;
    scheduleProfileSave();
  });

  // Experience chips (tap active to deselect)
  document.getElementById("profExp").addEventListener("click", e => {
    const btn = e.target.closest("[data-val]");
    if(!btn) return;
    const val = btn.dataset.val;
    const wasActive = btn.classList.contains("active");
    state.profile.experience = wasActive ? null : val;
    btn.parentNode.querySelectorAll(".sub-chip").forEach(c => {
      const isActive = !wasActive && c === btn;
      c.classList.toggle("active", isActive);
      c.style.borderColor = isActive ? "var(--accent)" : "var(--border)";
      c.style.background = isActive ? "var(--accent-soft)" : "var(--surface-2)";
      c.style.color = isActive ? "var(--accent)" : "var(--text)";
    });
    scheduleProfileSave();
  });

  // Injury chips (multi-toggle)
  document.getElementById("profInjuries").addEventListener("click", e => {
    const btn = e.target.closest("[data-muscle]");
    if(!btn) return;
    const k = btn.dataset.muscle;
    if(state.profile.injuries[k]){ delete state.profile.injuries[k]; } else { state.profile.injuries[k] = true; }
    const active = !!state.profile.injuries[k];
    btn.classList.toggle("active", active);
    btn.style.borderColor = active ? "var(--accent)" : "var(--border)";
    btn.style.background = active ? "var(--accent-soft)" : "var(--surface-2)";
    btn.style.color = active ? "var(--accent)" : "var(--text)";
    scheduleProfileSave();
  });
}

// ========= Collapse-on-scroll sticky header =========
{
  const $days = document.querySelector("nav.days");
  const mql = window.matchMedia("(max-width:600px)");
  let ticking = false;

  function updateCondensed(){
    if(!mql.matches || $viewTreino.style.display === "none"){
      $days.classList.remove("condensed");
      return;
    }
    const sy = window.scrollY;
    if(sy > 48 && !$days.classList.contains("condensed")){
      $days.classList.add("condensed");
      centerActiveDay();
    } else if(sy < 16 && $days.classList.contains("condensed")){
      $days.classList.remove("condensed");
      centerActiveDay();
    }
  }

  window.addEventListener("scroll", () => {
    if(!ticking){
      ticking = true;
      requestAnimationFrame(() => { updateCondensed(); ticking = false; });
    }
  }, { passive: true });

  // Reset on media query change
  mql.addEventListener("change", () => updateCondensed());

  // Expose for showTab to call
  window._updateCondensed = updateCondensed;
}

// ========= Modal scroll lock + drag-to-dismiss =========
function lockBodyScroll(){
  state._modalScrollY = window.scrollY;
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${state._modalScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
}
function unlockBodyScroll(){
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  window.scrollTo(0, state._modalScrollY);
}

// Observe all modal overlays for .open class changes
const _allOverlays = document.querySelectorAll(".modal-overlay");
const _modalObserver = new MutationObserver(mutations => {
  for(const m of mutations){
    if(m.attributeName !== "class") continue;
    const el = m.target;
    if(el.classList.contains("open")) lockBodyScroll();
    else unlockBodyScroll();
  }
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

function applyModeButtons(){
  $modeCompact.classList.toggle("active", state.viewMode === "compact");
  $modeLoad.classList.toggle("active", state.viewMode === "load");
}
function setMode(m){
  state.viewMode = m;
  applyModeButtons();
  renderDay();
  savePref();
}
$modeCompact.addEventListener("click", () => setMode("compact"));
$modeLoad.addEventListener("click", () => setMode("load"));

function setSync(status, txt){
  $sync.className = "sync-status " + status;
  $sync.querySelector(".txt").textContent = txt;
}

// ========= Auth =========
$loginBtn.addEventListener("click", () => {
  signInWithPopup(auth, provider).catch(err => {
    alert("Erro no login: " + err.message);
  });
});

onAuthStateChanged(auth, async u => {
  state.user = u;
  state.allSessions = null;
  state.allSessionsTruncated = false;
  state.allSessionsError = false;
  state.allSessionsPromise = null;
  state.gamification = null;
  state.gamificationEnabled = false;
  state.gamifStartDate = null;
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
    state.exercisesCatalog.clear();
    state.userDays = null;
    state.dayCustomizations = {};
    state.plansCache.clear();
    state.currentPlanName = null;
    state.currentPlanId = null;
    state.currentPlanKey = null;
    teardownFeatureFlags();
  }
});

window.addEventListener("online", ()=>{ if(state.user) setSync("live","sincronizado"); });
window.addEventListener("offline", ()=>{ setSync("offline","offline — salvando local"); });

async function initApp(u){
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
function initWithTimeout(u, ms = 15000){
  return Promise.race([
    initApp(u),
    new Promise((_, rej) => setTimeout(() => rej(new Error("init timeout")), ms)),
  ]);
}
function renderInitError(){
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

// ========= Firestore =========

async function loadPref(){
  if(!state.user) return;
  try{
    const ref = doc(db, "users", state.user.uid, "prefs", "app");
    const snap = await getDoc(ref);
    if(snap.exists()){
      const d = snap.data();
      if(d.viewMode) state.viewMode = d.viewMode;
      if(d.theme === "dark" || d.theme === "light") state.theme = d.theme;
      if(d.currentPlanName) state.currentPlanName = d.currentPlanName;
      if(d.currentPlanId) state.currentPlanId = d.currentPlanId;
      if(d.currentPlanKey) state.currentPlanKey = d.currentPlanKey;
      if(d.lastDeloadDate) state.lastDeloadDate = d.lastDeloadDate;
      if(d.prevLayout === "panel" || d.prevLayout === "column") state.prevLayout = d.prevLayout;
      if(typeof d.periodizationEnabled === "boolean") state.periodizationEnabled = d.periodizationEnabled;
      if(typeof d.machinesEnabled === "boolean") state.machinesEnabled = d.machinesEnabled;
      if(typeof d.profileEnabled === "boolean") state.profileEnabled = d.profileEnabled;
      if(typeof d.autoregEnabled === "boolean") state.autoregEnabled = d.autoregEnabled;
      if(["suave","mod","agr"].includes(d.autoregSensitivity)) state.autoregSensitivity = d.autoregSensitivity;
      if(typeof d.execOrderEnabled === "boolean") state.execOrderEnabled = d.execOrderEnabled;
      if(typeof d.gamificationEnabled === "boolean") state.gamificationEnabled = d.gamificationEnabled;
      if(typeof d.gamifStartDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.gamifStartDate)) state.gamifStartDate = d.gamifStartDate;
    }
  }catch(e){ console.warn("loadPref:", e.message); }
  // Migrate: gamification already ON but no start date → anchor to today (fresh window)
  if(state.gamificationEnabled && !state.gamifStartDate){ state.gamifStartDate = todayStr(); savePref(); }
  // load profile doc
  try{
    const pRef = doc(db, "users", state.user.uid, "prefs", "profile");
    const pSnap = await getDoc(pRef);
    if(pSnap.exists()){
      const p = pSnap.data();
      state.profile.birthDate = (typeof p.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)) ? p.birthDate : null;
      if(p.sex === "m" || p.sex === "f") state.profile.sex = p.sex; else state.profile.sex = null;
      if(typeof p.bodyweight === "number" && p.bodyweight > 0) state.profile.bodyweight = p.bodyweight; else state.profile.bodyweight = null;
      if(p.experience === "beg" || p.experience === "int" || p.experience === "adv") state.profile.experience = p.experience; else state.profile.experience = null;
      if(p.injuries && typeof p.injuries === "object"){
        state.profile.injuries = {};
        MUSCLE_ORDER.forEach(k => { if(p.injuries[k] === true) state.profile.injuries[k] = true; });
      } else { state.profile.injuries = {}; }
    }
  }catch(e){ console.warn("loadProfile:", e.message); }
  applyModeButtons();
  applyTheme();
  applyPrevLayoutState();
  applyPeriodizationState();
  applyMachinesState();
  applyProfileState();
  applyAutoregState();
  applyExecOrderState();
  applyGamificationState();
}
async function savePref(){
  if(!state.user) return;
  try{
    const ref = doc(db, "users", state.user.uid, "prefs", "app");
    await setDoc(ref, {
      viewMode: state.viewMode, theme: state.theme || null,
      currentPlanName: state.currentPlanName || null,
      currentPlanId: state.currentPlanId || null,
      currentPlanKey: state.currentPlanKey || null,
      prevLayout: state.prevLayout,
      periodizationEnabled: state.periodizationEnabled,
      machinesEnabled: state.machinesEnabled,
      profileEnabled: state.profileEnabled,
      autoregEnabled: state.autoregEnabled,
      autoregSensitivity: state.autoregSensitivity,
      execOrderEnabled: state.execOrderEnabled,
      gamificationEnabled: state.gamificationEnabled,
      gamifStartDate: state.gamifStartDate || null,
    }, { merge: true });
  }catch(e){ console.warn("savePref:", e.message); }
}
async function saveDeloadDate(){
  if(!state.user) return;
  try{
    const ref = doc(db, "users", state.user.uid, "prefs", "app");
    await setDoc(ref, { lastDeloadDate: state.lastDeloadDate }, { merge: true });
  }catch(e){ console.warn("saveDeloadDate:", e.message); }
}
function scheduleProfileSave(){
  clearTimeout(state._profileSaveTimer);
  state._profileSaveTimer = setTimeout(saveProfileDoc, 500);
}
async function saveProfileDoc(){
  if(!state.user) return;
  try{
    const ref = doc(db, "users", state.user.uid, "prefs", "profile");
    await setDoc(ref, { ...state.profile, updatedAt: serverTimestamp() }, { merge: true });
  }catch(e){ console.warn("saveProfileDoc:", e.message); }
}

const machineFilterActive = () => document.body.classList.contains("flag-machines");

const lastMachineFor = (name, isSup = false) => domainLastMachineFor(state.allSessions, name, isSup);
const usedMachinesRanked = () => domainUsedMachinesRanked(state.allSessions);
const matchVariant = (entryMachine, machine) => domainMatchVariant(entryMachine, machine, machineFilterActive());

const sessionOpts = dayKey => ({
  day: activeDays()[dayKey],
  date: dateForDay(dayKey, state.weekOffset),
  sessions: state.allSessions,
  machinesActive: document.body.classList.contains("flag-machines")
});
const emptySession = dayKey => domainEmptySession(dayKey, sessionOpts(dayKey));
const reconcileSession = (prev, dayKey) => domainReconcileSession(prev, dayKey, sessionOpts(dayKey));

const autoregCfg = () => domainAutoregCfg(state.autoregSensitivity);
const profileAge = () => domainProfileAge(state.profile.birthDate);
const projectLoad = (w, repsDone, target, equip, u, step, fatigueSteps) =>
  domainProjectLoad(w, repsDone, target, equip, u, step, fatigueSteps, autoregCfg());

const histCtx = () => ({
  currentKey: state.session ? (state.session.date + "_" + state.session.dayKey) : null,
  machineFilter: machineFilterActive(),
  execOrder: execOrderActive(),
  cfg: autoregCfg()
});

const prevLoadData = (name, machine) => domainPrevLoadData(state.allSessions, name, machine, histCtx());
const exerciseTopHistory = (name, since = null, machine) => domainExerciseTopHistory(state.allSessions, name, { ...histCtx(), since, machine });
const bestWeightEver = (name, machine) => domainBestWeightEver(state.allSessions, name, machine, histCtx());

const suggestLoads = (name, unit, machine, opts) => domainSuggestLoads(state.allSessions, name, unit, machine, {
  ...histCtx(),
  muscle: opts && opts.muscle,
  profileActive: profileActive(),
  profile: state.profile
});

const isDeloadActive = () => domainIsDeloadActive(state.lastDeloadDate, formatDate(new Date()));
const deloadDue = () => domainDeloadDue(state.allSessions, {
  ...histCtx(),
  lastDeloadDate: state.lastDeloadDate,
  today: formatDate(new Date()),
  days: activeDays(),
  age: profileActive() ? profileAge() : null
});

const computeWrapped = (sessions, year) => domainComputeWrapped(sessions, year, domainBuildMuscleIndex({
  plans: state.plansCache ? [...state.plansCache.values()] : [],
  days: DAYS,
  templates: PLAN_TEMPLATES,
  catalog: EXERCISE_CATALOG
}));

async function loadAllSessions(){
  if(state.allSessions || !state.user) return;
  if(state.allSessionsPromise) return state.allSessionsPromise;
  state.allSessionsPromise = (async () => {
    try{
      // Ordered by the `date` field, not documentId(): Firestore's automatic
      // single-field index covers normal fields in both directions, but the
      // automatic __name__ index is ascending only, so desc on documentId()
      // demands an explicitly created index. A single orderBy with no where
      // clause needs no composite index.
      const q = query(
        collection(db, "users", state.user.uid, "sessions"),
        orderBy("date", "desc"),
        limit(SESSIONS_FETCH_LIMIT)
      );
      const snap = await getDocs(q);
      state.allSessions = [];
      snap.forEach(d => state.allSessions.push(d.data()));
      state.allSessionsTruncated = snap.size >= SESSIONS_FETCH_LIMIT;
      state.allSessionsError = false;
      if(state.allSessionsTruncated) console.warn("allSessions truncated at", SESSIONS_FETCH_LIMIT);
    }catch(e){
      console.error("loadAllSessions failed:", e);
      state.allSessionsError = true;
      state.allSessions = null;   // leave unset so the next navigation retries
    } finally {
      state.allSessionsPromise = null;
      refreshGamification();
    }
  })();
  return state.allSessionsPromise;
}

function findPrevSession(dayKey, beforeDate){
  if(!state.allSessions) return null;
  return state.allSessions
    .filter(s => s.dayKey === dayKey && s.date < beforeDate)
    .sort((a,b) => b.date.localeCompare(a.date))[0] || null;
}

async function loadDay(dayKey){
  if(!state.user) return;
  const token = ++state.loadDayToken;
  const date = dateForDay(dayKey, state.weekOffset);
  const ref = doc(db, "users", state.user.uid, "sessions", sessionId(date, dayKey));
  try{
    const snap = await getDoc(ref);
    if(token !== state.loadDayToken) return;
    state.session = reconcileSession(snap.exists() ? snap.data() : null, dayKey);
  }catch(e){
    if(token !== state.loadDayToken) return;
    console.warn("loadDay:", e);
    state.session = emptySession(dayKey);
  }
  state.prevSession = findPrevSession(dayKey, date);
  renderDay();
  if(!state.allSessions){
    await loadAllSessions();
    if(token !== state.loadDayToken) return;
    state.prevSession = findPrevSession(dayKey, date);
    renderDay();
  }
}

function scheduleSave(){
  if(!state.user) return;
  setSync("saving","salvando…");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNow, 500);
}
async function saveNow(){
  if(!state.user || !state.session) return;
  const ref = doc(db, "users", state.user.uid, "sessions", sessionId(state.session.date, state.session.dayKey));
  try{
    await setDoc(ref, { ...state.session, updatedAt: serverTimestamp() }, { merge: true });
    setSync(navigator.onLine ? "live" : "offline", navigator.onLine ? "sincronizado" : "offline — salvando local");
    if(state.allSessions){
      const idx = state.allSessions.findIndex(s => s.date === state.session.date && s.dayKey === state.session.dayKey);
      if(idx >= 0) state.allSessions[idx] = { ...state.session };
      else state.allSessions.push({ ...state.session });
      refreshGamification();
    }
  }catch(e){
    setSync("offline","erro ao salvar");
    console.error(e);
  }
}

// ========= Gamificação (XP + Levels + Badges) =========
// Presentation for BADGE_IDS in src/domain/gamification.js — ids and order must match.
const BADGES = [
  { id:"consistencia", name:"Consistência", desc:"Treinou 7 dias seguidos",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M9 16l2 2 4-4"/></svg>' },
  { id:"levantador", name:"Levantador", desc:"1.000 kg de volume em um dia",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M2 8h4"/><path d="M2 16h4"/><path d="M18 8h4"/><path d="M18 16h4"/><path d="M6 12h12"/></svg>' },
  { id:"madrugador", name:"Madrugador", desc:"Treinou antes das 6h",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="5"/></svg>' }
];

function showGamifToast(name){
  if(!document.body.classList.contains("flag-gamification")) return;
  let $t = document.getElementById("gamifToast");
  if(!$t){
    $t = document.createElement("div");
    $t.id = "gamifToast";
    $t.className = "gamif-toast";
    document.body.appendChild($t);
  }
  $t.textContent = `\u{1F3C6} Conquista: ${name}`;
  $t.classList.remove("show");
  void $t.offsetWidth; // reflow
  $t.classList.add("show");
  clearTimeout(state._gamifToastTimer);
  state._gamifToastTimer = setTimeout(() => $t.classList.remove("show"), 3500);
}

function refreshGamification(){
  const prevEarned = state.gamification && state.gamification.badges
    ? new Set(state.gamification.badges.filter(b => b.earned).map(b => b.id))
    : null;
  state.gamification = computeGamification(state.allSessions, state.gamifStartDate);
  renderGamifChip();
  // Detect newly earned badges (only if we had a previous snapshot, i.e. not initial load)
  if(prevEarned && state.gamification.badges){
    for(const b of state.gamification.badges){
      if(b.earned && !prevEarned.has(b.id)){
        const def = BADGES.find(d => d.id === b.id);
        if(def) showGamifToast(def.name);
      }
    }
  }
}

function renderGamifChip(){
  if(!state.gamification) return;
  const $label = document.getElementById("gamifChipLabel");
  const $fill = document.getElementById("gamifChipFill");
  if(!$label || !$fill) return;
  $label.textContent = `Nv ${state.gamification.level} · ${state.gamification.title}`;
  const pct = state.gamification.xpForNextLevel > 0 ? Math.min(100, Math.round(state.gamification.xpIntoLevel / state.gamification.xpForNextLevel * 100)) : 100;
  $fill.style.width = pct + "%";
  const $chip = document.getElementById("gamifChip");
  if($chip && $chip.classList.contains("loading")){
    $chip.classList.remove("loading");
    $chip.classList.add("revealed");
    setTimeout(() => $chip.classList.remove("revealed"), 320);
  }
}

function renderGamifModal(){
  if(!state.gamification) return;
  const g = state.gamification;
  document.getElementById("gamifLevelBig").textContent = g.level;
  document.getElementById("gamifTitleBig").textContent = g.title;
  const pct = g.xpForNextLevel > 0 ? Math.min(100, Math.round(g.xpIntoLevel / g.xpForNextLevel * 100)) : 100;
  document.getElementById("gamifXpFill").style.width = pct + "%";
  document.getElementById("gamifXpText").textContent = g.level < 50
    ? `${g.xpIntoLevel} / ${g.xpForNextLevel} XP para o próximo nível`
    : `Nível máximo alcançado!`;
  document.getElementById("gamifTotalXp").textContent = g.totalXP.toLocaleString("pt-BR");
  document.getElementById("gamifTrained").textContent = g.trainedDays;
  document.getElementById("gamifMissed").textContent = g.missedDays;
  // Badges
  const $sec = document.getElementById("gamifBadgesSection");
  if(!g.badges){ $sec.style.display = "none"; return; }
  let html = '<div class="gamif-badges-label">Conquistas</div><div class="gamif-badges-grid">';
  for(const b of g.badges){
    const def = BADGES.find(d => d.id === b.id);
    if(!def) continue;
    const locked = !b.earned;
    let dateStr = "";
    if(b.earnedDate){
      const [y,m,d] = b.earnedDate.split("-");
      dateStr = `em ${d}/${m}/${y}`;
    }
    html += `<div class="gamif-badge${locked ? " locked" : ""}">
      <div class="gamif-badge-icon">${def.icon}</div>
      <div class="gamif-badge-name">${esc(def.name)}</div>
      ${locked ? `<div class="gamif-badge-desc">${esc(def.desc)}</div>` : `<div class="gamif-badge-date">${dateStr}</div>`}
    </div>`;
  }
  html += '</div>';
  $sec.innerHTML = html;
  $sec.style.display = "";
}

// Chip click → open modal
document.getElementById("gamifChip").addEventListener("click", () => {
  renderGamifModal();
  $gamifModal.classList.add("open");
});
$gamifModal.addEventListener("click", e => { if(e.target === $gamifModal) $gamifModal.classList.remove("open"); });

// ========= Wrapped overlay logic =========
function wrappedCapitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

function getWrappedYears(){
  if(!state.allSessions || !state.allSessions.length) return [];
  const years = new Set();
  for(const s of state.allSessions){ if(s.date) years.add(s.date.slice(0,4)); }
  return [...years].sort().reverse();
}

function buildWrappedSlides(data){
  if(!data){
    $wrappedSlides.innerHTML = '<div class="wrapped-card active"><div class="wrapped-empty">Nenhum treino registrado neste ano.</div></div>';
    state._wrappedTotal = 1; state._wrappedCurrent = 0;
    $wrappedProgress.innerHTML = '<div class="wrapped-progress-seg filled"></div>';
    return;
  }
  const slides = [];

  // S1: Seu ano de treino
  slides.push(`<div class="wrapped-card">
    <div class="wrapped-big-label">Seu ano de treino</div>
    <div class="wrapped-stat-row">
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.sessionsCount.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Treinos</span></div>
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.trainedDates.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Dias</span></div>
    </div>
    <div class="wrapped-stat-row">
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.totalVolume.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">kg levantados</span></div>
    </div>
    <div class="wrapped-stat-row">
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.totalSets.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Séries</span></div>
      <div class="wrapped-stat"><span class="wrapped-stat-val">${data.totalReps.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Repetições</span></div>
    </div>
  </div>`);

  // S2: Grupo mais treinado
  if(data.topMuscle){
    slides.push(`<div class="wrapped-card">
      <div class="wrapped-big-label">Grupo mais treinado</div>
      <div class="wrapped-big-num" style="font-size:36px">${esc(wrappedCapitalize(data.topMuscle))}</div>
      <div class="wrapped-stat-row" style="margin-top:16px">
        <div class="wrapped-stat"><span class="wrapped-stat-val">${data.topMuscleSets.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Séries</span></div>
        <div class="wrapped-stat"><span class="wrapped-stat-val">${data.topMuscleReps.toLocaleString("pt-BR")}</span><span class="wrapped-stat-lbl">Repetições</span></div>
      </div>
    </div>`);
  }

  // S3: Maior carga do ano (skip if no valid weight)
  if(data.heaviest){
    slides.push(`<div class="wrapped-card">
      <div class="wrapped-big-label">Maior carga do ano</div>
      <div class="wrapped-big-num">${data.heaviest.weight.toLocaleString("pt-BR")} kg</div>
      <div class="wrapped-detail"><strong>${esc(data.heaviest.exercise)}</strong></div>
      <div class="wrapped-detail">${fmtDateBR(data.heaviest.date)}</div>
    </div>`);
  }

  // S4: Maior evolução (skip if null)
  if(data.mostProgressed){
    const mp = data.mostProgressed;
    slides.push(`<div class="wrapped-card">
      <div class="wrapped-big-label">Maior evolução</div>
      <div class="wrapped-detail" style="font-size:16px;margin-bottom:12px"><strong>${esc(mp.exercise)}</strong></div>
      <div class="wrapped-detail" style="font-size:18px">de <strong>${mp.from.toLocaleString("pt-BR")} kg</strong> → <strong>${mp.to.toLocaleString("pt-BR")} kg</strong></div>
      <div class="wrapped-big-num" style="font-size:48px;margin-top:8px">+${mp.delta.toLocaleString("pt-BR")} kg</div>
    </div>`);
  }

  // S5: Repetições por grupo + top exercícios
  {
    const top6 = data.repsByMuscle.slice(0,6);
    let rankHtml = '';
    top6.forEach((m,i) => {
      rankHtml += `<div class="wrapped-rank-item"><span class="wrapped-rank-pos">${i+1}</span><span class="wrapped-rank-name">${esc(wrappedCapitalize(m.muscle))}</span><span class="wrapped-rank-val">${m.reps.toLocaleString("pt-BR")} reps</span></div>`;
    });
    let topExHtml = '';
    data.topExercisesByReps.forEach((e,i) => {
      topExHtml += `<div class="wrapped-rank-item"><span class="wrapped-rank-pos">${i+1}</span><span class="wrapped-rank-name">${esc(e.name)}</span><span class="wrapped-rank-val">${e.reps.toLocaleString("pt-BR")} reps</span></div>`;
    });
    slides.push(`<div class="wrapped-card">
      <div class="wrapped-big-label">Repetições por grupo</div>
      <div class="wrapped-rank-list">${rankHtml}</div>
      ${topExHtml ? `<div class="wrapped-section-title">Top exercícios</div><div class="wrapped-rank-list">${topExHtml}</div>` : ""}
    </div>`);
  }

  state._wrappedTotal = slides.length;
  state._wrappedCurrent = 0;
  $wrappedSlides.innerHTML = slides.join("");
  // Progress segments
  $wrappedProgress.innerHTML = slides.map(() => '<div class="wrapped-progress-seg"></div>').join("");
  updateWrappedSlide();
}

function updateWrappedSlide(){
  const cards = $wrappedSlides.querySelectorAll(".wrapped-card");
  cards.forEach((c,i) => c.classList.toggle("active", i === state._wrappedCurrent));
  const segs = $wrappedProgress.querySelectorAll(".wrapped-progress-seg");
  segs.forEach((s,i) => s.classList.toggle("filled", i <= state._wrappedCurrent));
}

function openWrapped(){
  if(!state.allSessions || !state.allSessions.length) return;
  const years = getWrappedYears();
  if(!years.length) return;
  // Find most recent year with data
  let bestYear = years[0];
  for(const y of years){
    const d = computeWrapped(state.allSessions, y);
    if(d){ bestYear = y; break; }
  }
  // Render year pills
  if(years.length > 1){
    $wrappedYearPills.innerHTML = years.map(y => `<button type="button" class="wrapped-year-pill${y===bestYear?" active":""}" data-year="${y}">${y}</button>`).join("");
    $wrappedYearPills.style.display = "";
    $wrappedYearPills.querySelectorAll(".wrapped-year-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        const yr = btn.dataset.year;
        $wrappedYearPills.querySelectorAll(".wrapped-year-pill").forEach(b => b.classList.toggle("active", b.dataset.year === yr));
        buildWrappedSlides(computeWrapped(state.allSessions, yr));
      });
    });
  } else {
    $wrappedYearPills.innerHTML = "";
    $wrappedYearPills.style.display = "none";
  }
  buildWrappedSlides(computeWrapped(state.allSessions, bestYear));
  $wrappedOverlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeWrapped(){
  $wrappedOverlay.classList.remove("open");
  document.body.style.overflow = "";
}

document.getElementById("wrappedOpenBtn").addEventListener("click", () => {
  $gamifModal.classList.remove("open");
  openWrapped();
});
document.getElementById("wrappedCloseBtn").addEventListener("click", closeWrapped);

// Tap navigation: right half → next, left half → prev
$wrappedSlides.addEventListener("click", e => {
  if(e.target.closest(".wrapped-close") || e.target.closest(".wrapped-year-pill")) return;
  const rect = $wrappedSlides.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if(x > rect.width / 2){
    if(state._wrappedCurrent < state._wrappedTotal - 1){ state._wrappedCurrent++; updateWrappedSlide(); }
  } else {
    if(state._wrappedCurrent > 0){ state._wrappedCurrent--; updateWrappedSlide(); }
  }
});

// ========= Render =========
function exDone(ex){
  const mainOk = ex.main.every(s => s.done);
  const supOk  = !ex.sup || ex.sup.every(s => s.done);
  return mainOk && supOk;
}
function countDone(){ return state.session.exercises.filter(exDone).length; }

function setPct(){
  let done = 0, total = 0;
  for(const ex of state.session.exercises){
    total += ex.main.length;
    done  += ex.main.filter(s => s.done).length;
    if(ex.sup){ total += ex.sup.length; done += ex.sup.filter(s => s.done).length; }
  }
  return total ? Math.round(done / total * 100) : 0;
}

// Legacy single-line renderer. Output is intentionally unchanged; stage B replaces it.
// Shared meta row + variant-1 panel. `prev` / `sug` are precomputed by renderDay so the
// history scan and the suggestion engine each run once per exercise.
// "×N" for the reps actually completed on that set last time. Accented when the user beat that
// session's target — the cue that the load is ready to go up. Empty when no repsDone was recorded.
function prevRepsHTML(ps){
  if(!ps || ps.repsDone == null) return "";
  const over = (ps.reps != null && ps.repsDone > ps.reps) ? " over" : "";
  return `<span class="pv-reps${over}">×${ps.repsDone}</span>`;
}

function prevBlockHTML(prev, sug, unit, exIdx, isSup){
  if(!prev && !sug) return "";
  const u = unit || "kg";
  const ua = UNIT_ABBR[u];
  const n = Math.max(prev ? prev.perSet.length : 0, sug ? sug.loads.length : 0);
  if(!n) return "";

  const rank = (prev && prev.execRank != null) ? ` · ${prev.execRank}º` : "";
  const dateTxt = prev
    ? `Último treino <b>${shortDate(prev.date)}</b>${rank}`
    : `Sem histórico`;
  const applyBtn = sug
    ? `<button class="suggest-apply" data-ex="${exIdx}" ${isSup?'data-sup="1"':""}>aplicar sugestão ${sug.dir}</button>`
    : "";

  let html = `<div class="prev-block">`;
  html += `<div class="prev-meta"><span class="pm-date">${dateTxt}</span>${applyBtn}</div>`;
  html += `<div class="prev-panel" style="--pp-cols:${n}">`;
  html += `<div class="pp-row pp-head"><span class="pp-lbl pp-unit">${ua}</span>`;
  for(let i = 0; i < n; i++) html += `<span class="pp-val">${i+1}ª</span>`;
  html += `</div>`;

  if(prev){
    html += `<div class="pp-row pp-prev"><span class="pp-lbl">ÚLTIMA</span>`;
    for(let i = 0; i < n; i++){
      const ps = prev.perSet[i] || null;
      const w = ps ? ps.weight : null;
      html += w != null
        ? `<span class="pp-val"><span class="pv-w">${w}</span>${prevRepsHTML(ps)}</span>`
        : `<span class="pp-val">—</span>`;
    }
    html += `</div>`;
  }
  if(sug){
    html += `<div class="pp-row pp-sug"><span class="pp-lbl">SUGESTÃO</span>`;
    for(let i = 0; i < n; i++){
      const v = sug.loads[i];
      const w = prev && prev.perSet[i] ? prev.perSet[i].weight : null;
      const chg = (v != null && w != null && v !== w) ? " chg" : "";
      html += `<span class="pp-val${chg}">${v != null ? v : "—"}</span>`;
    }
    html += `</div>`;
    if(sug.limited) html += `<div class="pp-note">limitação</div>`;
  }
  html += `</div></div>`;
  return html;
}

const profileActive = () => document.body.classList.contains("flag-profile");
const execOrderActive = () => document.body.classList.contains("flag-exec-order");

// Suggestion payload, or null. Gating that used to live in `.flag-periodization .suggest`
// now lives here so the panel row, the apply button and the input placeholders agree.
function suggestData(name, unit, isSup, exIdx){
  if(!document.body.classList.contains("flag-periodization")) return null;
  if(!state.session || !state.session.exercises[exIdx]) return null;
  const ex = state.session.exercises[exIdx];
  const sets = isSup ? ex.sup : ex.main;
  if(sets && sets.some(s => typeof s.weight === "number")) return null;
  const machine = machineFilterActive() ? (isSup ? ex.supMachine : ex.machine) : undefined;
  const planEx = activeDays()[state.current] && activeDays()[state.current].ex[exIdx];
  const muscle = planEx ? (isSup ? (ex.supSubMuscle || (planEx.superset && planEx.superset.muscle) || planEx.muscle) : (ex.subMuscle || planEx.muscle)) : undefined;
  return suggestLoads(name, unit, machine, {muscle}) || null;
}

function seriesHTML(sets, exIdx, isSup, unit, name, prev, sug){
  const u = unit || "kg";
  const step = UNIT_STEP[u] || 2.5;
  const equip = name ? equipmentOf(name) : null;
  const autoreg = document.body.classList.contains("flag-autoreg");
  // In panel layout the SUGESTÃO row already carries these values; echoing them as
  // placeholders reads like pre-filled data. Column layout has no such row, so it keeps them.
  // Train mode is the exception: it shows the panel AND the placeholder — the panel is a
  // stable reference across sets, the placeholder is the field the user is about to type in.
  const colLayout = document.body.classList.contains("layout-prev-column")
                 || document.body.classList.contains("mode-train");
  let html = `<div class="series-table" data-ex="${exIdx}" ${isSup?'data-sup="1"':""}>`;
  html += `<span class="compact-reps-lbl">Reps</span>`;
  html += `<div class="series-grid series-head">
    <span>Série</span><span class="h-prev">Anterior</span><span class="h-reps">Reps</span><span class="h-load">Carga</span>
  </div>`;
  sets.forEach((s, si) => {
    const cls = "chip" + (s.done ? " set-done" : "");
    const filled = (s.weight != null && s.weight !== "") ? " filled" : "";
    const fromSug = (filled && s.fromSug) ? " from-sug" : "";
    const ps = (prev && prev.perSet[si]) ? prev.perSet[si] : null;
    const pw = ps ? ps.weight : null;
    const prevCell = `<span class="prev-cell">${pw != null
      ? `<span class="pv-w">${pw}</span>${prevRepsHTML(ps)}`
      : '<span class="pc-empty">—</span>'}</span>`;
    const sugV = sug ? sug.loads[si] : null;
    const showSugPh = colLayout && sugV != null && (s.weight == null || s.weight === "");
    const wPlaceholder = showSugPh ? sugV : "—";
    const sugPh = showSugPh ? " sug-ph" : "";
    html += `<div class="series-grid${s.done ? " set-done-row" : ""}">
      <button class="set-idx${s.done ? " done" : ""}" data-si="${si}" aria-pressed="${!!s.done}" aria-label="Série ${si+1}${s.done ? " — concluída" : ""}">${s.done ? "✓" : (si+1)+"ª"}</button>
      ${prevCell}
      <button class="${cls}" data-si="${si}" aria-label="Série ${si+1}: ${s.reps} reps${s.done?' concluída':''}"><span class="tick">✓</span>${s.reps}</button>
      <input class="reps-input" type="text" inputmode="numeric" data-si="${si}" placeholder="${s.reps}" value="${s.repsDone ?? ""}" aria-label="Reps feitas série ${si+1}">
      <div class="load-cell${filled}${sugPh}${fromSug}">
        <input class="weight-input" type="text" inputmode="decimal" data-si="${si}" placeholder="${wPlaceholder}" value="${s.weight ?? ""}" aria-label="Carga da série ${si+1} em ${UNIT_ABBR[u]}">
        <span class="unit">${UNIT_ABBR[u]}</span>
      </div>
    </div>`;
    // in-session hint: only for still-empty upcoming sets, derived from the most
    // recent COMPLETED set above (weight + repsDone), fatigue-discounted by distance.
    if(autoreg && (s.weight == null || s.weight === "")){
      let src = null, gap = 0;
      for(let j = si - 1; j >= 0; j--){
        if(typeof sets[j].weight === "number" && sets[j].repsDone != null){ src = sets[j]; gap = si - j; break; }
      }
      if(src){
        const v = projectLoad(src.weight, src.repsDone, s.reps, equip, u, step, gap);
        if(v != null && v !== src.weight){
          const arrow = v > src.weight ? "↑" : "↓";
          html += `<div class="set-hint">sugerido <b>${v}</b> ${UNIT_ABBR[u]} ${arrow}</div>`;
        }
      }
    }
  });
  html += `</div>`;
  return html;
}
function badgesHTML(b){
  if(!b||!b.length) return "";
  return `<div class="badges">${b.map(x=>`<span class="badge ${x}">${BADGE_LABEL[x]}</span>`).join("")}</div>`;
}

function skeletonStrip(){
  let h = "";
  for(let i=0;i<5;i++){
    h += `<button class="day-btn" disabled>
      <span class="abbr"><div class="skeleton" style="width:28px;height:14px;margin:0 auto"></div></span>
      <span class="focus"><div class="skeleton" style="width:44px;height:10px;margin:0 auto"></div></span>
    </button>`;
  }
  return h;
}

function skeletonPanel(n=5){
  let h = `<div class="panel-head"><div>
    <div class="skeleton" style="width:120px;height:20px;margin-bottom:6px"></div>
    <div class="skeleton" style="width:80px;height:12px"></div>
  </div></div>
`;
  for(let i=0;i<n;i++){
    h += `<article class="ex"><div class="ex-header">
      <div class="num"><div class="skeleton" style="width:32px;height:32px;border-radius:8px"></div></div>
      <div class="body">
        <div class="skeleton" style="width:60%;height:14px;margin-bottom:6px"></div>
        <div class="skeleton" style="width:40%;height:10px"></div>
      </div>
    </div>
    <div class="series-table">
      <div class="skeleton" style="width:100%;height:34px;margin-bottom:7px"></div>
      <div class="skeleton" style="width:100%;height:34px;margin-bottom:7px"></div>
      <div class="skeleton" style="width:100%;height:34px"></div>
    </div></article>`;
  }
  return h;
}

function skeletonEvo(){
  let stats = `<div class="evo-stats">`;
  for(let i=0;i<3;i++){
    stats += `<div class="evo-stat">
      <div class="skeleton" style="width:50px;height:26px;margin:0 auto 6px"></div>
      <div class="skeleton" style="width:70px;height:10px;margin:0 auto"></div>
    </div>`;
  }
  stats += `</div>`;
  stats += `<div class="evo-chart-card"><div class="evo-chart-wrap">
    <div class="skeleton" style="width:100%;height:100%"></div>
  </div></div>`;
  return stats;
}

// ========= Train mode =========

function trainExCount(){ return activeDays()[state.current].ex.length; }

function firstIncompleteIdx(){
  if(!state.session) return 0;
  const i = state.session.exercises.findIndex(ex => !exDone(ex));
  return i < 0 ? 0 : i;
}

function enterTrainMode(){
  if(!state.session || trainExCount() === 0) return;
  state.trainMode = true;
  state.trainIdx = firstIncompleteIdx();
  document.body.classList.add("mode-train");
  applyPrevLayoutState();
  renderDay();
}

function exitTrainMode(){
  const back = state.trainIdx;
  state.trainMode = false;
  document.body.classList.remove("mode-train");
  applyPrevLayoutState();
  renderDay();
  const art = $panel.querySelector(`.ex[data-i="${back}"]`);
  if(art) art.scrollIntoView({ block: "center" });
}

function renderTrainBar(){
  if(!state.trainMode || !state.session) return;
  const day = activeDays()[state.current];
  const n = day.ex.length;
  const exs = state.session.exercises || [];
  let segs = "";
  for(let i = 0; i < n; i++){
    const done = exs[i] ? exDone(exs[i]) : false;
    segs += `<button class="train-seg${done?" is-done":""}${i===state.trainIdx?" is-current":""}" data-seg="${i}" type="button" aria-label="Ir para exercício ${i+1}"></button>`;
  }
  segs += `<button class="train-seg train-seg-end${state.trainIdx>=n?" is-current":""}" data-seg="${n}" type="button" aria-label="Resumo do treino"></button>`;
  $trainSegs.innerHTML = segs;
  $trainCount.textContent = state.trainIdx >= n ? "fim" : `${state.trainIdx+1}/${n}`;
  $trainFocus.textContent = day.focus || "";
}

// Restore horizontal position synchronously after renderDay() rebuilds $panel.
function restoreTrainScroll(){
  const track = document.getElementById("trainTrack");
  if(!track) return;
  const prev = track.style.scrollBehavior;
  track.style.scrollBehavior = "auto";
  track.scrollLeft = state.trainIdx * track.clientWidth;
  track.style.scrollBehavior = prev;
}

// Track is recreated on every render, so this binds per render (no listener stacking).
function bindTrainTrack(){
  const track = document.getElementById("trainTrack");
  if(!track) return;
  track.addEventListener("scroll", () => {
    clearTimeout(state._trainScrollT);
    state._trainScrollT = setTimeout(() => {
      const w = track.clientWidth || 1;
      const i = Math.round(track.scrollLeft / w);
      // renderTrainBar() only — never renderDay() here, or the swipe rebuilds the DOM mid-gesture.
      if(i !== state.trainIdx){
        state.trainIdx = i;
        renderTrainBar();
        if(state.trainIdx >= trainExCount()) refreshTrainEndCard();
      }
    }, 120);
  }, { passive: true });
}

function goToTrainIdx(i){
  const track = document.getElementById("trainTrack");
  if(!track) return;
  state.trainIdx = Math.max(0, Math.min(i, trainExCount()));
  track.scrollTo({ left: state.trainIdx * track.clientWidth, behavior: "smooth" });
  renderTrainBar();
  if(state.trainIdx >= trainExCount()) refreshTrainEndCard();
}

// ========= Session summary (pure; derived from firstSetAt + per-set doneAt) =========
const LB_TO_KG = 0.45359237;
const GAP_MIN_MS = 20 * 1000;      // below this the user is marking retroactively
const GAP_MAX_MS = 8 * 60 * 1000;  // above this the phone was abandoned

function fmtDur(ms, withSecs){
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if(h) return `${h}h${String(m).padStart(2,"0")}`;
  if(m) return withSecs ? `${m}min${String(s).padStart(2,"0")}` : `${m}min`;
  return `${s}s`;
}
function fmtNum(v){ return (Math.round(v * 10) / 10).toLocaleString("pt-BR"); }
function fmtKg(v){ return Math.round(v).toLocaleString("pt-BR"); }

// Returns null when there is not enough data to say anything.
function trainSummary(){
  if(!state.session) return null;
  const day = activeDays()[state.current];
  const evts = [];
  let volKg = 0, volSkipped = 0, doneSets = 0;
  const prs = [];

  state.session.exercises.forEach((ex, i) => {
    const e = day.ex[i];
    if(!e) return;
    const blocks = [{
      sets: ex.main || [], sup: false, unit: e.unit || "kg",
      name: ex.subName || e.name,
      machine: machineFilterActive() ? ex.machine : undefined
    }];
    if(ex.sup && e.superset) blocks.push({
      sets: ex.sup, sup: true, unit: e.superset.unit || "kg",
      name: ex.supSubName || e.superset.name,
      machine: machineFilterActive() ? ex.supMachine : undefined
    });

    blocks.forEach(b => {
      let topW = null;
      b.sets.forEach(s => {
        if(!s || !s.done) return;
        doneSets++;
        if(s.doneAt){ const t = Date.parse(s.doneAt); if(!isNaN(t)) evts.push({t, ex:i, sup:b.sup}); }
        const w = typeof s.weight === "number" ? s.weight : null;
        const r = typeof s.repsDone === "number" ? s.repsDone : null;
        if(w != null && r != null){
          // "placas" is not a mass unit — it cannot enter a tonnage sum.
          if(b.unit === "kg") volKg += w * r;
          else if(b.unit === "lb") volKg += w * LB_TO_KG * r;
          else volSkipped++;
        }
        if(w != null && b.unit !== "placas" && (topW == null || w > topW)) topW = w;
      });
      if(topW != null){
        const prev = bestWeightEver(b.name, b.machine);
        if(prev != null && topW > prev) prs.push({ name: b.name, weight: topW, unit: b.unit, prev });
      }
    });
  });

  if(!evts.length) return null;
  evts.sort((a, b) => a.t - b.t);

  // Start = earliest firstSetAt (stamped on the first keystroke, before any set completes).
  let startT = null;
  state.session.exercises.forEach(ex => {
    if(!ex.firstSetAt) return;
    const t = Date.parse(ex.firstSetAt);
    if(!isNaN(t) && (startT == null || t < startT)) startT = t;
  });
  if(startT == null || startT > evts[0].t) startT = evts[0].t;
  const totalMs = Math.max(0, evts[evts.length - 1].t - startT);

  // Consecutive completions. Superset-internal transitions carry no rest by design.
  const gaps = [];
  for(let k = 1; k < evts.length; k++){
    const a = evts[k-1], b = evts[k];
    if(a.ex === b.ex && a.sup !== b.sup) continue;
    const d = b.t - a.t;
    if(d >= GAP_MIN_MS && d <= GAP_MAX_MS) gaps.push(d);
  }
  // Median, not mean: one bathroom break would dominate a mean.
  let gapMs = null;
  if(gaps.length >= 3){
    gaps.sort((x, y) => x - y);
    const mid = gaps.length >> 1;
    gapMs = gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid-1] + gaps[mid]) / 2);
  }

  const mins = totalMs / 60000;
  const density = (volKg > 0 && mins >= 1) ? volKg / mins : null;

  return { totalMs, gapMs, gapN: gaps.length, volKg, volSkipped, density, doneSets, prs };
}

function trainEndInnerHTML(done, total){
  const all = done >= total;
  const sum = trainSummary();

  if(!sum){
    return `<div class="train-end-inner">
      <span class="train-end-big">${done}/${total} exercícios</span>
      <p class="train-end-sub">Ainda faltam exercícios — deslize de volta ou toque na barra para escolher.</p>
      <button class="train-end-btn" id="trainFinish" type="button">Voltar à lista</button>
    </div>`;
  }

  let h = `<div class="train-end-inner">`;
  h += `<span class="train-end-big">${all ? "Treino concluído" : done + "/" + total + " exercícios"}</span>`;

  h += `<div class="ts-grid">`;
  h += `<div class="ts-tile">
    <span class="ts-val">${fmtDur(sum.totalMs, false)}</span>
    <span class="ts-lbl">Tempo total</span>
  </div>`;
  h += `<div class="ts-tile">
    <span class="ts-val">${sum.gapMs != null ? fmtDur(sum.gapMs, true) : "—"}</span>
    <span class="ts-lbl">Intervalo entre séries</span>
    <span class="ts-sub">${sum.gapMs != null ? "mediana de " + sum.gapN : "poucos dados"}</span>
  </div>`;
  if(sum.density != null){
    const skipped = sum.volSkipped
      ? ` · ${sum.volSkipped} série${sum.volSkipped > 1 ? "s" : ""} em placas fora da conta`
      : "";
    h += `<div class="ts-tile ts-wide">
      <span class="ts-val">${fmtKg(sum.density)}<em>kg/min</em></span>
      <span class="ts-lbl">Densidade</span>
      <span class="ts-sub">${fmtKg(sum.volKg)} kg em ${fmtDur(sum.totalMs, false)}${skipped}</span>
    </div>`;
  }
  h += `</div>`;

  if(sum.prs.length){
    h += `<div class="ts-prs"><span class="ts-prs-title">${sum.prs.length === 1 ? "1 recorde" : sum.prs.length + " recordes"}</span>`;
    sum.prs.slice(0, 4).forEach(p => {
      h += `<div class="ts-pr">
        <span class="ts-pr-name">${esc(p.name)}</span>
        <span class="ts-pr-w">${fmtNum(p.weight)} ${UNIT_ABBR[p.unit] || "kg"}<em> · antes ${fmtNum(p.prev)}</em></span>
      </div>`;
    });
    h += `</div>`;
  }

  if(!all) h += `<p class="train-end-sub">Faltam ${total - done} exercício${total - done > 1 ? "s" : ""}.</p>`;
  h += `<button class="train-end-btn" id="trainFinish" type="button">${all ? "Concluir" : "Voltar à lista"}</button>`;
  h += `</div>`;
  return h;
}

// Placeholder while the user is still on an exercise card — the summary scans allSessions,
// which is too expensive to recompute on every renderDay().
function trainEndCardHTML(done, total){
  const body = (state.trainIdx >= total)
    ? trainEndInnerHTML(done, total)
    : `<div class="train-end-inner"><span class="train-end-big">Resumo</span></div>`;
  return `<article class="ex train-end" data-i="end">${body}</article>`;
}

// Targeted refresh when the carousel lands on the terminal card. Avoids a full renderDay(),
// which would rebuild the track and disturb the in-flight scroll.
function refreshTrainEndCard(){
  if(!state.trainMode || !state.session) return;
  const card = document.querySelector(".train-track > .train-end");
  if(!card) return;
  card.innerHTML = trainEndInnerHTML(countDone(), trainExCount());
  const $tf = document.getElementById("trainFinish");
  if($tf) $tf.addEventListener("click", exitTrainMode);
}

// Bound once — $panel is never recreated, only its innerHTML.
document.getElementById("trainExit").addEventListener("click", exitTrainMode);
$trainSegs.addEventListener("click", e => {
  const b = e.target.closest("[data-seg]");
  if(b) goToTrainIdx(+b.dataset.seg);
});
// iOS: fixed panel + soft keyboard can hide the focused field. Re-center it inside the card.
$panel.addEventListener("focusin", e => {
  if(!state.trainMode) return;
  const t = e.target;
  if(!t.matches || !t.matches(".weight-input, .reps-input")) return;
  setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 260);
});

// renderDay() replaces $panel.innerHTML, which destroys the element the user is tapping
// next — the tap never lands and the field looks uneditable. Defer one task, then skip the
// rebuild if focus moved to another field inside the panel. State was already written by
// the `input` handler, so nothing is lost; the panel refreshes when focus leaves the table.
function renderDaySoft(){
  clearTimeout(state._softRenderT);
  state._softRenderT = setTimeout(() => {
    const a = document.activeElement;
    if(a && $panel.contains(a) &&
       (a.classList.contains("weight-input") || a.classList.contains("reps-input"))) return;
    renderDay();
  }, 0);
}

function renderDay(){
  clearTimeout(state._softRenderT);
  if(!state.session) return;
  $panel.classList.toggle("compact", state.viewMode === "compact");
  const day = activeDays()[state.current];
  const total = day.ex.length;

  if(total === 0){
    if(state.trainMode){ state.trainMode = false; document.body.classList.remove("mode-train"); applyPrevLayoutState(); }
    document.getElementById("dayProgressFill").style.width = "0%";
    document.getElementById("dayProgressPct").textContent = "0%";
    $panel.innerHTML = `
      <div class="rest-placeholder">
        <span class="big">Descanso</span>
        Nenhum exerc\u00edcio programado para hoje. Aproveite para recuperar!
      </div>`;
    return;
  }

  const completed = countDone();
  const pct = Math.round(completed/total*100);

  const _deloadActive = isDeloadActive();
  const _deload = !_deloadActive && !state.deloadDismissed ? deloadDue() : { due: false };

  let head = `
    <div class="panel-head">
      <div class="focus-tag">${esc(day.focus)}${_deloadActive ? '<span class="deload-tag">Descarga</span>' : ''}</div>
      <div class="progress">
        <span><span class="count">${completed}</span>/${total} conclu\u00eddos</span>
        <button class="reset" id="resetBtn">Limpar</button>
      </div>
      <button class="train-start" id="trainStartBtn" type="button">${completed > 0 ? "▶ Retomar treino" : "▶ Iniciar treino"}</button>
    </div>
  `;
  let html = "";
  if(_deload.due){
    head += `<div class="deload-card">
      <div class="deload-title">Hora de uma semana de descarga</div>
      <div class="deload-reason">${_deload.reason}. Reduza carga/volume por uma semana para recuperar e voltar a progredir.</div>
      <div class="deload-actions">
        <button class="deload-apply">Aplicar descarga</button>
        <button class="deload-skip">Agora não</button>
      </div>
    </div>`;
  }
  const barPct = setPct();
  document.getElementById("dayProgressFill").style.width = barPct + "%";
  document.getElementById("dayProgressPct").textContent = barPct + "%";

  day.ex.forEach((e, i) => {
    const ex = state.session.exercises[i];
    const isDone = exDone(ex);

    html += `<article class="ex ${isDone?'done':''}" data-i="${i}">`;
    const isSub = !!ex.subName;
    const effectiveName = ex.subName || e.name;
    const prevMain = isSub ? null : prevLoadData(effectiveName, machineFilterActive() ? ex.machine : undefined);
    const sugMain = suggestData(effectiveName, e.unit, false, i);
    html += `<div class="ex-header">
      <div class="num"><span class="n">${i+1}</span></div>
      <div class="body">
        <div class="name"><span class="evo-link" data-evo-i="${i}" data-evo-sup="0" role="button" tabindex="0" title="Ver evolução">${esc(effectiveName)}${ICON_TREND}</span>${isSub?'<span class="sub-tag">trocado</span>':''}${ex.machine?`<span class="machine-tag">${esc(ex.machine)}</span>`:''}</div>
        ${!isSub && e.note?`<div class="note">${esc(e.note)}</div>`:""}
      </div>
      <button class="ex-icon-btn machine-btn" data-i="${i}" data-sup="0" title="Indicar máquina (opcional)">🏷</button>
      <button class="ex-icon-btn sub-btn" data-i="${i}" data-sup="0" title="Trocar exercício (só hoje)">⇄</button>
      <button class="unit-toggle" data-ex="${i}" data-sup="0" title="Trocar unidade (KG/LB/Placas)">${UNIT_BTN[e.unit||"kg"]}</button>
    </div>`;
    html += prevBlockHTML(prevMain, sugMain, e.unit, i, false);
    html += seriesHTML(ex.main, i, false, e.unit, effectiveName, prevMain, sugMain);
    html += !isSub ? badgesHTML(e.badges) : "";

    if(e.superset){
      const isSupSub = !!ex.supSubName;
      const supEffName = ex.supSubName || e.superset.name;
      const prevSup = isSupSub ? null : prevLoadData(supEffName, machineFilterActive() ? ex.supMachine : undefined);
      const sugSup = suggestData(supEffName, e.superset.unit, true, i);
      html += `<div class="superset">
        <span class="tag">+ Supersérie</span>
        <div class="sname"><span class="sname-text"><span class="evo-link" data-evo-i="${i}" data-evo-sup="1" role="button" tabindex="0" title="Ver evolução">${esc(supEffName)}${ICON_TREND}</span>${isSupSub?'<span class="sub-tag">trocado</span>':''}${ex.supMachine?`<span class="machine-tag">${esc(ex.supMachine)}</span>`:''}</span><button class="ex-icon-btn machine-btn" data-i="${i}" data-sup="1" title="Indicar máquina (opcional)">🏷</button><button class="ex-icon-btn sub-btn" data-i="${i}" data-sup="1" title="Trocar exercício (só hoje)">⇄</button><button class="unit-toggle" data-ex="${i}" data-sup="1" title="Trocar unidade (KG/LB/Placas)">${UNIT_BTN[e.superset.unit||"kg"]}</button></div>
        ${prevBlockHTML(prevSup, sugSup, e.superset.unit, i, true)}`;
      html += seriesHTML(ex.sup, i, true, e.superset.unit, supEffName, prevSup, sugSup);
      html += `</div>`;
    }
    html += `</article>`;
  });

  if(state.trainMode){
    html += trainEndCardHTML(completed, total);
    if(state.trainIdx > total) state.trainIdx = total;
    $panel.innerHTML = `<div class="train-track" id="trainTrack">${html}</div>`;
    attachHandlers();
    renderTrainBar();
    bindTrainTrack();
    restoreTrainScroll();   // must run synchronously, before paint
  } else {
    $panel.innerHTML = head + html;
    attachHandlers();
  }
}

// Single write path for set completion. Stamps doneAt only on the false→true edge, so
// editing weight/reps on an already-completed set never moves the timestamp.
function setDoneState(set, val){
  if(!set) return;
  const was = !!set.done;
  set.done = !!val;
  if(!val) set.doneAt = null;
  else if(!was || !set.doneAt) set.doneAt = new Date().toISOString();
}

// In-place feedback for a single set row. renderDay() rebuilds the whole panel and would
// destroy the field the user is tapping next, so completion is reflected here; the full
// re-render (hints and placeholders on the other rows) still follows via renderDaySoft().
function syncSetRow(row, si, set){
  const idx = row.querySelector(`.set-idx[data-si="${si}"]`);
  const grid = idx ? idx.closest(".series-grid") : null;
  if(!grid) return;
  const on = !!set.done;
  grid.classList.toggle("set-done-row", on);
  idx.classList.toggle("done", on);
  idx.textContent = on ? "✓" : (si + 1) + "ª";
  idx.setAttribute("aria-pressed", String(on));
  idx.setAttribute("aria-label", `Série ${si + 1}${on ? " — concluída" : ""}`);
  const chip = grid.querySelector(".chip");
  if(chip) chip.classList.toggle("set-done", on);
  const w = grid.querySelector(".weight-input");
  if(w && w.parentElement){
    const has = set.weight != null && set.weight !== "";
    if(has && w.value === "") w.value = set.weight;
    w.parentElement.classList.toggle("filled", has);
    w.parentElement.classList.toggle("from-sug", has && !!set.fromSug);
    if(has) w.parentElement.classList.remove("sug-ph");
  }
}

// The load currently shown for this set, in precedence order:
//   1. the suggestion echoed in the weight placeholder (.load-cell.sug-ph)
//   2. the SUGESTÃO row of the reference panel (panel layout)
//   3. the in-session autoreg hint under the row (.set-hint)
// Read from the DOM on purpose: suggestData() switches off once any set in the block has a
// weight, so re-deriving it would let only the first completed set adopt anything.
function displayedLoadFor(row, si){
  const idx = row.querySelector(`.set-idx[data-si="${si}"]`);
  const grid = idx ? idx.closest(".series-grid") : null;
  if(!grid) return null;
  const num = t => { const v = parseFloat(String(t).replace(",", ".")); return isNaN(v) ? null : v; };

  const cell = grid.querySelector(".load-cell");
  if(cell && cell.classList.contains("sug-ph")){
    const inp = cell.querySelector(".weight-input");
    const v = inp ? num(inp.placeholder) : null;
    if(v != null) return v;
  }

  const block = row.previousElementSibling;
  if(block && block.classList.contains("prev-block")){
    const vals = block.querySelectorAll(".pp-sug .pp-val");
    if(vals[si]){ const v = num(vals[si].textContent); if(v != null) return v; }
  }

  const hint = grid.nextElementSibling;
  if(hint && hint.classList.contains("set-hint")){
    const b = hint.querySelector("b");
    if(b){ const v = num(b.textContent); if(v != null) return v; }
  }
  return null;
}

// Completing a set with no typed load adopts the load on screen, and remembers that the
// number came from a suggestion rather than from the user.
function adoptSuggestedLoad(row, si, set){
  if(!set || (set.weight != null && set.weight !== "")) return;
  const v = displayedLoadFor(row, si);
  if(v == null) return;
  set.weight = v;
  set.fromSug = true;
}

function markExecStart(ei){ const ex = state.session.exercises[ei]; if(ex && !ex.firstSetAt){ ex.firstSetAt = new Date().toISOString(); } }

function attachHandlers(){
  $panel.querySelectorAll(".series-table").forEach(row => {
    const ei = +row.dataset.ex;
    const isSup = !!row.dataset.sup;
    const target = () => isSup ? state.session.exercises[ei].sup : state.session.exercises[ei].main;

    row.querySelectorAll(".chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const si = +btn.dataset.si;
        const toggling = !target()[si].done;
        setDoneState(target()[si], toggling);
        if(toggling) markExecStart(ei);
        scheduleSave(); renderDay(); renderStrip();
      });
    });
    row.querySelectorAll(".set-idx").forEach(btn => {
      btn.addEventListener("click", () => {
        const si = +btn.dataset.si;
        const set = target()[si];
        const period = document.body.classList.contains("flag-periodization");
        const turningOn = !set.done;
        if (turningOn) adoptSuggestedLoad(row, si, set);
        setDoneState(set, turningOn);
        if (turningOn) {
          if (period && (set.repsDone == null || set.repsDone === "")) set.repsDone = set.reps;
          markExecStart(ei);
        } else if (period && set.repsDone === set.reps) {
          set.repsDone = null;
        }
        scheduleSave(); renderDay(); renderStrip();
      });
    });
    row.querySelectorAll(".weight-input").forEach(inp => {
      inp.addEventListener("input", () => {
        const si = +inp.dataset.si;
        const v = inp.value.replace(",", ".").trim();
        target()[si].weight = v === "" ? null : (isNaN(parseFloat(v)) ? target()[si].weight : parseFloat(v));
        target()[si].fromSug = false;
        inp.parentElement.classList.toggle("filled", v !== "");
        inp.parentElement.classList.remove("from-sug");
        if(v !== "") markExecStart(ei);
        scheduleSave();
      });
      inp.addEventListener("change", () => { renderDaySoft(); });
    });
    row.querySelectorAll(".reps-input").forEach(inp => {
      inp.addEventListener("input", () => {
        const si = +inp.dataset.si;
        const v = inp.value.trim();
        target()[si].repsDone = v === "" ? null : (isNaN(parseInt(v, 10)) ? target()[si].repsDone : parseInt(v, 10));
        if(v !== "") markExecStart(ei);
        scheduleSave();
      });
      inp.addEventListener("change", () => {
        const si = +inp.dataset.si;
        const set = target()[si];
        const on = set.repsDone != null;
        if(on) adoptSuggestedLoad(row, si, set);
        setDoneState(set, on);
        scheduleSave();
        syncSetRow(row, si, set);
        renderStrip(); renderTrainBar();
        renderDaySoft();
      });
    });
  });

  $panel.querySelectorAll(".unit-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ei = +btn.dataset.ex;
      const isSup = btn.dataset.sup === "1";
      const id = activeDays()[state.current].ex[ei]._id;
      const exDoc = state.exercisesCatalog.get(id);
      if(!exDoc) return;
      const cur = isSup ? (exDoc.superset && exDoc.superset.unit || "kg") : (exDoc.unit || "kg");
      const next = UNIT_CYCLE[(UNIT_CYCLE.indexOf(cur) + 1) % 3];
      if(isSup){
        exDoc.superset.unit = next;
        await saveExerciseDoc(id, {superset: {unit: next}});
      } else {
        exDoc.unit = next;
        await saveExerciseDoc(id, {unit: next});
      }
      rebuildUserDays(); renderDay();
    });
  });

  $panel.querySelectorAll(".suggest-apply").forEach(btn => {
    btn.addEventListener("click", () => {
      const ei = +btn.dataset.ex;
      const isSup = btn.dataset.sup === "1";
      const e = activeDays()[state.current].ex[ei];
      const ex = state.session.exercises[ei];
      const name = isSup ? (ex.supSubName || e.superset.name) : (ex.subName || e.name);
      const unit = isSup ? (e.superset.unit || "kg") : (e.unit || "kg");
      const machine = machineFilterActive() ? (isSup ? ex.supMachine : ex.machine) : undefined;
      const muscle = isSup ? (ex.supSubMuscle || (e.superset && e.superset.muscle) || e.muscle) : (ex.subMuscle || e.muscle);
      const result = suggestLoads(name, unit, machine, {muscle});
      if(!result) return;
      const sets = isSup ? state.session.exercises[ei].sup : state.session.exercises[ei].main;
      result.loads.forEach((v, si) => {
        if(v != null && sets[si]) sets[si].weight = v;
      });
      scheduleSave(); renderDay(); renderStrip();
    });
  });

  $panel.querySelectorAll(".evo-link").forEach(el => {
    const go = () => {
      const i = +el.dataset.evoI;
      const isSup = el.dataset.evoSup === "1";
      const ex = state.session.exercises[i];
      const e = activeDays()[state.current]?.ex[i];
      if(!ex || !e) return;
      const name = isSup ? (ex.supSubName || e.superset?.name) : (ex.subName || e.name);
      const machine = isSup ? ex.supMachine : ex.machine;
      if(name) openEvolucaoFor(name, machine);
    };
    el.addEventListener("click", go);
    el.addEventListener("keydown", ev => {
      if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); go(); }
    });
  });

  $panel.querySelectorAll(".sub-btn").forEach(btn => {
    btn.addEventListener("click", () => openSubModal(+btn.dataset.i, btn.dataset.sup === "1"));
  });

  $panel.querySelectorAll(".machine-btn").forEach(btn => {
    btn.addEventListener("click", () => openMachineModal(+btn.dataset.i, btn.dataset.sup === "1"));
  });

  const $reset = document.getElementById("resetBtn");
  if($reset) $reset.addEventListener("click", () => {
    if(!confirm("Limpar séries e cargas deste dia?")) return;
    state.session = emptySession(state.current);
    scheduleSave(); renderDay(); renderStrip();
  });

  const $skipBtn = $panel.querySelector(".deload-skip");
  if($skipBtn) $skipBtn.addEventListener("click", () => { state.deloadDismissed = true; renderDay(); });

  const $applyBtn = $panel.querySelector(".deload-apply");
  if($applyBtn) $applyBtn.addEventListener("click", async () => {
    const day = activeDays()[state.current];
    day.ex.forEach((e, ei) => {
      const ex = state.session.exercises[ei];
      const applyDeload = (sets, name, unit, machine) => {
        if(!sets) return;
        const u = unit || "kg";
        const step = UNIT_STEP[u] || 2.5;
        const hist = exerciseTopHistory(name, null, machine);
        if(!hist.length) return;
        const lastEntry = hist[hist.length - 1];
        // find the session's per-set weights for this exercise variant.
        // allSessions is newest-first, so a forward scan hits the most recent
        // matching session first when the date is shared by more than one.
        let refSets = null;
        for(let k = 0; k < state.allSessions.length; k++){
          const sess = state.allSessions[k];
          if(sess.date !== lastEntry.date || !sess.exercises) continue;
          for(const entry of sess.exercises){
            if((entry.subName || entry.name) === name && matchVariant(entry.machine, machine) && entry.main) refSets = entry.main;
            else if((entry.supSubName || entry.supName) === name && matchVariant(entry.supMachine, machine) && entry.sup) refSets = entry.sup;
            if(refSets) break;
          }
          if(refSets) break;
        }
        sets.forEach((s, si) => {
          const ref = refSets && refSets[si] && typeof refSets[si].weight === "number" ? refSets[si].weight : null;
          if(ref == null) return;
          const deloaded = ref * DELOAD_FACTOR;
          const rounded = Math.round(deloaded / step) * step;
          s.weight = u === "placas" ? Math.round(rounded) : rounded;
        });
      };
      const mainName = ex.subName || e.name;
      const mainMachine = machineFilterActive() ? ex.machine : undefined;
      const supMachine = machineFilterActive() ? ex.supMachine : undefined;
      applyDeload(ex.main, mainName, e.unit, mainMachine);
      if(e.superset && ex.sup) applyDeload(ex.sup, ex.supSubName || e.superset.name, e.superset.unit, supMachine);
    });
    const today = formatDate(new Date());
    state.lastDeloadDate = today;
    await saveDeloadDate();
    scheduleSave(); renderDay(); renderStrip();
  });

  const $ts = document.getElementById("trainStartBtn");
  if($ts) $ts.addEventListener("click", enterTrainMode);
  const $tf = document.getElementById("trainFinish");
  if($tf) $tf.addEventListener("click", exitTrainMode);
}

// ========= Substitution Modal =========
$subModal.addEventListener("click", e => { if(e.target === $subModal) closeSubModal(); });

function closeSubModal(){ $subModal.classList.remove("open"); }

function openSubModal(exIdx, isSup=false){
  const day = activeDays()[state.current];
  const planEx = day.ex[exIdx];
  const ex = state.session.exercises[exIdx];
  if(isSup && !planEx.superset) return;
  const originalName = isSup ? planEx.superset.name : planEx.name;
  const originalMuscle = isSup ? ((planEx.superset && planEx.superset.muscle) || planEx.muscle) : planEx.muscle;
  const curSub = isSup ? ex.supSubName : ex.subName;
  const isSub = !!curSub;

  // Build suggestions: same muscle, exclude original name, cap 8
  const suggestions = EXERCISE_CATALOG
    .filter(c => c.muscle === originalMuscle && c.name !== originalName)
    .slice(0, 8);

  let html = `<h3 style="margin:0 0 4px">Trocar ${isSup ? "supersérie" : "exercício"} (só hoje)</h3>`;
  html += `<p class="sub-desc">Substitui apenas esta sessão. O plano mantém <b>${esc(originalName)}</b>.</p>`;

  if(isSub){
    html += `<div class="sub-current">Atual: ${esc(curSub)}</div>`;
    html += `<button class="sub-revert" id="subRevertBtn">↩ Reverter ao padrão (${esc(originalName)})</button>`;
  }

  html += `<div class="sub-section-label">Buscar exercício</div>`;
  html += `<div class="sub-input-wrap">`;
  html += `<input class="modal-input" id="subSearchInput" placeholder="Digite o nome do exercício" autocomplete="off">`;
  html += `<div class="ac-list" id="subAcList"></div>`;
  html += `</div>`;

  if(suggestions.length){
    html += `<div class="sub-section-label">Sugestões (${esc(MUSCLE_LABEL[originalMuscle]||originalMuscle)})</div>`;
    html += `<div class="sub-chips">`;
    suggestions.forEach(c => {
      html += `<button class="sub-chip" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}</button>`;
    });
    html += `</div>`;
  }

  $subModalInner.innerHTML = html;
  $subModal.classList.add("open");

  function applySub(name, muscle){
    if(isSup){
      ex.supSubName = name;
      ex.supSubMuscle = muscle || originalMuscle;
    } else {
      ex.subName = name;
      ex.subMuscle = muscle || originalMuscle;
    }
    scheduleSave(); renderDay(); closeSubModal();
  }

  // Revert button
  const revertBtn = document.getElementById("subRevertBtn");
  if(revertBtn){
    revertBtn.addEventListener("click", () => {
      if(isSup){ ex.supSubName = null; ex.supSubMuscle = null; }
      else { ex.subName = null; ex.subMuscle = null; }
      scheduleSave(); renderDay(); closeSubModal();
    });
  }

  // Suggestion chips
  $subModalInner.querySelectorAll(".sub-chip").forEach(chip => {
    chip.addEventListener("click", () => applySub(chip.dataset.name, chip.dataset.muscle));
  });

  // Autocomplete on search input
  const subInp = document.getElementById("subSearchInput");
  const subList = document.getElementById("subAcList");
  let subActiveIdx = -1;

  function subFilter(q){
    if(!q || q.length < 1){ subList.classList.remove("open"); return; }
    const nq = stripDiacritics(q);
    const prefix = [], sub = [];
    EXERCISE_CATALOG.forEach(c => {
      const nc = stripDiacritics(c.name);
      if(nc.startsWith(nq)) prefix.push(c);
      else if(nc.includes(nq)) sub.push(c);
    });
    const results = prefix.concat(sub).slice(0, 8);
    if(!results.length){ subList.classList.remove("open"); return; }
    subActiveIdx = -1;
    subList.innerHTML = results.map((c,i) =>
      `<div class="ac-item" data-i="${i}" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}<span class="ac-muscle">${esc(MUSCLE_LABEL[c.muscle]||c.muscle)}</span></div>`
    ).join("");
    subList.classList.add("open");
    subList.querySelectorAll(".ac-item").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        applySub(el.dataset.name, el.dataset.muscle);
      });
    });
  }

  subInp.addEventListener("input", () => subFilter(subInp.value.trim()));
  subInp.addEventListener("focus", () => { if(subInp.value.trim()) subFilter(subInp.value.trim()); });
  subInp.addEventListener("blur", () => { setTimeout(() => subList.classList.remove("open"), 150); });
  subInp.addEventListener("keydown", e => {
    const items = subList.querySelectorAll(".ac-item");
    if(!items.length || !subList.classList.contains("open")) return;
    if(e.key === "ArrowDown"){ e.preventDefault(); subActiveIdx = Math.min(subActiveIdx+1, items.length-1); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); subActiveIdx = Math.max(subActiveIdx-1, 0); }
    else if(e.key === "Enter" && subActiveIdx >= 0){ e.preventDefault(); applySub(items[subActiveIdx].dataset.name, items[subActiveIdx].dataset.muscle); return; }
    else if(e.key === "Enter" && subInp.value.trim()){
      e.preventDefault();
      applySub(subInp.value.trim(), originalMuscle);
      return;
    }
    else if(e.key === "Escape"){ subList.classList.remove("open"); return; }
    else return;
    items.forEach((el,j) => el.classList.toggle("active", j === subActiveIdx));
  });

  setTimeout(() => subInp.focus(), 100);
}

// ========= Machine Modal =========
$machineModal.addEventListener("click", e => { if(e.target === $machineModal) closeMachineModal(); });

function closeMachineModal(){ $machineModal.classList.remove("open"); }

function openMachineModal(exIdx, isSup){
  const ex = state.session.exercises[exIdx];
  const day = activeDays()[state.current];
  const planEx = day.ex[exIdx];
  const effectiveName = isSup ? (planEx.superset ? planEx.superset.name : "") : (ex.subName || planEx.name);
  const currentMachine = isSup ? ex.supMachine : ex.machine;

  // Build chips: user's most-used machines GLOBAL across all sessions, ranked by frequency desc, cap 8
  const chips = usedMachinesRanked().slice(0, 8);

  let html = `<h3 style="margin:0 0 4px">Máquina (opcional)</h3>`;
  html += `<p class="sub-desc">Identifica o equipamento usado. Histórico e sugestões ficam separados por máquina.</p>`;

  if(currentMachine){
    html += `<div class="sub-current">Atual: ${esc(currentMachine)}</div>`;
  }

  if(chips.length){
    html += `<div class="sub-section-label">Usadas anteriormente</div>`;
    html += `<div class="sub-chips">`;
    chips.forEach(m => {
      html += `<button class="sub-chip machine-chip" data-machine="${esc(m)}">${esc(m)}</button>`;
    });
    html += `</div>`;
  }

  html += `<div class="sub-section-label">Nova máquina</div>`;
  html += `<div class="sub-input-wrap">`;
  html += `<input class="modal-input" id="machineInput" placeholder="Ex: Gervasport, Life Fitness…" autocomplete="off" value="${esc(currentMachine)}">`;
  html += `<div class="ac-list" id="machineAcList"></div>`;
  html += `</div>`;

  if(currentMachine){
    html += `<button class="sub-revert" id="machineRemoveBtn">✕ Remover máquina</button>`;
  }

  $machineModalInner.innerHTML = html;
  $machineModal.classList.add("open");

  function applyMachine(val){
    const v = val ? String(val).trim() : null;
    if(isSup) ex.supMachine = v || null;
    else ex.machine = v || null;
    scheduleSave(); renderDay(); closeMachineModal();
  }

  // Chip clicks
  $machineModalInner.querySelectorAll(".machine-chip").forEach(chip => {
    chip.addEventListener("click", () => applyMachine(chip.dataset.machine));
  });

  // Remove button
  const removeBtn = document.getElementById("machineRemoveBtn");
  if(removeBtn){
    removeBtn.addEventListener("click", () => applyMachine(null));
  }

  // Autocomplete: union of user machines + seed catalog, deduped via normMachine
  const machInp = document.getElementById("machineInput");
  const acSource = (() => {
    const out = [], seenK = new Set();
    const push = disp => { const k = normMachine(disp); if(k && !seenK.has(k)){ seenK.add(k); out.push(disp); } };
    usedMachinesRanked().forEach(push);
    MACHINE_CATALOG.forEach(push);
    return out;
  })();
  const machList = document.getElementById("machineAcList");
  let machActiveIdx = -1;
  function machFilter(q){
    if(!q){ machList.classList.remove("open"); return; }
    const nq = stripDiacritics(q.toLowerCase());
    const prefix = [], sub = [];
    acSource.forEach(m => {
      const nm = stripDiacritics(m.toLowerCase());
      if(nm.startsWith(nq)) prefix.push(m); else if(nm.includes(nq)) sub.push(m);
    });
    const results = prefix.concat(sub).slice(0, 8);
    if(!results.length){ machList.classList.remove("open"); return; }
    machActiveIdx = -1;
    machList.innerHTML = results.map((m,i) => `<div class="ac-item" data-i="${i}" data-machine="${esc(m)}">${esc(m)}</div>`).join("");
    machList.classList.add("open");
    machList.querySelectorAll(".ac-item").forEach(el => {
      el.addEventListener("mousedown", ev => { ev.preventDefault(); applyMachine(el.dataset.machine); });
    });
  }
  machInp.addEventListener("input", () => machFilter(machInp.value.trim()));
  machInp.addEventListener("focus", () => machFilter(machInp.value.trim()));
  machInp.addEventListener("blur", () => setTimeout(() => machList.classList.remove("open"), 150));
  machInp.addEventListener("keydown", e => {
    const items = machList.querySelectorAll(".ac-item");
    const open = machList.classList.contains("open") && items.length;
    if(e.key === "ArrowDown" && open){ e.preventDefault(); machActiveIdx = Math.min(machActiveIdx+1, items.length-1); }
    else if(e.key === "ArrowUp" && open){ e.preventDefault(); machActiveIdx = Math.max(machActiveIdx-1, 0); }
    else if(e.key === "Enter" && open && machActiveIdx >= 0){ e.preventDefault(); applyMachine(items[machActiveIdx].dataset.machine); return; }
    else if(e.key === "Enter"){ e.preventDefault(); applyMachine(machInp.value); return; }
    else if(e.key === "Escape"){ machList.classList.remove("open"); return; }
    else return;
    items.forEach((el,j) => el.classList.toggle("active", j === machActiveIdx));
  });

  setTimeout(() => machInp.focus(), 100);
}

function renderStrip(){
  $strip.innerHTML = activeDays().map((d,i) => {
    const isToday = state.weekOffset === 0 && i === todayIdx;
    const isRest = d.ex.length === 0;
    return `
      <button class="day-btn ${isToday?'is-today':''} ${isRest?'rest':''}"
              role="tab" aria-selected="${i===state.current}" data-i="${i}">
        <span class="abbr">${d.abbr}</span>
        <span class="focus">${isRest ? 'Descanso' : esc(d.tag || d.focus.split('\u00b7')[0].trim())}</span>
        <span class="today">Hoje</span>
        <span class="dot"></span>
      </button>`;
  }).join("");

  $strip.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      state.current = +btn.dataset.i;
      renderStrip();
      $panel.innerHTML = skeletonPanel();
      await loadDay(state.current);
      renderStrip();
      btn.scrollIntoView({inline:"center",block:"nearest",behavior:"smooth"});
    });
  });

  updateWeekLabel();
  centerActiveDay();
}

function centerActiveDay(behavior){
  if(!$strip) return;
  const btn = $strip.querySelector('.day-btn[aria-selected="true"]');
  if(!btn) return;
  const cr = $strip.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  const delta = (br.left - cr.left) - (cr.width - br.width) / 2;
  $strip.scrollTo({ left: $strip.scrollLeft + delta, behavior: behavior || "auto" });
}

function updateWeekLabel(){
  if(state.weekOffset === 0){
    $weekLabel.textContent = "Semana atual";
  } else {
    const mon = getWeekMonday(state.weekOffset);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const monDay = mon.getDate();
    const sunDay = sun.getDate();
    const sunMonth = months[sun.getMonth()];
    if(mon.getMonth() === sun.getMonth()){
      $weekLabel.textContent = `${monDay} – ${sunDay} ${sunMonth}`;
    } else {
      const monMonth = months[mon.getMonth()];
      $weekLabel.textContent = `${monDay} ${monMonth} – ${sunDay} ${sunMonth}`;
    }
  }
  $weekNext.disabled = state.weekOffset >= 0;
}

$weekPrev.addEventListener("click", async () => {
  state.weekOffset--;
  renderStrip();
  $panel.innerHTML = skeletonPanel();
  await loadDay(state.current);
  renderStrip();
});

$weekNext.addEventListener("click", async () => {
  if(state.weekOffset >= 0) return;
  state.weekOffset++;
  renderStrip();
  $panel.innerHTML = skeletonPanel();
  await loadDay(state.current);
  renderStrip();
});

// ========= Evolução =========
const MUSCLE_ORDER = ["peito","costas","ombro","trapézio","bíceps","tríceps","antebraço","perna","glúteo","panturrilha","abdômen"];
const MUSCLE_LABEL = {peito:"Peito",costas:"Costas",ombro:"Ombro","trapézio":"Trapézio","bíceps":"Bíceps","tríceps":"Tríceps","antebraço":"Antebraço",perna:"Perna","glúteo":"Glúteo","panturrilha":"Panturrilha","abdômen":"Abdômen"};

function buildExerciseList(){
  const seen = new Map();
  activeDays().forEach((d, dk) => {
    d.ex.forEach((e, ei) => {
      if(!seen.has(e.name)) seen.set(e.name, {name:e.name, muscle:e.muscle, unit:e.unit||"kg", dayKey:dk, exIdx:ei, isSup:false});
      if(e.superset && !seen.has(e.superset.name))
        seen.set(e.superset.name, {name:e.superset.name, muscle:e.superset.muscle||e.muscle, unit:e.superset.unit||"kg", dayKey:dk, exIdx:ei, isSup:true});
    });
  });
  // Add substituted exercise names from session history
  if(state.allSessions){
    state.allSessions.forEach(s => {
      if(!s.exercises) return;
      s.exercises.forEach(entry => {
        if(entry.subName && !seen.has(entry.subName)){
          seen.set(entry.subName, {name:entry.subName, muscle:entry.subMuscle||"outro", unit:"kg", dayKey:s.dayKey, exIdx:0, isSup:false});
        }
        if(entry.supSubName && !seen.has(entry.supSubName)){
          seen.set(entry.supSubName, {name:entry.supSubName, muscle:entry.supSubMuscle||"outro", unit:"kg", dayKey:s.dayKey, exIdx:0, isSup:true});
        }
      });
    });
  }
  return [...seen.values()];
}
state.EXERCISES = buildExerciseList();

function rebuildEvoDropdown(){
  const grouped = new Map();
  state.EXERCISES.forEach((x,i) => {
    const m = x.muscle || "outro";
    if(!grouped.has(m)) grouped.set(m, []);
    grouped.get(m).push({...x, idx:i});
  });
  let html = "";
  MUSCLE_ORDER.forEach(m => {
    const items = grouped.get(m);
    if(!items) return;
    items.sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
    html += `<optgroup label="${MUSCLE_LABEL[m]}">`;
    items.forEach(x => { html += `<option value="${x.idx}">${esc(x.name)}</option>`; });
    html += `</optgroup>`;
  });
  $evoSelect.innerHTML = html;
}

// Entry point used by the Treino view to deep-link into a specific exercise chart.
function openEvolucaoFor(name, machine){
  state.evoPendingName = name || null;
  state.evoPendingMachine = (machineFilterActive() && machine) ? normMachine(machine) : null;
  const wasInit = state.evoInitialized;
  showTab("evolucao");
  window.scrollTo({top:0, behavior:"auto"});
  // showTab -> initEvolucao only renders on first init; force a re-render otherwise.
  if(wasInit) renderEvolucao();
}

function initEvolucao(){
  if(state.evoInitialized) return;
  state.evoInitialized = true;
  rebuildEvoDropdown();
  $evoSelect.addEventListener("change", renderEvolucao);
  $evoMachineSelect.addEventListener("change", renderEvolucao);
  renderEvolucao();
}

function loadMetrics(sets){
  if(!sets) return null;
  const ws = sets.map(s => (s && s.weight != null && s.weight !== "") ? Number(s.weight) : null)
                 .filter(w => w != null && !isNaN(w));
  if(!ws.length) return null;
  const max = Math.max(...ws);
  const avg = ws.reduce((a,b)=>a+b,0) / ws.length;
  return { max, avg: Math.round(avg*10)/10 };
}

async function renderEvolucao(){
  if(!state.user){ return; }
  $evoBody.innerHTML = skeletonEvo();

  await loadAllSessions();
  // Rebuild exercise list to include substitutes from session history
  const prevSelected = $evoSelect.value;
  const prevName = state.EXERCISES[+prevSelected]?.name;
  state.EXERCISES = buildExerciseList();
  rebuildEvoDropdown();
  // A pending deep-link wins over restoring the previous selection.
  if(state.evoPendingName){
    const pIdx = state.EXERCISES.findIndex(x => x.name === state.evoPendingName);
    if(pIdx >= 0) $evoSelect.value = pIdx;
    // Machine select is built further down and restores from dataset.prevNorm.
    if(state.evoPendingMachine) $evoMachineSelect.dataset.prevNorm = state.evoPendingMachine;
    state.evoPendingName = null;
    state.evoPendingMachine = null;
  } else if(prevName){
    const newIdx = state.EXERCISES.findIndex(x => x.name === prevName);
    if(newIdx >= 0) $evoSelect.value = newIdx;
  }
  const sel = state.EXERCISES[+$evoSelect.value || 0];
  const evoUnit = sel.unit || "kg";
  const featureActive = machineFilterActive();

  // Collect matched sets bucketed by machine variant
  // Each bucket key: normMachine(machine) ?? "__none"
  const byVariant = new Map(); // key -> Map<date, sets[]>
  (state.allSessions || []).forEach(s => {
    if(!s.exercises) return;
    s.exercises.forEach(entry => {
      const effectiveName = entry.subName || entry.name;
      let sets = [];
      let machine = null;
      if(effectiveName === sel.name && entry.main){
        sets.push(...entry.main);
        machine = entry.machine || null;
      }
      if((entry.supSubName || entry.supName) === sel.name && entry.sup){
        sets.push(...entry.sup);
        machine = entry.supMachine || null;
      }
      if(!sets.length) return;
      const vKey = featureActive ? (normMachine(machine) ?? "__none") : "__none";
      if(!byVariant.has(vKey)) byVariant.set(vKey, { displayName: machine ? String(machine).trim() : null, byDate: new Map() });
      const bucket = byVariant.get(vKey);
      // Keep the first non-null display name encountered for this normalized key
      if(machine && !bucket.displayName) bucket.displayName = String(machine).trim();
      const prev = bucket.byDate.get(s.date);
      if(prev) prev.push(...sets); else bucket.byDate.set(s.date, [...sets]);
    });
  });

  // Build machine select dropdown
  const variantKeys = [...byVariant.keys()];
  const showMachineSelect = featureActive && variantKeys.length > 1;
  if(showMachineSelect){
    const prevMachineVal = $evoMachineSelect.dataset.prevNorm || "";
    let mhtml = `<option value="__all">Todas as máquinas</option>`;
    variantKeys.sort((a,b) => {
      if(a === "__none") return 1;
      if(b === "__none") return -1;
      return a.localeCompare(b, "pt-BR");
    }).forEach(vk => {
      const label = vk === "__none" ? "Geral (sem máquina)" : byVariant.get(vk).displayName;
      mhtml += `<option value="${vk}">${label}</option>`;
    });
    $evoMachineSelect.innerHTML = mhtml;
    // Restore previous selection if still valid
    const opts = [...$evoMachineSelect.options].map(o => o.value);
    if(prevMachineVal && opts.includes(prevMachineVal)){
      $evoMachineSelect.value = prevMachineVal;
    } else {
      $evoMachineSelect.value = "__all";
    }
    $evoMachineSelect.dataset.prevNorm = $evoMachineSelect.value;
    $evoMachineSelect.style.display = "";
  } else if(featureActive && variantKeys.length === 1 && variantKeys[0] !== "__none"){
    // Single tagged variant — show select but with only that option (no "all")
    const vk = variantKeys[0];
    const label = byVariant.get(vk).displayName;
    $evoMachineSelect.innerHTML = `<option value="${vk}">${label}</option>`;
    $evoMachineSelect.value = vk;
    $evoMachineSelect.dataset.prevNorm = vk;
    $evoMachineSelect.style.display = "";
  } else {
    $evoMachineSelect.style.display = "none";
    $evoMachineSelect.dataset.prevNorm = "";
  }

  const selectedVariant = showMachineSelect ? $evoMachineSelect.value : (variantKeys[0] || "__none");
  const isAllView = selectedVariant === "__all";

  // -- Color palette for multi-variant view --
  const VARIANT_COLORS = ["#FF5A1F","#3B82F6","#10B981","#F59E0B","#8B5CF6","#EC4899","#14B8A6","#EF4444"];

  if(isAllView){
    // Multi-variant: one max line per variant
    const allDates = new Set();
    const variantData = []; // [{key, label, points:[{date, max}]}]
    variantKeys.sort((a,b) => {
      if(a === "__none") return 1;
      if(b === "__none") return -1;
      return a.localeCompare(b, "pt-BR");
    }).forEach(vk => {
      const bucket = byVariant.get(vk);
      const pts = [];
      [...bucket.byDate.entries()]
        .sort((a,b) => a[0].localeCompare(b[0]))
        .forEach(([date, sets]) => {
          const m = loadMetrics(sets);
          if(m){ pts.push({ date, max: m.max }); allDates.add(date); }
        });
      if(pts.length){
        variantData.push({ key: vk, label: vk === "__none" ? "Geral" : bucket.displayName, points: pts });
      }
    });

    if(!variantData.length){
      $evoBody.innerHTML = `<div class="evo-empty"><span class="big">Sem dados ainda</span>Registre a carga deste exercício em alguns treinos e a evolução aparecerá aqui.</div>`;
      if(state.evoChart){ state.evoChart.destroy(); state.evoChart = null; }
      return;
    }

    // Stats for __all: last trained variant's max, sessions = distinct dates
    const totalSessions = allDates.size;
    // Find most recently trained variant
    let latestDate = "";
    let latestVariant = variantData[0];
    variantData.forEach(vd => {
      const last = vd.points[vd.points.length - 1].date;
      if(last > latestDate){ latestDate = last; latestVariant = vd; }
    });
    const latestMax = latestVariant.points[latestVariant.points.length - 1].max;

    $evoBody.innerHTML = `
      <div class="evo-stats">
        <div class="evo-stat"><div class="val">${latestMax}</div><div class="lbl">Carga máx. atual</div><div class="sub">${latestVariant.label}</div></div>
        <div class="evo-stat"><div class="val">—</div><div class="lbl">Variação total</div></div>
        <div class="evo-stat"><div class="val">${totalSessions}</div><div class="lbl">Sessões</div></div>
      </div>
      <div class="evo-chart-card">
        <div class="evo-chart-wrap"><canvas id="evoCanvas"></canvas></div>
        <div class="evo-legend">
          ${variantData.map((vd, i) => `<span class="item"><span class="swatch" style="background:${VARIANT_COLORS[i % VARIANT_COLORS.length]}"></span>${vd.label}</span>`).join("")}
        </div>
      </div>`;

    const datasets = variantData.map((vd, i) => ({
      label: vd.label,
      points: vd.points,
      color: VARIANT_COLORS[i % VARIANT_COLORS.length]
    }));
    drawChart(datasets, evoUnit, true);

  } else {
    // Single-variant view (or feature inactive): legacy behavior
    const bucket = byVariant.get(selectedVariant);
    const points = [];
    if(bucket){
      [...bucket.byDate.entries()]
        .sort((a,b) => a[0].localeCompare(b[0]))
        .forEach(([date, sets]) => {
          const m = loadMetrics(sets);
          if(m) points.push({ date, max: m.max, avg: m.avg });
        });
    }

    if(!points.length){
      $evoBody.innerHTML = `<div class="evo-empty"><span class="big">Sem dados ainda</span>Registre a carga deste exercício em alguns treinos e a evolução aparecerá aqui.</div>`;
      if(state.evoChart){ state.evoChart.destroy(); state.evoChart = null; }
      return;
    }

    const lastMax = points[points.length-1].max;
    const firstMax = points[0].max;
    const delta = lastMax - firstMax;
    const deltaTxt = points.length < 2
      ? "—"
      : (delta>0?"+":"") + (Math.round(delta*10)/10) + " " + UNIT_ABBR[evoUnit];

    $evoBody.innerHTML = `
      <div class="evo-stats">
        <div class="evo-stat"><div class="val">${lastMax}</div><div class="lbl">Carga máx. atual</div></div>
        <div class="evo-stat"><div class="val">${deltaTxt}</div><div class="lbl">Variação total</div></div>
        <div class="evo-stat"><div class="val">${points.length}</div><div class="lbl">Sessões</div></div>
      </div>
      <div class="evo-chart-card">
        <div class="evo-chart-wrap"><canvas id="evoCanvas"></canvas></div>
        <div class="evo-legend">
          <span class="item"><span class="swatch" style="background:var(--accent)"></span>Carga máxima</span>
          <span class="item"><span class="swatch" style="background:var(--muted)"></span>Carga média</span>
        </div>
      </div>`;

    drawChart(points, evoUnit, false);
  }
}

function drawChart(data, unit, multi){
  const uLabel = UNIT_ABBR[unit || "kg"];
  if(state.evoChart){ state.evoChart.destroy(); state.evoChart = null; }
  const ctx = document.getElementById("evoCanvas");
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim() || "#FF5A1F";
  const muted  = css.getPropertyValue("--muted").trim() || "#8A8F99";
  const border = css.getPropertyValue("--border").trim() || "#2A2E37";
  const faint  = css.getPropertyValue("--faint").trim() || "#5A5F69";

  let labels, datasets;

  if(multi){
    // data = [{label, points:[{date,max}], color}]
    // Build a unified date axis from all variants
    const dateSet = new Set();
    data.forEach(ds => ds.points.forEach(p => dateSet.add(p.date)));
    const allDates = [...dateSet].sort();
    labels = allDates.map(d => fmtDateBR(d));

    datasets = data.map(ds => {
      const dateMap = new Map(ds.points.map(p => [p.date, p.max]));
      return {
        label: ds.label,
        data: allDates.map(d => dateMap.has(d) ? dateMap.get(d) : null),
        borderColor: ds.color,
        backgroundColor: ds.color,
        borderWidth: 2.5,
        tension: .3,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: false,
      };
    });
  } else {
    // data = [{date, max, avg}] — legacy single-variant
    labels = data.map(p => fmtDateBR(p.date));
    datasets = [
      {
        label: "Carga máxima",
        data: data.map(p => p.max),
        borderColor: accent,
        backgroundColor: accent,
        borderWidth: 2.5,
        tension: .3,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: "Carga média",
        data: data.map(p => p.avg),
        borderColor: muted,
        backgroundColor: muted,
        borderWidth: 2,
        borderDash: [5,4],
        tension: .3,
        pointRadius: 3,
        pointHoverRadius: 5,
      }
    ];
  }

  state.evoChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css.getPropertyValue("--surface-2").trim() || "#1E2128",
          titleColor: css.getPropertyValue("--text").trim() || "#ECEDEF",
          bodyColor: muted,
          borderColor: border,
          borderWidth: 1,
          padding: 10,
          callbacks: { label: c => c.parsed.y != null ? `${c.dataset.label}: ${c.parsed.y} ${uLabel}` : null }
        }
      },
      scales: {
        x: { grid:{ color:border, drawTicks:false }, ticks:{ color:faint, font:{size:11} } },
        y: { grid:{ color:border, drawTicks:false }, ticks:{ color:faint, font:{size:11}, callback:v=>v+" "+uLabel }, beginAtZero:false }
      }
    }
  });
}

// ========= Exercise CRUD (Firestore) =========

const DAY_NAMES_SHORT = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

function activeDays(){ return state.userDays || DAYS; }

// Build userDays from exercisesCatalog
function rebuildUserDays(){
  const base = [
    {abbr:"Seg",name:"Segunda",tag:"Ombro · Costas",focus:"Ombro lateral/posterior · Costas"},
    {abbr:"Ter",name:"Terça",tag:"Posterior",focus:"Ombro frontal · Posterior de coxa · Glúteo"},
    {abbr:"Qua",name:"Quarta",tag:"Peito",focus:"Peito · Ombro"},
    {abbr:"Qui",name:"Quinta",tag:"Braços",focus:"Posterior de ombro · Tríceps · Bíceps"},
    {abbr:"Sex",name:"Sexta",tag:"Pernas",focus:"Quadríceps · Adutor"},
    {abbr:"Sáb",name:"Sábado",tag:"Livre",focus:"Livre"},
    {abbr:"Dom",name:"Domingo",tag:"Livre",focus:"Livre"},
  ];
  base.forEach((d,i) => {
    d.ex = [];
    const custom = state.dayCustomizations[i];
    if(custom){
      if(custom.tag) d.tag = custom.tag;
      if(custom.focus) d.focus = custom.focus;
    }
  });
  state.exercisesCatalog.forEach((ex, id) => {
    if(!ex.active) return;
    (ex.days || []).forEach(dk => {
      if(dk < 0 || dk > 6) return;
      const order = orderForDay(ex, dk);
      const sup = ex.superset ? {...ex.superset, unit: ex.superset.unit || "kg"} : null;
      base[dk].ex.push({
        _id: id,
        _order: order,
        name: ex.name,
        muscle: ex.muscle,
        reps: ex.reps || [12,10,8],
        badges: ex.badges || [],
        note: ex.note || null,
        unit: ex.unit || "kg",
        superset: sup,
      });
    });
  });
  base.forEach(d => d.ex.sort((a,b) =>
    cmpExOrder(a._order, a.name, a._id, b._order, b.name, b._id)));
  state.userDays = base;
  state.EXERCISES = buildExerciseList();
  state.evoInitialized = false;
}

// Load exercises from Firestore (seeds from hardcoded DAYS on first login)
async function loadExercises(uid){
  if(!state.user && !uid) return;
  uid = uid || state.user.uid;
  const colRef = collection(db, "users", uid, "exercises");
  let snap;
  try { snap = await getDocs(colRef); }
  catch(e){ console.warn("loadExercises:", e.message); return; }
  state.exercisesCatalog.clear();
  if(!snap.empty){
    snap.forEach(d => state.exercisesCatalog.set(d.id, d.data()));
    return;
  }
  // First login: seed from hardcoded DAYS, populate cache from write refs (no re-read)
  const byName = new Map();
  DAYS.forEach((d, dk) => {
    d.ex.forEach((e, ei) => {
      if(!byName.has(e.name)){
        byName.set(e.name, {
          name: e.name, muscle: e.muscle,
          reps: [...e.reps], badges: [...(e.badges||[])],
          note: e.note || null, active: true,
          days: [dk], orderByDay: {[dk]: ei},
          superset: e.superset ? {
            name: e.superset.name, muscle: e.superset.muscle || e.muscle,
            reps: [...e.superset.reps], badges: [...(e.superset.badges||[])],
            note: e.superset.note || null
          } : null,
        });
      } else {
        const existing = byName.get(e.name);
        if(!existing.days.includes(dk)){
          existing.days.push(dk);
          existing.orderByDay[dk] = ei;
        }
      }
    });
  });
  try {
    const writes = [];
    byName.forEach(ex => {
      const data = { ...ex, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      writes.push(addDoc(colRef, data).then(ref => state.exercisesCatalog.set(ref.id, data)));
    });
    await Promise.all(writes);
  } catch(e){ console.error("seed exercises:", e); }
}

// Save exercise doc
async function saveExerciseDoc(docId, data){
  if(!state.user) return null;
  data.updatedAt = serverTimestamp();
  if(docId){
    const ref = doc(db, "users", state.user.uid, "exercises", docId);
    await setDoc(ref, data, { merge: true });
    return docId;
  } else {
    data.createdAt = serverTimestamp();
    const ref = await addDoc(collection(db, "users", state.user.uid, "exercises"), data);
    return ref.id;
  }
}

// Delete exercise doc
async function deleteExerciseDoc(docId){
  if(!state.user) return;
  await deleteDoc(doc(db, "users", state.user.uid, "exercises", docId));
}

// ========= Day Customizations =========

const DAY_DEFAULTS = [
  {tag:"Ombro · Costas", focus:"Ombro lateral/posterior · Costas"},
  {tag:"Posterior", focus:"Ombro frontal · Posterior de coxa · Glúteo"},
  {tag:"Peito", focus:"Peito · Ombro"},
  {tag:"Braços", focus:"Posterior de ombro · Tríceps · Bíceps"},
  {tag:"Pernas", focus:"Quadríceps · Adutor"},
  {tag:"Livre", focus:"Livre"},
  {tag:"Livre", focus:"Livre"},
];

async function loadDayCustomizations(){
  if(!state.user) return;
  state.dayCustomizations = {};
  try {
    const snap = await getDocs(collection(db, "users", state.user.uid, "days"));
    snap.forEach(d => { state.dayCustomizations[d.id] = d.data(); });
  } catch(e){ console.warn("loadDayCustomizations:", e.message); }
}

async function saveDayCustomization(dayKey, tag, focus){
  if(!state.user) return;
  const data = { tag, focus, updatedAt: serverTimestamp() };
  const ref = doc(db, "users", state.user.uid, "days", String(dayKey));
  await setDoc(ref, data, { merge: true });
  state.dayCustomizations[dayKey] = { tag, focus };
}

async function deleteDayCustomization(dayKey){
  if(!state.user) return;
  const ref = doc(db, "users", state.user.uid, "days", String(dayKey));
  await deleteDoc(ref);
  delete state.dayCustomizations[dayKey];
}

function renderDayCustomSection(){
  const base = [
    {abbr:"Seg", name:"Segunda"},
    {abbr:"Ter", name:"Terça"},
    {abbr:"Qua", name:"Quarta"},
    {abbr:"Qui", name:"Quinta"},
    {abbr:"Sex", name:"Sexta"},
    {abbr:"Sáb", name:"Sábado"},
    {abbr:"Dom", name:"Domingo"},
  ];

  let html = "";
  base.forEach((d, i) => {
    const custom = state.dayCustomizations[i] || {};
    const tagVal = custom.tag ?? DAY_DEFAULTS[i].tag;
    const focusVal = custom.focus ?? DAY_DEFAULTS[i].focus;
    const isCustom = state.dayCustomizations[i] != null;
    html += `<div class="day-row" data-dk="${i}">
      <span class="day-row-abbr">${d.abbr}</span>
      <div class="day-row-info">
        <div class="day-row-tag">${tagVal}${isCustom ? ' <span class="ex-tag accent" style="font-size:9px;padding:2px 6px;vertical-align:middle">Personalizado</span>' : ''}</div>
        <div class="day-row-focus">${focusVal}</div>
      </div>
      <span class="day-row-chevron">›</span>
    </div>`;
  });
  $dayCustomSection.innerHTML = html;

  // Tap row → open bottom-sheet editor
  $dayCustomSection.querySelectorAll(".day-row").forEach(row => {
    row.addEventListener("click", () => {
      const dk = Number(row.dataset.dk);
      openDayEditSheet(dk, base[dk].name);
    });
  });
}

function openDayEditSheet(dk, dayName){
  const custom = state.dayCustomizations[dk] || {};
  const tagVal = custom.tag ?? DAY_DEFAULTS[dk].tag;
  const focusVal = custom.focus ?? DAY_DEFAULTS[dk].focus;
  const isCustom = state.dayCustomizations[dk] != null;

  let html = `<h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0 0 18px">${esc(dayName)}</h3>`;
  html += `<div class="modal-field" style="margin-bottom:14px">
    <label style="display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:6px">Tag</label>
    <input class="modal-input" id="dayEditTag" value="${esc(tagVal)}" maxlength="30" placeholder="${DAY_DEFAULTS[dk].tag}">
  </div>`;
  html += `<div class="modal-field" style="margin-bottom:18px">
    <label style="display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:6px">Foco</label>
    <input class="modal-input" id="dayEditFocus" value="${esc(focusVal)}" maxlength="80" placeholder="${DAY_DEFAULTS[dk].focus}">
  </div>`;
  html += `<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">`;
  if(isCustom) html += `<button class="modal-btn" id="dayEditReset" style="margin-right:auto;color:var(--muted)">Restaurar padrão</button>`;
  html += `<button class="modal-btn" id="dayEditCancel">Cancelar</button>`;
  html += `<button class="modal-btn" id="dayEditSave" style="background:var(--accent);color:#fff;border-color:var(--accent)">Salvar</button>`;
  html += `</div>`;
  $dayEditModalBody.innerHTML = html;
  $dayEditModal.classList.add("open");

  const closeDaySheet = () => $dayEditModal.classList.remove("open");

  document.getElementById("dayEditCancel").addEventListener("click", closeDaySheet);
  $dayEditModal.addEventListener("click", e => { if(e.target === $dayEditModal) closeDaySheet(); }, {once:true});

  document.getElementById("dayEditSave").addEventListener("click", async () => {
    const tag = document.getElementById("dayEditTag").value.trim();
    const focus = document.getElementById("dayEditFocus").value.trim();
    const finalTag = tag || DAY_DEFAULTS[dk].tag;
    const finalFocus = focus || DAY_DEFAULTS[dk].focus;
    try {
      await saveDayCustomization(dk, finalTag, finalFocus);
      rebuildUserDays();
      renderStrip();
      if(state.current === dk) renderDay();
      closeDaySheet();
      renderDayCustomSection();
    } catch(e) { console.error(e); alert("Erro ao salvar"); }
  });

  if(isCustom){
    document.getElementById("dayEditReset").addEventListener("click", async () => {
      try {
        await deleteDayCustomization(dk);
        rebuildUserDays();
        renderStrip();
        if(state.current === dk) renderDay();
        closeDaySheet();
        renderDayCustomSection();
      } catch(e) { console.error(e); alert("Erro ao restaurar"); }
    });
  }
}

// ========= Exercícios list view =========

function renderExercicios(){
  document.querySelectorAll("#exSubTabs [data-subtab]").forEach(b =>
    b.classList.toggle("active", b.dataset.subtab === state.exSubTab));
  document.getElementById("subViewList").style.display  = state.exSubTab==="list"  ? "" : "none";
  document.getElementById("subViewPlans").style.display = state.exSubTab==="plans" ? "" : "none";
  document.getElementById("subViewDays").style.display  = state.exSubTab==="days"  ? "" : "none";
  if(state.exSubTab==="list"){ renderExFilterBar(); renderExList(); }
  else if(state.exSubTab==="plans"){ renderPlansSection(); }
  else { renderDayCustomSection(); }
}

function renderExFilterBar(){
  const muscles = Object.entries(MUSCLE_LABEL);
  let html = `<div class="ex-toolbar">
    <input type="search" class="ex-search" id="exSearchInput" placeholder="Buscar exercício…" value="${esc(state.exSearchQuery)}">
    <button class="ex-new-btn" id="exNewBtn" style="width:auto;flex:0 0 auto">+ Novo</button>
  </div>`;
  // Muscle chips
  html += `<div class="chip-scroll">`;
  html += `<span class="filter-chip ${state.exFilterMuscle===null?'active':''}" data-muscle="">Todos</span>`;
  muscles.forEach(([k,v]) => {
    html += `<span class="filter-chip ${state.exFilterMuscle===k?'active':''}" data-muscle="${k}">${v}</span>`;
  });
  html += `</div>`;
  // Day chips + Inativos toggle
  html += `<div class="chip-scroll">`;
  html += `<span class="filter-chip ${state.exFilterDay===null?'active':''}" data-day="">Todos</span>`;
  DAY_NAMES_SHORT.forEach((d,i) => {
    html += `<span class="filter-chip ${state.exFilterDay===i?'active':''}" data-day="${i}">${d}</span>`;
  });
  html += `<span class="filter-chip ${state.exShowInactive?'active':''}" id="exInactiveChip">Inativos</span>`;
  html += `</div>`;
  $exFilterBar.innerHTML = html;

  // search input — only re-render the list (keep focus)
  document.getElementById("exSearchInput").addEventListener("input", e => {
    state.exSearchQuery = e.target.value;
    renderExList();
  });
  // bind filter clicks
  $exFilterBar.querySelectorAll("[data-muscle]").forEach(el => {
    el.addEventListener("click", () => {
      state.exFilterMuscle = el.dataset.muscle === "" ? null : el.dataset.muscle;
      renderExFilterBar(); renderExList();
    });
  });
  $exFilterBar.querySelectorAll("[data-day]").forEach(el => {
    el.addEventListener("click", () => {
      state.exFilterDay = el.dataset.day === "" ? null : Number(el.dataset.day);
      renderExFilterBar(); renderExList();
    });
  });
  document.getElementById("exInactiveChip").addEventListener("click", () => {
    state.exShowInactive = !state.exShowInactive;
    renderExFilterBar(); renderExList();
  });
  document.getElementById("exNewBtn").addEventListener("click", () => openExEditor(null));
}

function renderExItemHtml(ex, canDrag){
  const isInactive = ex.active === false;
  const dayPills = (ex.days||[]).sort().map(d => DAY_NAMES_SHORT[d]).join(" · ");
  const repsSummary = (ex.reps||[]).length + "×" + (ex.reps||[])[0];
  const badgeTags = (ex.badges||[]).map(b => `<span class="ex-tag accent">${b}</span>`).join("");

  let h = `<div class="ex-list-item ${isInactive?'inactive':''}" data-id="${ex._id}" ${canDrag?'draggable="true"':''}>`;
  if(canDrag) h += `<div class="drag-handle"><span></span><span></span><span></span></div>`;
  h += `<div class="ex-list-body">
    <div class="ex-list-name">${esc(ex.name)}</div>
    <div class="ex-list-meta">
      <span class="ex-tag">${esc(MUSCLE_LABEL[ex.muscle]||ex.muscle)}</span>
      <span class="ex-tag">${dayPills}</span>
      <span class="ex-tag">${repsSummary}</span>
      ${badgeTags}
      ${isInactive ? '<span class="ex-tag inactive-tag">Inativo</span>' : ''}
      ${ex.superset ? '<span class="ex-tag accent">supersérie</span>' : ''}
    </div>
  </div>`;
  h += `<div class="ex-list-actions">
    <button class="ex-icon-btn active-toggle ${!isInactive?'is-active':''}" data-id="${ex._id}" title="${isInactive?'Ativar':'Desativar'}">
      ${isInactive ? '○' : '●'}
    </button>
    <button class="ex-icon-btn edit-btn" data-id="${ex._id}" title="Editar">✎</button>
  </div>`;
  h += `</div>`;
  return h;
}

function renderExList(){
  let items = [];
  state.exercisesCatalog.forEach((ex, id) => items.push({...ex, _id: id}));

  // filters
  if(state.exFilterMuscle) items = items.filter(e => e.muscle === state.exFilterMuscle);
  if(state.exFilterDay !== null) items = items.filter(e => (e.days||[]).includes(state.exFilterDay));
  if(!state.exShowInactive) items = items.filter(e => e.active !== false);
  if(state.exSearchQuery.trim()){
    const q = stripDiacritics(state.exSearchQuery.trim());
    items = items.filter(e => stripDiacritics(e.name).includes(q));
  }

  if(!items.length){
    $exList.innerHTML = `<div class="evo-empty"><span class="big">Nenhum exercício encontrado</span></div>`;
    return;
  }

  const canDrag = state.exFilterDay !== null && !state.exSearchQuery.trim();
  let html = "";

  if(canDrag){
    // Flat list sorted by day order — drag-and-drop enabled
    items.sort((a,b) => cmpExOrder(
      orderForDay(a, state.exFilterDay), a.name, a._id,
      orderForDay(b, state.exFilterDay), b.name, b._id));
    items.forEach(ex => { html += renderExItemHtml(ex, true); });
  } else {
    // Grouped by weekday — no drag-and-drop
    const dayGroups = new Map(); // dayIndex -> items[]
    const noDayItems = [];
    items.forEach(ex => {
      const days = ex.days || [];
      if(!days.length){ noDayItems.push(ex); return; }
      days.forEach(dk => {
        if(!dayGroups.has(dk)) dayGroups.set(dk, []);
        dayGroups.get(dk).push(ex);
      });
    });
    // Sort each group by orderByDay within that day, then by name
    dayGroups.forEach((list, dk) => {
      list.sort((a,b) => cmpExOrder(
        orderForDay(a, dk), a.name, a._id,
        orderForDay(b, dk), b.name, b._id));
    });
    noDayItems.sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));

    // Render in day order 0–4
    const seenIds = new Set();
    for(let dk = 0; dk < DAY_NAMES_SHORT.length; dk++){
      const group = dayGroups.get(dk);
      if(!group || !group.length) continue;
      // Apply muscle/inactive filters already done above, but also deduplicate
      const filtered = group.filter(ex => {
        if(seenIds.has(ex._id + "_" + dk)) return false;
        seenIds.add(ex._id + "_" + dk);
        return true;
      });
      if(!filtered.length) continue;
      html += `<div class="ex-section-header">${DAY_NAMES_SHORT[dk]}</div>`;
      filtered.forEach(ex => { html += renderExItemHtml(ex, false); });
    }
    if(noDayItems.length){
      html += `<div class="ex-section-header">Sem dia</div>`;
      noDayItems.forEach(ex => { html += renderExItemHtml(ex, false); });
    }
  }

  $exList.innerHTML = html;

  // bind clicks
  $exList.querySelectorAll(".ex-list-item").forEach(el => {
    el.addEventListener("click", e => {
      if(e.target.closest(".ex-icon-btn") || e.target.closest(".drag-handle")) return;
      openExEditor(el.dataset.id);
    });
  });
  $exList.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); openExEditor(btn.dataset.id); });
  });
  $exList.querySelectorAll(".active-toggle").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const ex = state.exercisesCatalog.get(id);
      if(!ex) return;
      const newActive = ex.active === false;
      await saveExerciseDoc(id, { active: newActive });
      ex.active = newActive;
      rebuildUserDays();
      renderExList();
    });
  });

  // drag and drop
  if(canDrag) initDragAndDrop();
}

// ========= Drag and Drop =========

function initDragAndDrop(){
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
    let touchStartY = 0;
    let touchClone = null;
    let touchActive = false;
    let longPressTimer = null;

    const handle = el.querySelector(".drag-handle");
    if(!handle) return;

    handle.addEventListener("touchstart", e => {
      touchStartY = e.touches[0].clientY;
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

async function reorderExercise(fromId, toId, before){
  if(state.exFilterDay === null) return;
  const dk = state.exFilterDay;

  // get current order
  const ordered = [];
  $exList.querySelectorAll(".ex-list-item").forEach(el => ordered.push(el.dataset.id));

  // remove fromId and insert at new position
  const fromIdx = ordered.indexOf(fromId);
  if(fromIdx >= 0) ordered.splice(fromIdx, 1);
  let toIdx = ordered.indexOf(toId);
  if(!before) toIdx++;
  ordered.splice(toIdx, 0, fromId);

  // update orderByDay for all affected
  const promises = [];
  ordered.forEach((id, i) => {
    const ex = state.exercisesCatalog.get(id);
    if(!ex) return;
    if(!ex.orderByDay) ex.orderByDay = {};
    ex.orderByDay[dk] = i;
    promises.push(saveExerciseDoc(id, { orderByDay: ex.orderByDay }));
  });
  await Promise.all(promises);

  rebuildUserDays();
  renderExList();
}

// ========= Plans =========

async function loadPlans(){
  if(!state.user) return;
  state.plansCache.clear();
  try{
    const snap = await getDocs(collection(db, "users", state.user.uid, "plans"));
    snap.forEach(d => state.plansCache.set(d.id, d.data()));
  }catch(e){ console.warn("loadPlans:", e.message); }
}

async function savePlanDoc(docId, data){
  if(!state.user) return null;
  data.updatedAt = serverTimestamp();
  if(docId){
    const ref = doc(db, "users", state.user.uid, "plans", docId);
    await setDoc(ref, data, { merge: true });
    return docId;
  } else {
    data.createdAt = serverTimestamp();
    const ref = await addDoc(collection(db, "users", state.user.uid, "plans"), data);
    return ref.id;
  }
}

async function deletePlanDoc(docId){
  if(!state.user) return;
  await deleteDoc(doc(db, "users", state.user.uid, "plans", docId));
}

// ========= Data export (Phase 1, item 4) =========

// Firestore Timestamps don't survive JSON.stringify (they'd silently become {}).
// Detect them by duck-typing .toDate() rather than importing the Timestamp class.
function serializeTimestamps(value){
  if(value && typeof value.toDate === "function") return value.toDate().toISOString();
  if(Array.isArray(value)) return value.map(serializeTimestamps);
  if(value && typeof value === "object"){
    const out = {};
    for(const k in value) out[k] = serializeTimestamps(value[k]);
    return out;
  }
  return value;
}

// Reads straight from Firestore rather than the in-memory caches (allSessions,
// exercisesCatalog, plansCache) — those are partial by design (and about to gain
// a query limit), so a cache-built export could silently ship an incomplete backup.
async function buildExportPayload(){
  const [exSnap, planSnap, sessSnap, appPrefSnap, profilePrefSnap] = await Promise.all([
    getDocs(collection(db, "users", state.user.uid, "exercises")),
    getDocs(collection(db, "users", state.user.uid, "plans")),
    getDocs(collection(db, "users", state.user.uid, "sessions")),
    getDoc(doc(db, "users", state.user.uid, "prefs", "app")),
    getDoc(doc(db, "users", state.user.uid, "prefs", "profile")),
  ]);

  const toRecord = d => ({ id: d.id, ...serializeTimestamps(d.data()) });
  const exercises = [];
  exSnap.forEach(d => exercises.push(toRecord(d)));
  const plans = [];
  planSnap.forEach(d => plans.push(toRecord(d)));
  const sessions = [];
  sessSnap.forEach(d => sessions.push(toRecord(d)));
  sessions.sort((a, b) => String(a.date||"").localeCompare(String(b.date||"")));

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "strength-split",
    user: { uid: state.user.uid, email: state.user.email || null, displayName: state.user.displayName || null },
    prefs: {
      app: appPrefSnap.exists() ? serializeTimestamps(appPrefSnap.data()) : null,
      profile: profilePrefSnap.exists() ? serializeTimestamps(profilePrefSnap.data()) : null,
    },
    exercises, plans, sessions,
  };
}

async function exportUserData(){
  if(state.exportingData || !state.user) return;
  state.exportingData = true;
  const $row = document.getElementById("settingsExportRow");
  const $label = document.getElementById("settingsExportLabel");
  const originalLabel = $label.textContent;
  $row.style.pointerEvents = "none";
  $row.style.opacity = ".6";
  $label.textContent = "Exportando…";

  try {
    const payload = await buildExportPayload();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const filename = `strength-split-backup-${todayStr()}.json`;
    const file = new File([blob], filename, { type: "application/json" });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], title: "Backup Strength Split" });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  } catch(e){
    if(e.name !== "AbortError"){
      console.error("exportUserData:", e);
      alert("Erro ao exportar dados: " + e.message);
    }
  } finally {
    state.exportingData = false;
    $row.style.pointerEvents = "";
    $row.style.opacity = "";
    $label.textContent = originalLabel;
  }
}

function renderPlansSection(){
  let html = "";

  if(state.currentPlanName){
    html += `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">
      Plano ativo: <b style="color:var(--accent)">${esc(state.currentPlanName)}</b>
    </div>`;
  }

  html += `<button class="ex-new-btn" id="newPlanBtn" style="margin-bottom:14px">+ Novo plano</button>`;

  html += `<div class="ex-section-header">Predefinidos</div>`;
  PLAN_TEMPLATES.forEach(t => {
    const isActive = state.currentPlanKey === t.templateKey;
    const daysSummary = t.days.map(d => d.type).join(' \u00b7 ');
    html += `<div class="plan-card ${isActive?'active-plan':''}" data-key="${t.templateKey}">
      <div class="plan-card-body">
        <div class="plan-card-name">${esc(t.name)}</div>
        <div class="plan-card-meta">
          <span class="ex-tag">${daysSummary}</span>
          ${isActive ? '<span class="ex-tag accent">Ativo</span>' : ''}
        </div>
      </div>
      <div class="plan-card-actions">
        <button class="plan-apply-btn" data-key="${t.templateKey}">Aplicar</button>
      </div>
    </div>`;
  });

  if(state.plansCache.size){
    html += `<div class="ex-section-header">Meus planos</div>`;
    state.plansCache.forEach((plan, id) => {
      const isActive = state.currentPlanId === id;
      const daysSummary = (plan.days||[]).map(d => d.type).join(' \u00b7 ');
      html += `<div class="plan-card ${isActive?'active-plan':''}" data-id="${id}">
        <div class="plan-card-body">
          <div class="plan-card-name">${esc(plan.name)}</div>
          <div class="plan-card-meta">
            <span class="ex-tag">${daysSummary}</span>
            ${isActive ? '<span class="ex-tag accent">Ativo</span>' : ''}
          </div>
        </div>
        <div class="plan-card-actions">
          <button class="ex-icon-btn plan-edit-btn" data-id="${id}" title="Editar">\u270e</button>
          <button class="ex-icon-btn plan-delete-btn" data-id="${id}" title="Excluir">\u2715</button>
          <button class="plan-apply-btn" data-id="${id}">Aplicar</button>
        </div>
      </div>`;
    });
  }

  $plansSection.innerHTML = html;

  document.getElementById("newPlanBtn").addEventListener("click", () => openPlanEditor(null));

  $plansSection.querySelectorAll(".plan-apply-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const id = btn.dataset.id;
      if(key){
        const tpl = PLAN_TEMPLATES.find(t => t.templateKey === key);
        if(tpl) openApplyPlanModal(tpl, null);
      } else if(id){
        const plan = state.plansCache.get(id);
        if(plan) openApplyPlanModal(plan, id);
      }
    });
  });

  $plansSection.querySelectorAll(".plan-edit-btn").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); openPlanEditor(btn.dataset.id); });
  });

  $plansSection.querySelectorAll(".plan-delete-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const plan = state.plansCache.get(id);
      if(!plan || !confirm(`Excluir plano "${plan.name}"?`)) return;
      try{
        await deletePlanDoc(id);
        state.plansCache.delete(id);
        if(state.currentPlanId === id){ state.currentPlanId = null; state.currentPlanName = null; savePref(); }
        renderPlansSection();
      }catch(e){ alert("Erro: " + e.message); }
    });
  });
}

// ========= Apply plan modal =========

function openApplyPlanModal(plan, planDocId){
  const dayTypes = plan.days || [];
  const weekdays = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  const autoMap = dayTypes.length === 5 || dayTypes.length === 7;

  let html = `<h3>Aplicar plano</h3>`;
  html += `<p style="color:var(--muted);font-size:13px;margin-bottom:16px">${esc(plan.name)}</p>`;
  html += `<p style="color:var(--muted);font-size:12px;margin-bottom:14px">Associe cada tipo de dia a um dia da semana. Dias n\u00e3o mapeados ser\u00e3o dias de descanso.</p>`;

  dayTypes.forEach((d, i) => {
    const defaultDay = autoMap ? i : -1;
    html += `<div class="day-map-row">
      <span class="day-map-type">${d.type}</span>
      <span class="day-map-label">${esc(d.label)} (${d.exercises.length} ex.)</span>
      <select class="day-map-select" data-idx="${i}">
        <option value="">— Selecionar —</option>
        ${weekdays.map((w,wi) => `<option value="${wi}" ${defaultDay===wi?'selected':''}>${w}</option>`).join("")}
      </select>
    </div>`;
  });

  html += `<div class="modal-error" id="applyError" style="display:none"></div>`;
  html += `<div class="modal-footer">
    <button class="modal-btn primary" id="applyConfirm">Aplicar</button>
    <button class="modal-btn secondary" id="applyCancel">Cancelar</button>
  </div>`;

  $applyPlanModalInner.innerHTML = html;
  $applyPlanModal.classList.add("open");

  const closeApply = () => $applyPlanModal.classList.remove("open");
  document.getElementById("applyCancel").addEventListener("click", closeApply);
  $applyPlanModal.addEventListener("click", e => { if(e.target === $applyPlanModal) closeApply(); });

  document.getElementById("applyConfirm").addEventListener("click", async () => {
    const errEl = document.getElementById("applyError");
    errEl.style.display = "none";

    const mapping = [];
    const usedWeekdays = new Set();
    let valid = true;

    $applyPlanModalInner.querySelectorAll(".day-map-select").forEach(sel => {
      if(!valid) return;
      const idx = +sel.dataset.idx;
      const val = sel.value;
      if(val === ''){
        errEl.textContent = `Selecione um dia para o tipo ${dayTypes[idx].type}.`;
        errEl.style.display = ""; valid = false; return;
      }
      const weekday = +val;
      if(usedWeekdays.has(weekday)){
        errEl.textContent = `O dia ${weekdays[weekday]} foi selecionado mais de uma vez.`;
        errEl.style.display = ""; valid = false; return;
      }
      usedWeekdays.add(weekday);
      mapping.push({ dayTypeIdx: idx, weekday });
    });

    if(!valid) return;

    const $confirmBtn = document.getElementById("applyConfirm");
    const $cancelBtn = document.getElementById("applyCancel");
    $confirmBtn.disabled = true;
    $confirmBtn.classList.add("loading");
    $confirmBtn.innerHTML = '<span class="spinner"></span>Aplicando…';
    $cancelBtn.disabled = true;
    $cancelBtn.style.opacity = ".4";
    $cancelBtn.style.pointerEvents = "none";

    try{
      await applyPlan(plan, planDocId, mapping);
      closeApply();
    }catch(e){
      $confirmBtn.disabled = false;
      $confirmBtn.classList.remove("loading");
      $confirmBtn.textContent = "Aplicar";
      $cancelBtn.disabled = false;
      $cancelBtn.style.opacity = "";
      $cancelBtn.style.pointerEvents = "";
      errEl.textContent = "Erro: " + e.message;
      errEl.style.display = "";
    }
  });
}

async function preserveCurrentAsCustomPlan(){
  if(!state.user || state.exercisesCatalog.size === 0) return;

  const typeLetters = ['A','B','C','D','E','F','G'];
  const days = activeDays();
  const dayTypes = [];

  days.forEach((d) => {
    if(d.ex.length === 0) return;
    const exercises = d.ex.map(e => ({
      name: e.name, muscle: e.muscle,
      reps: [...(e.reps||[])],
      badges: [...(e.badges||[])],
      note: e.note || null,
      superset: e.superset ? {
        name: e.superset.name, muscle: e.superset.muscle,
        reps: [...(e.superset.reps||[])],
        badges: [...(e.superset.badges||[])],
        note: e.superset.note || null,
      } : null,
    }));
    dayTypes.push({
      type: typeLetters[dayTypes.length] || String(dayTypes.length),
      label: d.tag || d.focus || d.name,
      exercises,
    });
  });

  if(!dayTypes.length) return;

  const planName = state.currentPlanName || "Treino anterior";
  const planData = { name: planName, source: "custom", days: dayTypes };

  let existingId = null;
  state.plansCache.forEach((p, id) => { if(p.name === planName) existingId = id; });

  const id = await savePlanDoc(existingId, planData);
  state.plansCache.set(id, { ...planData });
}

async function applyPlan(plan, planDocId, mapping){
  if(!state.user) return;

  // 1. Preserve current workout
  await preserveCurrentAsCustomPlan();

  // 2. Delete all current exercises
  const delPromises = [];
  state.exercisesCatalog.forEach((_, id) => delPromises.push(deleteExerciseDoc(id)));
  await Promise.all(delPromises);
  state.exercisesCatalog.clear();

  // 3. Create new exercises — deduplicate by name, merge days
  const byName = new Map();
  mapping.forEach(({ dayTypeIdx, weekday }) => {
    const dayType = plan.days[dayTypeIdx];
    dayType.exercises.forEach((e, ei) => {
      if(!byName.has(e.name)){
        byName.set(e.name, {
          name: e.name, muscle: e.muscle,
          reps: [...(e.reps||[12,10,8])],
          badges: [...(e.badges||[])],
          note: e.note || null, active: true,
          days: [weekday], orderByDay: { [weekday]: ei },
          superset: e.superset ? {
            name: e.superset.name, muscle: e.superset.muscle || e.muscle,
            reps: [...(e.superset.reps||[])],
            badges: [...(e.superset.badges||[])],
            note: e.superset.note || null,
          } : null,
        });
      } else {
        const existing = byName.get(e.name);
        if(!existing.days.includes(weekday)){
          existing.days.push(weekday);
          existing.orderByDay[weekday] = ei;
        }
      }
    });
  });

  const colRef = collection(db, "users", state.user.uid, "exercises");
  const addPromises = [];
  byName.forEach(exData => {
    addPromises.push(
      addDoc(colRef, { ...exData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        .then(ref => state.exercisesCatalog.set(ref.id, exData))
    );
  });
  await Promise.all(addPromises);

  // 4. Update day customizations
  for(let dk = 0; dk < 5; dk++){
    const mappedItem = mapping.find(m => m.weekday === dk);
    if(mappedItem){
      const dayType = plan.days[mappedItem.dayTypeIdx];
      await saveDayCustomization(dk, dayType.label, dayType.label);
    } else {
      await saveDayCustomization(dk, "Descanso", "Dia de descanso");
    }
  }

  // 5. Update plan pointer
  state.currentPlanName = plan.name;
  if(planDocId){
    state.currentPlanId = planDocId; state.currentPlanKey = null;
  } else if(plan.templateKey){
    state.currentPlanKey = plan.templateKey; state.currentPlanId = null;
  } else {
    state.currentPlanId = null; state.currentPlanKey = null;
  }
  await savePref();

  // 6. Rebuild and re-render
  rebuildUserDays();
  renderStrip();
  state.session = null;
  await loadDay(state.current);
  renderPlansSection();
}

// ========= Plan editor modal =========

function openPlanEditor(planDocId){
  const isNew = !planDocId;
  let plan;

  if(isNew){
    plan = { name: "", source: "custom", days: [
      { type: "A", label: "", exercises: [{name:"",muscle:"peito",reps:[10,10,10]}] }
    ]};
  } else {
    plan = JSON.parse(JSON.stringify(state.plansCache.get(planDocId)));
  }

  function renderPlanEditorContent(){
    let html = `<h3>${isNew ? 'Novo plano' : 'Editar plano'}</h3>`;
    html += `<div class="modal-field">
      <label>Nome do plano</label>
      <input class="modal-input" id="pfName" value="${esc(plan.name)}" placeholder="Ex: Push Pull Legs">
    </div>`;
    html += `<div class="modal-field"><label>Dias do plano</label></div>`;

    plan.days.forEach((d, di) => {
      html += `<div class="plan-day-type" data-di="${di}">
        <div class="plan-day-type-header">
          <span class="plan-day-type-letter">${d.type}</span>
          <input class="plan-day-type-label-input" data-di="${di}" value="${esc(d.label)}" placeholder="Ex: Push, Pull, Legs...">
          ${plan.days.length > 1 ? `<button class="plan-remove-day" data-di="${di}" title="Remover dia">\u2715</button>` : ''}
        </div>`;

      d.exercises.forEach((e, ei) => {
        html += `<div class="plan-ex-row" data-di="${di}" data-ei="${ei}">
          <div class="ac-wrap plan-ex-name-wrap">
            <input class="plan-ex-name" value="${esc(e.name)}" placeholder="Nome do exerc\u00edcio" data-di="${di}" data-ei="${ei}" autocomplete="off">
            <div class="ac-list"></div>
          </div>
          <select class="plan-ex-muscle" data-di="${di}" data-ei="${ei}">
            ${Object.entries(MUSCLE_LABEL).map(([k,v]) => `<option value="${k}" ${e.muscle===k?'selected':''}>${v}</option>`).join("")}
          </select>
          <input class="plan-ex-reps" value="${(e.reps||[]).join(',')}" placeholder="8,8,8" data-di="${di}" data-ei="${ei}" title="Reps separadas por v\u00edrgula">
          <button class="plan-ex-remove" data-di="${di}" data-ei="${ei}" title="Remover">\u2715</button>
        </div>`;
      });

      html += `<button class="plan-add-ex-btn" data-di="${di}">+ Exerc\u00edcio</button>`;
      html += `</div>`;
    });

    if(plan.days.length < 7){
      html += `<button class="plan-add-day-btn" id="pfAddDay">+ Adicionar dia</button>`;
    }

    html += `<div class="modal-error" id="pfError" style="display:none"></div>`;
    html += `<div class="modal-footer">
      <button class="modal-btn primary" id="pfSave">Salvar</button>
      <button class="modal-btn secondary" id="pfCancel">Cancelar</button>
      ${!isNew ? `<button class="modal-btn danger" id="pfDelete">Excluir</button>` : ''}
    </div>`;

    $planModalInner.innerHTML = html;
    bindPlanEditorEvents();
  }

  function syncPlanFromUI(){
    const nameEl = document.getElementById("pfName");
    if(nameEl) plan.name = nameEl.value.trim();

    $planModalInner.querySelectorAll(".plan-day-type").forEach(dtEl => {
      const di = +dtEl.dataset.di;
      if(!plan.days[di]) return;
      const labelInput = dtEl.querySelector(".plan-day-type-label-input");
      if(labelInput) plan.days[di].label = labelInput.value.trim();

      const exRows = dtEl.querySelectorAll(".plan-ex-row");
      const exercises = [];
      exRows.forEach(exRow => {
        const nameInput = exRow.querySelector(".plan-ex-name");
        const muscleSelect = exRow.querySelector(".plan-ex-muscle");
        const repsInput = exRow.querySelector(".plan-ex-reps");
        exercises.push({
          name: nameInput ? nameInput.value.trim() : "",
          muscle: muscleSelect ? muscleSelect.value : "peito",
          reps: repsInput ? repsInput.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0) : [10,10,10],
          badges: [], note: null, superset: null,
        });
      });
      plan.days[di].exercises = exercises;
    });
  }

  function bindPlanEditorEvents(){
    bindPlanExAutocomplete();
    document.getElementById("pfCancel").addEventListener("click", closePlanEditor);

    function bindPlanExAutocomplete(){
      $planModalInner.querySelectorAll(".plan-ex-name").forEach(inp => {
        const wrap = inp.closest(".ac-wrap");
        const list = wrap && wrap.querySelector(".ac-list");
        const row = inp.closest(".plan-ex-row");
        const mSel = row && row.querySelector(".plan-ex-muscle");
        if(!list) return;
        let activeIdx = -1;

        function filter(q){
          if(!q || q.length < 1){ list.classList.remove("open"); return; }
          const nq = stripDiacritics(q);
          const prefix = [], sub = [];
          EXERCISE_CATALOG.forEach(c => {
            const nc = stripDiacritics(c.name);
            if(nc.startsWith(nq)) prefix.push(c);
            else if(nc.includes(nq)) sub.push(c);
          });
          const results = prefix.concat(sub).slice(0, 8);
          if(!results.length){ list.classList.remove("open"); return; }
          activeIdx = -1;
          list.innerHTML = results.map((c,i) =>
            `<div class="ac-item" data-i="${i}" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}<span class="ac-muscle">${esc(MUSCLE_LABEL[c.muscle]||c.muscle)}</span></div>`
          ).join("");
          list.classList.add("open");
          list.querySelectorAll(".ac-item").forEach(el => {
            el.addEventListener("mousedown", e => { e.preventDefault(); pick(el.dataset.name, el.dataset.muscle); });
          });
        }
        function pick(name, muscle){
          inp.value = name;
          if(mSel && muscle) mSel.value = muscle;
          list.classList.remove("open");
        }
        inp.addEventListener("input", () => filter(inp.value.trim()));
        inp.addEventListener("focus", () => { if(inp.value.trim()) filter(inp.value.trim()); });
        inp.addEventListener("blur", () => { setTimeout(() => list.classList.remove("open"), 150); });
        inp.addEventListener("keydown", e => {
          const items = list.querySelectorAll(".ac-item");
          if(!items.length || !list.classList.contains("open")) return;
          if(e.key === "ArrowDown"){ e.preventDefault(); activeIdx = Math.min(activeIdx+1, items.length-1); }
          else if(e.key === "ArrowUp"){ e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); }
          else if(e.key === "Enter" && activeIdx >= 0){ e.preventDefault(); pick(items[activeIdx].dataset.name, items[activeIdx].dataset.muscle); return; }
          else if(e.key === "Escape"){ list.classList.remove("open"); return; }
          else return;
          items.forEach((it,i) => it.classList.toggle("active", i === activeIdx));
        });
      });
    }
    $planModal.addEventListener("click", e => { if(e.target === $planModal) closePlanEditor(); });

    $planModalInner.querySelectorAll(".plan-add-ex-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        const di = +btn.dataset.di;
        plan.days[di].exercises.push({name:"",muscle:"peito",reps:[10,10,10],badges:[],note:null,superset:null});
        renderPlanEditorContent();
      });
    });

    $planModalInner.querySelectorAll(".plan-ex-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        const di = +btn.dataset.di, ei = +btn.dataset.ei;
        plan.days[di].exercises.splice(ei, 1);
        renderPlanEditorContent();
      });
    });

    const addDayBtn = document.getElementById("pfAddDay");
    if(addDayBtn){
      addDayBtn.addEventListener("click", () => {
        syncPlanFromUI();
        const typeLetters = 'ABCDEFGHIJ';
        plan.days.push({ type: typeLetters[plan.days.length] || String(plan.days.length), label: "", exercises: [{name:"",muscle:"peito",reps:[10,10,10]}] });
        renderPlanEditorContent();
        requestAnimationFrame(() => {
          $planModalInner.scrollTo({ top: $planModalInner.scrollHeight, behavior: "smooth" });
        });
      });
    }

    $planModalInner.querySelectorAll(".plan-remove-day").forEach(btn => {
      btn.addEventListener("click", () => {
        syncPlanFromUI();
        plan.days.splice(+btn.dataset.di, 1);
        const typeLetters = 'ABCDEFGHIJ';
        plan.days.forEach((d, i) => d.type = typeLetters[i] || String(i));
        renderPlanEditorContent();
      });
    });

    document.getElementById("pfSave").addEventListener("click", async () => {
      syncPlanFromUI();
      const errEl = document.getElementById("pfError");
      errEl.style.display = "none";

      if(!plan.name){
        errEl.textContent = "Nome \u00e9 obrigat\u00f3rio."; errEl.style.display = ""; return;
      }

      for(const d of plan.days){
        d.exercises = d.exercises.filter(e => e.name);
        if(!d.exercises.length){
          errEl.textContent = `Dia ${d.type} precisa de pelo menos 1 exerc\u00edcio.`;
          errEl.style.display = ""; return;
        }
      }

      try{
        const data = { name: plan.name, source: "custom", days: plan.days };
        const id = await savePlanDoc(planDocId, data);
        state.plansCache.set(id, { ...data });
        closePlanEditor();
        renderPlansSection();
      }catch(e){
        errEl.textContent = "Erro: " + e.message;
        errEl.style.display = "";
      }
    });

    if(!isNew){
      const delBtn = document.getElementById("pfDelete");
      if(delBtn){
        delBtn.addEventListener("click", async () => {
          if(!confirm(`Excluir plano "${plan.name}"?`)) return;
          try{
            await deletePlanDoc(planDocId);
            state.plansCache.delete(planDocId);
            if(state.currentPlanId === planDocId){ state.currentPlanId = null; state.currentPlanName = null; savePref(); }
            closePlanEditor();
            renderPlansSection();
          }catch(e){ alert("Erro: " + e.message); }
        });
      }
    }
  }

  renderPlanEditorContent();
  $planModal.classList.add("open");
}

function closePlanEditor(){
  $planModal.classList.remove("open");
}

// ========= Exercise editor modal =========

function openExEditor(docId){
  const isNew = !docId;
  const ex = isNew ? {
    name:"", muscle:"ombro", reps:[12,10,8], badges:[], note:null,
    active:true, days:[], orderByDay:{}, superset:null,
  } : {...state.exercisesCatalog.get(docId)};

  let html = `<h3>${isNew ? 'Novo exercício' : 'Editar exercício'}</h3>`;

  // Nome
  html += `<div class="modal-field">
    <label>Nome</label>
    <div class="ac-wrap">
      <input class="modal-input" id="mfName" value="${esc(ex.name)}" placeholder="Nome do exercício" autocomplete="off">
      <div class="ac-list" id="acName"></div>
    </div>
  </div>`;

  // Grupo muscular
  html += `<div class="modal-field">
    <label>Grupo muscular</label>
    <select class="modal-select" id="mfMuscle">
      ${Object.entries(MUSCLE_LABEL).map(([k,v]) => `<option value="${k}" ${ex.muscle===k?'selected':''}>${v}</option>`).join("")}
    </select>
  </div>`;

  // Reps
  html += `<div class="modal-field">
    <label>Repetições por série</label>
    <div class="reps-list" id="mfReps">
      ${(ex.reps||[12]).map((r,i) => `<input class="rep-input" type="number" inputmode="numeric" value="${r}" min="1">`).join("")}
      <button class="rep-add" type="button" id="mfRepAdd">+</button>
    </div>
  </div>`;

  // Badges
  html += `<div class="modal-field">
    <label>Badges</label>
    <div class="badge-toggles" id="mfBadges">
      ${["drop","iso","fast"].map(b => `<span class="badge-toggle ${(ex.badges||[]).includes(b)?'selected':''}" data-badge="${b}">${BADGE_LABEL[b]}</span>`).join("")}
    </div>
  </div>`;

  // Nota
  html += `<div class="modal-field">
    <label>Observação</label>
    <textarea class="modal-textarea" id="mfNote" placeholder="Opcional">${esc(ex.note)}</textarea>
  </div>`;

  // Dias
  html += `<div class="modal-field">
    <label>Dias</label>
    <div class="day-chips" id="mfDays">
      ${DAY_NAMES_SHORT.map((d,i) => `<span class="day-chip ${(ex.days||[]).includes(i)?'selected':''}" data-day="${i}">${d}</span>`).join("")}
    </div>
  </div>`;

  // Ativo
  html += `<div class="modal-field" style="display:flex;align-items:center;gap:10px">
    <label style="margin-bottom:0">Ativo</label>
    <label class="switch"><input type="checkbox" id="mfActive" ${ex.active!==false?'checked':''}><span class="slider"></span></label>
  </div>`;

  // Supersérie
  const sup = ex.superset || {name:"",muscle:"ombro",reps:[12,10,8],badges:[],note:null};
  const hasSup = !!ex.superset;
  html += `<div class="modal-field">
    <button class="superset-toggle" type="button" id="mfSupToggle">
      <span id="mfSupArrow">${hasSup?'▼':'▶'}</span> Supersérie
    </button>
    <div class="superset-fields ${hasSup?'open':''}" id="mfSupFields">
      <div class="modal-field">
        <label>Nome</label>
        <div class="ac-wrap">
          <input class="modal-input" id="mfSupName" value="${esc(sup.name)}" placeholder="Nome da supersérie" autocomplete="off">
          <div class="ac-list" id="acSupName"></div>
        </div>
      </div>
      <div class="modal-field">
        <label>Grupo muscular</label>
        <select class="modal-select" id="mfSupMuscle">
          ${Object.entries(MUSCLE_LABEL).map(([k,v]) => `<option value="${k}" ${sup.muscle===k?'selected':''}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="modal-field">
        <label>Repetições por série</label>
        <div class="reps-list" id="mfSupReps">
          ${(sup.reps||[12]).map(r => `<input class="rep-input" type="number" inputmode="numeric" value="${r}" min="1">`).join("")}
          <button class="rep-add" type="button" id="mfSupRepAdd">+</button>
        </div>
      </div>
      <div class="modal-field">
        <label>Badges</label>
        <div class="badge-toggles" id="mfSupBadges">
          ${["drop","iso","fast"].map(b => `<span class="badge-toggle ${(sup.badges||[]).includes(b)?'selected':''}" data-badge="${b}">${BADGE_LABEL[b]}</span>`).join("")}
        </div>
      </div>
      <div class="modal-field">
        <label>Observação</label>
        <textarea class="modal-textarea" id="mfSupNote" placeholder="Opcional">${esc(sup.note)}</textarea>
      </div>
    </div>
  </div>`;

  // Error
  html += `<div class="modal-error" id="mfError" style="display:none"></div>`;

  // Footer
  html += `<div class="modal-footer">
    <button class="modal-btn primary" id="mfSave">Salvar</button>
    <button class="modal-btn secondary" id="mfCancel">Cancelar</button>
    ${!isNew ? `<button class="modal-btn danger" id="mfDelete">Excluir</button>` : ''}
  </div>`;

  $exModalInner.innerHTML = html;
  $exModal.classList.add("open");

  // Event bindings
  const bindRepsAdd = (containerId, addBtnId) => {
    const container = document.getElementById(containerId);
    const addBtn = document.getElementById(addBtnId);
    addBtn.addEventListener("click", () => {
      const inputs = container.querySelectorAll(".rep-input");
      const lastVal = inputs.length ? inputs[inputs.length-1].value : "10";
      const inp = document.createElement("input");
      inp.className = "rep-input"; inp.type = "number"; inp.inputMode = "numeric";
      inp.value = lastVal; inp.min = "1";
      container.insertBefore(inp, addBtn);
      // add remove on double tap
      inp.addEventListener("dblclick", () => { if(container.querySelectorAll(".rep-input").length > 1) inp.remove(); });
    });
    container.querySelectorAll(".rep-input").forEach(inp => {
      inp.addEventListener("dblclick", () => { if(container.querySelectorAll(".rep-input").length > 1) inp.remove(); });
    });
  };
  bindRepsAdd("mfReps","mfRepAdd");
  bindRepsAdd("mfSupReps","mfSupRepAdd");

  // badge toggles
  const bindBadges = (containerId) => {
    document.getElementById(containerId).querySelectorAll(".badge-toggle").forEach(el => {
      el.addEventListener("click", () => el.classList.toggle("selected"));
    });
  };
  bindBadges("mfBadges");
  bindBadges("mfSupBadges");

  // day chips
  document.getElementById("mfDays").querySelectorAll(".day-chip").forEach(el => {
    el.addEventListener("click", () => el.classList.toggle("selected"));
  });

  // superset toggle
  document.getElementById("mfSupToggle").addEventListener("click", () => {
    const f = document.getElementById("mfSupFields");
    const a = document.getElementById("mfSupArrow");
    f.classList.toggle("open");
    a.textContent = f.classList.contains("open") ? "▼" : "▶";
  });

  // autocomplete helper
  function bindAutocomplete(inputId, listId, muscleSelectId){
    const inp = document.getElementById(inputId);
    const list = document.getElementById(listId);
    const mSel = document.getElementById(muscleSelectId);
    let activeIdx = -1;

    function filter(q){
      if(!q || q.length < 1){ list.classList.remove("open"); return; }
      const nq = stripDiacritics(q);
      const prefix = [], sub = [];
      EXERCISE_CATALOG.forEach(c => {
        const nc = stripDiacritics(c.name);
        if(nc.startsWith(nq)) prefix.push(c);
        else if(nc.includes(nq)) sub.push(c);
      });
      const results = prefix.concat(sub).slice(0, 8);
      if(!results.length){ list.classList.remove("open"); return; }
      activeIdx = -1;
      list.innerHTML = results.map((c,i) =>
        `<div class="ac-item" data-i="${i}" data-name="${esc(c.name)}" data-muscle="${esc(c.muscle)}">${esc(c.name)}<span class="ac-muscle">${esc(MUSCLE_LABEL[c.muscle]||c.muscle)}</span></div>`
      ).join("");
      list.classList.add("open");
      list.querySelectorAll(".ac-item").forEach(el => {
        el.addEventListener("mousedown", e => {
          e.preventDefault();
          pick(el.dataset.name, el.dataset.muscle);
        });
      });
    }

    function pick(name, muscle){
      inp.value = name;
      if(mSel) mSel.value = muscle;
      list.classList.remove("open");
    }

    inp.addEventListener("input", () => filter(inp.value.trim()));
    inp.addEventListener("focus", () => { if(inp.value.trim()) filter(inp.value.trim()); });
    inp.addEventListener("blur", () => { setTimeout(() => list.classList.remove("open"), 150); });
    inp.addEventListener("keydown", e => {
      const items = list.querySelectorAll(".ac-item");
      if(!items.length || !list.classList.contains("open")) return;
      if(e.key === "ArrowDown"){ e.preventDefault(); activeIdx = Math.min(activeIdx+1, items.length-1); }
      else if(e.key === "ArrowUp"){ e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); }
      else if(e.key === "Enter" && activeIdx >= 0){ e.preventDefault(); pick(items[activeIdx].dataset.name, items[activeIdx].dataset.muscle); return; }
      else if(e.key === "Escape"){ list.classList.remove("open"); return; }
      else return;
      items.forEach((it,i) => it.classList.toggle("active", i === activeIdx));
    });
  }
  bindAutocomplete("mfName","acName","mfMuscle");
  bindAutocomplete("mfSupName","acSupName","mfSupMuscle");

  // cancel
  document.getElementById("mfCancel").addEventListener("click", closeExEditor);
  $exModal.addEventListener("click", e => { if(e.target === $exModal) closeExEditor(); });
  document.addEventListener("keydown", escHandler);

  // save
  document.getElementById("mfSave").addEventListener("click", async () => {
    const errEl = document.getElementById("mfError");
    errEl.style.display = "none";
    const name = document.getElementById("mfName").value.trim();
    const muscle = document.getElementById("mfMuscle").value;
    const reps = [...document.querySelectorAll("#mfReps .rep-input")].map(i => Math.max(1, parseInt(i.value)||1));
    const badges = [...document.querySelectorAll("#mfBadges .badge-toggle.selected")].map(el => el.dataset.badge);
    const note = document.getElementById("mfNote").value.trim() || null;
    const days = [...document.querySelectorAll("#mfDays .day-chip.selected")].map(el => Number(el.dataset.day));
    const active = document.getElementById("mfActive").checked;

    // superset
    const supOpen = document.getElementById("mfSupFields").classList.contains("open");
    const supName = document.getElementById("mfSupName").value.trim();
    let superset = null;
    if(supOpen && supName){
      superset = {
        name: supName,
        muscle: document.getElementById("mfSupMuscle").value,
        reps: [...document.querySelectorAll("#mfSupReps .rep-input")].map(i => Math.max(1, parseInt(i.value)||1)),
        badges: [...document.querySelectorAll("#mfSupBadges .badge-toggle.selected")].map(el => el.dataset.badge),
        note: document.getElementById("mfSupNote").value.trim() || null,
      };
    }

    // validation
    if(!name){ errEl.textContent = "Nome é obrigatório."; errEl.style.display = ""; return; }
    if(reps.length < 1){ errEl.textContent = "Adicione ao menos 1 série."; errEl.style.display = ""; return; }
    if(days.length < 1){ errEl.textContent = "Selecione ao menos 1 dia."; errEl.style.display = ""; return; }

    // compute orderByDay for new days (append to end)
    const orderByDay = docId ? {...(state.exercisesCatalog.get(docId)?.orderByDay || {})} : {};
    days.forEach(dk => {
      if(orderByDay[dk] == null){
        // find max order for this day
        let maxOrder = -1;
        state.exercisesCatalog.forEach(ex => {
          if(ex.days?.includes(dk) && ex.orderByDay?.[dk] != null && ex.orderByDay[dk] > maxOrder)
            maxOrder = ex.orderByDay[dk];
        });
        orderByDay[dk] = maxOrder + 1;
      }
    });
    // remove orderByDay for days no longer assigned
    Object.keys(orderByDay).forEach(k => {
      if(!days.includes(Number(k))) delete orderByDay[k];
    });

    const data = { name, muscle, reps, badges, note, active, days, orderByDay, superset };

    try {
      const id = await saveExerciseDoc(docId, data);
      state.exercisesCatalog.set(id, { ...data, createdAt: state.exercisesCatalog.get(id)?.createdAt || null });
      rebuildUserDays();
      closeExEditor();
      renderExercicios();
    } catch(e) {
      errEl.textContent = "Erro ao salvar: " + e.message;
      errEl.style.display = "";
    }
  });

  // delete
  if(!isNew){
    document.getElementById("mfDelete").addEventListener("click", async () => {
      if(!confirm(`Excluir "${ex.name}" permanentemente?`)) return;
      try {
        await deleteExerciseDoc(docId);
        state.exercisesCatalog.delete(docId);
        rebuildUserDays();
        closeExEditor();
        renderExercicios();
      } catch(e) { alert("Erro ao excluir: " + e.message); }
    });
  }
}

function escHandler(e){ if(e.key === "Escape") closeExEditor(); }
function closeExEditor(){
  $exModal.classList.remove("open");
  document.removeEventListener("keydown", escHandler);
}

// ========= Share PDF =========

$btnSharePdf.addEventListener("click", buildAndSharePdf);

async function buildAndSharePdf(){
  if(state.sharingPdf) return;
  state.sharingPdf = true;
  $btnSharePdf.disabled = true;
  try { await _buildAndSharePdf(); } finally { state.sharingPdf = false; $btnSharePdf.disabled = false; }
}

async function _buildAndSharePdf(){
  const days = activeDays().filter(d => d.ex && d.ex.length > 0);
  if(!days.length){ alert("Nenhum dia de treino para exportar."); return; }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:"mm", format:"a4" });
  const pw = 210, ph = 297, mx = 16, my = 16;
  const cw = pw - mx * 2;
  let y = my;
  let pg = 1;

  function checkPage(need){
    if(y + need > ph - my){
      drawFooter();
      pdf.addPage();
      pg++;
      y = my;
    }
  }

  function drawFooter(){
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text("strength-split", mx, ph - 8);
    pdf.text(String(pg), pw - mx, ph - 8, { align:"right" });
  }

  function fmtDate(d){
    return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });
  }

  const planName = state.currentPlanName || "Meu Treino";
  const today = new Date();

  // Header
  pdf.setFont("helvetica","bold");
  pdf.setFontSize(22);
  pdf.setTextColor(255, 90, 31);
  pdf.text("STRENGTH SPLIT", mx, y);
  y += 8;

  pdf.setFont("helvetica","normal");
  pdf.setFontSize(13);
  pdf.setTextColor(60);
  pdf.text(planName, mx, y);
  y += 6;

  pdf.setFontSize(10);
  pdf.setTextColor(140);
  pdf.text(fmtDate(today), mx, y);
  y += 12;

  // Days
  days.forEach(day => {
    checkPage(24);

    // Day heading
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(14);
    pdf.setTextColor(30);
    pdf.text(day.name, mx, y);

    const tagText = day.tag || day.focus || "";
    if(tagText){
      const nameW = pdf.getTextWidth(day.name);
      pdf.setFont("helvetica","normal");
      pdf.setFontSize(10);
      pdf.setTextColor(140);
      pdf.text("  " + tagText, mx + nameW, y);
    }
    y += 3;
    pdf.setDrawColor(220);
    pdf.line(mx, y, pw - mx, y);
    y += 6;

    day.ex.forEach((ex, idx) => {
      checkPage(18);
      renderExerciseLine(pdf, ex, idx + 1, mx, false);

      if(ex.superset){
        checkPage(14);
        renderExerciseLine(pdf, ex.superset, null, mx, true);
      }
    });

    y += 6;
  });

  drawFooter();

  function renderExerciseLine(p, ex, num, lx, isSuperset){
    const indent = isSuperset ? 8 : 0;
    const x = lx + indent;

    // Prefix
    if(isSuperset){
      p.setFont("helvetica","italic");
      p.setFontSize(9);
      p.setTextColor(255, 90, 31);
      p.text("+ Supersérie", x, y);
      y += 4.5;
    }

    // Name line
    p.setFont("helvetica","bold");
    p.setFontSize(10);
    p.setTextColor(30);
    const prefix = num ? num + ". " : "";
    p.text(prefix + ex.name, x, y);

    // Muscle tag
    const muscleLabel = MUSCLE_LABEL[ex.muscle] || ex.muscle || "";
    if(muscleLabel){
      const nameW = p.getTextWidth(prefix + ex.name);
      p.setFont("helvetica","normal");
      p.setFontSize(8);
      p.setTextColor(120);
      p.text("  " + muscleLabel, x + nameW, y);
    }
    y += 5;

    // Reps
    if(ex.reps && ex.reps.length){
      p.setFont("helvetica","normal");
      p.setFontSize(9);
      p.setTextColor(80);
      const repsStr = ex.reps.length + "× " + ex.reps.join("·");
      p.text(repsStr, x, y);
      y += 4.5;
    }

    // Badges
    const badges = (ex.badges || []).filter(b => BADGE_LABEL[b]);
    if(badges.length){
      p.setFont("helvetica","italic");
      p.setFontSize(8);
      p.setTextColor(140);
      p.text(badges.map(b => BADGE_LABEL[b]).join(" | "), x, y);
      y += 4.5;
    }

    // Note
    if(ex.note){
      p.setFont("helvetica","italic");
      p.setFontSize(8);
      p.setTextColor(160);
      const noteLines = p.splitTextToSize(ex.note, cw - indent);
      noteLines.forEach(ln => {
        checkPage(5);
        p.text(ln, x, y);
        y += 4;
      });
      y += 0.5;
    }

    y += 2;
  }

  // Share or download
  const dateStr = today.toISOString().slice(0,10);
  const slug = (state.currentPlanName || "treino").toLowerCase().replace(/\s+/g, "-");
  const filename = `strength-split-${slug}-${dateStr}.pdf`;

  try {
    const blob = pdf.output("blob");
    const file = new File([blob], filename, { type:"application/pdf" });
    if(navigator.canShare && navigator.canShare({ files:[file] })){
      await navigator.share({ files:[file], title:"Meu treino", text: planName });
    } else {
      pdf.save(filename);
    }
  } catch(e){
    if(e.name !== "AbortError") alert("Erro ao gerar PDF: " + e.message);
  }
}

applyTheme();
applyModeButtons();
renderStrip();
