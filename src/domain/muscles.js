import { stripDiacritics } from "./text.js";

// Layered muscle index: plans → days → templates → catalog (first write wins)
export function buildMuscleIndex({ plans = [], days = [], templates = [], catalog = [] }){
  const idx = new Map();
  const add = (name, muscle) => {
    if(!name || !muscle) return;
    const k = stripDiacritics(String(name));
    if(!idx.has(k)) idx.set(k, muscle);
  };
  // a. Custom plans (plansCache)
  for(const plan of plans){
    if(!plan.days) continue;
    for(const day of plan.days){
      if(!day.exercises) continue;
      for(const e of day.exercises){
        add(e.name, e.muscle);
        if(e.superset) add(e.superset.name, e.superset.muscle);
      }
    }
  }
  // b. DAYS (built-in active plan)
  for(const day of days){
    if(!day.ex) continue;
    for(const e of day.ex){
      add(e.name, e.muscle);
      if(e.superset) add(e.superset.name, e.superset.muscle);
    }
  }
  // c. PLAN_TEMPLATES
  for(const tpl of templates){
    if(!tpl.days) continue;
    for(const day of tpl.days){
      if(!day.exercises) continue;
      for(const e of day.exercises){
        add(e.name, e.muscle);
        if(e.superset) add(e.superset.name, e.superset.muscle);
      }
    }
  }
  // d. EXERCISE_CATALOG
  for(const e of catalog){ add(e.name, e.muscle); }
  return idx;
}

// Keyword heuristic fallback for muscle resolution
export function muscleHeuristic(normName){
  const n = normName;
  if(n.includes("panturrilha")) return "panturrilha";
  // antebraço before bíceps (rosca punho)
  if(n.includes("rosca punho") || n.includes("antebraco")) return "antebraço";
  if(n.includes("gluteo") || n.includes("coice") || n.includes("abdutora") || n.includes("adutora") || n.includes("elevacao pelvica")) return "glúteo";
  if(n.includes("triceps") || n.includes("frances") || n.includes("testa") || n.includes("mergulho") || n.includes("paralela")) return "tríceps";
  if(n.includes("rosca") || n.includes("biceps") || n.includes("martelo")) return "bíceps";
  if(n.includes("encolhimento") || n.includes("trapezio")) return "trapézio";
  if(n.includes("abdominal") || n.includes("prancha") || n.includes("abdomen") || n.includes("infra") || n.includes("supra")) return "abdômen";
  if(n.includes("desenvolvimento") || n.includes("elevacao lateral") || n.includes("elevacao frontal") || n.includes("face pull") || n.includes("arnold") || n.includes("ombro")) return "ombro";
  // costas — exclude "terra romeno" and "stiff" which are perna
  if(n.includes("terra") && !n.includes("romeno") && !n.includes("stiff")) { /* fall through to costas check below */ }
  if(n.includes("remada") || n.includes("puxada") || n.includes("pulley") || n.includes("barra fixa") || n.includes("pull") || n.includes("serrote") || n.includes("costas")) return "costas";
  if(n.includes("terra") && !n.includes("romeno") && !n.includes("stiff")) return "costas";
  if(n.includes("supino") || n.includes("crucifixo") || n.includes("crossover") || n.includes("peck") || n.includes("flexao de braco") || n.includes("flexao com apoio") || n.includes("pullover") || n.includes("chest") || n.includes("peito")) return "peito";
  if(n.includes("agachamento") || n.includes("leg") || n.includes("afundo") || n.includes("stiff") || n.includes("romeno") || n.includes("flexora") || n.includes("extensora") || n.includes("cadeira") || n.includes("hack") || n.includes("bulgaro") || n.includes("passada") || n.includes("perna")) return "perna";
  return null;
}
