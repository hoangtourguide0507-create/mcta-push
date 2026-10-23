
const APP_VERSION="V28.0";
// V28.0: app chạy trên GitHub Pages; dữ liệu + thông báo nằm trên máy chủ Cloudflare riêng (mcta-push).
const CLOUD_DEFAULT="";
const KEY="freelance_planner_v12";
const OLD_KEYS=["freelance_planner_v16","freelance_planner_v15","freelance_planner_v14","freelance_planner_v13","freelance_planner_v12","freelance_planner_v11","freelance_planner_v10","freelance_planner_v9","freelance_planner_v8","freelance_planner_v7","freelance_planner_v6","freelance_planner_v5","freelance_planner_v4","freelance_planner_v3","freelance_planner_v2","freelance_planner_v1"];
let raw=localStorage.getItem(KEY)||OLD_KEYS.map(k=>localStorage.getItem(k)).find(Boolean);
let state=raw?JSON.parse(raw):null;
let seedReady=!!state;
function initializeState(next){
  state=next;
  state.settings=state.settings||{};
  state.settings.theme=state.settings.theme||"fresh";
  state.settings.appName=state.settings.appName||"MC Thiên Ân";
  state.settings.push=state.settings.push||{enabled:false,subscribed:false,lastStatus:""};
  state.settings.financeVisible=state.settings.financeVisible===true;
  state.settings.showCountVisible=state.settings.showCountVisible!==false;
  state.settings.soundNotifications=state.settings.soundNotifications!==false;
  state.settings.browserMapsKey=state.settings.browserMapsKey||"";
  state.settings.jobTypes=Array.isArray(state.settings.jobTypes)?state.settings.jobTypes:[];
  state.settings.appName=String(state.settings.appName||"MC Thiên Ân").trim()||"MC Thiên Ân"; if(state.settings.theme==="pro") state.settings.theme="pink"; const validThemes=["clean","fresh","pink","tiki","green","pop"]; if(!validThemes.includes(state.settings.theme)) state.settings.theme="fresh";
  state.notes=state.notes||[]; state.vendors=state.vendors||[]; state.bookers=state.bookers||[];
  state.jobs=state.jobs||[];
  normalizeJobTypes();
  migrateBookers();
  normalizeJobs();
  normalizeLocationFields();
  document.documentElement.dataset.theme=state.settings.theme;
}
let syncTimer=null, backendReady=false;
let localMode=(location.hostname==="localhost"||location.hostname==="127.0.0.1"||location.protocol==="file:"||new URLSearchParams(location.search).has("browserTest"));
function todayStr(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
let browserTestMode=(location.protocol==="file:"||new URLSearchParams(location.search).has("browserTest"));
let mapsConfig={apiKey:"",ready:false,failed:false}; let mapsScriptPromise=null;
let page="home", calendarDate=new Date(), selectedDate=todayStr(), jobFilter="Tất cả", searchQuery="", bookerSearch="", showPastJobs=false, workFilter="Tất cả";


async function ensureSeed(){
  if(seedReady) return true;
  try{
    if(window.SEED_STATE){ initializeState(JSON.parse(JSON.stringify(window.SEED_STATE))); seedReady=true; return true; }
    await new Promise((resolve,reject)=>{
      const sc=document.createElement("script");
      if(!browserTestMode)return reject(new Error("no seed in production"));
      sc.src="demo-data.js?v=24";
      sc.async=true;
      sc.onload=resolve;
      sc.onerror=reject;
      document.head.appendChild(sc);
    });
    if(!window.SEED_STATE) throw new Error("Seed not loaded");
    initializeState(JSON.parse(JSON.stringify(window.SEED_STATE)));
    seedReady=true;
    return true;
  }catch(e){
    initializeState({jobs:[],bookers:[],notes:[],vendors:[],settings:{theme:"fresh",appName:"MC Thiên Ân"}});
    seedReady=true;
    return false;
  }
}

function bootLocal(){
  if(!state || typeof state!=="object") state={jobs:[],bookers:[],notes:[],vendors:[],settings:{theme:"fresh",appName:"MC Thiên Ân"}};
  initializeState(state);
  document.documentElement.dataset.theme=state.settings.theme;
}
const DEFAULT_JOB_TYPES=["Wedding","Corporate","Birthday","Private Party","Other"];
const TYPE_PALETTE=[
  {bg:"#eaf2ff",color:"#3571bf",border:"#d5e5ff"},
  {bg:"#fff0f6",color:"#bd4b7a",border:"#ffd7e8"},
  {bg:"#e9f8f1",color:"#2a8b66",border:"#d4eee2"},
  {bg:"#fff5df",color:"#ab741c",border:"#f5e5bd"},
  {bg:"#f0ecff",color:"#6c59c8",border:"#e1dafb"},
  {bg:"#eef7f7",color:"#397e82",border:"#d9eeee"},
  {bg:"#fff0ea",color:"#b85e3d",border:"#f8d8ca"},
  {bg:"#f4f1ee",color:"#6c625a",border:"#e7e0d9"}
];
// V25.0: mọi job trong app đều là show đã chốt; trạng thái tự suy ra từ tiền.
// Show cũ (trước 1/10/2026) ở trạng thái "Đang deal / Chưa cập nhật / Hoàn thành / Đã thanh toán" được coi là đã thanh toán xong.
const LEGACY_CUTOFF="2026-10-01";
function legacySettled(j){if(j.status==="Đã thanh toán")return true;return (j.date||"")<LEGACY_CUTOFF&&["Đang deal","Chưa cập nhật","Hoàn thành"].includes(j.status);}
function jobStatus(j){if(j.paidFull)return "Đã thanh toán";if(Number(j.deposit||0)>0)return "Đã cọc";return "Đã chốt";}
const SCRIPT_SOURCES=["Chưa xác định","Khách gửi","MC Thiên Ân tự viết"];
const SCRIPT_STATUSES=["Chưa có","Đang viết / cập nhật","Đã cập nhật"];
const LOVE_STORY_STATUSES=["Không áp dụng","Chưa có","Đang viết","Đã viết"];
const REMINDER_PRESETS=[{minutes:10080,label:"7 ngày"},{minutes:1440,label:"1 ngày"},{minutes:120,label:"2 giờ"},{minutes:30,label:"30 phút"}];
const MEETING_MODES=["Online","Offline"];
const MEETING_REMINDER_PRESETS=[{minutes:1440,label:"1 ngày"},{minutes:120,label:"2 giờ"},{minutes:60,label:"1 giờ"},{minutes:15,label:"15 phút"}];
const MEETING_DEFAULT_REMINDERS=[1440,60];
function meetingStartMs(m){const t=/^\d{2}:\d{2}$/.test(m.time||"")?m.time:"09:00";return Date.parse(`${m.date}T${t}:00+07:00`);}
function jobMeetings(j){return (j.meetings||[]).filter(m=>m&&m.date).slice().sort((a,b)=>(a.date+(a.time||"")).localeCompare(b.date+(b.time||"")));}
function upcomingMeetings(limit=5){const out=[];state.jobs.forEach(j=>jobMeetings(j).forEach(m=>{if(isNotOver(m,MEETING_GRACE_MS))out.push({job:j,m});}));return out.sort((a,b)=>(a.m.date+(a.m.time||"")).localeCompare(b.m.date+(b.m.time||""))).slice(0,limit);}
function nextMeetingOf(j){return jobMeetings(j).find(m=>isNotOver(m,MEETING_GRACE_MS))||null;}
function meetingChip(j){const m=nextMeetingOf(j);if(!m)return"";return `<span class="work-chip meet-chip">Họp ${esc(fmtDate(m.date).slice(0,5))}${m.time?` · ${esc(m.time)}`:""} · ${esc(m.mode||"")}</span>`;}
function meetingWhere(m){return m.mode==="Online"?(m.link||"Online"):(m.place||"Chưa có địa điểm họp");}
function safeHref(u){u=String(u||"").trim();if(!u)return"";if(/^(https?:|zalo:|tel:)/i.test(u))return u;if(/^[\w.-]+\.[a-z]{2,}/i.test(u))return "https://"+u;return "";}
function meetingItem(j,m){return `<button class="timeline-item tl2 meeting-item ${isLive(m,MEETING_GRACE_MS)?"live":""}" onclick="openJob('${j.id}')">${dateBlock(m.date,"meet")}<div class="tl-body"><div class="tl-title"><span class="meet-badge">HỌP</span> ${esc(j.title)}</div>${tlMeta(m,(m.mode==="Online"?"Online":(m.place||"Offline")),MEETING_GRACE_MS)}${m.note?`<div class="tl-note">${esc(m.note)}</div>`:""}</div>${icon("chevron",16)}</button>`;}
function meetingFormBlock(m){
  m=m||{id:makeId(),date:"",time:"",mode:"Offline",place:"",link:"",note:"",reminders:MEETING_DEFAULT_REMINDERS.map(x=>({minutes:x,enabled:true}))};
  const on=min=>(m.reminders||[]).some(r=>r.minutes===min&&r.enabled!==false);
  const k=`mt_${m.id}_`;
  return `<div class="meeting-block" data-mid="${esc(m.id)}" data-mode="${esc(m.mode||"Offline")}">
  <div class="meeting-block-head"><b>Buổi họp</b><button type="button" class="text-btn danger-text" onclick="this.closest('.meeting-block').remove();refreshMeetingEmpty();onJobFormEdit()">Xóa</button></div>
  <div class="two">${field("Ngày họp",k+"date",m.date,false,"date")}${field("Giờ họp",k+"time",m.time,false,"time")}</div>
  <label class="field"><span>Hình thức</span><div class="seg">${MEETING_MODES.map(x=>`<label class="seg-opt"><input type="radio" name="${k}mode" value="${x}" ${(m.mode||"Offline")===x?"checked":""} onchange="this.closest('.meeting-block').dataset.mode=this.value"><span>${x==="Online"?"Online":"Offline (gặp trực tiếp)"}</span></label>`).join("")}</div></label>
  <div class="meet-offline">${field("Địa điểm họp",k+"place",m.place)}</div>
  <div class="meet-online">${field("Link họp (Zoom / Google Meet / Zalo…)",k+"link",m.link)}</div>
  ${field("Ghi chú buổi họp",k+"note",m.note)}
  <div class="small meet-remind-label">Nhắc lịch họp</div>
  <div class="notify-grid meet-remind-grid">${MEETING_REMINDER_PRESETS.map(r=>`<label class="notify-option"><input type="checkbox" name="${k}rem_${r.minutes}" ${on(r.minutes)?"checked":""}> Trước ${r.label}</label>`).join("")}</div>
</div>`;
}
function addMeetingBlock(){onJobFormEdit();const list=document.getElementById("meetingList");if(!list)return;list.insertAdjacentHTML("beforeend",meetingFormBlock());refreshMeetingEmpty();const last=list.lastElementChild;last?.querySelector('input[type=date]')?.focus();}
function refreshMeetingEmpty(){const list=document.getElementById("meetingList"),empty=document.getElementById("meetingEmpty");if(list&&empty)empty.style.display=list.children.length?"none":"";}
function collectMeetings(d){
  const out=[];
  document.querySelectorAll("#meetingList .meeting-block").forEach(el=>{
    const id=el.dataset.mid,k=`mt_${id}_`;
    const m={id,date:d[k+"date"]||"",time:d[k+"time"]||"",mode:d[k+"mode"]||"Offline",place:(d[k+"place"]||"").trim(),link:(d[k+"link"]||"").trim(),note:(d[k+"note"]||"").trim()};
    m.reminders=MEETING_REMINDER_PRESETS.map(r=>({minutes:r.minutes,enabled:d[`${k}rem_${r.minutes}`]==="on"}));
    if(m.date){const ms=meetingStartMs(m);m.startsAt=Number.isFinite(ms)?new Date(ms).toISOString():"";out.push(m);}
  });
  Object.keys(d).forEach(key=>{if(key.startsWith("mt_"))delete d[key];});
  return out.sort((a,b)=>(a.date+(a.time||"")).localeCompare(b.date+(b.time||"")));
}

function hideSplash(){try{localStorage.setItem("mcta_theme",state.settings.theme||"fresh");}catch(_){}const sp=document.getElementById("splash");if(sp){sp.classList.add("gone");setTimeout(()=>sp.remove(),350);}}
// ---- V23.1: đồng bộ theo từng mục + ghi nhận xoá ----
const DEVICE_SETTINGS=["financeVisible","soundNotifications","browserMapsKey","push","cloud","cardFields","_u"];
let syncSnap=null;
function sharedSettingsStr(st){const o={};Object.keys(st.settings||{}).sort().forEach(k=>{if(!DEVICE_SETTINGS.includes(k))o[k]=st.settings[k];});return JSON.stringify(o);}
function itemStr(it){const {_u,...rest}=it;return JSON.stringify(rest);}
function takeSnapshot(){syncSnap={settings:sharedSettingsStr(state)};SYNC_COLLS.forEach(c=>{const m=new Map();(state[c]||[]).forEach(it=>it&&it.id&&m.set(it.id,itemStr(it)));syncSnap[c]=m;});}
function stampChanges(){
  if(!syncSnap){takeSnapshot();return;}
  const now=Date.now();state.deleted=state.deleted||{};
  SYNC_COLLS.forEach(c=>{
    const seen=new Set();state.deleted[c]=state.deleted[c]||{};
    (state[c]||[]).forEach(it=>{if(!it||!it.id)return;seen.add(it.id);const str=itemStr(it);if(syncSnap[c].get(it.id)!==str){it._u=now;delete state.deleted[c][it.id];}});
    syncSnap[c].forEach((_,id)=>{if(!seen.has(id))state.deleted[c][id]=now;});
  });
  if(sharedSettingsStr(state)!==syncSnap.settings)state.settings._u=now;
  takeSnapshot();
}
function save(localOnly=false){
  (state.jobs||[]).forEach(j=>{j.status=jobStatus(j);});
  stampChanges();
  state.updatedAt=new Date().toISOString();
  localStorage.setItem(KEY,JSON.stringify(state));
  if(!localOnly){pendingPush=true;clearTimeout(syncTimer);syncTimer=setTimeout(syncCloud,450);}
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function money(n){return new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND",maximumFractionDigits:0}).format(Number(n||0));}
function fmtDate(s){return new Date(s+"T00:00:00").toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"});}
function fmtLong(s){return new Date(s+"T00:00:00").toLocaleDateString("vi-VN",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"});}
function daysFromNow(dateStr){const a=new Date();a.setHours(0,0,0,0);const b=new Date(dateStr+"T00:00:00");return Math.round((b-a)/86400000);}
function activeReminders(j){return (j.reminders||[]).filter(r=>r.enabled!==false);}
function labelMinutes(m){return m>=10080?`${Math.round(m/1440)} ngày`:m>=1440?`${Math.round(m/1440)} ngày`:m>=60?`${Math.round(m/60)} giờ`:`${m} phút`;}
function toIsoStart(j){
  const t=/^\d{2}:\d{2}$/.test(j.time||"")?j.time:"09:00";
  return new Date(`${j.date}T${t}:00+07:00`).toISOString();
}
function getBooker(j){return state.bookers.find(b=>b.id===j.bookerId)||null;}
function avatarText(name){return String(name||"B").trim().slice(0,1).toUpperCase();}
// ---- V22.8: bộ icon màu cho theme "Super App" ----
let popSeq=0;
function popIcon(name,size){
  const u="pi"+(++popSeq);
  const g=(id,a,b,x2=1,y2=1)=>`<linearGradient id="${u}${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const f=id=>`url(#${u}${id})`;
  const W='#fff';
  const art={
    home:`<defs>${g("a","#FF9A4D","#FF4B2B")}</defs><path d="M3.1 10.4 10.9 3.9a1.7 1.7 0 0 1 2.2 0l7.8 6.5c.6.5.2 1.4-.5 1.4h-.9v7.6a2.1 2.1 0 0 1-2.1 2.1H6.6a2.1 2.1 0 0 1-2.1-2.1v-7.6h-.9c-.7 0-1.1-.9-.5-1.4Z" fill="${f("a")}"/><path d="M6.4 10.3 11.2 6.3" stroke="${W}" stroke-opacity=".45" stroke-width="1.4" stroke-linecap="round"/><rect x="9.5" y="14" width="5" height="7.6" rx="1.7" fill="${W}"/><circle cx="13.2" cy="17.9" r=".55" fill="#FF6A36"/>`,
    calendar:`<defs>${g("a","#FF7A6B","#F2335B")}${g("b","#FFFFFF","#EEF1F7",0,1)}</defs><rect x="3" y="4.6" width="18" height="16.9" rx="4" fill="${f("b")}" stroke="#E2E6EF" stroke-width=".8"/><path d="M3 8.6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v1.6H3Z" fill="${f("a")}"/><rect x="6.6" y="2.4" width="2.2" height="4.6" rx="1.1" fill="#3A3F55"/><rect x="15.2" y="2.4" width="2.2" height="4.6" rx="1.1" fill="#3A3F55"/><rect x="6" y="12.6" width="3" height="2.6" rx=".9" fill="#D8DDE8"/><rect x="10.5" y="12.6" width="3" height="2.6" rx=".9" fill="#D8DDE8"/><rect x="15" y="12.6" width="3" height="2.6" rx=".9" fill="#FFB020"/><rect x="6" y="16.6" width="3" height="2.6" rx=".9" fill="#D8DDE8"/><rect x="10.5" y="16.6" width="3" height="2.6" rx=".9" fill="#F2335B"/>`,
    jobs:`<defs>${g("a","#9B7BFF","#5B35F2")}</defs><path d="M5.3 11.3a6.7 6.7 0 0 0 13.4 0" fill="none" stroke="#3A3F55" stroke-width="1.8" stroke-linecap="round"/><path d="M12 18.2v2.6M8.6 21.2h6.8" stroke="#3A3F55" stroke-width="1.8" stroke-linecap="round"/><rect x="8" y="2.4" width="8" height="12.8" rx="4" fill="${f("a")}"/><path d="M8.3 7.2h7.4M8.3 9.9h7.4" stroke="${W}" stroke-opacity=".4" stroke-width="1"/><rect x="9.3" y="3.6" width="1.7" height="4.2" rx=".85" fill="${W}" fill-opacity=".6"/><circle cx="18.6" cy="4" r="1.1" fill="#FFB020"/><circle cx="20.4" cy="7.1" r=".7" fill="#FF6A36"/>`,
    note:`<defs>${g("a","#FFD65C","#FFA81F")}</defs><path d="M6.2 3h9.3l4.3 4.3v11.6a2.1 2.1 0 0 1-2.1 2.1H6.2a2.1 2.1 0 0 1-2.1-2.1V5.1A2.1 2.1 0 0 1 6.2 3Z" fill="${f("a")}"/><path d="M15.5 3v2.9a1.4 1.4 0 0 0 1.4 1.4h2.9Z" fill="#FFE9A8"/><path d="M7.7 11h8.6M7.7 14.3h8.6M7.7 17.6h5" stroke="${W}" stroke-width="1.6" stroke-linecap="round"/>`,
    more:`<rect x="3.2" y="3.2" width="7.9" height="7.9" rx="2.6" fill="#FF6A36"/><rect x="12.9" y="3.2" width="7.9" height="7.9" rx="2.6" fill="#3D9BFF"/><rect x="3.2" y="12.9" width="7.9" height="7.9" rx="2.6" fill="#18BE8A"/><circle cx="16.85" cy="16.85" r="4.1" fill="#FFB020"/><path d="M4.8 5.2h2.4M14.5 5.2h2.4M4.8 14.9h2.4" stroke="${W}" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>`,
    booker:`<defs>${g("a","#63B3FF","#2D6BFF")}${g("b","#8FCBFF","#3B82F6")}</defs><path d="M4.4 20.1c.6-4.1 3.6-6.3 7.6-6.3s7 2.2 7.6 6.3c.1.7-.4 1.4-1.2 1.4H5.6c-.8 0-1.3-.7-1.2-1.4Z" fill="${f("b")}"/><circle cx="12" cy="8.1" r="4" fill="${f("a")}"/><circle cx="10.6" cy="6.6" r="1" fill="${W}" fill-opacity=".55"/>`,
    bell:`<defs>${g("a","#FFD45C","#FFA51C")}</defs><path d="M9.8 18.4a2.2 2.2 0 0 0 4.4 0Z" fill="#E88A00"/><path d="M12 3.1a6 6 0 0 0-6 6v3.5L4.4 15.3c-.4.7.1 1.6.9 1.6h13.4c.8 0 1.3-.9.9-1.6L18 12.6V9.1a6 6 0 0 0-6-6Z" fill="${f("a")}"/><path d="M8.7 7.2a3.6 3.6 0 0 1 2.2-1.6" stroke="${W}" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round"/><circle cx="18.3" cy="5.2" r="2.7" fill="#FF3B4E" stroke="${W}" stroke-width="1.3"/>`,
    eye:`<defs>${g("a","#5CCBFF","#2E7BFF")}</defs><path d="M2.3 12s3.5-6.3 9.7-6.3 9.7 6.3 9.7 6.3-3.5 6.3-9.7 6.3S2.3 12 2.3 12Z" fill="${f("a")}"/><circle cx="12" cy="12" r="3.7" fill="${W}"/><circle cx="12" cy="12" r="1.9" fill="#1E3A8A"/><circle cx="12.8" cy="11.2" r=".6" fill="${W}"/>`,
    morecircle:`<path d="M2.3 12s3.5-6.3 9.7-6.3 9.7 6.3 9.7 6.3-3.5 6.3-9.7 6.3S2.3 12 2.3 12Z" fill="#C7CCD8"/><circle cx="12" cy="12" r="3.4" fill="${W}"/><circle cx="12" cy="12" r="1.7" fill="#7C8295"/><path d="M4.5 4.5l15 15" stroke="${W}" stroke-width="3.6" stroke-linecap="round"/><path d="M4.5 4.5l15 15" stroke="#7C8295" stroke-width="1.8" stroke-linecap="round"/>`,
    finance:`<defs>${g("a","#3EE0A4","#0FAF7A")}</defs><path d="M5.2 6.6 15.6 3.7a1.5 1.5 0 0 1 1.9 1.1l.5 1.8Z" fill="#9EF0CF"/><rect x="2.8" y="6.4" width="18.4" height="14" rx="3.3" fill="${f("a")}"/><rect x="13.8" y="10.9" width="7.4" height="5.2" rx="2" fill="#0B8F63"/><circle cx="16.6" cy="13.5" r="1.2" fill="#FFD65C"/><path d="M5.2 9.4h5" stroke="${W}" stroke-opacity=".5" stroke-width="1.3" stroke-linecap="round"/>`,
    phone:`<defs>${g("a","#3EE0A4","#10A866")}</defs><circle cx="12" cy="12" r="10" fill="${f("a")}"/><g transform="translate(5.3 5.3) scale(.56)"><path d="M7.4 3.5 10 6l-1.7 2.7a13.2 13.2 0 0 0 7 7L18 14l2.5 2.6-1.8 3.1c-.4.7-1.2 1-2 .8C9.5 18.9 5.1 14.5 3.5 7.3c-.2-.8.1-1.6.8-2Z" fill="${W}"/></g>`,
    messenger:`<defs>${g("a","#2FA8FF","#A63DFA")}</defs><path d="M12 2.8c-5.3 0-9.6 3.9-9.6 8.8 0 2.8 1.4 5.2 3.7 6.8v3.1l3.1-1.7c.9.3 1.8.4 2.8.4 5.3 0 9.6-3.9 9.6-8.8S17.3 2.8 12 2.8Z" fill="${f("a")}"/><path d="m6.6 14.2 3.6-3.8 2.4 2 4.6-2.5-3.6 3.9-2.4-2Z" fill="${W}"/>`,
    edit:`<defs>${g("a","#FFBE4D","#FF7A1A")}</defs><path d="M4 20.2 5.1 15.9 15.6 5.4a2.1 2.1 0 0 1 3 0l.2.2a2.1 2.1 0 0 1 0 3L8.3 19.1Z" fill="${f("a")}"/><path d="m14.3 6.7 3.2 3.2 1.3-1.3a2.1 2.1 0 0 0 0-3l-.2-.2a2.1 2.1 0 0 0-3 0Z" fill="#FF5A7A"/><path d="M4 20.2 5.1 15.9l3.2 3.2Z" fill="#FFE1B8"/><path d="m4 20.2.5-1.9 1.4 1.4Z" fill="#3A3F55"/>`,
    pin:`<defs>${g("a","#FF7474","#E5304F")}</defs><path d="M12 2.4a7.1 7.1 0 0 0-7.1 7.1c0 5.2 7.1 12.1 7.1 12.1s7.1-6.9 7.1-12.1A7.1 7.1 0 0 0 12 2.4Z" fill="${f("a")}"/><circle cx="12" cy="9.5" r="2.8" fill="${W}"/>`,
    check:`<defs>${g("a","#3EE0A4","#10A866")}</defs><circle cx="12" cy="12" r="10" fill="${f("a")}"/><path d="m7.4 12.3 3.1 3 6.1-6.4" fill="none" stroke="${W}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    link:`<defs>${g("a","#5CCBFF","#2E6BFF")}</defs><g fill="none" stroke="${f("a")}" stroke-width="2.4" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></g>`
  };
  if(!art[name])return null;
  return `<svg class="${name}-icon pop-icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${art[name]}</svg>`;
}
function icon(name,size=19){
 const themeNow=state?.settings?.theme;
 if(themeNow==="pop"){const r=popIcon(name,size);if(r)return r;}
 const p={
 home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/>',
 calendar:'<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M7 2.5v4M17 2.5v4M3 9h18"/>',
 jobs:'<rect x="4" y="6" width="16" height="13" rx="3"/><path d="M9 6V4.5h6V6M8 13h8"/>',
 booker:'<circle cx="12" cy="8" r="3.2"/><path d="M5 20c.8-3.6 3.1-5.5 7-5.5s6.2 1.9 7 5.5"/>',
 edit:'<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.8 7.2 3 3"/>' ,
 more:'<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',search:'<circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 5 5"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m15 5-7 7 7 7"/>',
 phone:'<path d="M7.4 3.5 10 6l-1.7 2.7a13.2 13.2 0 0 0 7 7L18 14l2.5 2.6-1.8 3.1c-.4.7-1.2 1-2 .8C9.5 18.9 5.1 14.5 3.5 7.3c-.2-.8.1-1.6.8-2Z"/>',
 bell:'<path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z"/><path d="M10 21h4"/>',
 messenger:'<path d="M12 3.5c-5.2 0-9.5 3.8-9.5 8.6 0 2.7 1.4 5.1 3.7 6.7v2.2l2.6-1.4c1 .3 2.1.5 3.2.5 5.2 0 9.5-3.8 9.5-8.6S17.2 3.5 12 3.5Z"/><path d="m7.2 13.4 3.2-3 2.3 1.9 4.1-2.2-2.8 3.6-2.3-1.8-4.5 1.5Z"/>',
 finance:'<path d="M4 19.5V11M10 19.5V7M16 19.5V4M22 19.5H2"/>', eye:'<path d="M2.5 12s3.3-5.3 9.5-5.3 9.5 5.3 9.5 5.3-3.3 5.3-9.5 5.3S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.4"/>',
 check:'<path d="m5 12 4.2 4L19 6"/>', link:'<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>', pin:'<path d="M8 4h8l1 5-2.7 2.7V17l-2.3 2.5L9.7 17v-5.3L7 9l1-5Z"/><path d="M12 19.5V22"/>', morecircle:'<circle cx="12" cy="12" r="9"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/>' 
 };
 const variants={
   clean:{
     home:'<path d="M4 10.5 12 4l8 6.5V20H4Z"/><path d="M9 20v-5h6v5"/>',
     calendar:'<rect x="4" y="5" width="16" height="16" rx="4"/><path d="M8 3v4M16 3v4M4 10h16"/>',
     jobs:'<rect x="5" y="7" width="14" height="13" rx="3"/><path d="M9 7V5h6v2M8 13h8"/>',
     booker:'<circle cx="12" cy="8" r="3"/><path d="M6 20c1.1-3.3 3-5 6-5s4.9 1.7 6 5"/>',
     note:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
     more:'<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
     bell:'<path d="M7 10a5 5 0 0 1 10 0c0 5 2 5 2 7H5c0-2 2-2 2-7Z"/><path d="M10 21h4"/>'
   },
   fresh:{
     home:'<path d="M3.5 10.5 12 3.7l8.5 6.8v9.7a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z"/><path d="M9 21v-5.5h6V21"/><circle cx="17.2" cy="6" r="1.2" fill="currentColor" stroke="none"/>',
     calendar:'<rect x="3.5" y="5" width="17" height="16" rx="4"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 10h17"/><circle cx="8" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/>',
     jobs:'<rect x="4" y="6" width="16" height="14" rx="4"/><path d="M9 6V4.5h6V6M7.5 13h9"/>',
     booker:'<circle cx="12" cy="8" r="3.3"/><path d="M4.8 20c.8-3.8 3.2-5.7 7.2-5.7s6.4 1.9 7.2 5.7"/><circle cx="19" cy="5" r="1.2" fill="currentColor" stroke="none"/>',
     note:'<path d="M5 4h12l2 2v14H5Z"/><path d="M8 9h7M8 13h7M8 17h4"/>',
     more:'<circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
     bell:'<path d="M12 4.2a5.3 5.3 0 0 1 5.3 5.3v2.6c0 2.3 1.8 3.4 2.2 4.7H4.5c.4-1.3 2.2-2.4 2.2-4.7V9.5A5.3 5.3 0 0 1 12 4.2Z"/><circle cx="12" cy="20" r="1.3" fill="currentColor" stroke="none"/>'
   },
   pink:{
     home:'<path d="M4 10 12 3l8 7v10H4Z"/><path d="M8 21v-7h8v7"/>',
     calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M7 2v4M17 2v4M3 9h18M8 13h2M14 13h2M8 17h2"/>',
     jobs:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M9 6V4h6v2M7 13h10M7 16h6"/>',
     booker:'<circle cx="12" cy="8" r="2.8"/><path d="M5 21c.8-3.9 3.1-5.8 7-5.8s6.2 1.9 7 5.8"/>',
     note:'<path d="M4 3h14l2 2v16H4Z"/><path d="M8 8h7M8 12h7M8 16h5"/>',
     more:'<rect x="4" y="10.5" width="16" height="3" rx="1.5"/>',
     bell:'<path d="M7 10a5 5 0 0 1 10 0v3l2 3H5l2-3Z"/><path d="M10 20h4"/>'
   },
   tiki:{
     home:'<path d="m3.2 10.2 8.8-7 8.8 7"/><path d="M5.2 9v11.8h13.6V9"/><path d="M9.2 20.8v-6h5.6v6"/><path d="m17.6 4.2.7-1.2.7 1.2 1.3.2-1 .9.2 1.3-1.2-.6-1.2.6.2-1.3-1-.9Z" fill="currentColor" stroke="none"/>',
     calendar:'<rect x="3" y="5" width="18" height="16" rx="5"/><path d="M7 3v4M17 3v4M3 10h18"/><circle cx="8" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1.4" fill="currentColor" stroke="none"/>',
     jobs:'<path d="M5 7h14l-1 12H6Z"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="M8.5 12h7"/>',
     booker:'<circle cx="12" cy="8" r="3.1"/><path d="M5 20c1-3.5 3.3-5.2 7-5.2s6 1.7 7 5.2"/><circle cx="18.5" cy="4.8" r="1.3" fill="currentColor" stroke="none"/>',
     note:'<rect x="4" y="4" width="16" height="17" rx="4"/><path d="M8 9h8M8 13h7M8 17h4"/>',
     more:'<circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
     bell:'<path d="M12 4c3.1 0 5.2 2.5 5.2 5.4v2.5c0 2.1 1.7 3.2 2.2 4.5H4.6c.5-1.3 2.2-2.4 2.2-4.5V9.4C6.8 6.5 8.9 4 12 4Z"/><path d="M9.8 20.3c1.1 1.2 3.3 1.2 4.4 0"/>'
   },
   green:{
     home:'<path d="M4 10.5 12 4l8 6.5V20H4Z"/><path d="M9 20v-5h6v5"/><path d="M12 7.5v2.2"/>',
     calendar:'<rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4M17 3v4M3 10h18"/><path d="M8 15h3M14 15h2M8 18h5"/>',
     jobs:'<path d="M5 7h14v13H5Z"/><path d="M9 7V5h6v2M9 13h6M12 13v4"/>',
     booker:'<circle cx="12" cy="8" r="3"/><path d="M5.5 20c.9-3.6 3.1-5.3 6.5-5.3s5.6 1.7 6.5 5.3"/><path d="m18.4 5.3 2.1 2.1"/>',
     note:'<path d="M5 4h14v16H5Z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M17 17h2v2"/>',
     more:'<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
     bell:'<path d="M7 10a5 5 0 0 1 10 0v3.2l2 2.8H5l2-2.8Z"/><path d="M10 20h4"/>'
   }
 };
 const theme=state?.settings?.theme||"fresh";
 if(variants[theme]?.[name]) p[name]=variants[theme][name];
 return `<svg class="${name}-icon theme-icon-${theme}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${theme==="pop"?2.3:1.8}" stroke-linecap="round" stroke-linejoin="round">${p[name]||p.more}</svg>`;
}
function makeId(){try{if(window.crypto?.randomUUID)return window.crypto.randomUUID();}catch(_){}return "id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);}
function isWedding(j){return String(j?.type||"").trim().toLowerCase()==="wedding";}
// V23.7: trạng thái kịch bản suy ra từ tab Kịch bản (không cần nhập tay)
function noteKind(n){return n.kind==="lovestory"?"lovestory":"script";}
function linkedNotes(j,kind){return state.notes.filter(n=>n.jobId===j.id&&(!kind||noteKind(n)===kind));}
function scriptNeedsWork(j){if(!j)return true;if(j.noScript)return false;if(j.scriptStatus==="Đã cập nhật")return false;return !linkedNotes(j,"script").length;}
function loveStoryNeedsWork(j){if(!isWedding(j)||j.noLoveStory)return false;if(j.loveStoryStatus==="Đã viết"||j.loveStoryStatus==="Không áp dụng")return false;return !linkedNotes(j,"lovestory").length;}
function workNeedsAttention(j){return scriptNeedsWork(j)||loveStoryNeedsWork(j);}
function workChips(j){const t=workNeedText(j);return t?`<span class="work-chip work-warn">${esc(t)}</span>`:"";}
function workLabel(j){if(scriptNeedsWork(j)&&loveStoryNeedsWork(j))return "Chưa có kịch bản + Love Story";if(scriptNeedsWork(j))return "Chưa có kịch bản";if(loveStoryNeedsWork(j))return "Chưa có Love Story";return "Đã đủ";}
function migrateBookers(){
  const map=new Map();
  const existing=Array.isArray(state.bookers)?state.bookers:[];
  existing.forEach(b=>map.set((b.name||"").trim().toLowerCase()+"|"+(b.phone||"").replace(/\D/g,""),b));
  state.jobs.forEach(j=>{
    if(j.bookerId && existing.find(b=>b.id===j.bookerId)) return;
    const name=(j.client||"").trim()||"Chưa rõ";
    const phone=(j.phone||"").trim();
    const key=name.toLowerCase()+"|"+phone.replace(/\D/g,"");
    let b=map.get(key);
    if(!b){b={id:makeId(),name,phone,messengerLink:j.messengerLink||"",zalo:phone,email:"",company:"",notes:"",createdAt:new Date().toISOString()};existing.push(b);map.set(key,b);}
    if(!j.bookerId)j.bookerId=b.id;
  });
  state.bookers=existing;
  state.jobs.forEach(j=>{const b=getBooker(j);if(b){j.client=b.name;j.phone=b.phone||j.phone||"";}});
}
// ---- V23.6: tài chính: Giá trị · Đã cọc · Chiết khấu (back) · Đã thanh toán đủ ----
function fin(j){const total=Number(j.total||0),deposit=Number(j.deposit||0),commission=Number(j.commission||0);const paidFull=!!j.paidFull;const received=paidFull?Math.max(total,deposit):deposit;const due=paidFull?0:Math.max(0,total-deposit);return {total,deposit,commission,paidFull,received,due,net:Math.max(0,total-commission)};}
// ---- V23.8: Theo dõi thanh toán ----
var payView="due",payYear="all",payMonth="all",repYear="",askedKey=false;
function askAccessKey(force){if(askedKey&&!force)return;askedKey=true;const k=prompt("Nhập mã truy cập dữ liệu\n(mã bạn đặt lúc chuyển app sang GitHub — giống nhau trên mọi máy):",accessKey());if(k!==null){try{localStorage.setItem("mcta_key",k.trim());}catch(_){}askedKey=false;writeSwMeta();setTimeout(()=>loadCloud(true).then(ok=>{if(ok)render();}),400);}}
function csvCell(v){v=String(v??"");return /[";\n,]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;}
async function exportReportCSV(){
 const rows=[["Ngày","Giờ","Tên show","Loại","Trạng thái","Booker","Địa điểm","Giá trị","Đã cọc","Đã nhận","Còn phải thu","Chiết khấu","Thực nhận","Thanh toán đủ"]];
 state.jobs.filter(j=>isBillable(j)&&j.date.startsWith(repYear)).sort(byStart).forEach(j=>{const F=fin(j);rows.push([j.date,j.time||"",j.title,j.type||"",j.status||"",getBooker(j)?.name||"",j.locationName||j.location||"",F.total,F.deposit,F.received,F.due,F.commission,F.net,F.paidFull?"Có":"Chưa"]);});
 const csv="\ufeff"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n");
 const name=`MC-Thien-An-thu-nhap-${repYear}.csv`;const file=new File([csv],name,{type:"text/csv"});
 try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return;}}catch(e){if(e&&e.name==="AbortError")return;}
 const a=document.createElement("a");a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);showToast("Đã xuất file — mở bằng Excel / Numbers / Google Sheets");
}
function isBillable(j){return fin(j).total>0;}
function payStats(){const b=state.jobs.filter(isBillable);const dueJobs=b.filter(j=>fin(j).due>0);const over=dueJobs.filter(j=>!isNotOver(j));return {b,dueJobs,over,dueSum:dueJobs.reduce((a,j)=>a+fin(j).due,0),overSum:over.reduce((a,j)=>a+fin(j).due,0)};}
function payRow(j){const F=fin(j),bk=getBooker(j)?.name||"",over=F.due>0&&!isNotOver(j),pct=F.total?Math.min(100,Math.round(F.received/F.total*100)):0;return `<div class="pay-row ${over?"over":""} ${F.due?"":"done"}"><button class="pay-main" onclick="openJob('${j.id}')">${dateBlock(j.date)}<div class="pay-info"><b>${esc(j.title)}</b><span>${esc([bk,j.status].filter(Boolean).join(" · "))}</span><div class="pay-bar"><i style="width:${pct}%"></i></div><span class="pay-amt">${F.due?`Đã nhận ${maskedMoney(F.received)} / ${maskedMoney(F.total)} · <b>còn ${maskedMoney(F.due)}</b>`:`<b>Đã thu đủ ${maskedMoney(F.total)}</b>`}</span></div></button>${F.due?`<div class="pay-btns"><button class="pay-remind" onclick="openPayMessage('${j.id}')">✉︎ Nhắc khéo</button><button class="pay-done" onclick="quickPaid('${j.id}')">✓ Đã thu đủ</button></div>`:""}</div>`;}
function payMessage(j){const F=fin(j),b=getBooker(j);const greet=b?.name?`Chào ${b.name.replace(/^(anh|chị|c|a)\s+/i,"")} ạ,`:"Chào anh/chị ạ,";return `${greet}\n\nEm Thiên Ân đây. Em gửi lại thông tin thanh toán show “${j.title}” ngày ${fmtDate(j.date)}:\n• Giá trị: ${money(F.total)}\n• Đã nhận: ${money(F.received)}\n• Còn lại: ${money(F.due)}\n\nAnh/chị thu xếp giúp em phần còn lại khi tiện nhé. Cảm ơn anh/chị nhiều ạ!`;}
function openPayMessage(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;openModal(`<div class="sheet-head"><div><div class="eyebrow">NHẮC THANH TOÁN</div><h2>${esc(j.title)}</h2></div><button class="close" onclick="closeModal()">×</button></div><div class="small" style="margin-bottom:8px">Sửa lại cho hợp ngữ cảnh rồi gửi qua Zalo / Messenger.</div><textarea id="payMsg" class="field-control pay-msg">${esc(payMessage(j))}</textarea><div class="pay-msg-actions"><button class="outline-btn" onclick="copyText(document.getElementById('payMsg').value,this)">Copy</button>${navigator.share?`<button class="black-btn" onclick="navigator.share({text:document.getElementById('payMsg').value}).catch(()=>{})">Gửi qua…</button>`:""}${getBooker(j)?.messengerLink?`<button class="outline-btn" onclick="copyText(document.getElementById('payMsg').value);openMessenger('${getBooker(j).id}')">Copy & mở Messenger</button>`:""}</div>`);}
function bulkPaid(ids){const list=state.jobs.filter(j=>ids.includes(j.id));if(!list.length)return;if(!confirm(`Đánh dấu ĐÃ THU ĐỦ cho ${list.length} show?\n\n${list.slice(0,8).map(j=>`• ${fmtDate(j.date)} — ${j.title}`).join("\n")}${list.length>8?`\n… và ${list.length-8} show khác`:""}\n\nCó thể bỏ đánh dấu từng show trong chi tiết job.`))return;list.forEach(j=>j.paidFull=true);save();render();showToast(`Đã ghi nhận ${list.length} show thu đủ ✓`);}
function quickPaid(id){const j=state.jobs.find(x=>x.id===id);if(!j)return;if(!confirm(`Ghi nhận khách đã thanh toán đủ cho “${j.title}”?`))return;j.paidFull=true;save();render();showToast("Đã ghi nhận thanh toán đủ ✓");}
function markPaid(id,on=true){const j=state.jobs.find(x=>x.id===id);if(!j)return;j.paidFull=on;save();render();openJob(id);showToast(on?"Đã ghi nhận: khách thanh toán đủ ✓":"Đã bỏ đánh dấu thanh toán");}
function normalizeJobs(){
  state.jobs.forEach(j=>{
    if(j.commission===undefined){j.commission=Number(j.balancePaid||0);j.balancePaid=0;}
    if(j.paidFull===undefined)j.paidFull=false;
    if(!j.statusV){if(legacySettled(j))j.paidFull=true;j.statusV=2;}
    j.status=jobStatus(j);
    j.type=j.type||"Other";j.meetings=Array.isArray(j.meetings)?j.meetings:[];j.reminders=j.reminders||[
      {minutes:1440,enabled:true},{minutes:120,enabled:true}
    ];
    if(j.reminders.every(r=>r.enabled===false)) j.notificationEnabled=false; else if(j.notificationEnabled===undefined) j.notificationEnabled=true;
    j.startsAt=j.startsAt||toIsoStart(j);
    j.checklist=j.checklist||[];
    j.scriptSource=j.scriptSource||"Chưa xác định";
    if(!SCRIPT_SOURCES.includes(j.scriptSource))j.scriptSource="Chưa xác định";
    j.scriptStatus=j.scriptStatus||"Chưa có";
    if(!SCRIPT_STATUSES.includes(j.scriptStatus))j.scriptStatus="Chưa có";
    j.scriptLink=j.scriptLink||"";
    j.scriptNotes=j.scriptNotes||"";
    j.loveStoryStatus=isWedding(j)?(j.loveStoryStatus||"Chưa có"):"Không áp dụng";
    if(isWedding(j)&&!LOVE_STORY_STATUSES.includes(j.loveStoryStatus))j.loveStoryStatus="Chưa có";
    j.loveStoryLink=j.loveStoryLink||"";
    j.loveStoryNotes=j.loveStoryNotes||"";
    j.createdAt=j.createdAt||new Date(`${j.date}T${/^\d{2}:\d{2}$/.test(j.time||"")?j.time:"09:00"}:00+07:00`).toISOString();
    j.updatedAt=j.updatedAt||j.createdAt;
  });
}
function normalizeLocationFields(){
  state.jobs.forEach(j=>{
    if(!j.locationName) j.locationName=j.location||"";
    if(!j.locationAddress) j.locationAddress="";
    if(!j.location && j.locationName) j.location=j.locationName;
  });
}
function navigate(p){page=p;window.scrollTo({top:0,behavior:"instant"});render();}
function render(){
  const titles={home:"Tổng quan",calendar:"Lịch",jobs:"Jobs",bookers:"Booker",notes:"Kịch bản",payments:"Thanh toán",report:"Báo cáo thu nhập",notify:"Thông báo",more:"Thiết lập"};
  document.title=state.settings.appName;
  const meta=document.querySelector('meta[name="apple-mobile-web-app-title"]'); if(meta)meta.setAttribute("content",state.settings.appName);
  const brand=document.querySelector(".topbar .eyebrow"); if(brand)brand.textContent=state.settings.appName.toUpperCase();
  document.getElementById("pageTitle").textContent=titles[page]||state.settings.appName;
  document.querySelectorAll(".tabbar button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  document.querySelectorAll(".tabbar .nav-icon").forEach(el=>{el.innerHTML=icon(el.dataset.icon,19);});
  const iconLink=document.getElementById("themeAppIcon");
  if(iconLink) iconLink.href=`icons/app-${state.settings.theme}-180.png`;
  const manifestLink=document.getElementById("themeManifest");
  if(manifestLink) manifestLink.href=`manifest-${state.settings.theme}.json`;
  document.getElementById("content").innerHTML=pages[page]();
}
const SHOW_GRACE_MS=3*3600000, MEETING_GRACE_MS=3600000;
function hasTime(x){return /^\d{2}:\d{2}$/.test(x?.time||"");}
function startMsOf(x){return Date.parse(`${x.date}T${hasTime(x)?x.time:"00:00"}:00+07:00`);}
/* Job còn "chưa xong": có giờ → tới 3 tiếng sau giờ bắt đầu; không có giờ → tới hết ngày */
function endMsOf(x,grace=SHOW_GRACE_MS){const s=startMsOf(x);if(!Number.isFinite(s))return 0;return hasTime(x)?s+grace:s+86400000;}
function isLive(x,grace=SHOW_GRACE_MS){const now=Date.now();return hasTime(x)&&startMsOf(x)<=now&&now<endMsOf(x,grace);}
function isNotOver(x,grace){return endMsOf(x,grace)>Date.now();}
function byStart(a,b){return (a.date+(a.time||"")).localeCompare(b.date+(b.time||""));}
function upcoming(limit=5){return state.jobs.filter(j=>isNotOver(j)).sort(byStart).slice(0,limit);}
const WEEKDAYS=["CN","T2","T3","T4","T5","T6","T7"];
function shortDate(ds){const d=new Date(ds+"T00:00:00");if(isNaN(d))return"";return `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;}
function relLabel(x,grace){if(isLive(x,grace))return "Đang diễn ra";const day=daysFromNow(x.date);if(day===0)return hasTime(x)&&startMsOf(x)<Date.now()?"Đã xong":"Hôm nay";if(day===1)return"Ngày mai";if(day>1)return `Còn ${day} ngày`;return `${-day} ngày trước`;}
function nextJob(){return upcoming()[0]||null;}
function statusClass(s){if(s==="Đã thanh toán")return"green";if(s==="Đã cọc")return"amber";return"pink";}
function normalizeJobTypes(){
  const existing=Array.isArray(state.settings.jobTypes)?state.settings.jobTypes:[];
  const seen=new Set(), out=[];
  const add=(name,id)=>{
    const clean=String(name||"").trim(); if(!clean)return;
    const key=clean.toLowerCase(); if(seen.has(key))return;
    seen.add(key); out.push({id:id||makeId(),name:clean});
  };
  existing.forEach(t=>add(t.name,t.id));
  DEFAULT_JOB_TYPES.forEach(n=>add(n));
  (state.jobs||[]).forEach(j=>{if(j.type)add(j.type);});
  state.settings.jobTypes=out;
}
function getJobTypeNames(){return state.settings.jobTypes.map(x=>x.name);}
function typeMeta(t){
  const idx=Math.max(0,state.settings.jobTypes.findIndex(x=>x.name===t));
  return TYPE_PALETTE[idx%TYPE_PALETTE.length];
}
function typeChip(t){
  const c=typeMeta(t);
  return `<span class="tag type-tag" style="--type-bg:${c.bg};--type-color:${c.color};--type-border:${c.border}">${esc(t)}</span>`;
}
function statusChip(s){return `<span class="status-chip status-${statusClass(s)}">${esc(s)}</span>`;}
function calendarState(ds){const jobs=state.jobs.filter(j=>j.date===ds);return jobs.length?"confirmed-day":"empty-day";}
function maskedMoney(n){return state.settings.financeVisible?money(n):"••••••";}
function maskedCount(n){return state.settings.showCountVisible?String(n):"••";}
function toggleShowCount(){state.settings.showCountVisible=!state.settings.showCountVisible;save(true);render();}
function toggleFinance(){state.settings.financeVisible=!state.settings.financeVisible;save(true);render();}

function mapsEmbedUrl(j,key){
  const q=j.placeId?`place_id:${encodeURIComponent(j.placeId)}`:encodeURIComponent([j.locationName||j.location||"",j.locationAddress||""].filter(Boolean).join(", "));
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${q}&zoom=16&language=vi`;
}
async function hydrateJobMap(j){
  const wrap=document.getElementById("jobMapWrap");
  if(!wrap)return;
  const cfg=await loadMapsConfig();
  if(!cfg.apiKey){
    const q=placeQueryText(j.locationName||j.location,j.locationAddress);
    if(!q){wrap.innerHTML=`<div class="map-placeholder"><div class="map-placeholder-icon">${icon("pin",22)}</div><b>Chưa có địa điểm</b><span class="small">Bấm Chỉnh sửa để thêm tên nơi tổ chức và địa chỉ.</span></div>`;return;}
    wrap.innerHTML=`<div class="embedded-map-card"><iframe title="Bản đồ ${esc(q)}" src="${freeMapEmbedUrl(q)}" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe></div>${travelButtons(q,j.googleMapsURI)}`;
    return;
  }
  const url=mapsEmbedUrl(j,cfg.apiKey);
  wrap.innerHTML=`<div class="embedded-map-card"><iframe title="Bản đồ ${esc(j.locationName||j.location||"")}" src="${url}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>${travelButtons(placeQueryText(j.locationName||j.location,j.locationAddress),j.googleMapsURI)}`;
}
function saveBrowserMapsKey(){
  const input=document.getElementById("browserMapsKeyInput");
  const key=(input?.value||"").trim();
  state.settings.browserMapsKey=key;
  mapsConfig={apiKey:"",ready:false,failed:false}; mapsScriptPromise=null;
  save(true); render();
  alert(key?"Đã lưu API key thử nghiệm trên trình duyệt này.":"Đã xóa API key thử nghiệm.");
}
// ---- V22.5: địa điểm miễn phí, không cần API key ----
function placeQueryText(name,address){return [name||"",address||""].map(x=>String(x).trim()).filter(Boolean).join(", ");}
function freeMapEmbedUrl(q){return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&hl=vi&z=16&output=embed`;}
function directionsUrl(q,link){const u=safeHref(link);if(u)return u;return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=driving`;}
function appleMapsUrl(q){return `https://maps.apple.com/?daddr=${encodeURIComponent(q)}&dirflg=d`;}
async function copyText(t,btn){try{await navigator.clipboard.writeText(t);}catch(_){const a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();try{document.execCommand("copy")}catch(_){}a.remove();}if(btn){const o=btn.innerHTML;btn.textContent="Đã copy ✓";setTimeout(()=>btn.innerHTML=o,1400);}}
function travelButtons(q,link){if(!q&&!link)return"";return `<div class="travel-actions"><a class="travel-btn primary" href="${esc(directionsUrl(q,link))}" target="_blank" rel="noopener">${icon("pin",14)} Chỉ đường Google Maps</a><a class="travel-btn" href="${esc(appleMapsUrl(q||link))}" target="_blank" rel="noopener">Apple Maps</a>${q?`<button type="button" class="travel-btn" onclick="copyText(this.dataset.q,this)" data-q="${esc(q)}">Copy địa chỉ</button>`:""}</div>`;}
/* Dán nội dung "Chia sẻ" từ app Google Maps: tách tên, địa chỉ và link */
function parseMapsShare(text){
  const t=String(text||"").trim();const m=t.match(/https?:\/\/\S+/);
  if(!m)return null;
  const url=m[0];if(!/(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.)/i.test(url))return null;
  const lines=t.replace(url,"").split(/\n+/).map(x=>x.trim()).filter(Boolean);
  return {url,name:lines[0]||"",address:lines.slice(1).join(", ")};
}
function applyMapsShare(info){
  if(!info)return false;
  const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!==undefined)el.value=v;};
  set("googleMapsURIInput",info.url);
  if(info.name){set("locationNameInput",info.name);set("locationFallback",info.name);}
  if(info.address)set("locationAddressInput",info.address);
  set("placeIdInput","");set("locationLatInput","");set("locationLngInput","");
  const h=document.getElementById("placesHint");if(h)h.textContent=info.address?"Đã lấy tên, địa chỉ và link từ Google Maps ✓":"Đã lưu link Google Maps ✓ — bạn nhập thêm địa chỉ nếu muốn hiện trên app.";
  return true;
}
function onMapsLinkPaste(e){const txt=(e.clipboardData||window.clipboardData)?.getData("text")||"";const info=parseMapsShare(txt);if(info){e.preventDefault();applyMapsShare(info);}}
/* Gợi ý địa chỉ miễn phí từ OpenStreetMap (Photon) */
let osmTimer=null,osmSeq=0;
function osmAddress(pr){
  const street=[pr.housenumber,pr.street].filter(Boolean).join(" ");
  const parts=[street,pr.locality||pr.district,pr.city||pr.county,pr.state].filter(Boolean);
  const out=[];parts.forEach(x=>{if(!out.includes(x))out.push(x)});return out.join(", ");
}
function osmSuggest(q){
  const box=document.getElementById("placeSuggest");if(!box)return;
  clearTimeout(osmTimer);q=String(q||"").trim();
  if(q.length<3||/^https?:/i.test(q)){box.innerHTML="";box.hidden=true;return;}
  osmTimer=setTimeout(async()=>{
    const seq=++osmSeq;
    try{
      const r=await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=10.7769&lon=106.7009&bbox=102.1,8.2,109.6,23.4`);
      if(!r.ok)throw new Error("photon");
      const data=await r.json();if(seq!==osmSeq)return;
      const items=(data.features||[]).filter(f=>(f.properties||{}).countrycode==="VN"||!(f.properties||{}).countrycode).map(f=>{const pr=f.properties||{};const [lng,lat]=f.geometry?.coordinates||[];return {name:pr.name||[pr.housenumber,pr.street].filter(Boolean).join(" "),address:osmAddress(pr),lat,lng,pr};}).filter(x=>x.name||x.address);
      window._osmItems=items;
      box.innerHTML=items.length?items.map((x,i)=>`<button type="button" class="suggest-item" onclick="pickOsm(${i})"><b>${esc(x.name||x.address)}</b><span>${esc(x.address)}</span></button>`).join("")+`<div class="suggest-foot">Gợi ý từ OpenStreetMap · miễn phí</div>`:`<div class="suggest-foot">Không tìm thấy gợi ý. Bạn cứ nhập tay, hoặc dán link từ app Google Maps.</div>`;
      box.hidden=false;
    }catch(_){if(seq===osmSeq){box.innerHTML=`<div class="suggest-foot">Không tải được gợi ý (mất mạng?). Bạn vẫn nhập tay được.</div>`;box.hidden=false;}}
  },450);
}
function pickOsm(i){
  const x=(window._osmItems||[])[i];if(!x)return;const pr=x.pr||{};
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v??"";};
  set("locationFallback",x.name||x.address);set("locationNameInput",x.name||x.address);
  set("locationAddressInput",x.address);set("locationLatInput",x.lat??"");set("locationLngInput",x.lng??"");set("placeIdInput","");
  const put=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v||"";};
  put("addressStreetNumber",pr.housenumber?`Số ${pr.housenumber}`:"");put("addressWard",pr.street||pr.locality||"");put("addressDistrict",pr.district||pr.county||"");put("addressCity",pr.city||pr.state||"");
  document.getElementById("addressBreakdown")?.classList.toggle("hidden",!(pr.housenumber||pr.street||pr.district||pr.city));
  const box=document.getElementById("placeSuggest");if(box){box.hidden=true;box.innerHTML="";}
  const h=document.getElementById("placesHint");if(h)h.textContent="Đã điền địa chỉ ✓ — kiểm tra lại số nhà nếu cần.";
}
async function loadMapsConfig(){
  if(mapsConfig.ready || mapsConfig.failed) return mapsConfig;
  try{
    if(state.settings.browserMapsKey) {
      mapsConfig.apiKey=state.settings.browserMapsKey.trim();
    }
    if(!mapsConfig.apiKey){mapsConfig.failed=true; return mapsConfig;}
  }catch(e){mapsConfig.failed=true; return mapsConfig;}
  if(mapsScriptPromise) return mapsScriptPromise;
  mapsScriptPromise=new Promise((resolve,reject)=>{
    if(window.google?.maps?.importLibrary){mapsConfig.ready=true;resolve(mapsConfig);return;}
    const script=document.createElement("script");
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsConfig.apiKey)}&loading=async&libraries=places&v=weekly&language=vi&region=VN`;
    script.async=true;script.defer=true;
    script.onload=()=>{mapsConfig.ready=true;resolve(mapsConfig)};
    script.onerror=()=>{mapsConfig.failed=true;reject(new Error("Google Maps JS failed"))};
    document.head.appendChild(script);
  }).catch(()=>mapsConfig);
  return mapsScriptPromise;
}
function addressPartsFromPlace(place){
  const parts={};
  for(const c of (place.addressComponents||[])){
    const types=c.types||[];
    const text=c.longText||c.shortText||"";
    if(types.includes("street_number")) parts.streetNumber=text;
    else if(types.includes("route")) parts.route=text;
    else if(types.includes("sublocality_level_1")||types.includes("sublocality")) parts.ward=text;
    else if(types.includes("administrative_area_level_2")) parts.district=text;
    else if(types.includes("administrative_area_level_1")) parts.city=text;
    else if(types.includes("postal_code")) parts.postalCode=text;
  }
  return parts;
}
async function attachPlaceAutocomplete(existing){
  const host=document.getElementById("placePicker");
  if(!host)return;
  const fallback=document.getElementById("locationFallback");
  const hint=document.getElementById("placesHint");
  const cfg=await loadMapsConfig();
  if(!cfg.apiKey){
    host.innerHTML=fallback?.outerHTML||`<input id="locationFallback" class="field-control" value="${esc(existing?.locationName||existing?.location||"")}" placeholder="Nhập tên địa điểm">`;
    if(fallback&&!host.contains(fallback))fallback.remove();
    const f=host.querySelector("#locationFallback");
    if(f){f.style.display="";f.setAttribute("autocomplete","off");f.placeholder="Gõ tên nơi tổ chức hoặc địa chỉ…";
      f.addEventListener("input",e=>{document.getElementById("locationNameInput").value=e.target.value;document.getElementById("locationLatInput").value="";document.getElementById("locationLngInput").value="";osmSuggest(e.target.value);});
      f.addEventListener("paste",e=>{const info=parseMapsShare((e.clipboardData||window.clipboardData)?.getData("text")||"");if(info){e.preventDefault();applyMapsShare(info);}});}
    if(hint)hint.textContent="Gõ tên hoặc địa chỉ để xem gợi ý (miễn phí). Không có gợi ý thì cứ nhập tay.";
    return;
  }
  try{
    const {PlaceAutocompleteElement}=await google.maps.importLibrary("places");
    host.innerHTML="";
    const el=new PlaceAutocompleteElement();
    el.setAttribute("included-region-codes","vn");
    el.placeholder="Gõ tên địa điểm…";
    el.value=existing?.locationName||existing?.location||"";
    el.style.width="100%";
    host.appendChild(el);
    el.addEventListener("gmp-select",async({placePrediction})=>{
      const place=placePrediction.toPlace();
      await place.fetchFields({fields:["displayName","formattedAddress","addressComponents","location","googleMapsURI","id"]});
      const name=place.displayName?.text || place.displayName || existing?.locationName || "";
      const full=place.formattedAddress || "";
      const parts=addressPartsFromPlace(place);
      document.getElementById("locationNameInput").value=name;
      document.getElementById("locationAddressInput").value=full;
      document.getElementById("placeIdInput").value=place.id||"";
      document.getElementById("googleMapsURIInput").value=place.googleMapsURI||"";
      document.getElementById("locationLatInput").value=place.location?.lat?.() ?? place.location?.lat ?? "";
      document.getElementById("locationLngInput").value=place.location?.lng?.() ?? place.location?.lng ?? "";
      document.getElementById("addressStreetNumber").textContent=parts.streetNumber?`Số ${parts.streetNumber}`:"";
      document.getElementById("addressWard").textContent=parts.ward||"";
      document.getElementById("addressDistrict").textContent=parts.district||"";
      document.getElementById("addressCity").textContent=parts.city||"";
      const detail=[parts.streetNumber,parts.route,parts.ward,parts.district,parts.city].filter(Boolean).join(", ");
      document.getElementById("addressBreakdown").classList.toggle("hidden",!detail);
      document.getElementById("addressBreakdown").dataset.googleUrl=place.googleMapsURI||"";
    });
    if(hint)hint.textContent="Google Maps sẽ đề xuất địa điểm khi bạn gõ.";
  }catch(e){
    mapsConfig.failed=true;
    if(hint)hint.textContent="Không tải được Google Places. Bạn vẫn có thể nhập thủ công.";
    const f=document.getElementById("locationFallback");
    if(f){f.style.display="block";f.addEventListener("input",e=>document.getElementById("locationNameInput").value=e.target.value);}
  }
}

const pages={
home(){
 const n=nextJob(),d=new Date(),month=d.getMonth(),year=d.getFullYear();
 const mKey=`${year}-${String(month+1).padStart(2,"0")}`;
 const inMonth=state.jobs.filter(j=>(j.date||"").startsWith(mKey));
 const monthly=inMonth;
 const revenue=monthly.reduce((s,j)=>s+fin(j).received,0);
 const endKey=`${mKey}-31`;const dueJobs=state.jobs.filter(j=>isBillable(j)&&fin(j).due>0&&(j.date||"")<=endKey);
 const due=dueJobs.reduce((s,j)=>s+fin(j).due,0);const overdueN=dueJobs.filter(j=>!isNotOver(j)&&!(j.date||"").startsWith(mKey)).length;
 const dayText=n?`${relLabel(n)} · ${shortDate(n.date)}${hasTime(n)?" · "+n.time:""}`:"Chưa có show";
 return `<button class="black-btn add-job-cta" onclick="openJobForm()"><span class="cta-plus">${icon("plus",20)}</span>Thêm job mới</button>
 ${(()=>{if(localMode||!pushSupported()||Notification.permission!=="default"||pushMeta().enabled===false||pushMeta().nudgeHidden)return"";if(isIOS()&&!isStandalone())return"";return `<div class="notify-nudge"><span>🔔</span><button class="nn-main" onclick="enablePush()"><b>Bật thông báo trên máy này</b><small>Nhắc show, lịch họp và thu tiền — kể cả khi khoá màn hình</small></button><button class="nn-x" aria-label="Ẩn" onclick="setPushMeta({...pushMeta(),nudgeHidden:true});render()">×</button></div>`;})()}
 ${(()=>{const dr=getDraft("new");return dr?`<div class="draft-resume"><span class="draft-dot"></span><button class="draft-open" onclick="restoreDraft('new')"><b>Job đang nhập dở</b><span>${esc(dr.job?.title||"(chưa đặt tên)")} · ${esc(draftTimeText(dr))}</span></button><button class="draft-go" onclick="restoreDraft('new')">Tiếp tục ›</button><button class="draft-del" aria-label="Xoá nháp" onclick="discardDraft('new')">Xoá</button></div>`:"";})()}
 ${n?`<section class="hero" onclick="openJob('${n.id}')"><div class="hero-top"><span class="eyebrow">SHOW TIẾP THEO</span><span class="hero-pill">${esc(n.status)}</span></div><div class="hero-title">${esc(n.title)}</div><div class="hero-meta">${fmtDate(n.date)}${n.time?` • ${esc(n.time)}`:""}</div><div class="hero-location"><span>${icon("pin",13)} ${esc(n.locationName||n.location||"Chưa có địa điểm")}</span>${n.locationAddress?`<small>${esc(n.locationAddress)}</small>`:""}</div><div class="hero-bottom"><span class="countdown">${dayText}</span><span class="hero-arrow">${icon("chevron",17)}</span></div></section>`:`<div class="empty hero-empty">Chưa có show sắp tới.</div>`}
 <section class="metric-grid"><button class="metric-card finance-card count-card" onclick="toggleShowCount()"><div class="metric-icon">${icon(state.settings.showCountVisible?"eye":"morecircle",17)}</div><span>Tháng ${month+1}</span><strong>${maskedCount(monthly.length)}<small> show</small></strong><small class="tap-hint">${state.settings.showCountVisible?"Chạm để ẩn":"Chạm để xem"}</small></button><button class="metric-card finance-card" onclick="toggleFinance()"><div class="metric-icon">${icon(state.settings.financeVisible?"eye":"morecircle",17)}</div><span>Đã nhận · T${month+1}</span><strong>${maskedMoney(revenue)}</strong><small class="tap-hint">${state.settings.financeVisible?"Chạm để ẩn":"Chạm để xem"}</small></button><button class="metric-card finance-card" onclick="toggleFinance()"><div class="metric-icon">${icon(state.settings.financeVisible?"eye":"morecircle",17)}</div><span>Còn phải thu</span><strong>${maskedMoney(due)}</strong>${overdueN?`<small class="metric-sub warn">gồm ${overdueN} show tháng trước</small>`:""}<small class="tap-hint">${state.settings.financeVisible?"Chạm để ẩn":"Chạm để xem"}</small></button></section>
 ${(()=>{const P=payStats();return P.dueJobs.length?`<button class="pay-strip ${P.over.length?"warn":""}" onclick="payView='due';navigate('payments')"><span class="pay-strip-ic">₫</span><div><b>${P.dueJobs.length} show chưa thu đủ${P.over.length?` · ${P.over.length} quá hạn`:""}</b><span>Còn phải thu ${maskedMoney(P.dueSum)}</span></div><em>Xem ›</em></button>`:"";})()}
 ${(()=>{const um=upcomingMeetings(3);return um.length?`<section class="section"><div class="section-head"><h2>LỊCH HỌP SẮP TỚI</h2></div><div class="timeline">${um.map(x=>meetingItem(x.job,x.m)).join("")}</div></section>`:"";})()}
 <section class="section"><div class="section-head"><h2>SẮP TỚI</h2><button class="text-btn" onclick="navigate('calendar')">XEM LỊCH ${icon("chevron",14)}</button></div><div class="timeline">${upcoming().map(timelineItem).join("")||'<div class="empty">Không có lịch sắp tới.</div>'}</div></section>
 ${(() => {const todo=state.jobs.filter(j=>new Date(j.date+"T00:00:00")>=new Date(new Date().setHours(0,0,0,0))&&workNeedsAttention(j)).sort((a,b)=>(a.date+(a.time||"")).localeCompare(b.date+(b.time||""))).slice(0,5);const count=state.jobs.filter(j=>new Date(j.date+"T00:00:00")>=new Date(new Date().setHours(0,0,0,0))&&workNeedsAttention(j)).length;return `<section class="section work-alert-section"><div class="section-head"><div><div class="eyebrow">NHẮC VIỆC</div><h2>KỊCH BẢN CẦN XỬ LÝ</h2></div><span class="alert-count">${count}</span></div>${todo.length?`<div class="work-alert-list">${todo.map(j=>`<button class="work-alert" onclick="openJob('${j.id}')"><div class="work-alert-date">${daysFromNow(j.date)<=0?"HÔM NAY":daysFromNow(j.date)===1?"NGÀY MAI":"CÒN "+daysFromNow(j.date)+" NGÀY"}</div><div class="work-alert-main"><b>${esc(j.title)}</b><span>${esc(workLabel(j).toUpperCase())}</span></div>${icon("chevron",15)}</button>`).join("")}</div>`:`<div class="work-clear"><b>✓ KỊCH BẢN ĐÃ CẬP NHẬT</b><span>Các show sắp tới hiện không còn việc kịch bản bắt buộc.</span></div>`}<button class="text-btn" onclick="workFilter='Chưa xong';navigate('jobs')">XEM TẤT CẢ VIỆC CẦN XỬ LÝ ${icon("chevron",14)}</button></section>`})()}`;
},
calendar(){
 const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),start=(first.getDay()+6)%7,cells=[];
 for(let i=0;i<start;i++)cells.push(`<div class="cal-day muted"></div>`);
 for(let d=1;d<=last.getDate();d++){const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,count=state.jobs.filter(j=>j.date===ds).length,meets=state.jobs.reduce((n,j)=>n+(j.meetings||[]).filter(m=>m.date===ds).length,0);cells.push(`<button class="cal-day ${calendarState(ds)} ${ds===selectedDate?"selected":""}" aria-label="${fmtDate(ds)} ${count?count+" show":"trống"}" onclick="selectedDate='${ds}';calView='day';render()"><span>${d}</span>${count?`<i>${count}</i>`:""}${meets?`<b class="meet-dot" title="${meets} lịch họp"></b>`:""}</button>`)}
 const monthKey=`${y}-${String(m+1).padStart(2,"0")}`;
 const monthJobs=state.jobs.filter(j=>(j.date||"").startsWith(monthKey)).sort(byStart);
 const dayJobs=state.jobs.filter(j=>j.date===selectedDate).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
 const dayMeets=[];state.jobs.forEach(j=>(j.meetings||[]).forEach(m=>{if(m.date===selectedDate)dayMeets.push({job:j,m});}));dayMeets.sort((a,b)=>(a.m.time||"").localeCompare(b.m.time||""));
 return `<div class="calendar-card"><div class="month-row"><button class="ghost-btn" onclick="changeMonth(-1)">${icon("back",17)}</button><div class="month-label">${calendarDate.toLocaleDateString("vi-VN",{month:"long",year:"numeric"})}</div><button class="ghost-btn" onclick="changeMonth(1)">${icon("chevron",17)}</button></div><div class="weekdays">${["T2","T3","T4","T5","T6","T7","CN"].map(x=>`<span>${x}</span>`).join("")}</div><div class="cal-grid">${cells.join("")}</div><div class="calendar-legend"><span class="legend-item"><i class="legend-dot legend-empty"></i> Trống</span><span class="legend-item"><i class="legend-dot legend-confirmed"></i> Có show</span><span class="legend-item"><i class="legend-dot legend-meet"></i> Có lịch họp</span></div></div><div class="seg-switch"><button class="${calView!=="month"?"on":""}" onclick="calView='day';render()">Theo ngày</button><button class="${calView==="month"?"on":""}" onclick="calView='month';render()">Cả tháng (${monthJobs.length})</button></div>
 ${calView==="month"?`<section class="section"><div class="section-head"><div><div class="eyebrow">TẤT CẢ JOB TRONG THÁNG</div><h2>Tháng ${m+1}/${y}</h2></div><span class="small">${monthJobs.length} show${state.settings.financeVisible&&monthJobs.length?` · ${money(monthJobs.reduce((a,j)=>a+Number(j.total||0),0))}`:""}</span></div><div class="timeline">${monthJobs.map(timelineItem).join("")||'<div class="empty">Tháng này chưa có show.</div>'}</div></section>`
 :`<section class="section"><div class="section-head"><div><div class="eyebrow">NGÀY ĐANG CHỌN</div><h2>${fmtDate(selectedDate)}</h2></div><button class="text-btn" onclick="selectedDate=todayStr();calendarDate=new Date();render()">Hôm nay</button></div><div class="timeline">${dayJobs.map(timelineItem).join("")||(dayMeets.length?"":'<div class="empty">Ngày này chưa có show.</div>')}${dayMeets.map(x=>meetingItem(x.job,x.m)).join("")}</div></section>`}`;
},
jobs(){
 const filters=["Tất cả",...getJobTypeNames()];
 if(!filters.includes(jobFilter))jobFilter="Tất cả";
 const workFilters=["Tất cả","Chưa xong","Kịch bản chưa xong","Love Story chưa xong"];
 if(!workFilters.includes(workFilter))workFilter="Tất cả";
 let arr=state.jobs.filter(j=>jobFilter==="Tất cả"||j.type===jobFilter);
 if(workFilter==="Chưa xong")arr=arr.filter(workNeedsAttention);
 if(workFilter==="Kịch bản chưa xong")arr=arr.filter(scriptNeedsWork);
 if(workFilter==="Love Story chưa xong")arr=arr.filter(loveStoryNeedsWork);
 if(searchQuery)arr=arr.filter(j=>{const b=getBooker(j);return `${j.title} ${j.location} ${j.locationName||""} ${j.locationAddress||""} ${b?.name||j.client} ${b?.phone||j.phone} ${j.notes} ${j.scriptSource||""} ${j.scriptStatus||""} ${j.scriptLink||""} ${j.scriptNotes||""} ${j.loveStoryStatus||""} ${j.loveStoryLink||""} ${j.loveStoryNotes||""}`.toLowerCase().includes(searchQuery.toLowerCase())});
 const today=new Date(); today.setHours(0,0,0,0);
 const recentCutoff=Date.now()-30*86400000;
 const recent=[...arr].filter(j=>new Date(j.updatedAt||j.createdAt||j.date).getTime()>=recentCutoff).sort((a,b)=>new Date(b.updatedAt||b.createdAt||b.date)-new Date(a.updatedAt||a.createdAt||a.date)).slice(0,5);
 const recentIds=new Set(recent.map(j=>j.id));
 const upcomingArr=arr.filter(j=>!recentIds.has(j.id)&&isNotOver(j)).sort(byStart);
 const pastAll=arr.filter(j=>!isNotOver(j));
 const pastYears=[...new Set(pastAll.map(j=>(j.date||"").slice(0,4)).filter(Boolean))].sort().reverse();
 if(pastYear!=="all"&&!pastYears.includes(pastYear))pastYear="all";
 let past=pastAll.filter(j=>(pastYear==="all"||j.date.startsWith(pastYear))&&(pastMonth==="all"||j.date.slice(5,7)===pastMonth));
 past.sort((a,b)=>{const c=(a.date+(a.time||"")).localeCompare(b.date+(b.time||""));return pastOrder==="asc"?c:-c;});
 const allSearch=searchQuery?[...arr].sort((a,b)=>new Date(b.updatedAt||b.createdAt||b.date)-new Date(a.updatedAt||a.createdAt||a.date)):[];
 return `<div class="search-wrap"><span>${icon("search",17)}</span><input id="jobSearch" value="${esc(searchQuery)}" class="search" placeholder="Tìm show, booker, địa điểm, kịch bản..." oninput="searchQuery=this.value;render()"></div>
 <div class="filter-row">${filters.map(x=>`<button class="filter ${jobFilter===x?"active":""}" onclick="jobFilter='${esc(x).replace(/'/g,"\'")}';render()">${esc(x)}</button>`).join("")}</div>
 <div class="filter-row work-filter-row">${workFilters.map(x=>`<button class="filter work-filter ${workFilter===x?"active":""}" onclick="workFilter='${x}';render()">${esc(x)}</button>`).join("")}</div>
 ${searchQuery?`<section class="section"><div class="section-head"><h2>${allSearch.length} kết quả</h2><button class="text-btn" onclick="openJobForm()">THÊM JOB ${icon("plus",13)}</button></div><div class="job-list">${allSearch.map(jobRow).join("")||'<div class="empty">Không tìm thấy công việc.</div>'}</div></section>`:`
 ${recent.length?`<section class="section"><div class="section-head"><div><div class="eyebrow">MỚI CẬP NHẬT</div><h2>Vừa cập nhật</h2></div><span class="small">${recent.length} job</span></div><div class="job-list">${recent.map(jobRow).join("")}</div></section>`:""}
 <section class="section"><div class="section-head"><div><div class="eyebrow">LỊCH SẮP TỚI</div><h2>SẮP DIỄN RA</h2></div><button class="text-btn" onclick="openJobForm()">THÊM JOB ${icon("plus",13)}</button></div><div class="job-list">${upcomingArr.map(jobRow).join("")||'<div class="empty">Không có show sắp tới.</div>'}</div></section>
 <section class="section"><button class="past-toggle" onclick="showPastJobs=!showPastJobs;render()"><span><div class="eyebrow">LỊCH SỬ</div><b>Show đã qua (${pastAll.length})</b></span>${icon(showPastJobs?"back":"chevron",17)}</button>${showPastJobs?`<div class="past-filters">
   <select class="field-control" onchange="pastYear=this.value;render()"><option value="all">Tất cả năm</option>${pastYears.map(yy=>`<option value="${yy}" ${pastYear===yy?"selected":""}>Năm ${yy}</option>`).join("")}</select>
   <select class="field-control" onchange="pastMonth=this.value;render()"><option value="all">Tất cả tháng</option>${Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(mm=>`<option value="${mm}" ${pastMonth===mm?"selected":""}>Tháng ${Number(mm)}</option>`).join("")}</select>
   <button class="outline-btn past-order" onclick="pastOrder=pastOrder==='asc'?'desc':'asc';render()">${pastOrder==="asc"?"Cũ → mới":"Mới → cũ"}</button>
 </div><div class="small past-count">${past.length} show${state.settings.financeVisible&&past.length?` · ${money(past.reduce((a,j)=>a+Number(j.total||0),0))}`:""}</div>
 <div class="job-list past-list">${groupByMonth(past).map(g=>`<div class="month-group-head"><b>Tháng ${g.m}/${g.y}</b><span>${g.items.length} show</span></div>${g.items.map(jobRow).join("")}`).join("")||'<div class="empty">Không có show nào khớp bộ lọc.</div>'}</div>`:""}</section>`}`;
},
bookers(){
 let arr=state.bookers.filter(b=>`${b.name} ${b.phone} ${b.company} ${b.notes}`.toLowerCase().includes(bookerSearch.toLowerCase()));
 arr.sort((a,b)=>a.name.localeCompare(b.name,"vi"));
 return `<div class="section-head"><div><div class="eyebrow">CONTACTS</div><h2>Booker</h2></div><button class="black-btn" onclick="openBookerForm()">${icon("plus",15)} Booker mới</button></div>
 <div class="search-wrap"><span>${icon("search",17)}</span><input class="search" value="${esc(bookerSearch)}" placeholder="Tìm booker..." oninput="bookerSearch=this.value;render()"></div>
 <div class="booker-list">${arr.map(bookerRow).join("")||'<div class="empty">Chưa có booker.</div>'}</div>`;
},
notes(){
 const q=noteSearch.trim().toLowerCase();
 let arr=state.notes.filter(n=>!q||`${n.title||""} ${n.body||""} ${noteJob(n)?.title||""}`.toLowerCase().includes(q));
 if(noteFilter==="linked")arr=arr.filter(n=>noteJob(n));
 if(noteFilter==="upcoming")arr=arr.filter(n=>{const jj=noteJob(n);return jj&&isNotOver(jj);});
 if(noteFilter==="free")arr=arr.filter(n=>!noteJob(n));
 const days={"7":7,"30":30,"90":90}[noteRange];if(days)arr=arr.filter(n=>noteTime(n)>=Date.now()-days*86400000);
 arr.sort((a,b)=>{if(noteSort==="az")return (a.title||"").localeCompare(b.title||"","vi");if(noteSort==="show"){const ja=noteJob(a),jb=noteJob(b);return (ja?ja.date+(ja.time||""):"9999").localeCompare(jb?jb.date+(jb.time||""):"9999");}if(noteSort==="created")return (b.createdAt||"").localeCompare(a.createdAt||"");return noteTime(b)-noteTime(a);});
 const chip=(v,l)=>`<button class="filter ${noteFilter===v?"active":""}" onclick="noteFilter='${v}';render()">${l}</button>`;
 return `<div class="section-head"><span class="small"><b>${state.notes.length}</b> kịch bản · ${state.notes.filter(n=>noteJob(n)).length} đã gắn job</span><button class="black-btn" onclick="openNote()">${icon("plus",15)} Viết mới</button></div>
 <div class="search-wrap"><span>${icon("search",17)}</span><input class="search" id="noteSearchInput" value="${esc(noteSearch)}" placeholder="Tìm tiêu đề, nội dung, tên job…" oninput="noteSearch=this.value;render();const el=document.getElementById('noteSearchInput');el.focus();el.setSelectionRange(el.value.length,el.value.length)"></div>
 <div class="filter-row">${chip("all","Tất cả")}${chip("upcoming","Job sắp diễn ra")}${chip("linked","Đã gắn job")}${chip("free","Chưa gắn job")}</div>
 <div class="note-tools"><select class="field-control" onchange="noteSort=this.value;render()"><option value="edited" ${noteSort==="edited"?"selected":""}>Mới sửa gần đây</option><option value="created" ${noteSort==="created"?"selected":""}>Mới tạo</option><option value="show" ${noteSort==="show"?"selected":""}>Theo ngày diễn ra</option><option value="az" ${noteSort==="az"?"selected":""}>Tên A → Z</option></select><select class="field-control" onchange="noteRange=this.value;render()"><option value="all" ${noteRange==="all"?"selected":""}>Mọi thời gian</option><option value="7" ${noteRange==="7"?"selected":""}>Sửa trong 7 ngày</option><option value="30" ${noteRange==="30"?"selected":""}>Sửa trong 30 ngày</option><option value="90" ${noteRange==="90"?"selected":""}>Sửa trong 90 ngày</option></select></div>
 <div class="note-grid">${arr.map(noteCard).join("")||'<div class="empty">Không có kịch bản nào khớp.</div>'}</div>`;
},
payments(){
 const P=payStats();
 const years=[...new Set(P.b.map(j=>(j.date||"").slice(0,4)).filter(Boolean))].sort().reverse();
 if(payYear!=="all"&&!years.includes(payYear))payYear="all";
 let arr=P.b.filter(j=>(payYear==="all"||j.date.startsWith(payYear))&&(payMonth==="all"||j.date.slice(5,7)===payMonth));
 if(payView==="due")arr=arr.filter(j=>fin(j).due>0);if(payView==="paid")arr=arr.filter(j=>fin(j).due===0);
 const over=arr.filter(j=>fin(j).due>0&&!isNotOver(j)).sort(byStart),coming=arr.filter(j=>fin(j).due>0&&isNotOver(j)).sort(byStart),paid=arr.filter(j=>fin(j).due===0).sort((a,b)=>byStart(b,a));
 const sum=list=>list.reduce((a,j)=>a+fin(j).due,0);const seg=(v,l)=>`<button class="${payView===v?"on":""}" onclick="payView='${v}';render()">${l}</button>`;
 const noPrice=state.jobs.filter(j=>!Number(j.total)).length;
 return `<button class="text-btn back-link" onclick="navigate('home')">‹ Tổng quan</button>
 <section class="pay-summary"><div class="pay-sum-card warn"><span>Quá hạn chưa thu</span><b>${maskedMoney(P.overSum)}</b><small>${P.over.length} show đã diễn ra</small></div><div class="pay-sum-card"><span>Còn phải thu</span><b>${maskedMoney(P.dueSum)}</b><small>${P.dueJobs.length} show</small></div></section>
 <div class="seg-switch">${seg("due","Chưa thu đủ")}${seg("paid","Đã thu đủ")}${seg("all","Tất cả")}</div>
 <div class="past-filters pay-filters"><select class="field-control" onchange="payYear=this.value;render()"><option value="all">Tất cả năm</option>${years.map(y=>`<option value="${y}" ${payYear===y?"selected":""}>Năm ${y}</option>`).join("")}</select><select class="field-control" onchange="payMonth=this.value;render()"><option value="all">Tất cả tháng</option>${Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(mm=>`<option value="${mm}" ${payMonth===mm?"selected":""}>Tháng ${Number(mm)}</option>`).join("")}</select><button class="outline-btn past-order" onclick="toggleFinance()">${state.settings.financeVisible?"Ẩn số":"Hiện số"}</button></div>
 ${over.length?`<section class="section"><div class="section-head"><h2 class="pay-h over">Quá hạn · đã diễn ra</h2><span class="small">${over.length} show · ${maskedMoney(sum(over))}</span></div>${over.length>1?`<button class="outline-btn bulk-paid" onclick="bulkPaid([${over.map(j=>`'${j.id}'`).join(",")}])">✓ Đánh dấu đã thu đủ cả ${over.length} show quá hạn${payYear!=="all"?` năm ${payYear}`:""}${payMonth!=="all"?` tháng ${Number(payMonth)}`:""}</button>`:""}<div class="pay-list">${over.map(payRow).join("")}</div></section>`:""}
 ${coming.length?`<section class="section"><div class="section-head"><h2 class="pay-h">Sắp diễn ra · chưa thu đủ</h2><span class="small">${coming.length} show · ${maskedMoney(sum(coming))}</span></div><div class="pay-list">${coming.map(payRow).join("")}</div></section>`:""}
 ${paid.length?`<section class="section"><div class="section-head"><h2 class="pay-h ok">Đã thu đủ</h2><span class="small">${paid.length} show</span></div><div class="pay-list">${paid.map(payRow).join("")}</div></section>`:""}
 ${!over.length&&!coming.length&&!paid.length?'<div class="empty">Không có show nào khớp bộ lọc.</div>':""}
 <div class="small pay-note">Tính tất cả show đã nhập giá trị.${noPrice?` Có <b>${noPrice}</b> show chưa nhập giá trị.`:""}</div>`;
},
report(){
 const years=[...new Set(state.jobs.map(j=>(j.date||"").slice(0,4)).filter(Boolean))].sort().reverse();
 if(!years.includes(repYear))repYear=years.includes(String(new Date().getFullYear()))?String(new Date().getFullYear()):(years[0]||String(new Date().getFullYear()));
 const list=state.jobs.filter(j=>isBillable(j)&&j.date.startsWith(repYear));
 const tot=list.reduce((a,j)=>{const F=fin(j);a.total+=F.total;a.rec+=F.received;a.due+=F.due;a.com+=F.commission;return a;},{total:0,rec:0,due:0,com:0});
 const months=Array.from({length:12},(_,i)=>{const mm=String(i+1).padStart(2,"0");const l=list.filter(j=>j.date.slice(5,7)===mm);return {m:i+1,n:l.length,total:l.reduce((a,j)=>a+fin(j).total,0),rec:l.reduce((a,j)=>a+fin(j).received,0)};});
 const max=Math.max(1,...months.map(x=>x.total));
 const group=(keyFn)=>{const m=new Map();list.forEach(j=>{const k=keyFn(j)||"(Không rõ)";const g=m.get(k)||{k,n:0,total:0};g.n++;g.total+=fin(j).total;m.set(k,g);});return [...m.values()].sort((a,b)=>b.total-a.total);};
 const byBooker=group(j=>getBooker(j)?.name),byType=group(j=>j.type);
 const hide=!state.settings.financeVisible;const mm=v=>maskedMoney(v);
 return `<div class="report-top"><select class="field-control" onchange="repYear=this.value;render()">${years.map(y=>`<option ${y===repYear?"selected":""}>${y}</option>`).join("")}</select><button class="outline-btn" onclick="toggleFinance()">${hide?"Hiện số":"Ẩn số"}</button><button class="black-btn" onclick="exportReportCSV()">Xuất Excel</button></div>
 <section class="pay-summary rep-kpi"><div class="pay-sum-card"><span>Tổng giá trị show</span><b>${mm(tot.total)}</b><small>${list.length} show</small></div><div class="pay-sum-card"><span>Đã nhận</span><b>${mm(tot.rec)}</b><small>Còn phải thu ${mm(tot.due)}</small></div><div class="pay-sum-card"><span>Trung bình / show</span><b>${mm(list.length?Math.round(tot.total/list.length):0)}</b><small>&nbsp;</small></div><div class="pay-sum-card"><span>Chiết khấu (back)</span><b>${mm(tot.com)}</b><small>Thực nhận ${mm(tot.total-tot.com)}</small></div></section>
 <section class="section"><div class="section-head"><h2>Theo tháng · ${repYear}</h2></div><div class="rep-bars">${months.map(x=>`<div class="rep-bar"><div class="rep-col">${!hide&&x.total?`<i style="height:${Math.max(2,Math.round(x.total/max*100))}%"></i>`:""}${!hide&&x.rec?`<b style="height:${Math.max(2,Math.round(x.rec/max*100))}%"></b>`:""}</div><span>T${x.m}</span><small>${x.n||""}</small></div>`).join("")}</div><div class="small rep-legend"><i class="lg-a"></i> Giá trị show <i class="lg-b"></i> Đã nhận · số dưới cột = số show</div></section>
 <section class="section"><div class="section-head"><h2>Theo booker</h2><span class="small">${byBooker.length} người</span></div><div class="rep-table">${byBooker.map((g,i)=>`<div class="rep-row"><span class="rep-rank">${i+1}</span><b>${esc(g.k)}</b><span>${g.n} show</span><strong>${mm(g.total)}</strong></div>`).join("")||'<div class="empty">Chưa có dữ liệu.</div>'}</div></section>
 <section class="section"><div class="section-head"><h2>Theo loại show</h2></div><div class="rep-table">${byType.map(g=>`<div class="rep-row"><span class="rep-rank">•</span><b>${esc(g.k)}</b><span>${g.n} show</span><strong>${mm(g.total)}</strong></div>`).join("")||'<div class="empty">Chưa có dữ liệu.</div>'}</div></section>
 <div class="small pay-note">Tính các show đã nhập giá trị, theo ngày diễn ra.</div>`;
},
notify(){
 const st=notifyStatus;if(!st&&!notifyChecking)checkNotify().then(()=>{if(page==="notify")render();});
 const S=state.settings;const row=(ok,title,desc)=>`<div class="nt-step ${ok===true?"ok":ok===false?"bad":"wait"}"><i>${ok===true?"✓":ok===false?"!":"…"}</i><div><b>${title}</b><span>${desc}</span></div></div>`;
 let steps="",action="",head="";
 if(!st){head=`<div class="nt-hero wait"><b>Đang kiểm tra máy này…</b></div>`;}
 else{
  const needInstall=st.ios&&!st.standalone;
  steps+=row(needInstall?false:true,"Mở từ Màn hình chính",needInstall?"Đang mở trong Safari — iPhone/iPad chỉ nhận thông báo khi mở app từ biểu tượng trên Màn hình chính.":st.ios?"Đã cài lên Màn hình chính":"Không bắt buộc trên máy này");
  steps+=row(st.permission==="granted"?true:st.permission==="denied"?false:null,"Cho phép thông báo",st.permission==="granted"?"Đã cho phép":st.permission==="denied"?`Đang bị chặn — vào Cài đặt → Thông báo → ${esc(S.appName)} để bật lại`:st.supported?"Chưa hỏi quyền":"Trình duyệt này không hỗ trợ");
  steps+=row(st.server==="local"?null:st.server===true?true:false,"Máy chủ (Cloudflare)",st.server==="local"?"Chế độ thử trên máy tính — không có máy chủ":st.server===true?`Đã kết nối · ${esc(pushServer().replace(/^https:\/\//,""))}`:st.server==="none"?"Chưa kết nối máy chủ":`Chưa kết nối được — kiểm tra mạng hoặc địa chỉ máy chủ${st.error?` (${esc(st.error)})`:""}`);
  steps+=row(notifyReady(st)?true:(st.subscribed&&!st.registered&&st.server===true)?false:null,"Máy này đã đăng ký nhận",notifyReady(st)?`Đang nhận với tên “${esc(deviceName())}”`:(st.subscribed&&!st.registered&&st.server===true)?"Máy chủ chưa có máy này — bấm Bật thông báo để đăng ký lại":"Chưa đăng ký");
  const ready=notifyReady(st);
  head=`<div class="nt-hero ${ready?"ok":"bad"}"><span>${ready?"🔔":"🔕"}</span><div><b>${ready?"Máy này đang nhận thông báo":"Máy này chưa nhận thông báo"}</b><small>${ready?"Thông báo hiện cả khi khoá màn hình và khi app đang đóng.":"Làm theo các bước bên dưới — chỉ cần làm một lần trên mỗi máy."}</small></div></div>`;
  action=st.server==="none"&&!needInstall?`<button class="black-btn nt-main" onclick="openSetup(true)">Kết nối máy chủ</button>`
   :needInstall?`<button class="black-btn nt-main" onclick="showInstallHelp()">Xem cách cài lên Màn hình chính</button>`
   :ready?`<button class="black-btn nt-main" onclick="sendTestPush()">Gửi thông báo thử tới máy này</button>`
   :`<button class="black-btn nt-main" onclick="enablePush()">🔔 Bật thông báo trên máy này</button>`;
  action+=`<div class="nt-sub"><button class="outline-btn" onclick="checkNotify().then(render)">Kiểm tra lại</button><button class="outline-btn" onclick="renameDevice()">Đổi tên máy</button>${st.server!=="none"&&st.server!=="local"?`<button class="outline-btn" onclick="setPushServer()">Đổi máy chủ</button>`:""}${st.subscribed?`<button class="outline-btn danger-text" onclick="disablePushHere()">Tắt trên máy này</button>`:""}</div>`;
 }
 const nextTxt=st&&st.server===true?(st.pending?`<div class="small pay-note">Đã hẹn ${st.pending} lời nhắc trong ${PLAN_DAYS} ngày tới · gần nhất ${(()=>{const d=new Date(st.next);return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;})()}</div>`:`<div class="small pay-note">Chưa có lời nhắc nào sắp tới.</div>`):"";
 const devs=st&&st.devices&&st.devices.length?`<section class="section"><div class="section-head"><h2>Các máy đang nhận</h2><span class="small">${st.devices.length} máy</span></div><div class="nt-devs">${st.devices.map(d=>`<div class="nt-dev ${d.mine?"mine":""}"><b>${esc(d.device)}${d.mine?" · máy này":""}</b><span>${d.lastOkAt?`Nhận gần nhất ${esc(relTime(d.lastOkAt))}`:`Đăng ký ${esc(relTime(d.at))}`}</span></div>`).join("")}</div></section>`:"";
 const tg=(k,t,d)=>`<div class="setting-card"><div class="setting-main"><b>${t}</b><span>${d}</span></div><button class="small-black" onclick="toggleRemind('${k}')">${S[k]===false?"Bật":"Tắt"}</button></div>`;
 return `<button class="text-btn back-link" onclick="navigate('more')">‹ Khác</button>${head}<section class="nt-steps">${steps}</section>${action}
 ${nextTxt}${devs}
 <section class="section"><div class="section-head"><h2>Nhận những thông báo nào</h2><span class="small">áp dụng cho mọi máy</span></div><div class="settings-list nt-toggles">
  ${tg("jobRemind",`⏰ Nhắc show ${S.jobRemind===false?"· đang tắt":""}`,"Theo các mốc chọn trong từng job (7 ngày, 1 ngày, 2 giờ…)")}
  ${tg("meetRemind",`👥 Nhắc lịch họp ${S.meetRemind===false?"· đang tắt":""}`,"Theo các mốc chọn trong từng buổi họp")}
  ${tg("payRemind",`💰 Nhắc thu tiền ${S.payRemind===false?"· đang tắt":""}`,"10:00 sau show 1, 3, 7 ngày nếu chưa thu đủ")}
  <div class="setting-card"><div class="setting-main"><b>Âm thanh khi app đang mở</b><span>Chỉ trên máy này</span></div><div class="setting-actions"><button class="small-black" onclick="toggleSoundNotifications()">${S.soundNotifications?"Tắt":"Bật"}</button><button class="mini-btn" onclick="previewNotifySound('soft')">Thử</button></div></div>
 </div></section>
 <div class="small pay-note">App tự hẹn lịch nhắc lên máy chủ Cloudflare mỗi khi bạn sửa job; máy chủ gửi đúng giờ nên điện thoại chỉ cần có mạng — không cần mở app. Chế độ Tập trung / Không làm phiền của iPhone có thể ẩn thông báo.</div>`;
},
more(){
 return `${(()=>{const d=daysSinceBackup();if(d!==null&&d<BACKUP_REMIND_DAYS)return"";return `<button class="backup-nudge" onclick="exportData()"><span>☁️</span><div><b>${d===null?"Chưa sao lưu dữ liệu":`Đã ${d} ngày chưa sao lưu`}</b><span>Chạm để lưu file backup vào iCloud Drive / Google Drive</span></div><em>Sao lưu ›</em></button>`;})()}<section class="settings-hero"><div class="eyebrow">SETTINGS · PHIÊN BẢN ${APP_VERSION}</div><h2>Thiết lập ${esc(state.settings.appName)}</h2><p>${browserTestMode?"Bạn đang ở Browser Test Mode. Cloud sync và Push thật không chạy; bạn có thể test UI, Jobs, Booker, Maps và các luồng thao tác.":"Dữ liệu tự đồng bộ giữa các máy. Thông báo nhắc show được gửi thẳng tới màn hình khoá — bật ở mục Thông báo."}</p></section>
 <div class="settings-list">
  <div class="setting-card"><div class="setting-icon">${icon("edit",18)}</div><div class="setting-main"><b>Tên ứng dụng</b><span>${esc(state.settings.appName)}</span></div><button class="small-black" onclick="setAppName()">Đổi</button></div>
  <div class="setting-card"><div class="setting-icon">${icon("bell",18)}</div><div class="setting-main"><b>Thông báo</b><span>${(()=>{const st=notifyStatus;if(!st)return "Bật nhắc show, lịch họp, thu tiền trên từng máy";return notifyReady(st)?`Máy này đang nhận ✓ · ${st.devices.length} máy đã bật`:"Máy này chưa nhận — chạm để bật";})()}</span></div><button class="small-black" onclick="navigate('notify')">Mở</button></div>
  <div class="setting-card"><div class="setting-icon">${icon("calendar",18)}</div><div class="setting-main"><b>Báo cáo thu nhập</b><span>Theo tháng, booker, loại show · xuất Excel</span></div><button class="small-black" onclick="navigate('report')">Mở</button></div>
  <div class="setting-card"><div class="setting-icon">${icon("check",18)}</div><div class="setting-main"><b>Mã truy cập dữ liệu</b><span>${accessKey()?"Máy này đã nhập mã ✓":"Máy này chưa nhập mã"} · bảo vệ dữ liệu trên máy chủ</span></div><button class="small-black" onclick="askAccessKey(true)">${accessKey()?"Đổi":"Nhập"}</button></div>
  <div class="setting-card"><div class="setting-icon">${icon("link",18)}</div><div class="setting-main"><b>Máy chủ dữ liệu &amp; thông báo</b><span>${cloudUrl()?esc(cloudUrl().replace(/^https:\/\//,"")):"Chưa kết nối"} · chép dữ liệu từ Netlify cũ</span></div><button class="small-black" onclick="openSetup(true)">Mở</button></div>
  <div class="setting-card"><div class="setting-icon">${icon("booker",18)}</div><div class="setting-main"><b>Danh bạ booker</b><span>${state.bookers.length} booker · thêm, sửa, xem show theo booker</span></div><button class="small-black" onclick="navigate('bookers')">Mở</button></div>
  <div class="setting-card"><div class="setting-icon">${icon("finance",18)}</div><div class="setting-main"><b>Theo dõi thanh toán</b><span>Show đã thu đủ / chưa thu đủ / quá hạn</span></div><button class="small-black" onclick="navigate('payments')">Mở</button></div>
  <div class="setting-card card-fields-setting"><div class="setting-icon">${icon("eye",18)}</div><div class="setting-main"><b>Thông tin trên thẻ show</b><span>Chọn mục hiện ở danh sách Sắp tới / Lịch</span><div class="chip-toggles">${CARD_FIELDS.map(f=>`<button class="chip-toggle ${cardOn(f.k)?"on":""}" onclick="toggleCardField('${f.k}')">${cardOn(f.k)?"✓ ":""}${f.label}</button>`).join("")}</div></div></div>
  <div class="setting-card"><div class="setting-icon">${icon("check",18)}</div><div class="setting-main"><b>Sao lưu dữ liệu</b><span>${state.jobs.length} jobs • ${state.bookers.length} bookers • ${state.notes.length} notes</span><span class="backup-when ${(daysSinceBackup()??999)>=BACKUP_REMIND_DAYS?"late":""}">${esc(backupStatusText())}</span></div><button class="small-black" onclick="exportData()">Sao lưu</button></div>
  <div class="setting-card"><div class="setting-icon">${icon("note",18)}</div><div class="setting-main"><b>Kịch bản</b><span>Viết, gắn với job và đọc toàn màn hình</span></div><button class="small-black" onclick="navigate('notes')">Mở</button></div>
  <div class="setting-card"><div class="setting-icon">${icon("morecircle",18)}</div><div class="setting-main"><b>Khôi phục từ file sao lưu</b><span>Chọn file .json đã lưu (iCloud Drive, Google Drive…)</span>${localStorage.getItem("mcta_before_import")?`<button class="link-btn undo-link" onclick="undoImport()">Hoàn tác lần khôi phục gần nhất</button>`:""}</div><button class="small-black" onclick="document.getElementById('importFile').click()">Khôi phục</button><input id="importFile" type="file" accept=".json,application/json" hidden onchange="importData(event)"></div>
  <div class="setting-card"><div class="setting-icon">${icon("pin",18)}</div><div class="setting-main"><b>Địa điểm</b><span>Miễn phí, không cần API key: gợi ý địa chỉ từ OpenStreetMap, bản đồ xem trước, nút Chỉ đường mở Google Maps / Apple Maps. Chính xác nhất: dán nội dung Chia sẻ từ app Google Maps.</span></div></div>${browserTestMode?`<div class="setting-card browser-test-card"><div class="setting-icon">${icon("pin",18)}</div><div class="setting-main"><b>Browser Test · Google Maps</b><span>Dùng riêng trên trình duyệt này để test Places Autocomplete + bản đồ. Key được lưu trong localStorage của trình duyệt.</span><input id="browserMapsKeyInput" class="setting-input" type="password" placeholder="AIza..." value="${esc(state.settings.browserMapsKey||"")}"></div><button class="small-black" onclick="saveBrowserMapsKey()">Lưu</button></div>`:""}
  <div class="setting-card"><div class="setting-icon">${icon("finance",18)}</div><div class="setting-main"><b>Hiển thị tài chính</b><span>${state.settings.financeVisible?"Số tiền đang hiển thị":"Số tiền đang ẩn mặc định"}</span></div><button class="small-black" onclick="toggleFinanceSetting()">${state.settings.financeVisible?"Ẩn":"Hiện"}</button></div>
  <div class="setting-card"><div class="setting-icon">${icon("calendar",18)}</div><div class="setting-main"><b>Số show tháng này</b><span>${state.settings.showCountVisible?"Đang hiển thị":"Đang ẩn mặc định"}</span></div><button class="small-black" onclick="toggleShowCountSetting()">${state.settings.showCountVisible?"Ẩn":"Hiện"}</button></div>
 </div>
 <section class="section"><div class="section-head"><h2>Loại show</h2><button class="black-btn" onclick="addJobType()">${icon("plus",14)} Thêm loại</button></div><div class="type-settings-list">${state.settings.jobTypes.map((t,i)=>{const c=typeMeta(t.name);return `<div class="type-setting-row"><span class="tag type-tag" style="--type-bg:${c.bg};--type-color:${c.color};--type-border:${c.border}">${esc(t.name)}</span><div class="type-setting-actions"><button class="mini-btn" onclick="renameJobType('${t.id}')">Sửa</button><button class="mini-btn danger-mini" onclick="deleteJobType('${t.id}')">Xóa</button></div></div>`}).join("")}</div></section>
 <section class="section"><div class="section-head"><h2>Giao diện</h2><span class="small">6 phong cách</span></div><div class="theme-grid">${themeCard("pop","Super App ✦","Cam • nhiều màu • icon chi tiết","linear-gradient(135deg,#fff3ec,#f5f6fa)","linear-gradient(135deg,#ff8a3d,#ff4b2b)",state.settings.theme)}${themeCard("clean","Clean Neutral","Trắng • beige • đen","#f7f4ef","#171717",state.settings.theme)}${themeCard("fresh","Fresh Friendly","Pastel • trẻ • vui","#f5f6ff","#7667ee",state.settings.theme)}${themeCard("pink","Pink Cute","Hồng • dễ thương • mềm mại","#fff3f8","#ff5f9a",state.settings.theme)}${themeCard("tiki","Tiki-inspired","Xanh cyan • trắng • cam","#eef9ff","#00a6e9",state.settings.theme)}${themeCard("green","Green-inspired","Cyan • xanh lá • sạch","#effdf8","#00b894",state.settings.theme)}</div></section>
 <section class="section"><div class="card subtle-box"><div class="eyebrow">ĐỒNG BỘ</div><h3>${localMode?"LOCAL TEST MODE":backendReady?"Cloud sync đã sẵn sàng":"Chưa kết nối cloud"}</h3><p>${localMode?"Dữ liệu chỉ nằm trên MacBook này; không ghi lên cloud.":"Dữ liệu được lưu trên máy chủ Cloudflare riêng của bạn để mọi máy dùng chung một bộ dữ liệu."}</p></div></section>`;
}}
function setAppName(){
  const value=prompt("Tên hiển thị của ứng dụng:",state.settings.appName||"MC Thiên Ân");
  if(value===null)return;
  const clean=value.trim().slice(0,40);
  if(!clean){alert("Tên ứng dụng không được để trống.");return;}
  state.settings.appName=clean;
  save();
  document.title=clean;
  render();
}
function themeCard(id,title,desc,bg,accent,current){return `<button class="theme-card ${current===id?"active":""}" onclick="setTheme('${id}')"><div class="theme-preview" style="background:${bg}"><span style="background:${accent}"></span><i style="background:${accent}"></i><em style="background:${accent}"></em></div><div class="theme-copy"><b>${title}</b><span>${desc}</span></div>${current===id?'<div class="theme-check">✓</div>':''}</button>`;}
function setTheme(theme){try{localStorage.setItem("mcta_theme",arguments[0]);}catch(_){}
  state.settings.theme=theme;
  document.documentElement.dataset.theme=theme;
  const colors={clean:"#f7f4ef",fresh:"#f3f9fe",pink:"#fff3f8",tiki:"#eef9ff",green:"#effdf8",pop:"#f5f6fa"};
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",colors[theme]||colors.fresh);
  save();render();
}
function dateBlock(ds,extra=""){const d=new Date(ds+"T00:00:00");if(isNaN(d))return `<div class="tl-date ${extra}"><b>—</b></div>`;return `<div class="tl-date ${extra}"><span>${WEEKDAYS[d.getDay()]}</span><b>${d.getDate()}</b><small>Th${d.getMonth()+1}</small></div>`;}
function workNeedText(j){const need=[];if(scriptNeedsWork(j))need.push("kịch bản");if(isWedding(j)&&loveStoryNeedsWork(j))need.push("love story");return need.length?`Cần ${need.join(", ")}`:"";}
function tlMeta(x,where,grace){const live=isLive(x,grace);const parts=[`<span class="tl-rel ${live?"live":""}">${esc(relLabel(x,grace))}</span>`];if(hasTime(x))parts.push(`<b>${esc(x.time)}</b>`);if(where)parts.push(`<span class="tl-where">${esc(where)}</span>`);return `<div class="tl-meta">${parts.join('<i>·</i>')}</div>`;}
const CARD_FIELDS=[{k:"status",label:"Trạng thái"},{k:"booker",label:"Booker"},{k:"type",label:"Loại show"},{k:"work",label:"Cần kịch bản"},{k:"meeting",label:"Lịch họp"}];
const CARD_DEFAULT={status:true,booker:true,type:false,work:true,meeting:true};
function cardOn(k){const c=state.settings.cardFields||{};return k in c?c[k]!==false:CARD_DEFAULT[k];}
function toggleCardField(k){state.settings.cardFields={...CARD_DEFAULT,...(state.settings.cardFields||{})};state.settings.cardFields[k]=!cardOn(k);save(true);render();}
function timelineItem(j){const where=j.locationName||j.location||"";const need=cardOn("work")?workNeedText(j):"";const m=cardOn("meeting")?nextMeetingOf(j):null;const bk=cardOn("booker")?getBooker(j)?.name:"";const parts=[];if(cardOn("status"))parts.push(`<span class="tl-status s-${statusClass(j.status)}">${esc(j.status)}</span>`);if(bk)parts.push(`<span class="tl-booker">${icon("booker",11)}${esc(bk)}</span>`);if(cardOn("type")&&j.type)parts.push(`<span class="tl-type">${esc(j.type)}</span>`);const flags=`${m?`<span class="tl-flag meet">Họp ${esc(shortDate(m.date).split(", ")[1]||"")}</span>`:""}${need?`<span class="tl-flag warn">${esc(need)}</span>`:""}`;return `<button class="timeline-item tl2 ${isLive(j)?"live":""}" onclick="openJob('${j.id}')">${dateBlock(j.date)}<div class="tl-body"><div class="tl-title">${esc(j.title)}</div>${tlMeta(j,where)}${parts.length||flags?`<div class="tl-foot">${parts.join('<i class="tl-sep">·</i>')}${flags}</div>`:""}</div>${icon("chevron",16)}</button>`;}
function jobRow(j){const b=getBooker(j);return `<button class="job-row" onclick="openJob('${j.id}')"><div class="date-block"><b>${new Date(j.date+"T00:00:00").getDate()}</b><span>${new Date(j.date+"T00:00:00").toLocaleDateString("vi-VN",{month:"short"}).replace(".","")}</span></div><div class="job-main"><b>${esc(j.title)}</b><span>${esc(b?.name||j.client||"Chưa có booker")}${j.time?` • ${esc(j.time)}`:""}</span><span class="job-location">${esc(j.locationName||j.location||"Chưa có địa điểm")}${j.locationAddress?` • ${esc(j.locationAddress)}`:""}</span><div class="tags row-tags">${typeChip(j.type)}${statusChip(j.status)}</div><div class="work-chips">${meetingChip(j)}${workChips(j)}</div></div>${icon("chevron",15)}</button>`;}
function bookerRow(b){const jobs=state.jobs.filter(j=>j.bookerId===b.id);return `<button class="booker-row" onclick="openBooker('${b.id}')"><div class="avatar">${esc(avatarText(b.name))}</div><div class="booker-main"><b>${esc(b.name||"Chưa đặt tên")}</b><span class="booker-meta">${jobs.length} show${b.phone?" • "+esc(b.phone):""}${b.company?" • "+esc(b.company):""}</span></div>${icon("chevron",16)}</button>`;}

function fmtMoneyInput(v){const digits=String(v??"").replace(/\D/g,"").replace(/^0+(?=\d)/,"");return digits?digits.replace(/\B(?=(\d{3})+(?!\d))/g,"."):"";}
function parseMoneyInput(v){return Number(String(v??"").replace(/\D/g,""))||0;}
function onMoneyInput(el){
  const pos=el.selectionStart??el.value.length;
  const digitsBefore=el.value.slice(0,pos).replace(/\D/g,"").length;
  const formatted=fmtMoneyInput(el.value);
  el.value=formatted;
  let caret=0,seen=0;
  while(caret<formatted.length&&seen<digitsBefore){if(/\d/.test(formatted[caret]))seen++;caret++;}
  try{el.setSelectionRange(caret,caret);}catch(_){}
}
function field(label,name,value,required=false,type="text"){if(type==="money")return `<label class="field"><span>${label}</span><div class="money-input-wrap"><input name="${name}" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${esc(Number(value)?fmtMoneyInput(value):"")}" oninput="onMoneyInput(this)"><em>đ</em></div></label>`;if(type==="textarea")return `<label class="field"><span>${label}</span><textarea name="${name}">${esc(value||"")}</textarea></label>`;return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value||"")}" ${required?"required":""}></label>`;}
function selectField(label,name,opts,value){return `<label class="field"><span>${label}</span><select name="${name}">${opts.map(x=>`<option value="${esc(x.id||x)}" ${String(x.id||x)===String(value||"")?"selected":""}>${esc(x.name||x)}</option>`).join("")}</select></label>`;}

function openJobForm(existing=null,opts={}){
 draftDirty=false;clearTimeout(draftTimer);
 const j=existing||{id:"",title:"",type:"Wedding",date:todayStr(),time:"",location:"",bookerId:"",status:"Đã chốt",total:"",deposit:"",balancePaid:0,commission:"",paidFull:false,cost:"",notes:"",scriptSource:"Chưa xác định",scriptStatus:"Chưa có",loveStoryStatus:"Chưa có",notificationEnabled:true,reminders:[{minutes:10080,enabled:false},{minutes:1440,enabled:true},{minutes:120,enabled:true},{minutes:30,enabled:false}]};
 const selected=getBooker(j);
 openModal(`<div class="sheet-head"><div><div class="eyebrow">${j.id?"CHỈNH SỬA":"TẠO MỚI"}</div><h2>${j.id?"CẬP NHẬT JOB":"THÊM JOB"}</h2></div><button class="close" type="button" onclick="closeJobForm()">×</button></div>
 ${(()=>{const dk=j.id||"new",dr=opts.fromDraft?null:getDraft(dk);return dr?`<div id="draftBanner" class="draft-banner"><div><b>Có bản nháp chưa lưu</b><span>${esc(dr.job?.title||"(chưa đặt tên)")} · lưu lúc ${esc(draftTimeText(dr))}</span></div><div class="draft-actions"><button type="button" class="black-btn" onclick="restoreDraft('${dk}')">Khôi phục</button><button type="button" class="outline-btn" onclick="discardDraft('${dk}')">Bỏ</button></div></div>`:(opts.fromDraft?`<div class="draft-banner ok"><b>Đã khôi phục bản nháp</b><span>Nhớ bấm “Lưu job” khi xong.</span></div>`:"");})()}
 <form class="form job-form" data-draft-key="${j.id||"new"}" oninput="onJobFormEdit()" onchange="onJobFormEdit()" onsubmit="saveJob(event,'${j.id}')">
 ${field("Tên show","title",j.title,true)}
 <div class="two">${selectField("Loại","type",getJobTypeNames(),j.type)}</div>
 <div class="two">${field("Ngày","date",j.date,false,"date")}${field("Giờ","time",j.time,false,"time")}</div>
 <div id="conflictWarn" class="conflict-warn" hidden></div>
 <div class="place-field">
   <label class="field"><span>Địa điểm</span><div id="placePicker"></div></label>
   <input type="hidden" name="locationName" id="locationNameInput" value="${esc(j.locationName||j.location||"")}"><input type="hidden" name="placeId" id="placeIdInput" value="${esc(j.placeId||"")}"><input type="hidden" name="locationLat" id="locationLatInput" value="${esc(j.locationLat??"")}"><input type="hidden" name="locationLng" id="locationLngInput" value="${esc(j.locationLng??"")}">
   <div id="placesHint" class="small form-hint">Đang kiểm tra Google Places…</div>
   <div id="placeSuggest" class="place-suggest" hidden></div>
   <label class="field"><span>Địa chỉ đầy đủ</span><input id="locationAddressInput" name="locationAddress" value="${esc(j.locationAddress||"")}" placeholder="Số nhà, đường, phường, quận, TP..."></label>
   <label class="field"><span>Link Google Maps (không bắt buộc)</span><input id="googleMapsURIInput" name="googleMapsURI" value="${esc(j.googleMapsURI||"")}" placeholder="Dán link / nội dung Chia sẻ từ app Google Maps" onpaste="onMapsLinkPaste(event)" autocomplete="off"></label>
   <div class="small form-hint">Mẹo chính xác nhất: mở app Google Maps → tìm địa điểm → <b>Chia sẻ</b> → <b>Sao chép</b>, rồi dán vào ô trên.</div>
   <div id="addressBreakdown" class="address-breakdown hidden">
     <span id="addressStreetNumber"></span><span id="addressWard"></span><span id="addressDistrict"></span><span id="addressCity"></span>
   </div>
   <input id="locationFallback" class="field-control" value="${esc(j.locationName||j.location||"")}" placeholder="Nhập tên địa điểm" style="display:none">
 </div>
 <div class="field"><span>Booker</span><div class="two"><select name="bookerId"><option value="">Chưa chọn</option>${state.bookers.slice().sort((a,b)=>a.name.localeCompare(b.name,"vi")).map(b=>`<option value="${b.id}" ${b.id===j.bookerId?"selected":""}>${esc(b.name)}</option>`).join("")}</select><button type="button" class="outline-btn" onclick="closeModal();openBookerForm()">＋ Booker</button></div></div>
 <div class="subtle-box"><div class="small">Booker hiện tại</div><b>${esc(selected?.name||"Chưa chọn")}</b>${selected?.phone?`<div class="small">${esc(selected.phone)}</div>`:""}</div>
 <section class="meeting-box"><div class="section-head"><div><div class="eyebrow">TRƯỚC NGÀY DIỄN RA</div><h3>Lịch họp với khách</h3></div><button type="button" class="outline-btn" onclick="addMeetingBlock()">＋ Thêm buổi họp</button></div>
 <div id="meetingList">${jobMeetings(j).map(meetingFormBlock).join("")}</div>
 <div id="meetingEmpty" class="small" ${jobMeetings(j).length?'style="display:none"':""}>Chưa có lịch họp. Bấm “Thêm buổi họp” nếu khách hẹn họp online hoặc gặp trực tiếp.</div></section>
 <div class="two">${field("Giá trị","total",j.total,false,"money")}${field("Đã cọc","deposit",j.deposit,false,"money")}</div>
 <div class="two">${field("Chiết khấu (back)","commission",j.commission,false,"money")}</div>
 <div class="small form-hint">Chiết khấu là tiền back cho người giới thiệu, không tính vào tiền đã nhận.</div>
 <label class="paid-toggle"><input type="checkbox" name="paidFull" ${j.paidFull?"checked":""}><span><b>Khách đã thanh toán đủ</b><small>Bật khi đã nhận hết tiền show. “Đã nhận” sẽ tính bằng Giá trị, “Còn phải thu” về 0.</small></span></label>
 <section class="script-mini-box"><div class="smb-head"><b>Kịch bản</b>${j.id?`<span class="smb-count">${linkedNotes(j,"script").length} kịch bản${isWedding(j)?` · ${linkedNotes(j,"lovestory").length} love story`:""} đã gắn</span>`:""}</div>
 <label class="smb-check"><input type="checkbox" name="noScript" ${j.noScript?"checked":""}> Show này không cần kịch bản</label>
 <label class="smb-check ls-only"><input type="checkbox" name="noLoveStory" ${j.noLoveStory?"checked":""}> Không cần Love Story</label>
 <div class="small">Viết và gắn kịch bản ở tab <b>Kịch bản</b> hoặc trong chi tiết job — app tự biết job nào còn thiếu.</div></section>
 ${field("Ghi chú","notes",j.notes,false,"textarea")}
 <div class="notify-box"><div class="row"><div><div class="eyebrow">PUSH NOTIFICATION</div><b>Nhắc riêng cho job này</b></div><label class="switch"><input type="checkbox" name="notificationEnabled" ${j.notificationEnabled!==false?"checked":""}><span></span></label></div>
 <div class="notify-grid">${REMINDER_PRESETS.map(r=>{const on=(j.reminders||[]).some(x=>x.minutes===r.minutes&&x.enabled!==false);return `<label class="notify-option"><input type="checkbox" name="rem_${r.minutes}" ${on?"checked":""}> Trước ${r.label}</label>`}).join("")}</div>
 <div class="notify-custom"><span class="small">Thêm:</span><input name="customMinutes" type="number" min="1" max="525600" placeholder="phút trước"><span class="small">phút</span></div>
 <div class="small" style="margin-top:7px">Thông báo được gửi trực tiếp tới iPhone sau khi bạn bật Push.</div></div>
 <div class="sticky-save-bar"><div id="draftStatus" class="draft-status">Nháp được tự lưu khi bạn nhập</div><div class="save-row"><button class="outline-btn" type="button" onclick="saveDraftNow(true)">Lưu nháp</button><button class="black-btn submit" type="submit">Lưu job</button></div></div></form>`);
 if(opts.fromDraft){draftDirty=true;}
 setTimeout(updateConflictWarn,0);
 attachPlaceAutocomplete(j);
}
function toggleShowCountSetting(){state.settings.showCountVisible=!state.settings.showCountVisible;save(true);render();}
function addJobType(){
  const value=prompt("Tên loại show mới:", "");
  if(value===null)return;
  const name=value.trim();
  if(!name){alert("Tên loại show không được để trống.");return;}
  if(state.settings.jobTypes.some(t=>t.name.toLowerCase()===name.toLowerCase())){alert("Loại show này đã tồn tại.");return;}
  state.settings.jobTypes.push({id:makeId(),name});
  save();render();
}
function renameJobType(id){
  const t=state.settings.jobTypes.find(x=>x.id===id); if(!t)return;
  const value=prompt("Đổi tên loại show:",t.name);
  if(value===null)return;
  const name=value.trim(); if(!name)return;
  if(state.settings.jobTypes.some(x=>x.id!==id&&x.name.toLowerCase()===name.toLowerCase())){alert("Tên loại show này đã tồn tại.");return;}
  const oldName=t.name; t.name=name;
  state.jobs.forEach(j=>{if(j.type===oldName)j.type=name;});
  save();render();
}
function deleteJobType(id){
  const t=state.settings.jobTypes.find(x=>x.id===id); if(!t)return;
  const used=state.jobs.some(j=>j.type===t.name);
  if(used){alert("Loại show này đang được dùng bởi một hoặc nhiều Job. Hãy đổi loại của các Job trước khi xóa.");return;}
  if(!confirm(`Xóa loại "${t.name}"?`))return;
  if(state.settings.jobTypes.length<=1){alert("Cần giữ ít nhất một loại show.");return;}
  state.settings.jobTypes=state.settings.jobTypes.filter(x=>x.id!==id);
  save();render();
}
function toggleSoundNotifications(){state.settings.soundNotifications=!state.settings.soundNotifications;save(true);if(state.settings.soundNotifications)playNotifySound("soft");render();}
function toggleFinanceSetting(){state.settings.financeVisible=!state.settings.financeVisible;save(true);render();}
// ---- V22.6: Lưu nháp form Job ----
const DRAFT_KEY="mcta_job_drafts_v1";
let draftTimer=null, draftDirty=false;
function readDrafts(){try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}")||{};}catch(_){return {};}}
function writeDrafts(x){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(x));}catch(_){}}
function getDraft(key){return readDrafts()[key||"new"]||null;}
function clearDraft(key){const x=readDrafts();delete x[key||"new"];writeDrafts(x);}
function formDraftData(form){
  const d=Object.fromEntries(new FormData(form).entries());
  const meetings=collectMeetings(d);
  const job={...d};
  ["total","deposit","commission"].forEach(k=>job[k]=parseMoneyInput(job[k]));job.paidFull=d.paidFull==="on";
  job.notificationEnabled=d.notificationEnabled==="on";
  job.reminders=REMINDER_PRESETS.map(r=>({minutes:r.minutes,enabled:d[`rem_${r.minutes}`]==="on"}));
  Object.keys(job).forEach(k=>{if(k.startsWith("rem_")||k==="customMinutes")delete job[k];});
  job.meetings=meetings;
  return job;
}
function saveDraftNow(showMsg){
  clearTimeout(draftTimer);
  const form=document.querySelector("#modalCard form.job-form");if(!form)return false;
  if(!draftDirty&&!showMsg)return false;
  const key=form.dataset.draftKey||"new";
  const all=readDrafts();all[key]={job:formDraftData(form),savedAt:new Date().toISOString()};writeDrafts(all);
  draftDirty=false;
  const st=document.getElementById("draftStatus");if(st)st.textContent=`Đã lưu nháp lúc ${new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}`;
  if(showMsg)showToast("Đã lưu nháp. Bấm lại để tiếp tục bất cứ lúc nào.");
  return true;
}
function onJobFormEdit(){setTimeout(updateConflictWarn,0);draftDirty=true;clearTimeout(draftTimer);draftTimer=setTimeout(()=>saveDraftNow(false),700);const st=document.getElementById("draftStatus");if(st)st.textContent="Đang lưu nháp…";}
function closeJobForm(){saveDraftNow(false)&&showToast("Đã tự lưu nháp — mở lại để nhập tiếp.");closeModal();render();}
function restoreDraft(key){
  const dr=getDraft(key);if(!dr)return;
  const base=key&&key!=="new"?state.jobs.find(j=>j.id===key):null;
  const job={...(base||{}),...dr.job,id:base?base.id:""};
  openJobForm(job,{fromDraft:true});
}
function discardDraft(key){if(!confirm("Bỏ bản nháp này?"))return;clearDraft(key);const bar=document.getElementById("draftBanner");if(bar)bar.remove();render();}
function draftTimeText(dr){const d=new Date(dr.savedAt);if(isNaN(d))return"";const p=n=>String(n).padStart(2,"0");return `${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth()+1)}`;}
function showToast(msg){let t=document.getElementById("toast");if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.appendChild(t);}t.textContent=msg;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),2600);}
window.addEventListener("pagehide",()=>saveDraftNow(false));
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")saveDraftNow(false);else if(page==="home"||page==="jobs"||page==="calendar"){if(document.getElementById("modal").classList.contains("hidden"))render();}});
setInterval(()=>{if(document.visibilityState==="visible"&&document.getElementById("modal").classList.contains("hidden")&&(page==="home"||page==="jobs"))render();},60000);

// ---- V24.0: cảnh báo trùng lịch ----

function minutesOf(t){return /^\d{2}:\d{2}$/.test(t||"")?Number(t.slice(0,2))*60+Number(t.slice(3)):null;}
function findConflicts(date,time,selfId){const mine=minutesOf(time);return state.jobs.filter(j=>j.id!==selfId&&j.date===date).map(j=>{const t=minutesOf(j.time);const gap=(mine!=null&&t!=null)?Math.abs(t-mine):null;return {j,gap,close:gap!=null&&gap<240};}).sort((a,b)=>(a.gap??999)-(b.gap??999));}
function conflictHtml(list){if(!list.length)return"";const close=list.filter(x=>x.close);const head=close.length?`⚠️ Sát giờ với ${close.length} show khác trong ngày`:`ℹ️ Ngày này đã có ${list.length} show`;return `<b>${head}</b>${list.map(x=>`<span>${esc(x.j.time||"chưa có giờ")} · ${esc(x.j.title)} <i>${esc(x.j.status)}</i>${x.gap!=null?` · cách ${x.gap>=60?Math.floor(x.gap/60)+"g"+(x.gap%60?String(x.gap%60).padStart(2,"0"):""):x.gap+" phút"}`:""}</span>`).join("")}`;}
function updateConflictWarn(){const f=document.querySelector("#modalCard form.job-form");const box=document.getElementById("conflictWarn");if(!f||!box)return;const id=f.getAttribute("onsubmit").match(/'([^']*)'/)?.[1]||"";const list=findConflicts(f.date.value,f.time.value,id);box.hidden=!list.length;box.className="conflict-warn"+(list.some(x=>x.close)?" strong":"");box.innerHTML=conflictHtml(list);}
function saveJob(e,id){
 e.preventDefault();
 {const f=e.target,close=findConflicts(f.date.value,f.time.value,id).filter(x=>x.close);if(close.length&&!e.target.dataset.conflictOk){if(!confirm(`Show này sát giờ với:\n${close.map(x=>`• ${x.j.time} — ${x.j.title} (${x.j.status})`).join("\n")}\n\nVẫn lưu?`))return;}}clearTimeout(draftTimer);const d=Object.fromEntries(new FormData(e.target).entries());
 const existing=state.jobs.find(j=>j.id===id);
 d.total=parseMoneyInput(d.total);d.deposit=parseMoneyInput(d.deposit);d.commission=parseMoneyInput(d.commission);d.paidFull=d.paidFull==="on";d.balancePaid=0;
 d.locationName=(d.locationName||"").trim();
 d.locationAddress=(d.locationAddress||"").trim();
 d.addressStreetNumber=(document.getElementById("addressStreetNumber")?.textContent||"").trim();
 d.addressWard=(document.getElementById("addressWard")?.textContent||"").trim();
 d.addressDistrict=(document.getElementById("addressDistrict")?.textContent||"").trim();
 d.addressCity=(document.getElementById("addressCity")?.textContent||"").trim();
 d.location=d.locationName; d.locationLat=d.locationLat!==""?Number(d.locationLat):""; d.locationLng=d.locationLng!==""?Number(d.locationLng):"";
 d.scriptSource=d.scriptSource||"Chưa xác định";d.scriptStatus=d.scriptStatus||"Chưa có";d.scriptLink=(d.scriptLink||"").trim();d.scriptNotes=(d.scriptNotes||"").trim();
 d.loveStoryStatus=(d.type==="Wedding"?(d.loveStoryStatus||"Chưa có"):"Không áp dụng");d.loveStoryLink=(d.loveStoryLink||"").trim();d.loveStoryNotes=(d.loveStoryNotes||"").trim();
 d.notificationEnabled=d.notificationEnabled==="on";d.noScript=d.noScript==="on";d.noLoveStory=d.noLoveStory==="on";
 d.meetings=collectMeetings(d);
 const rem=[];
 REMINDER_PRESETS.forEach(r=>rem.push({minutes:r.minutes,enabled:d[`rem_${r.minutes}`]==="on"}));
 if(d.customMinutes){const cm=Math.max(1,Math.min(525600,Number(d.customMinutes)));if(!rem.some(x=>x.minutes===cm))rem.push({minutes:cm,enabled:true});}
 d.reminders=rem;delete d.customMinutes;REMINDER_PRESETS.forEach(r=>delete d[`rem_${r.minutes}`]);
 const b=state.bookers.find(x=>x.id===d.bookerId);
 d.client=b?.name||existing?.client||"";d.phone=b?.phone||existing?.phone||"";d.startsAt=toIsoStart(d);
 if(id){d.updatedAt=new Date().toISOString();Object.assign(existing,d);}else{d.id=makeId();d.createdAt=new Date().toISOString();d.updatedAt=d.createdAt;d.checklist=[{id:makeId(),text:"Kiểm tra thông tin show",done:false},{id:makeId(),text:"Chốt timeline / nội dung",done:false},{id:makeId(),text:"Kiểm tra thanh toán",done:false}];state.jobs.push(d);}
 clearDraft(id||"new");draftDirty=false;
 save();playNotifySound("soft");closeModal();render();showToast(id?"Đã cập nhật job ✓":"Đã thêm job ✓");
}
function openJob(id){
 const j=state.jobs.find(x=>x.id===id);if(!j)return;const b=getBooker(j);
 const F=fin(j),paid=F.received,due=F.due;
 const checks=(j.checklist||[]).map(x=>`<label class="check"><input type="checkbox" ${x.done?"checked":""} onchange="toggleCheck('${j.id}','${x.id}',this.checked)"><span>${esc(x.text)}</span></label>`).join("");
 const rem=activeReminders(j);
 openModal(`<div class="sheet-head"><div><div class="tags header-tags">${typeChip(j.type)}${statusChip(j.status)}</div><h2>${esc(j.title)}</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="job-hero"><div class="job-hero-icon">${icon("calendar",22)}</div><div><b>${fmtLong(j.date)}${j.time?` • ${esc(j.time)}`:""}</b><span>${esc(j.locationName||j.location||"Chưa có địa điểm")}${j.locationAddress?`<br><small>${esc(j.locationAddress)}</small>`:""}</span>${(j.locationName||j.location||j.locationAddress)?`<a class="map-link" href="${esc(directionsUrl(placeQueryText(j.locationName||j.location,j.locationAddress),j.googleMapsURI))}" target="_blank" rel="noopener">${icon("pin",14)} Chỉ đường</a>`:""}</div></div>
 <section class="section compact location-section"><div class="section-head"><h3>Vị trí & di chuyển</h3><span class="small">Miễn phí</span></div><div id="jobMapWrap"></div></section>
 ${b?`<div class="booker-strip"><button class="booker-main booker-open" onclick="openBooker('${b.id}')"><div class="booker-avatar">${esc(avatarText(b.name))}</div><div><div class="booker-name">${esc(b.name)}</div><div class="small">${b.phone?esc(b.phone):"Chưa có số điện thoại"}</div></div></button><div class="contact-actions" onclick="event.stopPropagation()">${b.messengerLink?`<button class="contact-btn messenger-btn" onclick="openMessenger('${b.id}')">${icon("messenger",16)} Messenger</button>`:""}${b.phone?`<a class="contact-btn call-btn" href="tel:${esc(b.phone)}">${icon("phone",16)} Gọi</a>`:""}</div></div>`:""}
 ${(()=>{const ms=jobMeetings(j);const tNow=new Date();tNow.setHours(0,0,0,0);return `<section class="section compact meeting-detail"><div class="section-head"><h3>Lịch họp</h3><button class="text-btn" onclick="openJobForm(state.jobs.find(x=>x.id==='${j.id}'));setTimeout(()=>document.querySelector('.meeting-box')?.scrollIntoView({behavior:'smooth'}),150)">${ms.length?"Cập nhật":"＋ Thêm"}</button></div>${ms.length?ms.map(m=>{const past=new Date(m.date+"T00:00:00")<tNow;const rem=(m.reminders||[]).filter(r=>r.enabled!==false);const href=m.mode==="Online"?safeHref(m.link):"";return `<div class="meeting-card ${past?"past":""}"><div class="meeting-when"><b>${esc(fmtLong(m.date))}${m.time?` • ${esc(m.time)}`:""}</b><span class="meet-mode meet-${m.mode==="Online"?"on":"off"}">${esc(m.mode)}</span></div><div class="meeting-where">${icon(m.mode==="Online"?"link":"pin",13)} ${esc(meetingWhere(m))}</div>${m.note?`<div class="small">${esc(m.note)}</div>`:""}<div class="meeting-actions">${m.mode==="Online"&&href?`<a class="map-link" href="${esc(href)}" target="_blank" rel="noopener">${icon("link",14)} Mở link họp</a>`:""}${m.mode!=="Online"&&m.place?`<a class="map-link" href="${esc(directionsUrl(m.place))}" target="_blank" rel="noopener">${icon("pin",14)} Chỉ đường</a><button type="button" class="map-link link-btn" onclick="copyText(this.dataset.q,this)" data-q="${esc(m.place)}">Copy địa chỉ</button>`:""}</div><div class="push-status small"><span class="push-dot ${rem.length?"on":""}"></span>${past?"Đã qua":rem.length?"Nhắc "+rem.map(x=>`trước ${labelMinutes(x.minutes)}`).join(" • "):"Không nhắc"}</div></div>`}).join(""):'<div class="empty">Chưa có lịch họp.</div>'}</section>`})()}
 <section class="section compact script-detail-section"><div class="section-head"><h3>Kịch bản</h3>${workNeedsAttention(j)?`<span class="work-mini warn">${esc(workLabel(j))}</span>`:`<span class="work-mini ok">${j.noScript&&!linkedNotes(j).length?"Không cần kịch bản":"Đã đủ"}</span>`}</div>
 <div class="job-scripts">${linkedNotes(j).sort((a,b)=>noteTime(b)-noteTime(a)).map(n=>`<div class="job-script-row"><div><b>${noteKind(n)==="lovestory"?'<i class="ls-tag">Love Story</i> ':""}${esc(n.title||"(Không tiêu đề)")}</b><span>${noteTime(n)?`Sửa ${esc(relTime(noteTime(n)))}`:"&nbsp;"}</span></div><button class="rd-btn" onclick="closeModal();openReader('${n.id}')">Đọc</button><button class="rd-btn" onclick="openJobAfterNote=true;openNote(state.notes.find(x=>x.id==='${n.id}'))">Sửa</button></div>`).join("")}
 <div class="job-script-adds"><button class="outline-btn job-script-add" onclick="openJobAfterNote=true;openNote(null,{jobId:'${j.id}'})">＋ Viết kịch bản</button>${isWedding(j)?`<button class="outline-btn job-script-add" onclick="openJobAfterNote=true;openNote(null,{jobId:'${j.id}',kind:'lovestory'})">＋ Viết Love Story</button>`:""}</div>
 ${(j.scriptLink||j.scriptNotes||j.loveStoryLink||j.loveStoryNotes)?`<details class="legacy-script"><summary>Link / ghi chú nhập trước đây</summary>${j.scriptLink?`<a class="script-link" href="${esc(safeHref(j.scriptLink)||"#")}" target="_blank" rel="noopener">${icon("link",14)} File kịch bản</a>`:""}${j.scriptNotes?`<div class="note-body script-note">${esc(j.scriptNotes)}</div>`:""}${j.loveStoryLink?`<a class="script-link" href="${esc(safeHref(j.loveStoryLink)||"#")}" target="_blank" rel="noopener">${icon("link",14)} File Love Story</a>`:""}${j.loveStoryNotes?`<div class="note-body script-note"><b>Love Story:</b> ${esc(j.loveStoryNotes)}</div>`:""}</details>`:""}
 </div></section>
 <section class="section compact"><div class="section-head"><h3>Checklist</h3><button class="text-btn" onclick="addChecklist('${j.id}')">＋ Thêm việc</button></div>${checks||'<div class="empty">Chưa có checklist.</div>'}</section>
 <section class="section compact"><div class="section-head"><h3>Tài chính</h3><button class="finance-eye" onclick="toggleFinance();openJob('${j.id}')">${icon(state.settings.financeVisible?"eye":"morecircle",15)} ${state.settings.financeVisible?"Ẩn":"Hiện"}</button></div><div class="finance-grid"><div><span>Hợp đồng</span><b>${money(j.total)}</b></div><button class="finance-sensitive" onclick="toggleFinance();openJob('${j.id}')"><span>Đã nhận</span><b>${maskedMoney(paid)}</b></button><button class="finance-sensitive" onclick="toggleFinance();openJob('${j.id}')"><span>Còn phải thu</span><b>${maskedMoney(due)}</b></button><div><span>Chiết khấu (back)</span><b>${F.commission?maskedMoney(F.commission):"—"}</b></div>${F.commission?`<div class="fin-net"><span>Thực nhận (sau chiết khấu)</span><b>${maskedMoney(F.net)}</b></div>`:""}</div>
 ${F.total?(F.paidFull?`<div class="paid-state on">✓ Khách đã thanh toán đủ <button class="text-btn" onclick="markPaid('${j.id}',false)">Bỏ đánh dấu</button></div>`:`<button class="black-btn mark-paid" onclick="markPaid('${j.id}',true)">✓ Đánh dấu khách đã thanh toán đủ</button>${!isNotOver(j)?`<button class="outline-btn pay-remind-detail" onclick="openPayMessage('${j.id}')">✉︎ Soạn tin nhắc thanh toán</button>`:""}`):""}</section>
 <section class="section compact"><div class="section-head"><h3>Thông báo</h3><button class="text-btn" onclick="openJobForm(state.jobs.find(x=>x.id==='${j.id}'))">Chỉnh sửa</button></div><div class="push-status"><span class="push-dot ${j.notificationEnabled===false?"":"on"}"></span>${j.notificationEnabled===false?"Tắt":"Bật"} · ${rem.length?rem.map(x=>`Trước ${labelMinutes(x.minutes)}`).join(" • "):"Không có mốc nhắc"}</div></section>
 ${j.notes?`<section class="section compact"><h3>Ghi chú</h3><div class="note-body">${esc(j.notes)}</div></section>`:""}
 <div class="actions end-actions"><button class="outline-btn" onclick="openJobForm(state.jobs.find(x=>x.id==='${j.id}'))">Chỉnh sửa</button><button class="danger-btn" onclick="deleteJob('${j.id}')">Xóa</button></div>`);
 hydrateJobMap(j);
}
function openMessenger(bookerId){
 const b=state.bookers.find(x=>x.id===bookerId);const raw=(b?.messengerLink||"").trim();
 if(!raw){alert("Booker này chưa có link Messenger.");return}
 let url=raw;if(/^m\.me\//i.test(raw))url="https://"+raw;if(!/^https?:\/\//i.test(url))url="https://"+url.replace(/^\/+/,"");
 window.location.href=url;
}
function toggleCheck(jid,cid,done){const j=state.jobs.find(x=>x.id===jid);j.checklist.find(x=>x.id===cid).done=done;j.updatedAt=new Date().toISOString();save();render();openJob(jid)}
function addChecklist(jid){const t=prompt("Tên công việc:");if(!t)return;const j=state.jobs.find(x=>x.id===jid);j.checklist.push({id:makeId(),text:t,done:false});j.updatedAt=new Date().toISOString();save();openJob(jid)}
function deleteJob(id){if(confirm("Xóa job này?")){clearDraft(id);state.jobs=state.jobs.filter(j=>j.id!==id);save();closeModal();render()}}
function openBooker(id){const b=state.bookers.find(x=>x.id===id);if(!b)return;const jobs=state.jobs.filter(j=>j.bookerId===id).sort((a,c)=>(c.date+(c.time||"")).localeCompare(a.date+(a.time||"")));const revenue=jobs.reduce((s,j)=>s+Number(j.total||0),0);openModal(`<div class="sheet-head"><div><div class="eyebrow">BOOKER PROFILE</div><h2>Hồ sơ</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="booker-profile"><div class="profile-head"><div class="avatar">${esc(avatarText(b.name))}</div><div><div class="profile-name">${esc(b.name)}</div><div class="profile-sub">${esc(b.company||"Freelancer contact")}</div></div></div>
 <div class="contact-actions">${b.messengerLink?`<button class="contact-btn messenger-btn" onclick="openMessenger('${b.id}')">${icon("messenger",16)} Messenger</button>`:""}${b.phone?`<a class="contact-btn call-btn" href="tel:${esc(b.phone)}">${icon("phone",16)} ${esc(b.phone)}</a>`:""}</div>
 <div class="profile-stats"><div class="profile-stat"><span>Shows</span><b>${jobs.length}</b></div><div class="profile-stat"><span>Tổng booking</span><b>${money(revenue)}</b></div><div class="profile-stat"><span>Cuối cùng</span><b>${jobs[0]?fmtDate(jobs[0].date):"—"}</b></div></div>
 ${b.email||b.zalo||b.notes?`<div class="subtle-box" style="margin-top:12px">${b.email?`<div class="small">Email</div><div>${esc(b.email)}</div>`:""}${b.zalo?`<div class="small" style="margin-top:7px">Zalo / SĐT</div><div>${esc(b.zalo)}</div>`:""}${b.notes?`<div class="small" style="margin-top:7px">Ghi chú</div><div class="note-body">${esc(b.notes)}</div>`:""}</div>`:""}
 <div class="actions" style="margin-top:12px"><button class="black-btn" onclick="openBookerForm(state.bookers.find(x=>x.id==='${b.id}'))">Sửa profile</button></div>
 <div class="profile-jobs"><h3>Jobs của booker</h3>${jobs.map(j=>`<button class="profile-job" onclick="closeModal();setTimeout(()=>openJob('${j.id}'),80)"><span><b>${esc(j.title)}</b><small class="small">${fmtDate(j.date)} • ${esc(j.locationName||j.location||"")}</small></span>${icon("chevron",15)}</button>`).join("")||'<div class="empty">Chưa có job.</div>'}</div></div>`);
}
function openBookerForm(existing=null){
 const b=existing||{id:"",name:"",phone:"",zalo:"",email:"",company:"",messengerLink:"",notes:""};
 openModal(`<div class="sheet-head"><div><div class="eyebrow">${existing?"EDIT":"NEW"}</div><h2>${existing?"Sửa booker":"Thêm booker"}</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <form class="form" onsubmit="saveBooker(event,'${b.id}')">${field("Tên booker","name",b.name,true)}${field("SĐT / Zalo","phone",b.phone)}${field("Link Messenger","messengerLink",b.messengerLink)}${field("Email","email",b.email)}${field("Công ty / agency","company",b.company)}${field("Ghi chú","notes",b.notes,false,"textarea")}<div class="small">Zalo chỉ lưu số điện thoại. Messenger dùng link đã lưu để mở chat bằng một chạm.</div><button class="black-btn submit">Lưu profile</button></form>`);
}
function saveBooker(e,id){e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());if(id)Object.assign(state.bookers.find(b=>b.id===id),d);else state.bookers.push({...d,id:makeId(),createdAt:new Date().toISOString()});save();closeModal();render()}
var noteSearch="",noteFilter="all",noteSort="edited",noteRange="all",noteDirty=false;
function noteJob(n){return n&&n.jobId?state.jobs.find(j=>j.id===n.jobId):null;}
function noteTime(n){return Date.parse(n.updatedAt||"")||n._u||Date.parse(n.createdAt||"")||0;}
function relTime(t){if(!t)return"";const d=(Date.now()-t)/60000;if(d<1)return"vừa xong";if(d<60)return`${Math.floor(d)} phút trước`;if(d<1440)return`${Math.floor(d/60)} giờ trước`;if(d<43200)return`${Math.floor(d/1440)} ngày trước`;const x=new Date(t);return`${pad2(x.getDate())}/${pad2(x.getMonth()+1)}/${x.getFullYear()}`;}
function noteCard(n){const jj=noteJob(n);return `<article class="note-card"><button class="note-open" onclick="openReader('${n.id}')">${jj?`<span class="note-job">${icon("jobs",12)} ${esc(jj.title)} · ${esc(shortDate(jj.date))}</span>`:""}<h3>${noteKind(n)==="lovestory"?'<i class="ls-tag">Love Story</i> ':""}${esc(n.title||"(Không tiêu đề)")}</h3><div class="note-preview">${esc(n.body)}</div>${noteTime(n)?`<span class="note-time">Sửa ${esc(relTime(noteTime(n)))}</span>`:""}</button><div class="note-actions"><button class="note-act read" onclick="openReader('${n.id}')">Đọc</button><button class="note-act" onclick="openNote(state.notes.find(x=>x.id==='${n.id}'))">Sửa</button><button class="note-act" onclick="exportNoteDocx('${n.id}')">Word</button><button class="note-act del" onclick="deleteNote('${n.id}')">Xoá</button></div></article>`;}
function noteJobOptions(sel){const now=state.jobs.filter(isNotOver).sort(byStart),past=state.jobs.filter(j=>!isNotOver(j)).sort((a,b)=>byStart(b,a)).slice(0,60);const o=j=>`<option value="${j.id}" ${sel===j.id?"selected":""}>${esc(shortDate(j.date))} · ${esc(j.title)}</option>`;const cur=sel&&!now.concat(past).some(j=>j.id===sel)&&state.jobs.find(j=>j.id===sel);return `<option value="">— Không gắn job —</option>${cur?o(cur):""}${now.length?`<optgroup label="Sắp diễn ra">${now.map(o).join("")}</optgroup>`:""}${past.length?`<optgroup label="Đã qua">${past.map(o).join("")}</optgroup>`:""}`;}
function editorSize(d){const p=readerPrefs();p.edit=Math.max(14,Math.min(34,(p.edit||19)+d));saveReaderPrefs(p);const t=document.getElementById("noteBody");if(t)t.style.fontSize=p.edit+"px";}
// ---- V23.5: soạn thảo định dạng + hoàn tác (chạy hoàn toàn trên máy) ----
const RTE_TAGS=new Set(["B","STRONG","I","EM","U","MARK","BR","DIV","P","UL","OL","LI","H3","SPAN","FONT"]);
function sanitizeHtml(html){
  const doc=new DOMParser().parseFromString(`<div>${html||""}</div>`,"text/html");const root=doc.body.firstChild;
  (function walk(el){[...el.childNodes].forEach(n=>{
    if(n.nodeType===3)return;
    if(n.nodeType!==1||!RTE_TAGS.has(n.tagName)){if(n.nodeType===1&&!["SCRIPT","STYLE","IFRAME","OBJECT"].includes(n.tagName)){walk(n);n.replaceWith(...n.childNodes);}else n.remove();return;}
    const keep={};const st=n.getAttribute("style")||"";const col=st.match(/(?:^|;)\s*color:\s*([^;]+)/i),bg=st.match(/background(?:-color)?:\s*([^;]+)/i),fw=st.match(/font-weight:\s*(bold|[6-9]00)/i),fs=st.match(/font-style:\s*italic/i),td=st.match(/text-decoration[^:]*:\s*[^;]*underline/i);
    const color=(n.tagName==="FONT"&&n.getAttribute("color"))||(col&&col[1]);
    [...n.attributes].forEach(a=>n.removeAttribute(a.name));
    const css=[];const ok=v=>/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(String(v).trim());
    if(color&&ok(color))css.push(`color:${color.trim()}`);if(bg&&ok(bg[1]))css.push(`background-color:${bg[1].trim()}`);if(fw)css.push("font-weight:bold");if(fs)css.push("font-style:italic");if(td)css.push("text-decoration:underline");
    if(css.length&&["SPAN","FONT","MARK"].includes(n.tagName))n.setAttribute("style",css.join(";"));
    walk(n);
  });})(root);
  return root.innerHTML;
}
function htmlToText(html){const d=document.createElement("div");d.innerHTML=String(html||"").replace(/<br\s*\/?>/gi,"\n").replace(/<(div|p|h3|li)(\s[^>]*)?>/gi,"\n").replace(/<\/(div|p|h3|li)>/gi,"\n");return d.textContent.replace(/\n{3,}/g,"\n\n").trim();}
function noteHtml(n){return n.html?sanitizeHtml(n.html):esc(n.body||"").replace(/\n/g,"<br>");}
let rteHist=[],rteIdx=-1,rteTimer=null;
function rteEl(){return document.getElementById("noteBody");}
function rteInit(){try{document.execCommand("styleWithCSS",false,true);}catch(_){}rteHist=[rteEl().innerHTML];rteIdx=0;rteButtons();}
function rteSnap(){const h=rteEl()?.innerHTML;if(h==null)return;if(rteHist[rteIdx]===h)return;rteHist=rteHist.slice(0,rteIdx+1);rteHist.push(h);if(rteHist.length>200)rteHist.shift();rteIdx=rteHist.length-1;rteButtons();}
function rteRecord(){clearTimeout(rteTimer);rteTimer=setTimeout(rteSnap,450);rteButtons(true);}
function rteButtons(typing){const u=document.getElementById("tbUndo"),r=document.getElementById("tbRedo");if(u)u.disabled=!typing&&rteIdx<=0;if(r)r.disabled=rteIdx>=rteHist.length-1;}
function rteRestore(){const e=rteEl();e.innerHTML=rteHist[rteIdx];noteDirty=true;e.focus();const sel=getSelection(),rg=document.createRange();rg.selectNodeContents(e);rg.collapse(false);sel.removeAllRanges();sel.addRange(rg);rteButtons();}
function rteUndo(){clearTimeout(rteTimer);rteSnap();if(rteIdx>0){rteIdx--;rteRestore();}}
function rteRedo(){if(rteIdx<rteHist.length-1){rteIdx++;rteRestore();}}
function rteSelInside(){const sel=getSelection();return sel.rangeCount&&rteEl().contains(sel.getRangeAt(0).commonAncestorContainer);}
function rteCmd(cmd,val){clearTimeout(rteTimer);rteSnap();if(!rteSelInside())rteEl().focus();document.execCommand(cmd,false,val??null);noteDirty=true;rteSnap();}
function rteMark(color){rteCmd("hiliteColor",color);}
function rteColor(color){rteCmd("foreColor",color);}
function rteUpper(){const sel=getSelection();if(!rteSelInside()||sel.isCollapsed){showToast("Bôi đen chữ cần IN HOA trước");return;}const t=sel.toString();const up=t.toUpperCase();rteCmd("insertText",up===t?t.toLowerCase():up);}
function rteCue(){if(!rteSelInside())rteEl().focus();rteCmd("insertHTML",'<span style="color:#e5304f;font-weight:bold">[CUE: ]</span>&nbsp;');}
function rteClear(){rteCmd("removeFormat");rteCmd("formatBlock","DIV");}
function rtePaste(e){e.preventDefault();const t=(e.clipboardData||window.clipboardData).getData("text/plain");rteCmd("insertText",t);}
document.addEventListener("keydown",e=>{if(!rteEl()||!document.activeElement||document.activeElement!==rteEl())return;const k=e.key.toLowerCase();if((e.metaKey||e.ctrlKey)&&k==="z"){e.preventDefault();e.shiftKey?rteRedo():rteUndo();}else if((e.metaKey||e.ctrlKey)&&k==="y"){e.preventDefault();rteRedo();}});
function openNote(existing=null,opts={}){
  const n=existing||{id:"",title:"",body:"",jobId:opts.jobId||"",kind:opts.kind||"script"};const p=readerPrefs();noteDirty=false;
  openModal(`<form class="note-editor" onsubmit="saveNote(event,'${n.id}')" oninput="noteDirty=true" onchange="noteDirty=true">
   <div class="ne-head"><button type="button" class="close" onclick="closeNoteEditor()">×</button><div class="ne-title-wrap"><div class="eyebrow">${n.id?"SỬA KỊCH BẢN":"KỊCH BẢN MỚI"}</div></div><div class="ne-size" onpointerdown="if(event.target.closest('button'))event.preventDefault()"><button type="button" class="rd-btn ne-undo" id="tbUndo" onclick="rteUndo()" title="Hoàn tác">↶</button><button type="button" class="rd-btn ne-undo" id="tbRedo" onclick="rteRedo()" title="Làm lại">↷</button><i class="tb-sep"></i><button type="button" class="rd-btn" onclick="editorSize(-1)">A−</button><button type="button" class="rd-btn" onclick="editorSize(1)">A+</button></div></div>
   <input class="ne-title" name="title" value="${esc(n.title)}" placeholder="Tiêu đề (vd: Kịch bản lễ cưới Minh & Lan)" required>
   <div class="ne-meta"><label class="ne-job"><span>${icon("jobs",14)} Job</span><select name="jobId">${noteJobOptions(n.jobId)}</select></label><label class="ne-kind"><select name="kind"><option value="script" ${noteKind(n)==="script"?"selected":""}>Kịch bản</option><option value="lovestory" ${noteKind(n)==="lovestory"?"selected":""}>Love Story</option></select></label></div>
   <div class="ne-toolbar" onpointerdown="if(event.target.closest('button'))event.preventDefault()">
    <button type="button" class="tb" onclick="rteCmd('bold')" title="In đậm"><b>B</b></button><button type="button" class="tb" onclick="rteCmd('italic')" title="In nghiêng"><i>I</i></button><button type="button" class="tb" onclick="rteCmd('underline')" title="Gạch chân"><u>U</u></button><button type="button" class="tb" onclick="rteUpper()" title="IN HOA chữ đang chọn">AA</button><i class="tb-sep"></i>
    <button type="button" class="tb" onclick="rteCmd('formatBlock','H3')" title="Tiêu đề đoạn">H</button><button type="button" class="tb" onclick="rteMark('#fff3a3')" title="Tô vàng"><span class="tb-hl">A</span></button><button type="button" class="tb" onclick="rteColor('#e5304f')" title="Chữ đỏ (cue)"><span style="color:#e5304f;font-weight:900">A</span></button><button type="button" class="tb" onclick="rteCmd('insertUnorderedList')" title="Gạch đầu dòng">•≡</button><button type="button" class="tb" onclick="rteCue()" title="Chèn cue">[cue]</button><i class="tb-sep"></i>
    <button type="button" class="tb" onclick="rteClear()" title="Xoá định dạng">Tx</button>
   </div>
   <div id="noteBody" class="ne-body rte" contenteditable="true" data-ph="Nội dung kịch bản, câu dẫn, cue…" style="font-size:${p.edit||19}px" onpaste="rtePaste(event)" oninput="rteRecord()">${noteHtml(n)}</div>
   <div class="ne-actions">${n.id?`<button type="button" class="outline-btn danger-text" onclick="deleteNote('${n.id}',true)">Xoá</button><button type="button" class="outline-btn" onclick="saveNoteThenRead('${n.id}')">Đọc</button><button type="button" class="outline-btn" onclick="saveNoteThenExport('${n.id}')">Word</button>`:""}<button class="black-btn submit">Lưu kịch bản</button></div>
  </form>`);
  document.getElementById("modal").classList.add("editor-mode");
  rteInit();
}
function closeNoteEditor(){if(noteDirty&&!confirm("Đóng mà không lưu thay đổi?"))return;noteDirty=false;const jid=document.querySelector("#modalCard select[name=jobId]")?.value;closeModal();if(openJobAfterNote&&jid){openJobAfterNote=false;openJob(jid);}openJobAfterNote=false;}
function saveNoteThenRead(id){const f=document.querySelector("#modalCard form.note-editor");if(noteDirty){f.requestSubmit();setTimeout(()=>openReader(id),150);}else{closeModal();openReader(id);}}
function deleteNote(id,fromModal){const n=state.notes.find(x=>x.id===id);if(!n)return;if(!confirm(`Xoá note “${n.title||"(Không tiêu đề)"}”? Máy trợ lý cũng sẽ xoá theo.`))return;state.notes=state.notes.filter(x=>x.id!==id);save();if(fromModal)closeModal();render();showToast("Đã xoá note");}
// ---- V23.3: Chế độ đọc toàn màn hình (chạy hoàn toàn trên máy, không dùng mạng) ----
const READER_KEY="mcta_reader";
let readerWake=null,readerScrollTimer=null;
function readerPrefs(){try{return {size:30,dark:true,speed:0,...JSON.parse(localStorage.getItem(READER_KEY)||"{}")};}catch(_){return {size:30,dark:true,speed:0};}}
function saveReaderPrefs(p){try{localStorage.setItem(READER_KEY,JSON.stringify(p));}catch(_){}}
async function keepAwake(on){try{if(on&&"wakeLock" in navigator){readerWake=await navigator.wakeLock.request("screen");}else if(!on&&readerWake){await readerWake.release();readerWake=null;}}catch(_){}}
function openReader(id){
  const n=state.notes.find(x=>x.id===id);if(!n)return;const p=readerPrefs();
  let r=document.getElementById("reader");if(!r){r=document.createElement("div");r.id="reader";document.body.appendChild(r);}
  r.className=`reader ${p.dark?"dark":"light"}`;
  r.innerHTML=`<div class="reader-bar top"><button class="rd-btn" onclick="closeReader()" aria-label="Đóng">✕</button><div class="rd-title">${esc(n.title||"")}</div><button class="rd-btn" onclick="readerTheme()" aria-label="Đổi nền">${p.dark?"☀︎":"☾"}</button></div>
  <div class="reader-scroll" id="readerScroll" onclick="readerToggleUI(event)"><div class="reader-text rte-view" id="readerText" style="font-size:${p.size}px">${noteHtml(n)}</div><div class="reader-end">— Hết —</div></div>
  <div class="reader-bar bottom"><button class="rd-btn big" onclick="readerSize(-2)">A−</button><span class="rd-size" id="rdSize">${p.size}px</span><button class="rd-btn big" onclick="readerSize(2)">A+</button><button class="rd-btn" id="rdPlay" onclick="readerAuto()">${p.speed?"⏸":"▶︎"} Tự cuộn</button><button class="rd-btn" onclick="readerSpeed(-1)">−</button><span class="rd-size" id="rdSpeed">${readerSpeedLabel(p)}</span><button class="rd-btn" onclick="readerSpeed(1)">+</button></div>`;
  r.dataset.auto="0";r.hidden=false;document.documentElement.classList.add("reader-open");keepAwake(true);
}
function readerSpeedLabel(p){return `x${p.rate||2}`;}
function closeReader(){const r=document.getElementById("reader");if(!r)return;readerStop();r.hidden=true;r.innerHTML="";document.documentElement.classList.remove("reader-open");keepAwake(false);}
function readerSize(d){const p=readerPrefs();p.size=Math.max(16,Math.min(72,p.size+d));saveReaderPrefs(p);const t=document.getElementById("readerText");if(t)t.style.fontSize=p.size+"px";const l=document.getElementById("rdSize");if(l)l.textContent=p.size+"px";}
function readerTheme(){const p=readerPrefs();p.dark=!p.dark;saveReaderPrefs(p);const r=document.getElementById("reader");if(r){r.classList.toggle("dark",p.dark);r.classList.toggle("light",!p.dark);r.querySelector(".reader-bar.top .rd-btn:last-child").textContent=p.dark?"☀︎":"☾";}}
function readerToggleUI(e){const r=document.getElementById("reader");if(r)r.classList.toggle("focus");}
function readerStop(){clearInterval(readerScrollTimer);readerScrollTimer=null;const b=document.getElementById("rdPlay");if(b)b.textContent="▶︎ Cuộn";}
function readerAuto(){if(readerScrollTimer){readerStop();return;}const sc=document.getElementById("readerScroll");if(!sc)return;const b=document.getElementById("rdPlay");if(b)b.textContent="⏸ Dừng";let acc=0;readerScrollTimer=setInterval(()=>{const p=readerPrefs();acc+=(p.rate||2)*0.5;const px=Math.floor(acc);if(px>=1){sc.scrollTop+=px;acc-=px;}if(sc.scrollTop+sc.clientHeight>=sc.scrollHeight-2)readerStop();},30);}
function readerSpeed(d){const p=readerPrefs();p.rate=Math.max(1,Math.min(10,(p.rate||2)+d));saveReaderPrefs(p);const l=document.getElementById("rdSpeed");if(l)l.textContent=readerSpeedLabel(p);}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.documentElement.classList.contains("reader-open"))closeReader();});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&document.documentElement.classList.contains("reader-open"))keepAwake(true);});
// ---- V25.1: Xuất kịch bản ra file Word (.docx) — tạo ngay trên máy, không dùng mạng ----
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC_T[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zipStore(files){const enc=new TextEncoder(),parts=[],central=[];let off=0;
  const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  files.forEach(f=>{const name=enc.encode(f.name),data=enc.encode(f.data),crc=crc32(data);
    const head=[...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)];
    parts.push(new Uint8Array(head),name,data);
    central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),name);
    off+=head.length+name.length+data.length;});
  const cSize=central.reduce((a,x)=>a+x.length,0);
  return new Blob([...parts,...central,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cSize),...u32(off),...u16(0)])],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});}
