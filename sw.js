// V26.0 — mở app tức thì từ bộ nhớ đệm; bản mới được tải ngầm và áp dụng ở lần mở sau.
const CACHE="freelance-planner-v28-6";
const ASSETS=["./","./index.html","./style.css","./app.js","./sync-merge.js","./manifest.json","./manifest-pop.json","./manifest-stage.json","./icons/app-pop-192.png","./icons/app-stage-192.png"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(async c=>{for(const a of ASSETS){try{await c.add(new Request(a,{cache:"reload"}))}catch(_){}}}));});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith("freelance-planner-")).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const req=e.request; if(req.method!=="GET")return;
  const url=new URL(req.url); if(url.origin!==location.origin||url.pathname.startsWith("/api/"))return;
  if(req.mode==="navigate"&&!/\/(index\.html)?$/.test(url.pathname))return; // chỉ trang chính dùng bộ nhớ đệm
  const key=req.mode==="navigate"?"./index.html":req;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(key,{ignoreSearch:true});
    if(hit)return hit;
    try{const res=await fetch(req);if(res&&res.ok)c.put(key,res.clone()).catch(()=>{});return res;}
    catch(_){return (await c.match("./index.html"))||Response.error();}
  }));
});
// ---- V26.0: Thông báo PWA (Push API + Notification API + Badging API) ----
async function appClients(){return clients.matchAll({type:"window",includeUncontrolled:true});}
async function readMeta(){try{const c=await caches.open("mcta-meta");const r=await c.match("/__meta");return r?await r.json():{};}catch(_){return {};}}
async function setBadgeFromTray(){
  try{if(!self.navigator||!self.navigator.setAppBadge)return;const list=await self.registration.getNotifications();if(list.length)await self.navigator.setAppBadge(list.length);else await self.navigator.clearAppBadge();}catch(_){}
}
self.addEventListener("push",e=>{
  let data={};try{data=e.data?e.data.json():{};}catch(_){data={body:e.data?e.data.text():""};}
  const title=data.title||"MC Thiên Ân";
  const opts={body:data.body||"Bạn có một việc cần xem.",icon:data.icon||"icons/app-pop-192.png",badge:data.icon||"icons/app-pop-192.png",tag:data.tag||"mcta",renotify:true,timestamp:Date.now(),data:{url:data.url||"./",kind:data.kind||""}};
  e.waitUntil((async()=>{
    // iOS bắt buộc: mỗi lần nhận push PHẢI hiện thông báo, nếu không iOS sẽ huỷ quyền nhận.
    await self.registration.showNotification(title,opts);
    await setBadgeFromTray();
    const list=await appClients();list.forEach(c=>c.postMessage({type:"push",title,body:opts.body,url:opts.data.url,kind:opts.data.kind}));
  })());
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const url=new URL(e.notification.data?.url||"./",self.registration.scope).href;
  e.waitUntil((async()=>{
    await setBadgeFromTray();
    const list=await appClients();
    for(const c of list){if("focus" in c){c.postMessage({type:"open",url});try{await c.focus();}catch(_){}return;}}
    try{if(clients.openWindow)await clients.openWindow(url);}catch(_){}
  })());
});
self.addEventListener("notificationclose",e=>e.waitUntil(setBadgeFromTray()));
// Trình duyệt tự đổi đăng ký (hết hạn / làm mới khoá) → đăng ký lại và báo server, không cần mở app.
self.addEventListener("pushsubscriptionchange",e=>{
  e.waitUntil((async()=>{
    try{
      const meta=await readMeta();
      const key=e.oldSubscription?.options?.applicationServerKey;
      const sub=e.newSubscription||(key?await self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}):null);
      if(!sub)return;
      if(!meta.server||!meta.group)return;
      await fetch(meta.server+"/sub",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({group:meta.group,sub:sub.toJSON(),device:meta.device||"Thiết bị",replaces:e.oldSubscription?.endpoint||""})});
    }catch(_){}
  })());
});
