// Gộp dữ liệu theo từng mục (job / booker / note): mục nào sửa sau thì thắng,
// mục đã xoá được ghi "bia mộ" (deleted) để máy khác cũng xoá theo.
const SYNC_COLLS=["jobs","bookers","notes","vendors"];
const TOMB_KEEP_MS=180*86400000;
function mergeStates(a,b){
  if(!a) return b; if(!b) return a;
  const out={...a,...b}; const now=Date.now(); const deleted={};
  for(const c of SYNC_COLLS){
    const del={};
    for(const src of [a.deleted?.[c]||{},b.deleted?.[c]||{}]) for(const [id,t] of Object.entries(src)){ if(now-t<TOMB_KEEP_MS) del[id]=Math.max(del[id]||0,t); }
    const map=new Map();
    for(const it of (a[c]||[])) if(it&&it.id) map.set(it.id,it);
    for(const it of (b[c]||[])){ if(!it||!it.id) continue; const old=map.get(it.id); if(!old||(it._u||0)>(old._u||0)) map.set(it.id,it); }
    out[c]=[...map.values()].filter(it=>!del[it.id]||(it._u||0)>del[it.id]);
    deleted[c]=del;
  }
  const sa=a.settings||{}, sb=b.settings||{};
  out.settings={...((sb._u||0)>(sa._u||0)?sb:sa)};
  out.deleted=deleted;
  out.updatedAt=[a.updatedAt,b.updatedAt].filter(Boolean).sort().pop()||new Date().toISOString();
  return out;
}
