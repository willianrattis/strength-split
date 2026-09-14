// Page size for the paginated full-history fetch (Phase 5.3) — see fetchAllSessions
// in features/day/session-io.js. No cap on total sessions anymore; this only tunes
// how many docs come back per Firestore round trip.
export const SESSIONS_PAGE_SIZE = 300;

// Recent-history window for the day view (Phase 5.2): prevLoad, suggestions, deload
// checks, and machine info only need this much lookback, not the full account
// history. Tradeoff: a date-bounded window can miss the last session of an exercise
// trained less often than this — that self-heals the next time it's trained, since
// the window is relative to "today", not fixed. Evolução, Wrapped, Gamificação, and
// the train-mode summary widen the cache to what they actually need via
// ensureSessionsLoaded() in features/day/session-io.js.
export const RECENT_WINDOW_DAYS = 365;

export { GAP_MIN_MS, GAP_MAX_MS } from "../domain/day-plan.js";

export const DELOAD_FACTOR = 0.55;

// How many weeks ahead the week strip may navigate. Forward navigation exists so a
// weekday's program can be trained early (a holiday Monday done on Saturday) — the
// session lands on the real date, which is the document that day will open. Bounded so
// nobody wanders years out and leaves stray sessions behind.
export const WEEK_OFFSET_MAX = 4;
