import { supabase } from "./supabaseClient.js";

/* ======================================================
   CONFIG (UI & données) — conforme à l’app d’origine
====================================================== */
const DAYS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const SLOTS = ["Préparation","M1","M2","M3","M4","Midi","S1","S2","S3","S4","Soir 1","Soir 2","Soir 3","Soir 4","Nuit 1","Nuit 2","Nuit 3","Nuit 4","Nuit 5"];
const ACTIVITIES = ["Cours","CDC/suivi","Préparation","Instances","Parcours Avenir","Baroque","Gestion","Numérique","Coordination","Réunion","Amicale","Autres","Pépinières","Occupation"];

const COLORS = {
  "Cours":           "#6AAFE6",
  "CDC/suivi":       "#5C9BD6",
  "Préparation":     "#E9D7A6",
  "Instances":       "#D7D2C6",
  "Parcours Avenir": "#7FD6C9",
  "Baroque":         "#73C5B7",
  "Gestion":         "#AEB8C6",
  "Numérique":       "#6FCFB8",
  "Coordination":    "#9FBAD8",
  "Réunion":         "#7FAED6",
  "Amicale":         "#CFE2F3",
  "Autres":          "#DDE2EA",
  "Pépinières":      "#9FD9AE",
  "Occupation":      "#F4F6FA"
};

/* ======================================================
   PÉRIODES (comme l’original)
====================================================== */
const T1 = Array.from({length:(48-36+1)}, (_,i)=>36+i);
const T2 = [...Array.from({length:(52-49+1)},(_,i)=>49+i), ...Array.from({length:11},(_,i)=>1+i)];
const T3 = Array.from({length:(27-12+1)}, (_,i)=>12+i);
const BONUS = Array.from({length:(35-28+1)}, (_,i)=>28+i);

function uniqueOrdered(arr){
  const seen = new Set(); const out=[];
  for(const x of arr){ if(seen.has(x)) continue; seen.add(x); out.push(x); }
  return out;
}
const PERIODS = {
  t1: T1, t2: T2, t3: T3, bonus: BONUS,
  school: uniqueOrdered([...T1, ...T2, ...T3, ...BONUS])
};
function weeksForPeriod(period){
  return (PERIODS[period] || PERIODS.school).slice();
}
const SCHOOL_ORDER = uniqueOrdered([
  ...Array.from({length:(52-36+1)},(_,i)=>36+i),
  ...Array.from({length:35},(_,i)=>1+i)
]);

/* ======================================================
   DOM helpers
====================================================== */
const $ = (id) => document.getElementById(id);

function toast(msg){
  const t = $("toast");
  if(!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1600);
}

function setSyncStatus(ok){
  const dot = $("sync-dot");
  if(!dot) return;
  dot.style.display = "inline-block";
  dot.style.background = ok ? "#2CA768" : "#7B2D2D";
}

function fixText(s){
  return (s || "")
    .replaceAll("PrĂ©paration","Préparation")
    .replaceAll("PrÃ©paration","Préparation")
    .replaceAll("RĂ©union","Réunion")
    .replaceAll("RÃ©union","Réunion");
}

/* ======================================================
   STATE — mêmes structures que l’original
====================================================== */
function defaultObjectifs(){
  return {
    global: { school:0, t1:0, t2:0, t3:0, bonus:0 },
    perActivity: { school:{}, t1:{}, t2:{}, t3:{}, bonus:{} },
    thresholds: { warnPct: 90, alertPct: 110 }
  };
}
function emptyTemplate(){
  const t={};
  for(const slot of SLOTS){
    t[slot]={};
    for(const day of DAYS) t[slot][day]="Occupation";
  }
  return t;
}

let CURRENT_UID = null;

// overrides stocké comme l’original : clé "S12|M1|Lundi" -> "Cours"
let overrides = {};
let objectifs = defaultObjectifs();
let TEMPLATE = emptyTemplate();

/* ======================================================
   SUPABASE AUTH (boutons + affichage)
====================================================== */
async function updateUserBar(){
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
}

async function login(email, password){
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { alert("Erreur connexion : " + error.message); return; }
  await updateUserBar();
  await hydrateAllFromSupabase();
  renderAll();
}

async function signup(email, password){
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("déjà")) { await login(email, password); return; }
    alert("Erreur inscription : " + error.message);
    return;
  }
  alert("Inscription réussie !");
  await updateUserBar();
  await hydrateAllFromSupabase();
  renderAll();
}

async function logout(){
  await supabase.auth.signOut();
  await updateUserBar();
  overrides = {};
  objectifs = defaultObjectifs();
  TEMPLATE = emptyTemplate();
  renderAll();
}

/* ======================================================
   SUPABASE DB — tables: overrides / objectifs / template
====================================================== */
function k(week, slot, day){ return `S${week}|${slot}|${day}`; }

function parseKey(key){
  const parts = (key||"").split("|");
  if(parts.length !== 3) return null;
  const week = parseInt(parts[0].replace(/^S/i,""),10);
  const slot = parts[1];
  const day  = parts[2];
  if(!Number.isFinite(week)) return null;
  return {week, slot, day};
}

