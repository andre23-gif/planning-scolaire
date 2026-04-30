import { supabase } from './supabaseClient.js';

let CURRENT_UID = null;

const DAYS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const SLOTS = ["Préparation","M1","M2","M3","M4","Midi","S1","S2","S3","S4","Soir 1","Soir 2","Soir 3","Soir 4","Nuit 1","Nuit 2","Nuit 3","Nuit 4","Nuit 5"];
const ACTIVITIES = ["Cours","CDC/suivi","Préparation","Instances","Parcours Avenir","Baroque","Gestion","Numérique","Coordination","Réunion","Amicale","Autres","Pépinières","Occupation"];

const COLORS = {
  "Cours": "#6AAFE6",
  "CDC/suivi": "#5C9BD6",
  "Préparation": "#E9D7A6",
  "Instances": "#D7D2C6",
  "Parcours Avenir": "#7FD6C9",
  "Baroque": "#73C5B7",
  "Gestion": "#AEB8C6",
  "Numérique": "#6FCFB8",
  "Coordination": "#9FBAD8",
  "Réunion": "#7FAED6",
  "Amicale": "#CFE2F3",
  "Autres": "#DDE2EA",
  "Pépinières": "#9FD9AE",
  "Occupation": "#F4F6FA"
};

const SCHOOL_ORDER = [
  ...Array.from({length:(52-36+1)},(_,i)=>36+i),
  ...Array.from({length:35},(_,i)=>1+i)
];

const $ = (id) => document.getElementById(id);

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1400);
}

function setSyncStatus(connected) {
  const dot = $("sync-dot");
  dot.style.display = "inline-block";
  dot.style.background = connected ? "#2CA768" : "#7B2D2D";
}

/* ---------------- Auth ---------------- */
async function updateUserBar() {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      CURRENT_UID = data.user.id;
      $("user-bar").style.display = "flex";
      $("auth-form").style.display = "none";
      $("user-email").textContent = data.user.email;
    } else {
      CURRENT_UID = null;
      $("user-bar").style.display = "none";
      $("auth-form").style.display = "flex";
      $("user-email").textContent = "";
    }
  } catch (e) {
    // Fallback : on affiche le formulaire si supabase plante
    CURRENT_UID = null;
    $("user-bar").style.display = "none";
    $("auth-form").style.display = "flex";
    setSyncStatus(false);
  }
}

async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { alert("Erreur connexion : " + error.message); return; }
  await updateUserBar();
  await loadPlanningCache();
  renderWeek();
}

async function signup(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("déjà")) {
      await login(email, password);
      return;
    }
    alert("Erreur inscription : " + error.message);
    return;
  }
  alert("Inscription réussie !");
  await updateUserBar();
  await loadPlanningCache();
  renderWeek();
}

async function logout() {
  await supabase.auth.signOut();
  await updateUserBar();
  planningCache = {};
  renderWeek();
}

$("btn-login").onclick = () => login($("auth-email").value, $("auth-password").value);
$("btn-signup").onclick = () => signup($("auth-email").value, $("auth-password").value);
$("btn-logout").onclick = logout;

/* ---------------- Supabase Planning ---------------- */
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
    .upsert([{ user_id: CURRENT_UID, week, slot, day, activity }]);
  setSyncStatus(!error);
}

/* ---------------- UI Semaine ---------------- */
let currentWeek = SCHOOL_ORDER[0];
let planningCache = {}; // key -> activity

function keyOf(week, slot, day){ return `S${week}|${slot}|${day}`; }

async function loadPlanningCache(){
  planningCache = {};
  if(!CURRENT_UID) return;
  const rows = await fetchPlanning();
  for(const r of rows){
    planningCache[keyOf(r.week, r.slot, r.day)] = r.activity;
  }
}

function getCell(week, slot, day){
  return planningCache[keyOf(week,slot,day)] ?? "Occupation";
}

async function setCell(week, slot, day, val){
  if(!CURRENT_UID){ toast("Connecte-toi pour enregistrer"); return; }
  planningCache[keyOf(week,slot,day)] = val;
  await savePlanning(week, slot, day, val);
}

