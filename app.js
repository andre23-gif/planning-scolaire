// === DÉBUT BLOC AUTHENTIFICATION SUPABASE ===
import { supabase } from './supabaseClient.js';

let CURRENT_UID = null;

// Authentification
async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert("Erreur connexion : " + error.message);
  await updateUserBar();
  await refreshAllUI();
}

async function signup(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    // Quand l'email existe déjà, on tente une connexion directe
    if (msg.includes("already") || msg.includes("déjà")) {
      await login(email, password);
      return;
    }
    alert("Erreur inscription : " + error.message);
    return;
  }

  alert("Inscription réussie !");
  await updateUserBar();
  await refreshAllUI();
}

async function logout() {
  await supabase.auth.signOut();
  await updateUserBar();
  await refreshAllUI();
}

async function updateUserBar() {
  const { data } = await supabase.auth.getUser();

  if (data?.user) {
    CURRENT_UID = data.user.id;
    document.getElementById("user-bar").style.display = "flex";
    document.getElementById("auth-form").style.display = "none";
    document.getElementById("user-email").textContent = data.user.email;
  } else {
    CURRENT_UID = null;
    document.getElementById("user-bar").style.display = "none";
    document.getElementById("auth-form").style.display = "flex";
    document.getElementById("user-email").textContent = "";
  }
}

document.getElementById("btn-login").onclick = () => {
  login(
    document.getElementById("auth-email").value,
    document.getElementById("auth-password").value
  );
};

document.getElementById("btn-signup").onclick = () => {
  signup(
    document.getElementById("auth-email").value,
    document.getElementById("auth-password").value
  );
};

document.getElementById("btn-logout").onclick = logout;

// === FIN BLOC AUTHENTIFICATION SUPABASE ===


// === DÉBUT BLOC VOYANT DE SYNCHRO SUPABASE ===
function setSyncStatus(connected) {
  const dot = document.getElementById("sync-dot");
  dot.style.display = "inline-block";
  dot.style.background = connected ? "#2CA768" : "#7B2D2D";
}
// === FIN BLOC VOYANT DE SYNCHRO SUPABASE ===


// === DÉBUT BLOC MIGRATION PLANNING SUPABASE ===
async function fetchPlanning() {
  if (!CURRENT_UID) return [];
  const { data, error } = await supabase
    .from('overrides')
    .select('*')
    .eq('user_id', CURRENT_UID);

  setSyncStatus(!error);
  return data || [];
}

async function savePlanning(week, slot, day, activity) {
  if (!CURRENT_UID) return;

  const { error } = await supabase
    .from('overrides')
    .upsert([{
      user_id: CURRENT_UID,
      week,
      slot,
      day,
      activity
    }]);

  setSyncStatus(!error);
}
// === FIN BLOC MIGRATION PLANNING SUPABASE ===


// === DÉBUT BLOC MIGRATION OBJECTIFS SUPABASE ===
async function fetchObjectifs() {
  if (!CURRENT_UID) return {};

  const { data, error } = await supabase
    .from('objectifs')
    .select('data')
    .eq('user_id', CURRENT_UID)
    .limit(1);

  setSyncStatus(!error);
  return (data && data.length > 0) ? (data[0].data || {}) : {};
}

async function saveObjectifs(obj) {
  if (!CURRENT_UID) return;

  const { error } = await supabase
    .from('objectifs')
    .upsert([{
      user_id: CURRENT_UID,
      data: obj
    }]);

  setSyncStatus(!error);
}
// === FIN BLOC MIGRATION OBJECTIFS SUPABASE ===


// === DÉBUT BLOC MIGRATION TEMPLATE SUPABASE ===
async function fetchTemplate() {
  if (!CURRENT_UID) return {};

  const { data, error } = await supabase
    .from('template')
    .select('data')
    .eq('user_id', CURRENT_UID)
    .limit(1);

  setSyncStatus(!error);

  if (error) {
    console.error("Erreur lors du fetch du template :", error.message);
    return null;
  }

  return (data && data.length > 0) ? (data[0].data || {}) : {};
}

async function saveTemplate(obj) {
  if (!CURRENT_UID) return;

  const { error } = await supabase
    .from('template')
    .upsert([{
      user_id: CURRENT_UID,
      data: obj
    }]);

  setSyncStatus(!error);
}
// === FIN BLOC MIGRATION TEMPLATE SUPABASE ===


// === DÉBUT BLOC UTILITAIRES SUPABASE ===
function calculStats(planning, objectifs) {
  let total = 0;
  planning.forEach(item => {
    if (item.activity && item.activity !== "Occupation") total++;
  });

  const objectifGlobal = objectifs?.global || 0;

  return {
    total,
    objectif: objectifGlobal,
    progression: objectifGlobal ? Math.round((total / objectifGlobal) * 100) : 0
  };
}

function exportJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJSON(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      callback(data);
    } catch {
      alert("Erreur lors de l'import JSON");
    }
  };
  reader.readAsText(file);
}
// === FIN BLOC UTILITAIRES SUPABASE ===


// === DÉBUT BLOC UI MINIMAL ===
async function afficherObjectifs() {
  const objectifs = await fetchObjectifs();
  const container = document.getElementById("objectifs");
  container.innerHTML = "";

  Object.entries(objectifs).forEach(([k, v]) => {
    const div = document.createElement("div");
    div.textContent = `${k} : ${v}`;
    container.appendChild(div);
  });
}

async function afficherTemplate() {
  const template = await fetchTemplate();
  const container = document.getElementById("template");
  container.innerHTML = "";

  if (!template) return;

  Object.entries(template).forEach(([k, v]) => {
    const div = document.createElement("div");
    div.textContent = `${k} : ${v}`;
    container.appendChild(div);
  });
}

async function afficherStats() {
  const planning = await fetchPlanning();
  const objectifs = await fetchObjectifs();
  const stats = calculStats(planning, objectifs);

  const container = document.getElementById("stats");
  container.innerHTML = `Total : ${stats.total} | Objectif : ${stats.objectif} | Progression : ${stats.progression}%`;
}

async function refreshAllUI() {
  // Si pas connecté, on vide proprement
  if (!CURRENT_UID) {
    document.getElementById("planning").innerHTML = "";
    document.getElementById("objectifs").innerHTML = "";
    document.getElementById("template").innerHTML = "";
    document.getElementById("stats").innerHTML = "";
    return;
  }

  await afficherObjectifs();
  await afficherTemplate();
  await afficherStats();
}

document.getElementById("export-btn").onclick = async () => {
  const planning = await fetchPlanning();
  exportJSON(planning, "planning.json");
};

document.getElementById("import-btn").onclick = () => {
  document.getElementById("import-file").click();
};

document.getElementById("import-file").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;

  importJSON(f, (data) => {
    // affichage simple pour vérifier l'import
    document.getElementById("planning").innerHTML = JSON.stringify(data, null, 2);
  });

  e.target.value = "";
};

document.addEventListener("DOMContentLoaded", async () => {
  await updateUserBar();
  await refreshAllUI();
});
// === FIN BLOC UI MINIMAL ===
/* ====== UI reprise de l'app "Planning scolaire – Heures" ====== */

:root{
  --bg-royal:#24308f;
  --bg-royal2:#3a4bd6;
  --bg-gold:#ffe08a;
  --bg-ivory:#fff7dd;

  --surface:#fcfcff;
  --surface2:#f1f4ff;
  --border:#c9cff7;

  --text:#111827;
  --dim:#4b5563;

  --gold:#f5c84b;
  --gold2:#d4a62a;

  --ok:#16a34a;
  --warn:#d4a62a;
  --danger:#dc2626;

  --r-card:24px;
  --r-btn:18px;
  --r-input:16px;
  --r-cell:14px;

  --shadow: 0 14px 34px rgba(17,24,39,.16);
  --shadow2: 0 8px 18px rgba(17,24,39,.10);

  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --font-type: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
}

*{box-sizing:border-box}

body{
  margin:0;
  font-family:var(--font-ui);
  color:var(--text);
  min-height:100vh;
  background:
    radial-gradient(900px 520px at 80% 12%, rgba(255,224,138,.85), transparent 58%),
    radial-gradient(1100px 680px at 18% -8%, rgba(58,75,214,.55), transparent 60%),
    radial-gradient(1200px 720px at 45% 120%, rgba(255,247,221,.80), transparent 55%),
    linear-gradient(135deg, var(--bg-royal) 0%, var(--bg-royal2) 45%, var(--bg-gold) 125%);
}

header{
  position:sticky; top:0; z-index:10;
  padding:14px;
  display:flex; gap:12px; align-items:center;
  background: rgba(16, 20, 70, 0.82);
  border-bottom: 1px solid rgba(245,200,75,0.35);
  backdrop-filter: blur(10px);
}

.brand{
  font-weight:900;
  letter-spacing:.08em;
  text-transform:uppercase;
  color:#fff;
  display:flex; gap:10px; align-items:baseline;
}
.brand span{ color:var(--gold); }

.spacer{flex:1}

