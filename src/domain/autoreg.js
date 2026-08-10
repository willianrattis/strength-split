// B1 — Equipment-aware increments (kg)
const DUMBBELL_LADDER = [1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40];

// --- Auto-regulation sensitivity presets (tunable) ---
export const AUTOREG_PRESETS = {
  suave: { tol: 2, fatigue: 0.04,  ceilUp: false },
  mod:   { tol: 1, fatigue: 0.025, ceilUp: false },
  agr:   { tol: 1, fatigue: 0.01,  ceilUp: true  },
};

// Snap a load to a real equipment increment. up=true rounds UP to the next rung.
export function snapLoad(equip, u, step, value, up){
  if(u === "kg"){
    if(equip === "halter"){
      if(value > 40) return up ? Math.ceil(value/2)*2 : Math.round(value/2)*2;
      if(up) return DUMBBELL_LADDER.find(x => x >= value) ?? 40;
      let best = DUMBBELL_LADDER[0];
      for(const v of DUMBBELL_LADDER) if(Math.abs(v-value) < Math.abs(best-value)) best = v;
      return best;
    }
    const kstep = equip === "barra" ? 2 : 2.5;
    const r = up ? Math.ceil(value/kstep)*kstep : Math.round(value/kstep)*kstep;
    return equip === "barra" ? Math.max(2, r) : r;
  }
  const r = up ? Math.ceil(value/step)*step : Math.round(value/step)*step;
  return u === "placas" ? Math.max(1, Math.round(r)) : r;
}

export function autoregCfg(sensitivity) {
  return AUTOREG_PRESETS[sensitivity] || AUTOREG_PRESETS.mod;
}
export function orderFactor(shift, cfg) {
  return Math.pow(1 - cfg.fatigue, -shift);
}
export function projectLoad(w, repsDone, target, equip, u, step, fatigueSteps, cfg){
  if(typeof w !== "number") return null;
  if(repsDone == null || typeof target !== "number") return w;
  if(Math.abs(repsDone - target) <= cfg.tol) return w;        // inside band -> hold
  const base = w * (30 + repsDone) / (30 + target);           // pre-fatigue rep-equivalent load
  let ideal = fatigueSteps ? base * Math.pow(1 - cfg.fatigue, fatigueSteps) : base;
  // Guard: when rep math warrants an increase (base >= w), fatigue may only dampen it
  // toward w — never below w, never flipping an increase into a decrease.
  if(base >= w && ideal < w) ideal = w;
  const up = ideal > w;
  return snapLoad(equip, u, step, ideal, cfg.ceilUp && up);
}
