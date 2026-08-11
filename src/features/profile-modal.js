import { serverTimestamp } from "firebase/firestore";
import { MUSCLE_ORDER, MUSCLE_LABEL } from "../data/labels.js";
import { state } from "../core/state.js";
import { $profileModal, $profileModalInner } from "../core/dom.js";
import { profileAge } from "../core/adapters.js";
import * as repo from "../core/repo.js";

function scheduleProfileSave(){
  clearTimeout(state._profileSaveTimer);
  state._profileSaveTimer = setTimeout(saveProfileDoc, 500);
}
async function saveProfileDoc(){
  if(!state.user) return;
  try{
    await repo.setProfileDoc(state.user.uid, { ...state.profile, updatedAt: serverTimestamp() });
  }catch(e){ console.warn("saveProfileDoc:", e.message); }
}

export function closeProfileModal(){ $profileModal.classList.remove("open"); }

// Renders the profile fields (birthDate/sex/bodyweight/experience/injuries) into
// any container and wires them scoped to that container — never document-wide —
// so this can be reused (e.g. by the onboarding wizard's Step 1) without ID
// cross-talk against the standalone modal's copy of the same field IDs.
export function renderProfileForm(containerEl){
  const SEX_OPTS = [{val:"m",label:"M"},{val:"f",label:"F"},{val:null,label:"Prefiro não dizer"}];
  const EXP_OPTS = [{val:"beg",label:"Iniciante · 0–1a"},{val:"int",label:"Intermediário · 1–3a"},{val:"adv",label:"Avançado · +3a"}];

  let html = `<h3 style="font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin:0 0 6px">Perfil de treino</h3>`;
  html += `<p style="font-size:12px;color:var(--muted);margin:0 0 18px;line-height:1.4">Opcional. Melhora a precisão das sugestões de carga. Deixe em branco o que não quiser informar.</p>`;

  // Data de nascimento
  const todayISO = new Date().toISOString().slice(0,10);
  const ageHint = profileAge();
  html += `<label style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:4px;display:block">Data de nascimento</label>`;
  html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><input id="profBirth" type="date" value="${state.profile.birthDate ?? ""}" max="${todayISO}" style="flex:1 1 auto;min-width:150px;box-sizing:border-box;min-height:40px;padding:8px 14px 8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:14px;font-family:var(--body)">`;
  html += `<span id="profAgeHint" style="flex:0 0 auto;white-space:nowrap;font-size:12px;color:var(--faint)">${ageHint != null ? "("+ageHint+" anos)" : ""}</span></div>`;

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
  html += `<input id="profWeight" type="text" inputmode="decimal" placeholder="—" value="${state.profile.bodyweight != null ? state.profile.bodyweight : ""}" style="width:120px;box-sizing:border-box;min-height:40px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:14px;font-family:var(--body);margin-bottom:14px">`;

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

  containerEl.innerHTML = html;

  // — Bind listeners, scoped to containerEl —
  // Birth date
  containerEl.querySelector("#profBirth").addEventListener("change", e => {
    const v = e.target.value;
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
      const yr = parseInt(v.slice(0,4),10);
      if(yr >= 1920 && v <= new Date().toISOString().slice(0,10)){
        state.profile.birthDate = v;
      } else { state.profile.birthDate = null; }
    } else { state.profile.birthDate = null; }
    const hint = containerEl.querySelector("#profAgeHint");
    const a = profileAge();
    if(hint) hint.textContent = a != null ? "("+a+" anos)" : "";
    scheduleProfileSave();
  });

  // Sex chips
  containerEl.querySelector("#profSex").addEventListener("click", e => {
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
  containerEl.querySelector("#profWeight").addEventListener("input", e => {
    const v = e.target.value.replace(/[^0-9.,]/g,"").replace(",",".");
    e.target.value = v;
    const n = parseFloat(v);
    state.profile.bodyweight = (n > 0 && isFinite(n)) ? Math.round(n * 10) / 10 : null;
    scheduleProfileSave();
  });

  // Experience chips (tap active to deselect)
  containerEl.querySelector("#profExp").addEventListener("click", e => {
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
  containerEl.querySelector("#profInjuries").addEventListener("click", e => {
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

export function openProfileModal(){
  $profileModal.classList.add("open");
  renderProfileForm($profileModalInner);
}

export function init(){
  $profileModal.addEventListener("click", e => { if(e.target === $profileModal) closeProfileModal(); });
}