.tabs{display:flex; gap:8px; flex-wrap:wrap}
.tab{
  font-family:var(--font-type);
  letter-spacing:.06em;
  border-radius:var(--r-btn);
  padding:9px 12px;
  cursor:pointer;
  border:1px solid rgba(245,200,75,.30);
  background: rgba(255,255,255,.10);
  color:#fff;
  box-shadow: 0 8px 18px rgba(0,0,0,.18);
}
.tab.active{
  background: linear-gradient(180deg, rgba(245,200,75,1), rgba(212,166,42,1));
  color:#111827;
  border-color: rgba(0,0,0,0.06);
}

main{max-width:1200px; margin:0 auto; padding:16px;}
.views > section{display:none}
.views > section.active{display:block}

.card{
  background: rgba(252,252,255,.92);
  border-radius: var(--r-card);
  padding:16px;
  border:1px solid rgba(36,48,143,.18);
  box-shadow: var(--shadow);
}

.row{display:flex; gap:10px; flex-wrap:wrap; align-items:center}
.pill{
  background: rgba(241,244,255,.92);
  border:1px solid rgba(36,48,143,.14);
  padding:6px 10px;
  border-radius:999px;
  color:var(--dim);
  font-size:12px;
  font-family:var(--font-type);
}

.btn{
  border:none;
  background: linear-gradient(180deg, rgba(245,200,75,1), rgba(212,166,42,1));
  color:#111827;
  font-weight:900;
  padding:10px 12px;
  border-radius: var(--r-btn);
  cursor:pointer;
  box-shadow: var(--shadow2);
  font-family:var(--font-type);
}
.btn.secondary{
  background: rgba(241,244,255,.95);
  border:1px solid rgba(36,48,143,.16);
  color:var(--text);
}

select, input{
  background: rgba(241,244,255,.95);
  border:1px solid rgba(36,48,143,.16);
  color:var(--text);
  padding:10px 12px;
  border-radius: var(--r-input);
  font-family:var(--font-type);
}

/* Table semaine */
.gridwrap{
  overflow:auto;
  border:1px solid rgba(36,48,143,.16);
  border-radius: var(--r-card);
  background: rgba(255,255,255,.62);
}
table{border-collapse:collapse; min-width:860px; width:100%}
th{
  position:sticky; top:0; z-index:2;
  background: rgba(241,244,255,.98);
  border-bottom:1px solid rgba(36,48,143,.16);
  padding:10px;
  color:var(--dim);
  font-size:12px;
  font-family:var(--font-type);
}
th:first-child{left:0; z-index:3; text-align:left}
td{border-bottom:1px solid rgba(36,48,143,.12); border-right:1px solid rgba(36,48,143,.12)}
td:first-child{
  position:sticky; left:0; z-index:1;
  background: rgba(241,244,255,.98);
  padding:10px;
  color:var(--dim);
  font-family:var(--font-type);
  font-size:12px;
}
td:last-child{border-right:none}

.cell{
  width:100%;
  min-height:44px;
  border:none;
  cursor:pointer;
  padding:6px;
  text-align:center;
  font-size:14px;
  font-weight:800;
  border-radius: var(--r-cell);
  box-shadow: 0 8px 18px rgba(17,24,39,0.10);
}

/* Modal */
.overlay{display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:50; align-items:center; justify-content:center}
.overlay.open{display:flex}
.modal{
  width:min(560px,94vw);
  background: rgba(252,252,255,.96);
  border:1px solid rgba(36,48,143,.16);
  border-radius: 22px;
  padding:14px;
  box-shadow: var(--shadow);
}
.modal h3{margin:0 0 6px 0; font-family:var(--font-type)}
.sub{color:var(--dim); font-size:12px; font-family:var(--font-type); margin-bottom:12px}
.choices{display:grid; grid-template-columns:repeat(3,1fr); gap:8px}
.choice{
  border:2px solid transparent;
  border-radius: 18px;
  min-height:44px;
  cursor:pointer;
  padding:10px 8px;
  font-weight:900;
}
.choice.sel{border-color:#111827}
.actions{display:flex; justify-content:flex-end; gap:10px; margin-top:12px}

/* Toast */
.toast{
  position:fixed; right:14px; bottom:14px;
  background: linear-gradient(180deg, rgba(245,200,75,1), rgba(212,166,42,1));
  color:#111827;
  font-weight:900;
  padding:10px 14px;
  border-radius:18px;
  opacity:0;
  transform:translateY(12px);
  transition:.25s;
  z-index:60;
  font-family:var(--font-type);
}
.toast.show{opacity:1; transform:translateY(0)}

/* Sync dot */
#sync-dot{
  display:none;
  width:10px;
  height:10px;
  border-radius:50%;
}
``
