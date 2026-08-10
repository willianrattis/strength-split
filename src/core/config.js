// Palliative cap on the session cache. ~750 sessions is several years of
// training; raising it is cheaper than the Phase 5 aggregate work if a real
// user ever hits it. Phase 5 replaces this with aggregates + pagination.
export const SESSIONS_FETCH_LIMIT = 750;

export const GAP_MIN_MS = 20 * 1000;      // below this the user is marking retroactively
export const GAP_MAX_MS = 8 * 60 * 1000;  // above this the phone was abandoned

export const DELOAD_FACTOR = 0.55;