function xmlEsc(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function cssHex(v){if(!v)return"";v=v.trim();let m=v.match(/^#([0-9a-f]{3})$/i);if(m)return m[1].split("").map(c=>c+c).join("").toUpperCase();m=v.match(/^#([0-9a-f]{6})/i);if(m)return m[1].toUpperCase();m=v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);if(m)return [m[1],m[2],m[3]].map(x=>Number(x).toString(16).padStart(2,"0")).join("").toUpperCase();return"";}
function htmlToParas(html){
  const root=new DOMParser().parseFromString(`<div>${html||""}</div>`,"text/html").body.firstChild;const paras=[];let cur=null;
  const open=st=>{if(!cur)cur={st:st||"p",runs:[]};return cur;},close=()=>{if(cur){paras.push(cur);cur=null;}};
  (function walk(node,f,st){node.childNodes.forEach(n=>{
    if(n.nodeType===3){if(n.nodeValue==="")return;const lines=n.nodeValue.split("\n");lines.forEach((ln,i)=>{if(i>0){open(st);close();}if(ln)open(st).runs.push({t:ln,...f});});return;}
    if(n.nodeType!==1)return;const tag=n.tagName;
    if(tag==="BR"){open(st);close();return;}
    const g={...f},css=n.getAttribute("style")||"";
    if(["B","STRONG"].includes(tag)||/font-weight:\s*(bold|[6-9]00)/i.test(css))g.b=1;
    if(["I","EM"].includes(tag)||/font-style:\s*italic/i.test(css))g.i=1;
    if(tag==="U"||/text-decoration[^;]*underline/i.test(css))g.u=1;
    const col=(tag==="FONT"&&n.getAttribute("color"))||(css.match(/(?:^|;)\s*color:\s*([^;]+)/i)||[])[1];if(cssHex(col))g.c=cssHex(col);
    const bg=(css.match(/background(?:-color)?:\s*([^;]+)/i)||[])[1];if(cssHex(bg))g.h=cssHex(bg);if(tag==="MARK"&&!g.h)g.h="FFF3A3";
    if(tag==="UL"||tag==="OL"){close();walk(n,g,"li");close();return;}
    if(["DIV","P","H3","LI"].includes(tag)){close();walk(n,g,tag==="H3"?"h":tag==="LI"?"li":st);close();return;}
    walk(n,g,st);
  });})(root,{},"p");close();
  while(paras.length&&!paras[paras.length-1].runs.length)paras.pop();
  return paras;
}
function runXml(r,extra=""){const p=[extra];if(r.b)p.push("<w:b/>");if(r.i)p.push("<w:i/>");if(r.u)p.push('<w:u w:val="single"/>');if(r.c)p.push(`<w:color w:val="${r.c}"/>`);if(r.h)p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${r.h}"/>`);return `<w:r><w:rPr>${p.join("")}</w:rPr><w:t xml:space="preserve">${xmlEsc(r.t)}</w:t></w:r>`;}
function paraXml(pa){if(pa.st==="h")return `<w:p><w:pPr><w:spacing w:before="240" w:after="80"/><w:keepNext/></w:pPr>${pa.runs.map(r=>runXml({...r,b:1},'<w:sz w:val="30"/>')).join("")}</w:p>`;
  if(pa.st==="li")return `<w:p><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr>${runXml({t:"•\t"})}${pa.runs.map(r=>runXml(r)).join("")}</w:p>`;
  return `<w:p>${pa.runs.map(r=>runXml(r)).join("")}</w:p>`;}
function buildDocx(n){
  const j=noteJob(n);const head=[`<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>${runXml({t:n.title||"Kịch bản",b:1},'<w:sz w:val="40"/>')}</w:p>`];
  if(j)head.push(`<w:p><w:pPr><w:spacing w:after="240"/></w:pPr>${runXml({t:[j.title,fmtLong(j.date)+(j.time?` • ${j.time}`:""),j.locationName||j.location].filter(Boolean).join("  ·  "),c:"6B7280"},'<w:sz w:val="22"/>')}</w:p>`);
  else head.push("<w:p/>");
  const body=htmlToParas(noteHtml(n)).map(paraXml).join("");
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${head.join("")}${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="312" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  return zipStore([
    {name:"[Content_Types].xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`},
    {name:"_rels/.rels",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`},
    {name:"word/_rels/document.xml.rels",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:"word/document.xml",data:doc},{name:"word/styles.xml",data:styles}]);
}
function docxName(n){const base=(n.title||"Kich-ban").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").replace(/[^\w\s-]/g,"").trim().replace(/\s+/g,"-").slice(0,60)||"Kich-ban";return `${base}.docx`;}
async function exportNoteDocx(id){
  const n=state.notes.find(x=>x.id===id);if(!n)return;
  let blob;try{blob=buildDocx(n);}catch(e){alert("Không tạo được file Word: "+e.message);return;}
  const file=new File([blob],docxName(n),{type:blob.type});
  try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:n.title||"Kịch bản"});return;}}catch(e){if(e&&e.name==="AbortError")return;}
  const a=document.createElement("a");a.href=URL.createObjectURL(file);a.download=file.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);showToast("Đã xuất file Word ✓");
}
function saveNoteThenExport(id){const f=document.querySelector("#modalCard form.note-editor");if(noteDirty&&f){f.requestSubmit();setTimeout(()=>exportNoteDocx(id),200);}else exportNoteDocx(id);}
function saveNote(e,id){e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());const ed=document.getElementById("noteBody");if(ed){d.html=sanitizeHtml(ed.innerHTML);d.body=htmlToText(d.html);}const now=new Date().toISOString();d.updatedAt=now;if(id)Object.assign(state.notes.find(n=>n.id===id),d);else state.notes.push({...d,id:makeId(),createdAt:now});noteDirty=false;save();closeModal();render();if(page==="notes"||!id)showToast("Đã lưu kịch bản ✓");const jid=d.jobId;const m=document.getElementById("modal");if(openJobAfterNote&&jid){openJobAfterNote=false;openJob(jid);}}
var openJobAfterNote=false;
function openModal(html){const c=document.getElementById("modalCard");c.innerHTML=html;c.scrollTop=0;c.scrollLeft=0;document.getElementById("modal").classList.remove("hidden");document.documentElement.classList.add("modal-open")}
function closeModal(){document.getElementById("modal").classList.add("hidden");document.getElementById("modal").classList.remove("editor-mode");document.documentElement.classList.remove("modal-open");if(pendingRender){pendingRender=false;setTimeout(render,0);}}
document.getElementById("modal").addEventListener("click",e=>{if(e.target.id!=="modal")return;if(document.querySelector("#modalCard form.note-editor")){closeNoteEditor();return;}if(document.querySelector("#modalCard form.job-form")){saveDraftNow(false);showToast("Bấm × hoặc Lưu job để đóng form — nháp đã được giữ.");return;}closeModal()});

function accessKey(){try{return localStorage.getItem("mcta_key")||"";}catch(_){return "";}}
function cloudUrl(){let u="";try{u=localStorage.getItem("mcta_cloud")||"";}catch(_){}return cleanServer(u||CLOUD_DEFAULT||state?.settings?.pushServer||pushMeta().server);}
async function api(path,options={}){
  const base=cloudUrl();if(!base){openSetup();const e=new Error("no server");e.noServer=true;throw e;}
  const url=base+path.replace(/^\/api\/state/,"/state");
  const r=await fetch(url,{cache:"no-store",...options,headers:{"Content-Type":"application/json","x-app-key":accessKey(),...(options.headers||{})}});
  if(r.status===401){const j=await r.json().catch(()=>({}));if(j.needSetup)openSetup();else askAccessKey();const err=new Error("unauthorized");err.status=401;throw err;}
  if(!r.ok)throw new Error(await r.text());return r.headers.get("content-type")?.includes("application/json")?r.json():r.text();}
let pendingRender=false,pullBusy=false,lastPull=0,pendingPush=false,lastRemoteAt="";
var calView="day",pastYear="all",pastMonth="all",pastOrder="desc";
function groupByMonth(list){const out=[];list.forEach(j=>{const y=j.date.slice(0,4),m=Number(j.date.slice(5,7));let g=out[out.length-1];if(!g||g.y!==y||g.m!==m){g={y,m,items:[]};out.push(g);}g.items.push(j);});return out;}
function syncView(st){const o={settings:sharedSettingsStr(st),deleted:st.deleted||{}};SYNC_COLLS.forEach(c=>o[c]=(st[c]||[]).map(it=>it.id+":"+(it._u||0)).sort());return JSON.stringify(o);}
function adoptState(next){
  const keep={};DEVICE_SETTINGS.forEach(k=>{if(k!=="_u"&&state?.settings&&k in state.settings)keep[k]=state.settings[k];});
  const before=state?syncView(state):"";
  initializeState(next);Object.assign(state.settings,keep);
  takeSnapshot();localStorage.setItem(KEY,JSON.stringify(state));
  if(syncView(state)!==before)softRender();
}
function softRender(){if(document.getElementById("modal")?.classList.contains("hidden"))render();else pendingRender=true;}
async function syncCloud(){
  if(localMode){backendReady=false;return;}
  try{
    const res=await api("/api/state",{method:"PUT",body:JSON.stringify(state)});backendReady=true;pendingPush=false;
    if(res&&res.state){adoptState(res.state);lastRemoteAt=res.state.updatedAt||"";}
    localStorage.setItem("mcta_sync_v2","1");schedulePlan();
  }catch(e){backendReady=false;}
}
async function loadCloud(backgroundOnly=false){
  if(localMode){backendReady=false;return false;}
  if(pullBusy)return true; pullBusy=true;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const remote=await api("/api/state"+(lastRemoteAt&&localStorage.getItem("mcta_sync_v2")?`?since=${encodeURIComponent(lastRemoteAt)}`:""),{signal:controller.signal});backendReady=true;lastPull=Date.now();
    if(remote&&remote.unchanged){if(pendingPush)await syncCloud();else schedulePlan();return true;}
    if(!remote||!remote.state)return false;
    lastRemoteAt=remote.state.updatedAt||"";
    if(!localStorage.getItem("mcta_sync_v2")){
      // Lần đầu chạy bản đồng bộ mới: lấy dữ liệu trên cloud làm chuẩn.
      adoptState(remote.state);localStorage.setItem("mcta_sync_v2","1");schedulePlan();return true;
    }
    const merged=mergeStates(state,remote.state);
    const needPush=syncView(merged)!==syncView(remote.state);
    adoptState(merged);
    if(needPush)await syncCloud();else schedulePlan();
    return true;
  }catch(e){backendReady=false;return false;} finally {clearTimeout(timer);pullBusy=false;}
}
// Form đang MỞ trên màn hình (form cũ còn nằm ẩn trong modal sau khi đóng thì không tính).
function formOpen(){return !!document.querySelector("#modalCard form")&&!document.getElementById("modal").classList.contains("hidden");}
function maybePull(minGap=5000){if(Date.now()-lastPull>minGap&&!formOpen())loadCloud(true);}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){maybePull(3000);autoHealPush().then(()=>{if(page==="notify")return checkNotify().then(()=>page==="notify"&&render());});try{navigator.serviceWorker?.getRegistration().then(r=>r&&r.update()).catch(()=>{});}catch(_){}}});
window.addEventListener("focus",()=>maybePull(3000));
window.addEventListener("pageshow",()=>maybePull(3000));
setInterval(()=>{if(document.visibilityState==="visible")maybePull(55000);},60000);
function urlBase64ToUint8Array(base64){const padding="=".repeat((4-base64.length%4)%4),base64url=(base64+padding).replace(/-/g,"+").replace(/_/g,"/"),raw=atob(base64url),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
// ---- V27.0: Thông báo PWA qua máy chủ Cloudflare riêng (giống app Giáo Án Địa Ngục) ----
// App tự lập lịch nhắc (show, lịch họp, thu tiền) và gửi lên máy chủ Cloudflare; máy chủ hẹn giờ và gửi Web Push
// tới mọi máy trong cùng nhóm. Từ V28 máy chủ này lo luôn việc đồng bộ dữ liệu.
// iOS/iPadOS 16.4+: chỉ hoạt động khi mở app từ biểu tượng trên Màn hình chính; xin quyền phải từ một lần chạm.
const PUSH_META="mcta_push";
function pushMeta(){try{return JSON.parse(localStorage.getItem(PUSH_META)||"{}")||{};}catch(_){return {};}}
function setPushMeta(m){try{localStorage.setItem(PUSH_META,JSON.stringify(m));}catch(_){}}
function isIOS(){const ua=navigator.userAgent||"";return /iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);}
function isStandalone(){try{return window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;}catch(_){return false;}}
function pushSupported(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;}
function defaultDeviceName(){const ua=navigator.userAgent||"";if(/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))return "iPad";if(/iPhone/.test(ua))return "iPhone";if(/Android/.test(ua))return "Android";return "Máy tính";}
function deviceName(){return pushMeta().device||defaultDeviceName();}
function cleanServer(u){u=String(u||"").trim().replace(/\/+$/,"");if(u&&!/^https?:\/\//i.test(u))u="https://"+u;return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(u)||(location.protocol==="http:"&&/^http:\/\/127\.[0-9.]+(:\d+)?$/.test(u))?u:"";}
function pushServer(){return cloudUrl();}
function pushGroup(){const g=state.settings.pushGroup||pushMeta().group||"";return /^[A-Za-z0-9_-]{16,64}$/.test(g)?g:"";}
function ensureGroup(){let g=pushGroup();if(!g){g="mc"+(makeId()+makeId()).replace(/[^A-Za-z0-9]/g,"").slice(0,30);}if(state.settings.pushGroup!==g){state.settings.pushGroup=g;save();}return g;}
// Giữ bản sao địa chỉ/nhóm trên từng máy, phòng khi phần cài đặt chung bị ghi đè lúc đồng bộ.
function rememberServer(){const s=cleanServer(state.settings.pushServer),g=pushGroup(),m=pushMeta();if(!state.settings.pushServer&&m.server&&!s){state.settings.pushServer=m.server;}if(!state.settings.pushGroup&&m.group){state.settings.pushGroup=m.group;}if((s&&m.server!==s)||(g&&m.group!==g))setPushMeta({...m,server:s||m.server,group:g||m.group});}
async function cf(path,body){
  const s=pushServer();if(!s){const e=new Error("Chưa nhập địa chỉ máy chủ thông báo.");e.noServer=true;throw e;}
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),9000);
  try{const r=await fetch(s+path,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:ctl.signal}:{signal:ctl.signal,cache:"no-store"});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.loi||("Máy chủ trả lỗi "+r.status));return j;}
  finally{clearTimeout(t);}
}
async function writeSwMeta(){try{const c=await caches.open("mcta-meta");await c.put("/__meta",new Response(JSON.stringify({server:pushServer(),group:pushGroup(),device:deviceName()}),{headers:{"content-type":"application/json"}}));}catch(_){}}
// ---- Lập lịch nhắc cho ~70 ngày tới (giờ Việt Nam) ----
const PLAN_DAYS=70;
function buildPlan(st,now){
  const out=[],s=st?.settings||{},hhmm=t=>/^\d{2}:\d{2}$/.test(t||"")?t:null,vnMs=(d,t)=>Date.parse(`${d}T${t}:00+07:00`);
  const end=now+PLAN_DAYS*86400000,ddmm=d=>{const p=(d||"").split("-");return p.length===3?`${p[2]}/${p[1]}`:d;};
  const when=m=>m>=1440?`còn ${Math.round(m/1440)} ngày`:m>=60?`còn ${Math.round(m/60)} giờ`:m>0?`còn ${m} phút`:"bắt đầu ngay";
  const icon=`icons/app-${["clean","fresh","pink","tiki","green","pop"].includes(s.theme)?s.theme:"fresh"}-192.png`;
  const add=(at,it)=>{if(Number.isFinite(at)&&at>now&&at<end)out.push({at,icon,...it});};
  for(const job of st?.jobs||[]){
    if(!job?.id||!job.date)continue;const url=`./?job=${encodeURIComponent(job.id)}`,title=job.title||"Show";
    if(s.jobRemind!==false&&job.notificationEnabled!==false){const t=hhmm(job.time)||"09:00",start=vnMs(job.date,t);
      for(const r of (job.reminders||[]).filter(x=>x&&x.enabled!==false)){const m=Number(r.minutes)||0;add(start-m*60000,{tag:`job-${job.id}`,title:`⏰ ${title}`,body:`${when(m)} • ${t} ${ddmm(job.date)} • ${job.locationName||job.location||"Chưa có địa điểm"}`,url,kind:"job"});}}
    if(s.meetRemind!==false){for(const mt of job.meetings||[]){if(!mt?.date)continue;const t=hhmm(mt.time)||"09:00",start=vnMs(mt.date,t);
      for(const r of (mt.reminders||[]).filter(x=>x&&x.enabled!==false)){const m=Number(r.minutes)||0;add(start-m*60000,{tag:`meet-${job.id}-${mt.id}`,title:`👥 Họp: ${title}`,body:`${when(m)} • ${t} ${ddmm(mt.date)} • ${mt.mode==="Online"?"Online":(mt.place||"Offline")}`,url,kind:"meeting"});}}}
    if(s.payRemind!==false){const total=Number(job.total||0),deposit=Number(job.deposit||0),rest=(job.paidFull||legacySettled(job))?0:Math.max(0,total-deposit);
      if(total>0&&rest>0)for(const n of [1,3,7])add(vnMs(job.date,"10:00")+n*86400000,{tag:`pay-${job.id}`,title:"💰 Chưa thu đủ tiền show",body:`${title} (${ddmm(job.date)}) • còn ${new Intl.NumberFormat("vi-VN").format(Math.round(rest))} đ`,url,kind:"pay"});}
  }
  return out.sort((a,b)=>a.at-b.at).slice(0,500);
}
function strHash(s){let h=5381;for(let i=0;i<s.length;i++)h=(h*33+s.charCodeAt(i))|0;return (h>>>0).toString(36)+":"+s.length;}
let planTimer=null,planBusy=false;
// Gọi sau mỗi lần đồng bộ thành công (dữ liệu đã khớp cloud) để mọi máy cùng giữ lịch nhắc mới nhất.
function schedulePlan(delay=1200){if(localMode||!pushServer()||!pushGroup())return;clearTimeout(planTimer);planTimer=setTimeout(async()=>{await joinIfNeeded();uploadPlan(false);},delay);}
// Máy đã cho phép thông báo nhưng chưa đăng ký với máy chủ/nhóm hiện tại (vd. vừa nhận địa chỉ máy chủ qua đồng bộ) → tự đăng ký.
async function joinIfNeeded(){try{if(!pushSupported()||Notification.permission!=="granted"||pushMeta().enabled===false||(isIOS()&&!isStandalone()))return;if(pushMeta().postedTo===pushServer()+"|"+pushGroup())return;await ensureSubscribed(false);if(page==="notify"){await checkNotify();render();}}catch(_){}}
async function uploadPlan(force){
  if(planBusy||localMode||!pushServer()||!pushGroup())return null;planBusy=true;
  try{const items=buildPlan(state,Date.now()),sig=strHash(pushServer()+"|"+pushGroup()+"|"+JSON.stringify(items.map(i=>[i.tag,i.at,i.title,i.body]))),m=pushMeta();
    if(!force&&m.planSig===sig&&Date.now()-(m.planAt||0)<6*3600000)return null;
    const r=await cf("/plan",{group:pushGroup(),items});setPushMeta({...pushMeta(),planSig:sig,planAt:Date.now(),planN:r.n,planNext:r.next});return r;}
  catch(_){return null;}finally{planBusy=false;}
}
var notifyStatus=null,notifyChecking=false;
async function checkNotify(){
  notifyChecking=true;
  const st={supported:pushSupported(),standalone:isStandalone(),ios:isIOS(),permission:("Notification" in window)?Notification.permission:"unsupported",subscribed:false,endpoint:"",sub:null,server:null,registered:false,devices:[],pending:0,next:null};
  if(st.supported){try{const reg=await navigator.serviceWorker.getRegistration();const sub=reg?await reg.pushManager.getSubscription():null;st.subscribed=!!sub;st.endpoint=sub?.endpoint||"";st.sub=sub?sub.toJSON():null;}catch(_){}}
  if(localMode)st.server="local";
  else if(!pushServer())st.server="none";
  else{try{const r=await cf("/devices",{group:ensureGroup(),sub:st.sub});st.server=true;st.devices=r.devices||[];st.registered=st.devices.some(d=>d.mine);st.pending=r.pending||0;st.next=r.next||null;}catch(e){st.server=false;st.error=e&&e.message;}}
  notifyStatus=st;notifyChecking=false;return st;
}
function notifyReady(st){return !!st&&st.permission==="granted"&&st.subscribed&&st.registered;}
function sameKey(sub,key){try{const k=sub.options&&sub.options.applicationServerKey;if(!k)return null;const a=new Uint8Array(k);return a.length===key.length&&a.every((x,i)=>x===key[i]);}catch(_){return null;}}
async function ensureSubscribed(force){
  const reg=await navigator.serviceWorker.ready,meta=pushMeta(),server=pushServer(),group=ensureGroup();
  if(!server){const e=new Error("Chưa nhập địa chỉ máy chủ thông báo.");e.noServer=true;throw e;}
  let vapid=meta.vapidFor===server&&meta.vapid;
  if(!vapid||force){const v=await cf("/vapid");if(!v||!v.publicKey)throw new Error("Máy chủ chưa trả về khoá thông báo (VAPID).");vapid=v.publicKey;}
  const key=urlBase64ToUint8Array(vapid);
  let sub=await reg.pushManager.getSubscription(),old="";
  // Đăng ký cũ (của server Netlify trước đây) dùng khoá khác → huỷ và đăng ký lại với khoá Cloudflare.
  if(sub){const same=sameKey(sub,key);if(same===false||(same===null&&meta.vapid!==vapid)){old=sub.endpoint;try{await sub.unsubscribe();}catch(_){}sub=null;}}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const changed=(meta.endpoint&&meta.endpoint!==sub.endpoint)||old;
  const stale=force||changed||meta.postedTo!==server+"|"+group||!meta.postedAt||Date.now()-Date.parse(meta.postedAt)>3*86400000;
  if(stale){await cf("/sub",{group,sub:sub.toJSON(),device:deviceName(),replaces:old||(changed?meta.endpoint:"")});setPushMeta({...pushMeta(),endpoint:sub.endpoint,postedAt:new Date().toISOString(),postedTo:server+"|"+group,vapid,vapidFor:server,enabled:true});}
  writeSwMeta();
  return sub;
}
// Mỗi lần mở app: giữ đăng ký còn hiệu lực (iOS đôi khi tự huỷ) và đẩy lịch nhắc mới nhất.
async function autoHealPush(){
  try{navigator.clearAppBadge&&navigator.clearAppBadge().catch(()=>{});}catch(_){}
  if(localMode)return;rememberServer();
  if(!pushServer())return;
  if(pushSupported()&&Notification.permission==="granted"&&pushMeta().enabled!==false&&!(isIOS()&&!isStandalone())){try{await ensureSubscribed(false);}catch(_){}}
  schedulePlan(2500);
}
function setPushServer(){openSetup(true);}
// ---- V28.0: kết nối máy chủ Cloudflare (lần đầu: đặt mã truy cập + chép dữ liệu từ Netlify) ----
let setupOpen=false;
function openSetup(manual){
  if(localMode||(setupOpen&&!manual))return;setupOpen=true;
  const cur=cloudUrl();
  openModal(`<div class="sheet-head"><div><div class="eyebrow">MÁY CHỦ CLOUDFLARE</div><h2>Kết nối dữ liệu</h2></div><button class="close" onclick="setupOpen=false;closeModal()">×</button></div>
  <form class="form setup-form" onsubmit="submitSetup(event)">
   <label class="field"><span>Địa chỉ máy chủ</span><input class="field-control" name="server" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://mcta-push.<tên>.workers.dev" value="${esc(cur)}" required></label>
   <label class="field"><span>Mã truy cập dữ liệu</span><input class="field-control" name="key" type="password" autocomplete="current-password" placeholder="ít nhất 4 ký tự" value="${esc(accessKey())}" required minlength="4"><small>Lần đầu: tự đặt một mã (nên dùng lại mã cũ của Netlify). Các máy sau: nhập đúng mã đó.</small></label>
   <label class="field"><span>Chép dữ liệu từ app Netlify cũ <em>(chỉ làm 1 lần, trên 1 máy)</em></span><input class="field-control" name="from" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="vd. ten-app.netlify.app (có thể để trống)"></label>
   <div class="small" id="setupMsg"></div>
   <button class="black-btn" type="submit">Kết nối</button>
  </form>`);
}
async function submitSetup(e){
  e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());const msg=document.getElementById("setupMsg");const btn=e.target.querySelector("button[type=submit]");
  const server=cleanServer(f.server),key=String(f.key||"").trim(),from=String(f.from||"").trim();
  if(!server){msg.textContent="Địa chỉ máy chủ chưa đúng — dạng https://mcta-push.<tên>.workers.dev";return;}
  btn.disabled=true;msg.textContent=from?"Đang chép dữ liệu từ Netlify…":"Đang kết nối…";
  try{
    const r=await fetch(server+"/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,from})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok){msg.textContent=j.loi||("Máy chủ trả lỗi "+r.status);btn.disabled=false;return;}
    try{localStorage.setItem("mcta_cloud",server);localStorage.setItem("mcta_key",key);}catch(_){}
    setPushMeta({...pushMeta(),server});
    if(j.migrated!=null)try{localStorage.removeItem("mcta_sync_v2");}catch(_){}  // lấy bản trên máy chủ làm chuẩn
    setupOpen=false;closeModal();
    await loadCloud(true);
    if(state.settings.pushServer!==server){state.settings.pushServer=server;save();}
    writeSwMeta();render();
    showToast(j.migrated!=null?`Đã chép ${j.migrated} show từ Netlify ✓`:j.created?"Đã tạo kho dữ liệu mới ✓":"Đã kết nối máy chủ ✓");
    autoHealPush();
  }catch(err){msg.textContent="Không kết nối được máy chủ. Kiểm tra lại địa chỉ và mạng.";btn.disabled=false;}
}
async function enablePush(){
  if(localMode){alert("Đang ở chế độ thử trên máy tính. Thông báo chỉ bật được trên app thật đã cài lên Màn hình chính.");return;}
  if(isIOS()&&!isStandalone()){showInstallHelp();return;}
  if(!pushSupported()){alert("Trình duyệt này chưa hỗ trợ thông báo đẩy. Trên iPhone/iPad cần iOS 16.4 trở lên và mở app từ Màn hình chính.");return;}
  // Phải gọi xin quyền ngay trong lần chạm, trước mọi thao tác chờ khác.
  let perm=Notification.permission;
  if(perm==="default"){try{perm=await Notification.requestPermission();}catch(_){perm=Notification.permission;}}
  if(perm!=="granted"){alert(perm==="denied"?`Thông báo đang bị chặn cho ${state.settings.appName}.\n\nCách mở lại: Cài đặt → Thông báo → ${state.settings.appName} → bật “Cho phép thông báo”, rồi mở lại app.`:"Bạn chưa cho phép thông báo.");await checkNotify();render();return;}
  setPushMeta({...pushMeta(),enabled:true});
  if(!pushServer()){openSetup(true);return;}
  showToast("Đang đăng ký máy này…");
  try{await ensureSubscribed(true);}
  catch(e){alert("Không đăng ký được thông báo: "+(e&&e.message||e)+"\n\nKiểm tra mạng và địa chỉ máy chủ rồi thử lại.");await checkNotify();render();return;}
  await uploadPlan(true);await checkNotify();render();await sendTestPush(true);
}
async function sendTestPush(silentOk){
  const st=notifyStatus&&notifyStatus.sub?notifyStatus:await checkNotify();
  if(!st.sub){alert("Máy này chưa bật thông báo.");return;}
  try{
    let r=await cf("/test",{sub:st.sub});
    if(!r.ok&&r.notRegistered){await ensureSubscribed(true);const st2=await checkNotify();r=await cf("/test",{sub:st2.sub});}
    if(r.ok)showToast(silentOk?"Đã bật ✓ — thông báo thử sẽ hiện sau vài giây":"Đã gửi — thông báo thử sẽ hiện sau vài giây");
    else alert("Máy chủ chưa gửi được tới máy này. Bấm “Bật thông báo” để đăng ký lại.");
  }catch(e){alert("Không gửi thử được: "+(e&&e.message||e));}
  await checkNotify();render();
}
async function disablePushHere(){
  if(!confirm("Tắt thông báo trên máy này? Các máy khác vẫn nhận bình thường."))return;
  try{const reg=await navigator.serviceWorker.getRegistration();const sub=reg&&await reg.pushManager.getSubscription();if(sub){if(pushServer())await cf("/unsub",{sub:sub.toJSON()}).catch(()=>{});await sub.unsubscribe();}}catch(_){}
  setPushMeta({...pushMeta(),enabled:false,endpoint:"",postedAt:""});await checkNotify();render();showToast("Đã tắt thông báo trên máy này");
}
async function renameDevice(){const n=prompt("Tên máy này (để phân biệt trong danh sách):",deviceName());if(n===null)return;const v=n.trim().slice(0,40)||defaultDeviceName();setPushMeta({...pushMeta(),device:v});writeSwMeta();if(notifyReady(notifyStatus)){try{await ensureSubscribed(true);}catch(_){}}await checkNotify();render();}
function toggleRemind(k){state.settings[k]=state.settings[k]===false;save();render();schedulePlan(600);}
function showInstallHelp(){openModal(`<div class="sheet-head"><div><div class="eyebrow">BƯỚC 1</div><h2>Cài app lên Màn hình chính</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="install-steps"><div><b>1</b><span>Mở link app bằng <b>Safari</b> (không dùng Chrome, Zalo hay Messenger).</span></div><div><b>2</b><span>Bấm nút <b>Chia sẻ</b> <i class="share-ic">⬆︎</i> ở thanh dưới (iPad: góc trên bên phải).</span></div><div><b>3</b><span>Chọn <b>Thêm vào MH chính</b> → <b>Thêm</b>.</span></div><div><b>4</b><span>Đóng Safari, mở app từ <b>biểu tượng mới</b> trên Màn hình chính → Khác → Thông báo → <b>Bật thông báo</b>.</span></div></div>
 <div class="small">Apple chỉ cho web app gửi thông báo khi được mở từ Màn hình chính (iOS / iPadOS 16.4 trở lên). Dữ liệu vẫn giữ nguyên vì nằm trên cloud.</div>`);}
if("serviceWorker" in navigator){navigator.serviceWorker.addEventListener("message",e=>{const d=e.data||{};
  if(d.type==="push"){showToast(`${d.title}: ${d.body}`.slice(0,120));if(soundSettingEnabled())playNotifySound(d.kind==="job"||d.kind==="meeting"?"urgent":"soft");maybePull(0);}
  if(d.type==="open")openFromUrl(d.url);});}
function openFromUrl(u){try{const id=new URL(u,location.href).searchParams.get("job");if(id&&state.jobs.some(j=>j.id===id)){closeModal();openJob(id);}}catch(_){}}
// ---- V23.0: Sao lưu / khôi phục an toàn ----
const BACKUP_REMIND_DAYS=14;
function pad2(n){return String(n).padStart(2,"0");}
function backupFileName(){const d=new Date();return `MC-Thien-An-backup-${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.json`;}
function backupPayload(){const x=JSON.parse(JSON.stringify(state));x.backupMeta={app:"MC Thiên Ân Planner",version:APP_VERSION,createdAt:new Date().toISOString(),jobs:x.jobs.length,bookers:x.bookers.length,notes:x.notes.length};return JSON.stringify(x,null,2);}
function daysSinceBackup(){const t=Date.parse(state.settings.lastBackupAt||"");return Number.isFinite(t)?Math.floor((Date.now()-t)/86400000):null;}
function backupStatusText(){const d=daysSinceBackup();if(d===null)return "Chưa sao lưu lần nào";const t=new Date(state.settings.lastBackupAt);const when=`${pad2(t.getDate())}/${pad2(t.getMonth()+1)}/${t.getFullYear()}`;return d===0?`Sao lưu gần nhất: hôm nay (${when})`:`Sao lưu gần nhất: ${when} · ${d} ngày trước`;}
function markBackedUp(){state.settings.lastBackupAt=new Date().toISOString();save();render();showToast("Đã sao lưu ✓ Nhớ lưu file vào iCloud Drive / Google Drive.");}
async function exportData(){
  const json=backupPayload(),name=backupFileName();
  const file=new File([json],name,{type:"application/json"});
  try{
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:"Sao lưu MC Thiên Ân",text:"File sao lưu dữ liệu MC Thiên Ân Planner"});
      markBackedUp();return;
    }
  }catch(e){if(e&&e.name==="AbortError")return;}
  const a=document.createElement("a");a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);
  markBackedUp();
}
function importData(e){
  const f=e.target.files[0];e.target.value="";if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    let x;try{x=JSON.parse(r.result);if(!Array.isArray(x.jobs))throw Error();}catch{alert("File không phải bản sao lưu hợp lệ của app.");return;}
    const meta=x.backupMeta||{};const when=meta.createdAt?new Date(meta.createdAt).toLocaleString("vi-VN"):(x.updatedAt?new Date(x.updatedAt).toLocaleString("vi-VN"):"không rõ ngày");
    const msg=`Khôi phục bản sao lưu (${when})?\n\n• ${x.jobs.length} jobs • ${(x.bookers||[]).length} bookers • ${(x.notes||[]).length} notes\n\nDữ liệu hiện tại (${state.jobs.length} jobs) sẽ được THAY THẾ bằng bản này và đồng bộ lên cloud cho cả máy trợ lý.\nApp sẽ giữ một bản dự phòng để bạn hoàn tác nếu chọn nhầm file.`;
    if(!confirm(msg))return;
    try{localStorage.setItem("mcta_before_import",JSON.stringify({savedAt:new Date().toISOString(),state}));}catch(_){}
    const keepFinance=state.settings?.financeVisible===true;
    delete x.backupMeta;state=x;initializeState(state);state.settings.financeVisible=keepFinance;
    save();showToast("Đã khôi phục dữ liệu ✓");setTimeout(()=>location.reload(),900);
  };
  r.readAsText(f);
}
function undoImport(){
  let b;try{b=JSON.parse(localStorage.getItem("mcta_before_import")||"null");}catch(_){}
  if(!b?.state){alert("Không có bản dự phòng để hoàn tác.");return;}
  if(!confirm(`Hoàn tác lần khôi phục gần nhất? App sẽ quay về dữ liệu trước lúc nhập (${(b.state.jobs||[]).length} jobs).`))return;
  state=b.state;initializeState(state);save();localStorage.removeItem("mcta_before_import");showToast("Đã hoàn tác ✓");setTimeout(()=>location.reload(),900);
}
function changeMonth(n){calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+n,1);render()}
function parseDeepLink(){const q=new URLSearchParams(location.search);const id=q.get("job");if(id&&state?.jobs?.some(j=>j.id===id))setTimeout(()=>openJob(id),350);}
document.addEventListener("dblclick",e=>e.preventDefault(),{passive:false});
async function startApp(){
  bootLocal();takeSnapshot();
  render();
  hideSplash();
  if("serviceWorker" in navigator && location.protocol!=="file:"){
    const hadController=!!navigator.serviceWorker.controller; let reloaded=false;
    const doReload=()=>{if(reloaded)return;if(formOpen()){setTimeout(doReload,4000);return;}reloaded=true;saveDraftNow&&saveDraftNow(false);location.reload();};
    navigator.serviceWorker.addEventListener("controllerchange",()=>{if(hadController)doReload();});
    window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js?v="+APP_VERSION,{updateViaCache:"none"}).then(r=>{r.update();autoHealPush();}).catch(()=>{}));
  }
  // First paint is immediate. Load only current/future jobs first.
  setTimeout(async()=>{
    const seeded=await ensureSeed();
    takeSnapshot();
    if(seeded) render();
    // Cloud sync is deliberately deferred so the first interaction never waits for the server.
    const defer=window.requestIdleCallback?(fn,ms)=>window.requestIdleCallback(fn,{timeout:ms}):setTimeout;
    defer(async()=>{
      const hadRemote=await loadCloud(true);
      if(!hadRemote) await syncCloud();
      render();
      parseDeepLink();
    },1500);
  },0);
}
startApp();
function soundSettingEnabled(){return state.settings.soundNotifications!==false;}
function playNotifySound(kind="soft"){
  if(!soundSettingEnabled()) return;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx) return;
    const ctx=new Ctx();
    const gain=ctx.createGain(); gain.gain.value=0.0001; gain.connect(ctx.destination);
    const now=ctx.currentTime;
    const osc=ctx.createOscillator(); osc.type="sine"; osc.connect(gain);
    const notes=kind==="urgent"?[784,988,1175]:[659,784,988];
    notes.forEach((freq,i)=>{osc.frequency.setValueAtTime(freq,now+i*0.12);});
    gain.gain.exponentialRampToValueAtTime(0.18,now+0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+0.46);
    osc.start(now); osc.stop(now+0.5);
    osc.onended=()=>ctx.close();
  }catch(_){}
}
function previewNotifySound(kind="soft"){ playNotifySound(kind); }

