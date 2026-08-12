// Single mutable store for app state. Modules read and write `state.x`.
// Anything that must survive a reload lives in Firestore, not here.
function makeInitialState(){
  return {
    user: null,
    current: 0,
    session: null,      // documento da sessão atual
    prevSession: null,  // sessão anterior para o mesmo dia (referência de carga)
    saveTimer: null,
    viewMode: "load",   // "load" | "compact" — preferência de visualização
    // Train mode — ephemeral session UI state. NEVER persisted (not in savePref/loadPref).
    trainMode: false,
    trainIdx: 0,
    _trainScrollT: null,
    // Set when a brand-new account's exercise catalog is empty, to show the onboarding
    // picker. Ephemeral UI state — NEVER persisted (not in savePref/loadPref).
    needsOnboarding: false,
    // Set right after applyPlan finishes, to nudge the user to review the freshly
    // applied program from the Treino day view. Ephemeral UI state — NEVER persisted
    // (not in savePref/loadPref); cleared on day navigation or when the banner is
    // opened/dismissed.
    showProgramReviewHint: false,
    // Set of one-time tip IDs the user has dismissed or superseded by the
    // corresponding action (e.g. "firstRun" for the "Iniciar treino" coach-mark).
    // Persisted as an array (savePref/loadPref) so seen tips don't come back after
    // a reload. See features/tips.js.
    tipsSeen: new Set(),
    theme: (function(){
      try{ var t = localStorage.getItem("ss_theme"); return (t === "dark" || t === "light") ? t : null; }
      catch(_){ return null; }
    })(),                    // "dark" | "light" — null = segue o sistema
    allSessions: null,  // cache: sessões do usuário (mais recente primeiro) — extensão variável, ver sessionsLoadedSince
    allSessionsError: false,
    // How far back allSessions currently covers: null = nothing loaded, "YYYY-MM-DD" =
    // earliest date loaded (a recent window), "ALL" = full history loaded. Never
    // persisted — see ensureSessionsLoaded in features/day/session-io.js (Phase 5.2).
    sessionsLoadedSince: null,
    // One-time guard so renderDay only kicks off the "is this account really new?"
    // full-history fetch once per login when the recent window comes back empty —
    // see showFirstRunHint in features/day/render.js. Ephemeral — never persisted.
    _firstRunEnsureTried: false,
    exercisesCatalog: new Map(), // docId -> exercise doc
    userDays: null, // built by rebuildUserDays() from the user's exercise catalog
    dayCustomizations: {}, // {0: {tag, focus}, 1: ...} from Firestore
    weekOffset: 0, // 0 = current week, -1 = last week, etc.
    plansCache: new Map(), // planId -> plan doc (custom plans from Firestore)
    currentPlanName: null,
    currentPlanId: null,   // custom plan doc id
    currentPlanKey: null,  // predefined template key
    exSubTab: "list",
    exSearchQuery: "",
    lastDeloadDate: null,
    prevLayout: "column", // 'column' | 'panel' — how previous load + suggestion are shown
    periodizationEnabled: true,
    machinesEnabled: true,
    profileEnabled: true,
    autoregEnabled: true,
    autoregSensitivity: "mod", // 'suave' | 'mod' | 'agr'
    execOrderEnabled: true,
    gamificationEnabled: false,
    gamifStartDate: null, // YYYY-MM-DD; start of the counting window (set on first enable)
    gamification: null, // cached result of computeGamification
    // sex/bodyweight are stored but intentionally UNUSED by the algorithm in this version (reserved for future RM-based cold-start)
    profile: { birthDate:null, sex:null, bodyweight:null, experience:null, injuries:{} },
    deloadDismissed: false,

    // exercise list filters
    exFilterMuscle: null, // null = todos
    exFilterDay: null, // null = todos
    exShowInactive: false,

    evoChart: null,
    _modalScrollY: 0,
    _profileSaveTimer: null,
    allSessionsPromise: null,
    loadDayToken: 0,
    _gamifToastTimer: null,
    _wrappedCurrent: 0,
    _wrappedTotal: 0,
    _softRenderT: null,
    EXERCISES: null, // recomputed post-login by evolution.js/exercises/crud.js via buildExerciseList()
    evoInitialized: false,
    evoPendingName: null,
    evoPendingMachine: null,
    exportingData: false,
    sharingPdf: false,
  };
}

export const state = makeInitialState();

// Resets `state` back to defaults IN PLACE — every module holds this same object
// reference, so a reset must mutate it, never reassign `state`. Call at the top of
// every auth transition (main.js's onAuthStateChanged) before touching state.user,
// so per-user fields (profile, prefs, caches, the evolution chart) never leak from
// the previous account into the next one. Does not touch state.user — the caller
// owns that assignment.
export function resetUserState(){
  clearTimeout(state.saveTimer);
  clearTimeout(state._profileSaveTimer);
  clearTimeout(state._trainScrollT);
  clearTimeout(state._gamifToastTimer);
  clearTimeout(state._softRenderT);
  state.evoChart?.destroy();
  // Stay strictly ahead of any in-flight loadDay from before this reset — see the
  // token check in features/day/session-io.js (Trap #8). Resetting straight to the
  // makeInitialState() default of 0 could let a stale response from the previous
  // account collide with the next account's first loadDay call.
  const nextLoadDayToken = state.loadDayToken + 1;
  Object.assign(state, makeInitialState());
  state.loadDayToken = nextLoadDayToken;
}
