import Chart from "chart.js/auto";
import { esc, normMachine } from "../domain/text.js";
import { fmtDateBR } from "../domain/dates.js";
import { UNIT_ABBR } from "../domain/units.js";
import { MUSCLE_ORDER, MUSCLE_LABEL } from "../data/labels.js";
import { state } from "../core/state.js";
import { $evoSelect, $evoMachineSelect, $evoBody } from "../core/dom.js";
import { activeDays, machineFilterActive } from "../core/adapters.js";
import { showTab } from "./shell.js";
import { loadAllSessions } from "./day/session-io.js";
import { openOnboarding } from "./onboarding.js";

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

export function buildExerciseList(){
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
export function openEvolucaoFor(name, machine){
  state.evoPendingName = name || null;
  state.evoPendingMachine = (machineFilterActive() && machine) ? normMachine(machine) : null;
  const wasInit = state.evoInitialized;
  showTab("evolucao");
  window.scrollTo({top:0, behavior:"auto"});
  // showTab -> initEvolucao only renders on first init; force a re-render otherwise.
  if(wasInit) renderEvolucao();
}

export function initEvolucao(){
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

export async function renderEvolucao(){
  if(!state.user){ return; }
  $evoBody.innerHTML = skeletonEvo();

  await loadAllSessions();
  // Rebuild exercise list to include substitutes from session history
  const prevSelected = $evoSelect.value;
  const prevName = state.EXERCISES[+prevSelected]?.name;
  state.EXERCISES = buildExerciseList();
  rebuildEvoDropdown();

  const $evoControls = document.querySelector(".evo-controls");
  if(!state.EXERCISES.length){
    if($evoControls) $evoControls.style.display = "none";
    $evoBody.innerHTML = `<div class="evo-empty">
      <span class="big">Nenhum exercício para acompanhar</span>
      Aplique um programa para começar a registrar sua evolução.
      <button class="modal-btn primary" id="evoApplyPlanBtn" style="margin-top:14px">Aplicar um programa</button>
    </div>`;
    document.getElementById("evoApplyPlanBtn").addEventListener("click", openOnboarding);
    if(state.evoChart){ state.evoChart.destroy(); state.evoChart = null; }
    return;
  }
  if($evoControls) $evoControls.style.display = "";
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

export function init(){
  state.EXERCISES = buildExerciseList();
}
