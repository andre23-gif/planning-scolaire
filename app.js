// === DÉBUT BLOC AUTHENTIFICATION SUPABASE ===
import { supabase } from './supabaseClient.js';

// Authentification
async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert("Erreur connexion : " + error.message);
  updateUserBar();
}

async function signup(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) alert("Erreur inscription : " + error.message);
  else alert("Inscription réussie, vérifie tes mails !");
}

async function logout() {
  await supabase.auth.signOut();
  updateUserBar();
}

function updateUserBar() {
  supabase.auth.getUser().then(({ data }) => {
    if (data?.user) {
      document.getElementById("user-bar").style.display = "flex";
      document.getElementById("auth-form").style.display = "none";
      document.getElementById("user-email").textContent = data.user.email;
    } else {
      document.getElementById("user-bar").style.display = "none";
      document.getElementById("auth-form").style.display = "flex";
    }
  });
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

updateUserBar();
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
  const { data, error } = await supabase
    .from('overrides')
    .select('*');
  setSyncStatus(!error);
  return data || [];
}

async function savePlanning(week, slot, day, activity) {
  const { error } = await supabase
    .from('overrides')
    .upsert([{ week, slot, day, activity }]);
  setSyncStatus(!error);
}
// === FIN BLOC MIGRATION PLANNING SUPABASE ===


// === DÉBUT BLOC MIGRATION OBJECTIFS SUPABASE ===
async function fetchObjectifs() {
  const { data, error } = await supabase
    .from('objectifs')
    .select('*');
  setSyncStatus(!error);
  return (data && data.length > 0) ? (data[0].data || {}) : {};
}

async function saveObjectifs(obj) {
  const { error } = await supabase
    .from('objectifs')
    .upsert([{ data: obj }]);
  setSyncStatus(!error);
}
// === FIN BLOC MIGRATION OBJECTIFS SUPABASE ===


// === DÉBUT BLOC MIGRATION TEMPLATE SUPABASE ===
async function fetchTemplate() {
  const { data, error } = await supabase
    .from('template')
    .select('*');
  setSyncStatus(!error);

  if (error) {
    console.error("Erreur lors du fetch du template :", error.message);
    return null;
  }

  if (data && data.length > 0) {
    return data[0].data || {};
  }

  return {};
}

async function saveTemplate(obj) {
  const { error } = await supabase
    .from('template')
    .upsert([{ data: obj }]);
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
``
