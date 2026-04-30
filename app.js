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
// === Voyant synchro ===
function setSyncStatus(connected) {
  const dot = document.getElementById("sync-dot");
  dot.style.display = "inline-block";
  dot.style.background = connected ? "#2CA768" : "#7B2D2D";
}
//=== migration planning ===
async function fetchPlanning() {
  const { data, error } = await supabase
    .from('overrides')
    .select('*');
  setSyncStatus(!error);
  // ...utilise data pour afficher le planning
}
async function savePlanning(week, slot, day, activity) {
  const { error } = await supabase
    .from('overrides')
    .upsert([{ week, slot, day, activity }]);
  setSyncStatus(!error);
}
// === migration objectifs ===
async function fetchObjectifs() {
  const { data, error } = await supabase
    .from('objectifs')
    .select('*');
  setSyncStatus(!error);
  // ...utilise data pour afficher les objectifs
}
async function saveObjectifs(obj) {
  const { error } = await supabase
    .from('objectifs')
    .upsert([{ data: obj }]);
  setSyncStatus(!error);
}
// === migration fetchtemplate ===
async function fetchTemplate() {
  const { data, error } = await supabase
    .from('template')
    .select('*');
  setSyncStatus(!error);
  if (error) {
    // Gestion d'erreur
    console.error("Erreur lors du fetch du template :", error.message);
    return null;
  }
  if (data && data.length > 0) {
    // Retourne le modèle récupéré
    return data[0].data;
  } else {
    // Aucun template trouvé, retourne un modèle vide
    return {};
  }
}

  // ...utilise data pour afficher le modèle
}
async function saveTemplate(obj) {
  const { error } = await supabase
    .from('template')
    .upsert([{ data: obj }]);
  setSyncStatus(!error);
}
// === migration templates ===
async function fetchTemplate() {
  const { data, error } = await supabase
    .from('template')
    .select('*');
  setSyncStatus(!error);
  // ...utilise data pour afficher le modèle
}
async function saveTemplate(obj) {
  const { error } = await supabase
    .from('template')
    .upsert([{ data: obj }]);
  setSyncStatus(!error);
}
