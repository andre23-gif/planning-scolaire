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
// Voyant synchro
function setSyncStatus(connected) {
  const dot = document.getElementById("sync-dot");
  dot.style.display = "inline-block";
  dot.style.background = connected ? "#2CA768" : "#7B2D2D";
}