function showView(viewId){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".views > section").forEach(s=>s.classList.remove("active"));
  const tab = document.querySelector(`.tab[data-view="${viewId}"]`);
  const sec = document.getElementById("view-" + viewId);
  if(tab) tab.classList.add("active");
  if(sec) sec.classList.add("active");
}

document.querySelectorAll(".tab").forEach(t=>{
  t.addEventListener("click", ()=>showView(t.dataset.view));
});

function buildWeekSelect(){
  const sel = $("weekSelect");
  sel.innerHTML = "";
  SCHOOL_ORDER.forEach(w=>{
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = "Semaine " + w;
    sel.appendChild(opt);
  });
  sel.value = currentWeek;
}

$("weekSelect").addEventListener("change", ()=>{
  currentWeek = parseInt($("weekSelect").value,10);
  renderWeek();
});

$("prevWeek").addEventListener("click", ()=>{
  const i = SCHOOL_ORDER.indexOf(currentWeek);
  if(i>0){ currentWeek = SCHOOL_ORDER[i-1]; renderWeek(); }
});

$("nextWeek").addEventListener("click", ()=>{
  const i = SCHOOL_ORDER.indexOf(currentWeek);
  if(i < SCHOOL_ORDER.length-1){ currentWeek = SCHOOL_ORDER[i+1]; renderWeek(); }
});

function renderWeek(){
  $("weekLabel").textContent = "Semaine " + currentWeek;
  $("weekSelect").value = currentWeek;

  const table = $("grid");
  table.innerHTML = "";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  const th0 = document.createElement("th");
  th0.textContent = "Créneau";
  trh.appendChild(th0);

  DAYS.forEach(d=>{
    const th = document.createElement("th");
    th.textContent = d.slice(0,3).toUpperCase();
    trh.appendChild(th);
  });

  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  SLOTS.forEach(slot=>{
    const tr = document.createElement("tr");
    const td0 = document.createElement("td");
    td0.textContent = slot;
    tr.appendChild(td0);

    DAYS.forEach(day=>{
      const td = document.createElement("td");
      const act = getCell(currentWeek, slot, day);

      const b = document.createElement("button");
      b.className = "cell";
      b.style.background = COLORS[act] ?? "#444";
      b.style.color = (act==="Occupation") ? "#666" : "#0b1020";
      b.textContent = (act==="Occupation") ? "" : act;

      b.addEventListener("click", ()=>openModal(currentWeek, slot, day));
      td.appendChild(b);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

/* modal */
const overlay = $("overlay");
const choices = $("choices");
let modalCtx = null;

function openModal(week, slot, day){
  modalCtx = {week, slot, day};
  $("mTitle").textContent = slot + " — " + day;
  $("mSub").textContent = "Semaine " + week;

  const cur = getCell(week,slot,day);
  choices.innerHTML = "";

  ACTIVITIES.forEach(a=>{
    const btn = document.createElement("button");
    btn.className = "choice" + (a===cur ? " sel" : "");
    btn.style.background = COLORS[a] ?? "#444";
    btn.style.color = (a==="Occupation") ? "#666" : "#0b1020";
    btn.textContent = a;
    btn.addEventListener("click", ()=>{
      choices.querySelectorAll(".choice").forEach(x=>x.classList.remove("sel"));
      btn.classList.add("sel");
    });
    choices.appendChild(btn);
  });

  overlay.classList.add("open");
}

function closeModal(){
  overlay.classList.remove("open");
  modalCtx = null;
}

$("mCancel").addEventListener("click", closeModal);
overlay.addEventListener("click",(e)=>{ if(e.target===overlay) closeModal(); });

$("mSave").addEventListener("click", async ()=>{
  const sel = choices.querySelector(".choice.sel");
  if(!sel || !modalCtx) return;
  await setCell(modalCtx.week, modalCtx.slot, modalCtx.day, sel.textContent);
  closeModal();
  renderWeek();
  toast("Enregistré");
});

/* init */
document.addEventListener("DOMContentLoaded", async ()=>{
  buildWeekSelect();
  showView("planning");
  await updateUserBar();
  await loadPlanningCache();
  renderWeek();
});
