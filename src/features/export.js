import { todayStr } from "../domain/dates.js";
import { state } from "../core/state.js";
import * as repo from "../core/repo.js";

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
  const uid = state.user.uid;
  const [exercisesRaw, plansRaw, sessionsRaw, appPrefs, profilePrefs] = await Promise.all([
    repo.fetchExercises(uid),
    repo.fetchPlans(uid),
    repo.fetchAllSessionsRaw(uid),
    repo.getPrefs(uid),
    repo.getProfileDoc(uid),
  ]);

  const toRecord = ({id, data}) => ({ id, ...serializeTimestamps(data) });
  const exercises = exercisesRaw.map(toRecord);
  const plans = plansRaw.map(toRecord);
  const sessions = sessionsRaw.map(toRecord);
  sessions.sort((a, b) => String(a.date||"").localeCompare(String(b.date||"")));

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "strength-split",
    user: { uid: state.user.uid, email: state.user.email || null, displayName: state.user.displayName || null },
    prefs: {
      app: appPrefs ? serializeTimestamps(appPrefs) : null,
      profile: profilePrefs ? serializeTimestamps(profilePrefs) : null,
    },
    exercises, plans, sessions,
  };
}

function triggerDownload(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportUserData(){
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
      // buildExportPayload's awaits above can outlast the click's transient user
      // activation, so share() itself gets its own try/catch: a stale-activation
      // NotAllowedError (or any other share failure) falls back to a download
      // instead of surfacing as an export error.
      try {
        await navigator.share({ files: [file], title: "Backup Strength Split" });
      } catch(shareErr){
        if(shareErr.name === "AbortError") return;
        triggerDownload(blob, filename);
      }
    } else {
      triggerDownload(blob, filename);
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

// No listeners of its own — settingsExportRow's click (in settings.js) calls
// exportUserData directly. init() exists only so main.js's bootstrap list is uniform.
export function init(){}
