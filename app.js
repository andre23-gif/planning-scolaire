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