async function hydrateOverrides(){
  if(!CURRENT_UID){ overrides = {}; return; }
  const { data, error } = await supabase.from("overrides").select("*").eq("user_id", CURRENT_UID);
  setSyncStatus(!error);
  overrides = {};
  (data || []).forEach(r => { overrides[k(r.week, r.slot, r.day)] = r.activity; });
}

async function persistOverride(week, slot, day, activity){
  if(!CURRENT_UID){ toast("Connecte-toi pour enregistrer"); return; }
  const { error } = await supabase.from("overrides")
    .upsert([{ user_id: CURRENT_UID, week, slot, day, activity }]);
  setSyncStatus(!error);
}

async function hydrateObjectifs(){
  if(!CURRENT_UID){ objectifs = defaultObjectifs(); return; }
  const { data, error } = await supabase.from("objectifs")
    .select("data")
    .eq("user_id", CURRENT_UID)
    .limit(1);
  setSyncStatus(!error);
  if(data && data.length>0 && data[0].data) objectifs = data[0].data;
  else objectifs = defaultObjectifs();
}

async function persistObjectifs(){
  if(!CURRENT_UID) return;
  const { error } = await supabase.from("objectifs")
    .upsert([{ user_id: CURRENT_UID, data: objectifs }]);
  setSyncStatus(!error);
}

async function hydrateTemplate(){
  if(!CURRENT_UID){ TEMPLATE = emptyTemplate(); return; }
  const { data, error } = await supabase.from("template")
    .select("data")
    .eq("user_id", CURRENT_UID)
    .limit(1);
  setSyncStatus(!error);
  if(data && data.length>0 && data[0].data) TEMPLATE = data[0].data;
  else TEMPLATE = emptyTemplate();
}

async function persistTemplate(){
  if(!CURRENT_UID) return;
  const { error } = await supabase.from("template")
    .upsert([{ user_id: CURRENT_UID, data: TEMPLATE }]);
  setSyncStatus(!error);
}

async function hydrateAllFromSupabase(){
  await hydrateOverrides();
  await hydrateObjectifs();
  await hydrateTemplate();
}

/* bulk upsert overrides (import/apply) — chunké */
async function upsertOverridesBulk(){
  if(!CURRENT_UID) return;
  const rows = [];
  for(const key of Object.keys(overrides)){
    const p = parseKey(key);
    if(!p) continue;
    rows.push({ user_id: CURRENT_UID, week:p.week, slot:p.slot, day:p.day, activity: overrides[key] });
  }
  if(!rows.length) return;

  const CHUNK = 500;
  for(let i=0;i<rows.length;i+=CHUNK){
    const part = rows.slice(i, i+CHUNK);
    const { error } = await supabase.from("overrides").upsert(part);
    setSyncStatus(!error);
    if(error) break;
  }
}

/* ======================================================
   HELPERS Planning
====================================================== */
function getCell(week, slot, day){
  const key = k(week,slot,day);
  if(overrides[key] !== undefined) return overrides[key];
  return "Occupation";
}

async function setCell(week, slot, day, val){
  overrides[k(week,slot,day)] = val;
  await persistOverride(week, slot, day, val);
}

/* ======================================================
   NAV (onglets) — identique original
====================================================== */
function showView(viewId){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".views > section").forEach(s=>s.classList.remove("active"));

  const tab = document.querySelector(`.tab[data-view="${viewId}"]`);
  const sec = document.getElementById("view-" + viewId);
  if(tab) tab.classList.add("active");
  if(sec) sec.classList.add("active");

  if(viewId==="stats") renderStats();
  if(viewId==="prefill"){ refreshPrefillWeekList(); renderPrefillGrid(); }
  if(viewId==="advstats_act") renderAdvStats();
}

/* ======================================================
   SEMAINE — identique original
====================================================== */
let currentWeek = SCHOOL_ORDER[0];

