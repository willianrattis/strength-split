// Single mutable store for app state. Modules read and write `state.x`.
// Anything that must survive a reload lives in Firestore, not here.
export const state = {
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
  theme: (function(){
    try{ var t = localStorage.getItem("ss_theme"); return (t === "dark" || t === "light") ? t : null; }
    catch(_){ return null; }
  })(),                    // "dark" | "light" — null = segue o sistema
  allSessions: null,  // cache: array de todas as sessões do usuário (mais recente primeiro)
  allSessionsTruncated: false,
  allSessionsError: false,
  exercisesCatalog: new Map(), // docId -> exercise doc
  userDays: null, // replaces DAYS when loaded from Firestore
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
  EXERCISES: null, // set at module evaluation time in main.js via buildExerciseList()
  evoInitialized: false,
  evoPendingName: null,
  evoPendingMachine: null,
  exportingData: false,
  sharingPdf: false,
};