function buildWeekSelect(){
  const sel = $("weekSelect");
  sel.innerHTML = "";
  SCHOOL_ORDER.forEach(w=>{
    const opt=document.createElement("option");
    opt.value=w;
    opt.textContent="Semaine "+w;
    sel.appendChild(opt);
  });
  sel.value=currentWeek;
}

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
    const th=document.createElement("th");
    th.textContent = d.slice(0,3).toUpperCase();
    trh.appendChild(th);
  });

  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody=document.createElement("tbody");
  SLOTS.forEach(slot=>{
    const tr=document.createElement("tr");
    const td0=document.createElement("td");
    td0.textContent=slot;
    tr.appendChild(td0);

    DAYS.forEach(day=>{
      const td=document.createElement("td");
      const act = getCell(currentWeek, slot, day);

      const b=document.createElement("button");
      b.className="cell";
      b.style.background = COLORS[act] || "#444";
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

/* ======================================================
   MODAL — choix activité
====================================================== */
let modalCtx = null;

function openModal(week, slot, day){
  modalCtx = {week, slot, day};

  $("mTitle").textContent = slot + " — " + day;
  $("mSub").textContent = "Semaine " + week;

  const cur = getCell(week,slot,day);
  const choices = $("choices");
  choices.innerHTML = "";

  ACTIVITIES.forEach(a=>{
    const btn=document.createElement("button");
    btn.className="choice" + (a===cur ? " sel": "");
    btn.style.background = COLORS[a] || "#444";
    btn.style.color = (a==="Occupation") ? "#666" : "#0b1020";
    btn.textContent = a;

    btn.addEventListener("click", ()=>{
      choices.querySelectorAll(".choice").forEach(x=>x.classList.remove("sel"));
      btn.classList.add("sel");
    });

    choices.appendChild(btn);
  });

  $("overlay").classList.add("open");
}

function closeModal(){
  $("overlay").classList.remove("open");
  modalCtx=null;
}

/* ======================================================
   JSON Import/Export
====================================================== */
function download(filename, content, type){
  const blob = new Blob([content], {type});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ======================================================
   CSV import hebdo
====================================================== */
function detectDelimiter(line){
  const semis=(line.match(/;/g)||[]).length;
  const commas=(line.match(/,/g)||[]).length;
  return semis>=commas?";":",";
}
function parseCSV(text){
  const lines=text.replace(/\r/g,"").split("\n").filter(l=>l.trim()!=="");
  if(lines.length===0) return {header:[], rows:[]};
  const delim=detectDelimiter(lines[0]);
  const rows=[];
  for(const rawLine of lines){
    const out=[]; let cur=""; let inQ=false;
    for(let i=0;i<rawLine.length;i++){
      const ch=rawLine[i];
      if(ch === '"'){
        if(inQ && rawLine[i+1] === '"'){ cur+='"'; i++; }
        else inQ=!inQ;
      } else if(ch===delim && !inQ){
        out.push(cur); cur="";
      } else cur+=ch;
    }
    out.push(cur); rows.push(out.map(x=>x.trim()));
  }
  return {header: rows[0], rows: rows.slice(1)};
}
function weekFromFilename(name){
  const m=(name||"").match(/semaine\s*(\d{1,2})/i);
  return m ? parseInt(m[1],10) : null;
}
async function importWeeklyCSV(text, filename){
  const {header, rows}=parseCSV(text);
  const week=weekFromFilename(filename);
  if(!week){ toast("CSV : numéro de semaine introuvable"); return; }

  const h=header.map(x=>fixText(x).trim().toLowerCase());
  const looksWeekly = h.includes("lundi") && h.includes("mardi") && h.includes("mercredi") && h.includes("jeudi") && h.includes("vendredi");
  if(!looksWeekly){ toast("CSV non reconnu"); return; }

  let count=0;
  for(const r of rows){
    const slot=fixText(r[0]||"").trim();
    if(!slot) continue;
    for(let i=0;i<7;i++){
      let v=fixText(r[i+1]||"").trim();
      if(v===""||v.toLowerCase()==="nan") v="Occupation";
      await setCell(week, slot, DAYS[i], v);
      count++;
    }
  }
  toast(`Import CSV OK – S${week} (${count} cellules)`);
}

/* ======================================================
   STATS (principal)
====================================================== */
let _statsTimer=null;
function scheduleStatsRefresh(){
  clearTimeout(_statsTimer);
  _statsTimer = setTimeout(()=>{ try{ renderStats(); }catch(e){} }, 200);
}
function clampWeeks(v){
  const min=parseInt($("workedRange").min,10), max=parseInt($("workedRange").max,10);
  v=parseInt(v,10); if(isNaN(v)) v=min;
  return Math.max(min, Math.min(max, v));
}
function countActivitiesForWeeks(weeks){
  const counts={};
  ACTIVITIES.forEach(a=>{ if(a!=="Occupation") counts[a]=0; });
  for(const w of weeks){
    for(const slot of SLOTS){
      for(const day of DAYS){
        const a=getCell(w,slot,day);
        if(a!=="Occupation") counts[a]=(counts[a]||0)+1;
      }
    }
  }
  return counts;
}
function renderSpark(points){
  const container = $("spark");
  if(!container) return;
  if(points.length===0){ container.innerHTML=""; return; }
  const W=520,H=140,pad={l:28,r:10,t:10,b:24},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b;
  const maxV=Math.max(1,...points.map(p=>p.n));
  const stepX=iw/Math.max(1,points.length-1);
  const coords=points.map((p,i)=>[pad.l+i*stepX, pad.t+ih-(p.n/maxV)*ih]);
  const line=coords.map(c=>c.join(",")).join(" ");
  const area=`M ${pad.l},${pad.t+ih} L ${coords.map(c=>c.join(",")).join(" L ")} L ${pad.l+(points.length-1)*stepX},${pad.t+ih} Z`;
  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}">
      <path d="${area}" fill="rgba(36,48,143,.10)"></path>
      <polyline points="${line}" fill="none" stroke="#24308f" stroke-width="2"></polyline>
      ${coords.map(c=>`<circle cx="${c[0]}" cy="${c[1]}" r="3" fill="#24308f"></circle>`).join("")}
    </svg>
  `;
}

function renderStats(){
  const period = $("periodSelect").value;

  // seuils
  $("warnPct").value = objectifs.thresholds.warnPct ?? 90;
  $("alertPct").value = objectifs.thresholds.alertPct ?? 110;

  const warnPct = objectifs.thresholds.warnPct ?? 90;
  const alertPct = objectifs.thresholds.alertPct ?? 110;

  const baseWeeks = weeksForPeriod(period);
  let weeksForNumerator = baseWeeks.slice();
  if(period==="school") weeksForNumerator = uniqueOrdered([...weeksForNumerator, ...weeksForPeriod("bonus")]);

  const counts = countActivitiesForWeeks(weeksForNumerator);
  const totalReal = Object.values(counts).reduce((s,v)=>s+v,0);

  const divisor = clampWeeks($("workedInput").value || $("workedRange").value || 36);
  $("workedRange").value = String(divisor);
  $("workedInput").value = String(divisor);
  $("workedLabel").textContent = String(divisor);

  const avg = totalReal / Math.max(1, divisor);
  $("totalReal").textContent = String(totalReal);
  $("avgPerWeek").textContent = avg.toFixed(1);

  const perAct = (objectifs.perActivity[period] ||= {});
  const storedGlobal = Number(objectifs.global?.[period] || 0);
  const sumPerAct = Object.values(perAct).map(Number).filter(v=>!isNaN(v)&&v>0).reduce((a,b)=>a+b,0);
  const effectiveGlobal = storedGlobal > 0 ? storedGlobal : sumPerAct;

  const globalExpectedInput=$("globalExpected");
  const globalStatus=$("globalStatus");

  globalExpectedInput.value = storedGlobal > 0 ? String(storedGlobal) : "";
  globalExpectedInput.placeholder = sumPerAct>0 ? `auto : ${sumPerAct}` : "—";
  globalExpectedInput.oninput = async ()=>{
    const v = Number(globalExpectedInput.value);
    if(!globalExpectedInput.value || isNaN(v) || v<=0) objectifs.global[period]=0;
    else objectifs.global[period]=Math.round(v);
    await persistObjectifs();
    scheduleStatsRefresh();
  };

  function globalStatusHTML(real, exp){
    if(!exp || exp<=0) return "—";
    const pct = Math.round((real/exp)*100);
    const diff = real-exp;
    if(pct >= alertPct) return `<span style="color:var(--danger);font-weight:900">${pct}% – +${diff} h</span>`;
    if(pct >= 100) return `<span style="color:var(--ok);font-weight:900">${pct}% – atteint</span>`;
    if(pct >= warnPct) return `<span style="color:var(--warn);font-weight:900">${pct}% – reste ${Math.abs(diff)} h</span>`;
    return `<span style="color:var(--dim)">${pct}% – reste ${Math.abs(diff)} h</span>`;
  }
  globalStatus.innerHTML = globalStatusHTML(totalReal, effectiveGlobal);

  const globalFill=$("globalFill");
  const globalBarText=$("globalBarText");
  globalFill.classList.remove("global-warn","global-ok","global-alert");
  globalFill.style.background="var(--dim)";

  if(!effectiveGlobal || effectiveGlobal<=0){
    globalFill.style.width="0%";
    globalBarText.textContent="Objectif global non défini";
  } else {
    const pct=Math.round((totalReal/effectiveGlobal)*100);
    const diff=totalReal-effectiveGlobal;
    globalFill.style.width = Math.min(100,(totalReal/effectiveGlobal)*100).toFixed(1)+"%";
    if(pct>=alertPct) globalFill.classList.add("global-alert");
    else if(pct>=100) globalFill.classList.add("global-ok");
    else if(pct>=warnPct) globalFill.classList.add("global-warn");
    globalBarText.textContent = diff>0 ? `${pct}% (+${diff} h)` : diff<0 ? `${pct}% (reste ${Math.abs(diff)} h)` : `100% (atteint)`;
  }

  const setActs = new Set(Object.keys(counts).filter(a=>counts[a]>0));
  Object.keys(perAct).forEach(a=>setActs.add(a));
  const list = Array.from(setActs).filter(a=>a && a!=="Occupation");
  list.sort((a,b)=>(counts[b]||0)-(counts[a]||0) || a.localeCompare(b));
  const maxReal = Math.max(1, ...list.map(a=>counts[a]||0));

  const bars=$("bars");
  bars.innerHTML="";
  if(list.length===0){
    bars.innerHTML=`<div class="hint">Aucune donnée : importe des semaines ou renseigne des attendus.</div>`;
    return;
  }

  list.forEach(act=>{
    const real=counts[act]||0;
    const exp=perAct[act]?Number(perAct[act]):0;
    const pct=exp>0?Math.round((real/exp)*100):null;
    const diff=exp>0?(real-exp):null;

    let widthPct = exp>0 ? Math.min(100,(real/exp)*100) : (real/maxReal)*100;
    let cls="", badge="";
    if(exp>0 && pct!==null){
      if(pct>=alertPct){ cls="alert"; badge=`<span class="badge b-alert">ALERTE</span>`; }
      else if(pct>=100){ cls="ok"; badge=`<span class="badge b-ok">OK</span>`; }
      else if(pct>=warnPct){ cls="warn"; badge=`<span class="badge b-warn">PROCHE</span>`; }
    }

    const row=document.createElement("div");
    row.className=`barrow ${cls}`;

    const label=document.createElement("div");
    label.className="barname";
    label.title=act;
    label.innerHTML=`${act}${badge}`;

    const track=document.createElement("div");
    track.className="track";
    const fill=document.createElement("div");
    fill.className="fill";
    fill.style.width=widthPct.toFixed(1)+"%";
    fill.style.background=COLORS[act]||"#444";
    track.appendChild(fill);

    const value=document.createElement("div");
    value.className="barval";
    if(exp>0){
      if(diff>0) value.innerHTML=`<span style="color:var(--danger);font-weight:900">${real} / ${exp} (${pct}%) – +${diff} h</span>`;
      else if(diff<0) value.innerHTML=`<span style="color:var(--dim)">${real} / ${exp} (${pct}%) – reste ${Math.abs(diff)} h</span>`;
      else value.innerHTML=`<span style="color:var(--ok);font-weight:900">${real} / ${exp} (100%) – atteint</span>`;
    } else value.textContent=`${real}`;

    const expBox=document.createElement("div");
    expBox.className="expbox";
    const lab=document.createElement("label");
    lab.textContent="Attendu";
    const inp=document.createElement("input");
    inp.type="number"; inp.min="0"; inp.step="1"; inp.placeholder="—";
    inp.value=exp>0?String(exp):"";
    const applyExpected=async ()=>{
      const v=Number(inp.value);
      if(!inp.value||isNaN(v)||v<=0) delete objectifs.perActivity[period][act];
      else objectifs.perActivity[period][act]=Math.round(v);
      await persistObjectifs();
    };
    inp.addEventListener("input", ()=>{ applyExpected(); scheduleStatsRefresh(); });
    inp.addEventListener("blur", ()=>{ applyExpected(); renderStats(); });
    inp.addEventListener("change", ()=>{ applyExpected(); renderStats(); });

    expBox.appendChild(lab); expBox.appendChild(inp);
    row.appendChild(label); row.appendChild(track); row.appendChild(value); row.appendChild(expBox);
    bars.appendChild(row);
  });

  const pts = baseWeeks.map(w=>{
    let n=0;
    for(const slot of SLOTS) for(const day of DAYS) if(getCell(w,slot,day)!=="Occupation") n++;
    return {w,n};
  });
  renderSpark(pts);
}

/* Export CSV stats */
function exportStatsCSV(){
  const period = $("periodSelect").value;
  const baseWeeks = weeksForPeriod(period);
  let weeksForNumerator = baseWeeks.slice();
  if(period==="school") weeksForNumerator = uniqueOrdered([...weeksForNumerator, ...weeksForPeriod("bonus")]);

  const counts = countActivitiesForWeeks(weeksForNumerator);
  const totalReal = Object.values(counts).reduce((s,v)=>s+v,0);

  const divisor = clampWeeks($("workedInput").value || $("workedRange").value || 36);
  const avg = totalReal / Math.max(1,divisor);

  const perAct = objectifs.perActivity[period] || {};
  const acts = new Set(Object.keys(counts));
  Object.keys(perAct).forEach(a=>acts.add(a));

  const rows=[
    ["Periode", period],
    ["Diviseur (semaines)", String(divisor)],
    ["Total realise", String(totalReal)],
    ["Moyenne / semaine", avg.toFixed(1)],
    [],
    ["Activite","Realise","Attendu","%","Ecart"]
  ];
  Array.from(acts).filter(a=>a&&a!=="Occupation").sort().forEach(a=>{
    const real=counts[a]||0;
    const exp=perAct[a]?Number(perAct[a]):0;
    const pct=exp>0?Math.round((real/exp)*100):"";
    const diff=exp>0?(real-exp):"";
    rows.push([a,String(real),exp>0?String(exp):"",pct!==""?String(pct):"",diff!==""?String(diff):""]);
  });

  const csv=rows.map(r=>r.join(";")).join("\n");
  download("stats_planning_scolaire.csv", csv, "text/csv");
}

/* ======================================================
   PREFILL
====================================================== */
const pfSelectedWeeks = new Set();
let pfCtx=null;

function fillPrefillSourceWeeks(){
  const pfSourceWeek=$("pfSourceWeek");
  pfSourceWeek.innerHTML="";
  SCHOOL_ORDER.forEach(w=>{
    const o=document.createElement("option");
    o.value=w; o.textContent="Semaine "+w;
    pfSourceWeek.appendChild(o);
  });
}

function refreshPrefillWeekList(){
  const pfWeekList=$("pfWeekList");
  const pfCount=$("pfCount");
  pfWeekList.innerHTML="";
  SCHOOL_ORDER.forEach(w=>{
    const row=document.createElement("label");
    row.className="hint";
    row.style.display="flex";
    row.style.gap="10px";
    row.style.alignItems="center";
    row.style.margin="6px 0";
    row.innerHTML = `<input type="checkbox"><span style="color:var(--text);font-weight:800">S${w}</span>`;
    const cb=row.querySelector("input");
    cb.checked = pfSelectedWeeks.has(w);
    cb.addEventListener("change", ()=>{
      if(cb.checked) pfSelectedWeeks.add(w); else pfSelectedWeeks.delete(w);
      pfCount.textContent = pfSelectedWeeks.size + (pfSelectedWeeks.size<=1 ? " semaine sélectionnée":" semaines sélectionnées");
    });
    pfWeekList.appendChild(row);
  });
  pfCount.textContent = pfSelectedWeeks.size + (pfSelectedWeeks.size<=1 ? " semaine sélectionnée":" semaines sélectionnées");
}

function setPrefillSelection(list){
  pfSelectedWeeks.clear();
  list.forEach(w=>pfSelectedWeeks.add(w));
  refreshPrefillWeekList();
}

function renderPrefillGrid(){
  const pfGrid=$("pfGrid");
  pfGrid.innerHTML="";
  const thead=document.createElement("thead");
  const trh=document.createElement("tr");
  const th0=document.createElement("th"); th0.textContent="Créneau"; trh.appendChild(th0);
  DAYS.forEach(d=>{ const th=document.createElement("th"); th.textContent=d.slice(0,3).toUpperCase(); trh.appendChild(th); });
  thead.appendChild(trh); pfGrid.appendChild(thead);

  const tbody=document.createElement("tbody");
  SLOTS.forEach(slot=>{
    const tr=document.createElement("tr");
    const td0=document.createElement("td"); td0.textContent=slot; tr.appendChild(td0);

    DAYS.forEach(day=>{
      const td=document.createElement("td");
      const act = (TEMPLATE[slot] && TEMPLATE[slot][day]) ? TEMPLATE[slot][day] : "Occupation";
      const b=document.createElement("button");
      b.className="cell";
      b.style.background = COLORS[act] || "#444";
      b.style.color = (act==="Occupation") ? "#666" : "#0b1020";
      b.textContent = (act==="Occupation") ? "" : act;
      b.addEventListener("click", ()=>openPrefillPicker(slot, day, act));
      td.appendChild(b); tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  pfGrid.appendChild(tbody);
}

function openPrefillPicker(slot, day, current){
  pfCtx={slot,day,current};
  $("pfMTitle").textContent = slot+" — "+day;
  $("pfMSub").textContent = "Choisis une activité pour le modèle";
  const pfChoices=$("pfChoices");
  pfChoices.innerHTML="";
  ACTIVITIES.forEach(a=>{
    const btn=document.createElement("button");
    btn.className="choice"+(a===current?" sel":"");
    btn.style.background = COLORS[a] || "#444";
    btn.style.color = (a==="Occupation") ? "#666" : "#0b1020";
    btn.textContent=a;
    btn.addEventListener("click", ()=>{
      pfChoices.querySelectorAll(".choice").forEach(x=>x.classList.remove("sel"));
      btn.classList.add("sel");
    });
    pfChoices.appendChild(btn);
  });
  $("pfOverlay").classList.add("open");
}
function closePrefillPicker(){ $("pfOverlay").classList.remove("open"); pfCtx=null; }

/* ======================================================
   ADV STATS
====================================================== */
const advActs = ACTIVITIES.filter(a=>a && a!=="Occupation");
const advSelected = new Set(advActs);

function renderAdvChecks(){
  const aaChecks=$("aaChecks");
  aaChecks.innerHTML="";
  advActs.forEach(act=>{
    const row=document.createElement("label");
    row.style.display="flex";
    row.style.gap="10px";
    row.style.alignItems="center";
    row.style.margin="6px 0";
    row.innerHTML = `
      <input type="checkbox" ${advSelected.has(act)?"checked":""}>
      <span style="width:12px;height:12px;border-radius:4px;background:${COLORS[act]||"#777"}"></span>
      <span style="font-family:var(--font-hand);font-size:16px;font-weight:700">${act}</span>
    `;
    const cb = row.querySelector("input");
    cb.addEventListener("change",(e)=>{
      if(e.target.checked) advSelected.add(act); else advSelected.delete(act);
      renderAdvStats();
    });
    aaChecks.appendChild(row);
  });
}

function computeAdv(period){
  const wks = weeksForPeriod(period);
  const totals={};
  advActs.forEach(a=>totals[a]=0);

  for(const w of wks){
    for(const slot of SLOTS){
      for(const day of DAYS){
        const a=getCell(w,slot,day);
        if(!a || a==="Occupation") continue;
        if(totals[a] !== undefined) totals[a]+=1;
      }
    }
  }
  const filtered={};
  advActs.forEach(a=>{ if(advSelected.has(a)) filtered[a]=totals[a]; });
  const totalSelected = Object.values(filtered).reduce((s,v)=>s+v,0);
  return {wksCount:wks.length, totalsSel:filtered, totalSelected};
}

function renderAdvBars(totalsSel){
  const aaBars=$("aaBars");
  const entries = Object.entries(totalsSel).filter(([,v])=>v>0);
  if(entries.length===0){ aaBars.innerHTML = `<div class="hint">Aucune heure.</div>`; return; }
  entries.sort((a,b)=>b[1]-a[1]);
  const maxV=Math.max(1,...entries.map(e=>e[1]));

  const barH=26,W=760,H=40+entries.length*barH,padL=160,padR=20,padT=20;
  let svg=`<text x="10" y="16" font-size="12" fill="#4b5563">Heures</text>`;
  entries.forEach(([act,val], i)=>{
    const y=padT+i*barH+10;
    const w=((W-padL-padR)*(val/maxV));
    svg+=`
      <text x="10" y="${y+12}" font-size="14" fill="#111827" style="font-family:var(--font-hand);">${act}</text>
      <rect x="${padL}" y="${y}" width="${w}" height="16" rx="8" fill="${COLORS[act]||"#777"}"></rect>
      <text x="${padL+w+8}" y="${y+12}" font-size="12" fill="#4b5563" style="font-family:var(--font-type);">${val}</text>
    `;
  });
  aaBars.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${svg}</svg>`;
}

function renderAdvPie(totalsSel, total){
  const aaPie=$("aaPie");
  const entries=Object.entries(totalsSel).filter(([,v])=>v>0);
  if(entries.length===0){ aaPie.innerHTML = `<div class="hint">Aucune heure.</div>`; return; }

  const W=420,H=320,cx=210,cy=140,r=110;
  function polar(a){ return [cx + r*Math.cos(a), cy + r*Math.sin(a)]; }
  function arcPath(a0,a1){
    const [x0,y0]=polar(a0), [x1,y1]=polar(a1);
    const large=(a1-a0)>Math.PI?1:0;
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  }

  let a=-Math.PI/2, paths="";
  let legend=`<div class="hint">Total sélection : <b style="color:var(--text)">${total}</b> h</div>`;
  entries.sort((a,b)=>b[1]-a[1]).forEach(([act,val])=>{
    const frac=val/total;
    const a1=a+frac*2*Math.PI;
    paths += `<path d="${arcPath(a,a1)}" fill="${COLORS[act]||"#777"}"></path>`;
    legend += `
      <div style="display:flex;gap:10px;align-items:center;margin:6px 0">
        <span style="width:12px;height:12px;border-radius:4px;background:${COLORS[act]||"#777"}"></span>
        <span style="font-family:var(--font-hand);font-size:16px;font-weight:700">${act}</span>
        <span style="margin-left:auto;font-family:var(--font-type);font-size:12px;color:var(--dim)">${val} (${Math.round(frac*100)}%)</span>
      </div>`;
    a=a1;
  });

  aaPie.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
      ${paths}
      <text x="${cx}" y="${H-16}" font-size="12" fill="#4b5563" text-anchor="middle" style="font-family:var(--font-type);">Répartition</text>
    </svg>
    ${legend}
  `;
}

function renderAdvStats(){
  const period=$("aaPeriod").value;
  const {wksCount, totalsSel, totalSelected} = computeAdv(period);
  $("aaWeeks").textContent = String(wksCount);
  $("aaTotal").textContent = String(totalSelected);
  $("aaAvg").textContent = (totalSelected / Math.max(1,wksCount)).toFixed(1);
  renderAdvBars(totalsSel);
  renderAdvPie(totalsSel, Math.max(1,totalSelected));
}

/* ======================================================
   Render global + wiring
====================================================== */
function renderAll(){
  renderWeek();
  renderStats();
  refreshPrefillWeekList();
  renderPrefillGrid();
  renderAdvChecks();
  renderAdvStats();
  showView("planning");
}

function wireEvents(){
  // tabs
  document.querySelectorAll(".tab").forEach(t=>{
    t.addEventListener("click", ()=>showView(t.dataset.view));
  });

  // auth
  $("btn-login").onclick = ()=>login($("auth-email").value, $("auth-password").value);
  $("btn-signup").onclick = ()=>signup($("auth-email").value, $("auth-password").value);
  $("btn-logout").onclick = logout;

  // week nav
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
    if(i<SCHOOL_ORDER.length-1){ currentWeek = SCHOOL_ORDER[i+1]; renderWeek(); }
  });

  // modal
  $("mCancel").addEventListener("click", closeModal);
  $("overlay").addEventListener("click",(e)=>{ if(e.target===$("overlay")) closeModal(); });
  $("mSave").addEventListener("click", async ()=>{
    const sel = $("choices").querySelector(".choice.sel");
    if(!sel || !modalCtx) return;
    await setCell(modalCtx.week, modalCtx.slot, modalCtx.day, sel.textContent);
    closeModal();
    renderAll();
    toast("Enregistré");
  });

  // export/import JSON
  $("btnExportJson").addEventListener("click", ()=>{
    download("planning_scolaire_donnees.json", JSON.stringify({overrides, objectifs}, null, 2), "application/json");
  });

  $("importJson").addEventListener("change", async (e)=>{
    const file=e.target.files && e.target.files[0];
    if(!file) return;
    try{
      const payload = JSON.parse(await file.text());
      if(payload.overrides) overrides = payload.overrides;
      if(payload.objectifs) objectifs = payload.objectifs;
      await persistObjectifs();
      await upsertOverridesBulk();
      toast("Import JSON OK");
      renderAll();
    }catch{
      toast("Import JSON impossible");
    }finally{
      e.target.value="";
    }
  });

  // import CSV
  $("importCSV").addEventListener("change", async (e)=>{
    const files=e.target.files?Array.from(e.target.files):[];
    for(const f of files){
      await importWeeklyCSV(await f.text(), f.name);
    }
    renderAll();
    e.target.value="";
  });

  // stats controls
  $("workedRange").addEventListener("input", renderStats);
  $("workedInput").addEventListener("input", renderStats);
  $("periodSelect").addEventListener("change", renderStats);
  $("btnExportCsv").addEventListener("click", exportStatsCSV);

  $("warnPct").addEventListener("change", async ()=>{
    objectifs.thresholds.warnPct = Math.max(50, Math.min(99, Number($("warnPct").value)||90));
    $("warnPct").value = objectifs.thresholds.warnPct;
    await persistObjectifs();
    renderStats();
  });
  $("alertPct").addEventListener("change", async ()=>{
    objectifs.thresholds.alertPct = Math.max(100, Math.min(300, Number($("alertPct").value)||110));
    $("alertPct").value = objectifs.thresholds.alertPct;
    await persistObjectifs();
    renderStats();
  });

  // prefill controls
  $("pfAll").addEventListener("click", ()=>setPrefillSelection(SCHOOL_ORDER));
  $("pfNone").addEventListener("click", ()=>setPrefillSelection([]));
  $("pfT1").addEventListener("click", ()=>setPrefillSelection(weeksForPeriod("t1")));
  $("pfT2").addEventListener("click", ()=>setPrefillSelection(weeksForPeriod("t2")));
  $("pfT3").addEventListener("click", ()=>setPrefillSelection(weeksForPeriod("t3")));
  $("pfBonus").addEventListener("click", ()=>setPrefillSelection(weeksForPeriod("bonus")));

  $("pfCancel").addEventListener("click", closePrefillPicker);
  $("pfOverlay").addEventListener("click",(e)=>{ if(e.target===$("pfOverlay")) closePrefillPicker(); });
  $("pfOk").addEventListener("click", async ()=>{
    const sel=$("pfChoices").querySelector(".choice.sel");
    if(!sel || !pfCtx) return;
    TEMPLATE[pfCtx.slot] ||= {};
    TEMPLATE[pfCtx.slot][pfCtx.day] = sel.textContent;
    await persistTemplate();
    closePrefillPicker();
    renderPrefillGrid();
    toast("Modèle enregistré");
  });

  $("pfCopyFromWeek").addEventListener("click", async ()=>{
    const w=parseInt($("pfSourceWeek").value,10);
    if(!Number.isFinite(w)) return;
    const t=emptyTemplate();
    for(const slot of SLOTS) for(const day of DAYS) t[slot][day]=getCell(w,slot,day);
    TEMPLATE=t;
    await persistTemplate();
    renderPrefillGrid();
    toast("Modèle copié");
  });
  $("pfClear").addEventListener("click", async ()=>{
    TEMPLATE=emptyTemplate();
    await persistTemplate();
    renderPrefillGrid();
    toast("Modèle vidé");
  });
  $("pfSave").addEventListener("click", async ()=>{
    await persistTemplate();
    toast("Modèle enregistré");
  });
  $("pfApply").addEventListener("click", async ()=>{
    const weeks=Array.from(pfSelectedWeeks);
    if(!weeks.length){ toast("Aucune semaine cochée"); return; }

    const onlyEmpty = $("pfOnlyEmpty").checked;
    const includeOcc = $("pfIncludeOccupation").checked;

    let writes=0;
    for(const w of weeks){
      for(const slot of SLOTS){
        for(const day of DAYS){
          const val = (TEMPLATE[slot] && TEMPLATE[slot][day]) ? TEMPLATE[slot][day] : "Occupation";
          if(!includeOcc && val==="Occupation") continue;
          if(onlyEmpty && getCell(w,slot,day)!=="Occupation") continue;
          await setCell(w,slot,day,val);
          writes++;
        }
      }
    }
    toast(`Modèle appliqué (${writes} cellules)`);
    renderAll();
  });

  // adv stats controls
  $("aaPeriod").addEventListener("change", renderAdvStats);
  $("aaAll").addEventListener("click", ()=>{
    advSelected.clear(); advActs.forEach(a=>advSelected.add(a));
    renderAdvChecks(); renderAdvStats();
  });
  $("aaNone").addEventListener("click", ()=>{
    advSelected.clear();
    renderAdvChecks(); renderAdvStats();
  });
}

/* ======================================================
   INIT
====================================================== */
async function startApp() {
  wireEvents();
  buildWeekSelect();
  fillPrefillSourceWeeks();
  renderAdvChecks();

  await updateUserBar();
  await hydrateAllFromSupabase();

  renderAll();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}
