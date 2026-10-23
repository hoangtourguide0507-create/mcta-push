/**
 * MC THIÊN ÂN · MÁY CHỦ THÔNG BÁO (Cloudflare Worker + Durable Object, gói miễn phí)
 * ----------------------------------------------------------------------------------
 * Cùng kiến trúc với máy chủ thông báo của app Giáo Án Địa Ngục:
 *  - App trên điện thoại tự lập lịch nhắc (show, lịch họp, thu tiền) rồi gửi lên đây.
 *  - Máy chủ hẹn giờ bằng Durable Object alarm và gửi Web Push đúng lúc, kể cả khi khoá màn hình.
 *  - Mọi máy trong cùng "nhóm" (iPhone MC, iPhone trợ lý, iPad) dùng chung một lịch nhắc:
 *    máy nào sửa job cũng cập nhật lịch cho cả nhóm.
 * Khoá VAPID tự tạo ở lần chạy đầu, không cần cấu hình gì thêm.
 * Từ V28: máy chủ này cũng lưu & đồng bộ dữ liệu app (thay Netlify), bảo vệ bằng mã truy cập.
 *
 * API (JSON):
 *   GET  /vapid                                   → { publicKey }
 *   POST /sub     { group, sub, device, replaces } đăng ký / cập nhật một máy
 *   POST /unsub   { sub }                           huỷ một máy
 *   POST /plan    { group, items:[{tag,at,title,body,url,kind}] }  thay toàn bộ lịch nhắc của nhóm
 *   POST /devices { group }                         danh sách máy của nhóm
 *   POST /test    { sub }                           gửi thử ngay tới đúng máy đó
 *   GET  /status                                  → { setup, hasState }
 *   POST /setup   { key, from }                     đặt mã truy cập lần đầu (hoặc kiểm tra mã);
 *                                                   from = địa chỉ app Netlify cũ để chép dữ liệu sang
 *   GET  /state?since=…   (header x-app-key)        lấy dữ liệu
 *   PUT  /state           (header x-app-key)        gộp & lưu dữ liệu, trả bản đã gộp
 */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-app-key', 'Access-Control-Max-Age': '86400' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });
const MAX_SUBS = 200, MAX_ITEMS = 500, AHEAD = 75 * 864e5, LATE = 30 * 60000;

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const u = new URL(req.url);
    if (u.pathname === '/' || u.pathname === '') return json({ ok: true, ten: 'MC Thiên Ân · máy chủ thông báo' });
    return env.HUB.get(env.HUB.idFromName('main')).fetch(req);
  }
};

/* ---------- tiện ích mã hoá ---------- */
const enc = new TextEncoder();
const b64u = buf => { const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
async function sha(s) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s))).slice(0, 32); }
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

/* Mã hoá nội dung theo RFC 8291 (aes128gcm) */
export async function encryptPayload(sub, payload) {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/* Chữ ký VAPID (JWT ES256) */
async function vapidAuth(endpoint, V) {
  const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
  const h = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), c = b64u(enc.encode(JSON.stringify({ aud, exp: now + 12 * 3600, sub: 'mailto:mcthienan@example.com' })));
  const key = await crypto.subtle.importKey('jwk', V.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(h + '.' + c)));
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${V.pub}`;
}

export async function makeVapid() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { pub: b64u(await crypto.subtle.exportKey('raw', k.publicKey)), jwk: await crypto.subtle.exportKey('jwk', k.privateKey) };
}


const okSub = s => s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
const okGroup = g => typeof g === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(g);
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const payloadOf = it => JSON.stringify({ title: clip(it.title || 'MC Thiên Ân', 80), body: clip(it.body, 240), tag: clip(it.tag || 'mcta', 100), url: clip(it.url || './', 200), kind: clip(it.kind, 16), icon: clip(it.icon, 80) || undefined });

/* ---------- đồng bộ dữ liệu (giống hàm _merge.mjs bên Netlify) ---------- */
// Gộp theo từng mục: mục nào sửa sau thì thắng; mục đã xoá ghi "bia mộ" để máy khác cũng xoá theo.
const COLLS = ['jobs', 'bookers', 'notes', 'vendors'], TOMB_KEEP_MS = 180 * 864e5, CHUNK = 100000;
export function mergeStates(a, b) {
  if (!a) return b; if (!b) return a;
  const out = { ...a, ...b }, now = Date.now(), deleted = {};
  for (const c of COLLS) {
    const del = {};
    for (const src of [a.deleted?.[c] || {}, b.deleted?.[c] || {}]) for (const [id, t] of Object.entries(src)) { if (now - t < TOMB_KEEP_MS) del[id] = Math.max(del[id] || 0, t); }
    const map = new Map();
    for (const it of (a[c] || [])) if (it && it.id) map.set(it.id, it);
    for (const it of (b[c] || [])) { if (!it || !it.id) continue; const old = map.get(it.id); if (!old || (it._u || 0) > (old._u || 0)) map.set(it.id, it); }
    out[c] = [...map.values()].filter(it => !del[it.id] || (it._u || 0) > del[it.id]);
    deleted[c] = del;
  }
  const sa = a.settings || {}, sb = b.settings || {};
  out.settings = { ...((sb._u || 0) > (sa._u || 0) ? sb : sa) };
  out.deleted = deleted;
  out.updatedAt = [a.updatedAt, b.updatedAt].filter(Boolean).sort().pop() || new Date().toISOString();
  return out;
}
const okState = o => o && typeof o === 'object' && Array.isArray(o.jobs) && Array.isArray(o.bookers);

export class Hub {
  constructor(state, env) { this.state = state; this.st = state.storage; this.env = env; }

  async vapid() { let V = await this.st.get('vapid'); if (!V) { V = await makeVapid(); await this.st.put('vapid', V); } return V; }

  async send(sub, payload, ttl = 1800) {
    const V = await this.vapid(), body = await encryptPayload(sub, payload);
    const r = await fetch(sub.endpoint, { method: 'POST', headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'high', Authorization: await vapidAuth(sub.endpoint, V) }, body });
    if (r.status === 404 || r.status === 410) { await this.st.delete('sub:' + await sha(sub.endpoint)); return 'gone'; }
    if (r.ok) { const k = 'sub:' + await sha(sub.endpoint), rec = await this.st.get(k); if (rec) await this.st.put(k, { ...rec, lastOkAt: Date.now() }); }
    return r.ok ? 'ok' : 'err' + r.status;
  }

  // Dữ liệu lưu thành nhiều mảnh ~100 KB để không chạm giới hạn kích thước một ô lưu trữ.
  async getState() {
    const m = await this.st.get('state:meta'); if (!m) return null;
    const keys = Array.from({ length: m.n }, (_, i) => 'state:' + i), got = await this.st.get(keys);
    return JSON.parse(keys.map(k => got.get(k) || '').join(''));
  }
  async putState(obj) {
    const str = JSON.stringify(obj), parts = [];
    for (let i = 0; i < str.length; i += CHUNK) parts.push(str.slice(i, i + CHUNK));
    const old = (await this.st.get('state:meta'))?.n || 0, rec = {};
    parts.forEach((x, i) => rec['state:' + i] = x);
    rec['state:meta'] = { n: parts.length, updatedAt: obj.updatedAt || null, size: str.length };
    await this.st.put(rec);
    for (let i = parts.length; i < old; i++) await this.st.delete('state:' + i);
  }
  async keyOk(k) { const h = await this.st.get('auth'); if (!h) return null; return (await sha('key:' + String(k || '').trim())) === h; }

  async data(req, p) {
    if (p === '/status') { const m = await this.st.get('state:meta'); return json({ ok: true, setup: !!(await this.st.get('auth')), hasState: !!m, updatedAt: m?.updatedAt || null }); }
    if (p === '/setup') {
      if (req.method !== 'POST') return json({ ok: false }, 405);
      const q = await req.json().catch(() => ({})), key = String(q.key || '').trim();
      if (key.length < 4) return json({ ok: false, loi: 'Mã truy cập cần ít nhất 4 ký tự' }, 400);
      const ok = await this.keyOk(key);
      if (ok === false) return json({ ok: false, loi: 'Sai mã truy cập' }, 401);
      let migrated = null;
      if (q.from) {
        let u = String(q.from).trim().replace(/\/+$/, ''); if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(u)) return json({ ok: false, loi: 'Địa chỉ Netlify chưa đúng' }, 400);
        let r; try { r = await fetch(u + '/api/state', { headers: { 'x-app-key': key, 'Cache-Control': 'no-store' } }); } catch (e) { return json({ ok: false, loi: 'Không mở được ' + u }, 502); }
        if (r.status === 401) return json({ ok: false, loi: 'Netlify báo sai mã truy cập — nhập đúng mã đang dùng trên app cũ' }, 400);
        const j = await r.json().catch(() => null);
        if (!r.ok || !j || !okState(j.state)) return json({ ok: false, loi: 'Không đọc được dữ liệu từ ' + u + ' (kiểm tra lại địa chỉ app Netlify)' }, 502);
        const cur = await this.getState();
        await this.putState(mergeStates(cur, j.state));
        migrated = j.state.jobs.length;
      }
      if (ok === null) await this.st.put('auth', await sha('key:' + key));
      return json({ ok: true, created: ok === null, migrated });
    }
    // /state
    const ok = await this.keyOk(req.headers.get('x-app-key'));
    if (ok === null) return json({ ok: false, error: 'setup', needSetup: true }, 401);
    if (!ok) return json({ ok: false, error: 'unauthorized' }, 401);
    if (req.method === 'GET') {
      const meta = await this.st.get('state:meta'); if (!meta) return json({ state: null, updatedAt: null });
      const since = new URL(req.url).searchParams.get('since');
      if (since && since === meta.updatedAt) return json({ unchanged: true, updatedAt: meta.updatedAt });
      const state = await this.getState(); return json({ state, updatedAt: state.updatedAt || null });
    }
    if (req.method === 'PUT') {
      const body = await req.json().catch(() => null);
      if (!okState(body)) return json({ error: 'Invalid state' }, 400);
      body.updatedAt = body.updatedAt || new Date().toISOString();
      const merged = mergeStates(await this.getState(), body);
      await this.putState(merged);
      return json({ ok: true, updatedAt: merged.updatedAt, state: merged });
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  async subsOf(group) { const S = await this.st.list({ prefix: 'sub:' }); return [...S.values()].filter(r => r.group === group); }

  async arm() {
    const P = await this.st.list({ prefix: 'plan:' }); let min = Infinity;
    for (const p of P.values()) for (const it of p.items || []) if (it.at < min) min = it.at;
    if (min === Infinity) await this.st.deleteAlarm(); else await this.st.setAlarm(Math.max(Date.now() + 50, min));
  }

  async alarm() {
    const now = Date.now(), P = await this.st.list({ prefix: 'plan:' });
    for (const [key, p] of P) {
      const group = key.slice(5), due = (p.items || []).filter(it => it.at <= now + 1000);
      if (!due.length) continue;
      const sentKey = 'sent:' + group, sent = (await this.st.get(sentKey)) || {};
      const subs = await this.subsOf(group);
      for (const it of due) {
        const id = it.tag + '@' + it.at;
        if (!sent[id] && now - it.at < LATE) { for (const rec of subs) { try { await this.send(rec.sub, payloadOf(it), it.kind === 'pay' ? 6 * 3600 : 1800); } catch (e) { /* bỏ qua lần lỗi */ } } }
        sent[id] = now;
      }
      for (const k of Object.keys(sent)) if (now - sent[k] > 3 * 864e5) delete sent[k];
      await this.st.put(sentKey, sent);
      await this.st.put(key, { ...p, items: p.items.filter(it => it.at > now + 1000) });
    }
    await this.arm();
  }

  async fetch(req) {
    const u = new URL(req.url), p = u.pathname;
    try {
      if (p === '/vapid') return json({ publicKey: (await this.vapid()).pub });
      if (p === '/state' || p === '/setup' || p === '/status') return await this.data(req, p);
      if (!['/plan', '/devices', '/sub', '/unsub', '/test'].includes(p)) return json({ ok: false, loi: 'Không có đường dẫn này' }, 404);
      if (req.method !== 'POST') return json({ ok: false, loi: 'Sai phương thức' }, 405);
      const q = await req.json().catch(() => ({}));
      if (p === '/plan') {
        if (!okGroup(q.group)) return json({ ok: false, loi: 'Nhóm không hợp lệ' }, 400);
        const now = Date.now(), sent = (await this.st.get('sent:' + q.group)) || {};
        const items = (Array.isArray(q.items) ? q.items : []).map(it => ({ tag: clip(it.tag, 100), at: Number(it.at) || 0, title: clip(it.title, 80), body: clip(it.body, 240), url: clip(it.url, 200), kind: clip(it.kind, 16), icon: clip(it.icon, 80) }))
          .filter(it => it.tag && it.at > now - 60000 && it.at < now + AHEAD && !sent[it.tag + '@' + it.at])
          .sort((a, b) => a.at - b.at).slice(0, MAX_ITEMS);
        await this.st.put('plan:' + q.group, { items, updatedAt: now });
        await this.arm(); return json({ ok: true, n: items.length, next: items[0] ? items[0].at : null });
      }
      if (p === '/devices') {
        if (!okGroup(q.group)) return json({ ok: false, loi: 'Nhóm không hợp lệ' }, 400);
        const mine = okSub(q.sub) ? await sha(q.sub.endpoint) : '';
        const list = (await this.st.list({ prefix: 'sub:' }));
        const devices = []; for (const [k, r] of list) if (r.group === q.group) devices.push({ device: r.device || 'Thiết bị', at: r.at, lastOkAt: r.lastOkAt || null, mine: k === 'sub:' + mine });
        const plan = await this.st.get('plan:' + q.group);
        return json({ ok: true, devices, pending: plan ? plan.items.length : 0, next: plan && plan.items[0] ? plan.items[0].at : null });
      }
      if (!okSub(q.sub)) return json({ ok: false, loi: 'Thiếu đăng ký thông báo' }, 400);
      const k = 'sub:' + await sha(q.sub.endpoint);
      if (p === '/sub') {
        if (!okGroup(q.group)) return json({ ok: false, loi: 'Nhóm không hợp lệ' }, 400);
        const cur = await this.st.get(k);
        if (!cur) { const n = (await this.st.list({ prefix: 'sub:', limit: MAX_SUBS + 1 })).size; if (n >= MAX_SUBS) return json({ ok: false, loi: 'Máy chủ đã đầy' }, 400); }
        if (okSub(q.replaces) || typeof q.replaces === 'string') { const old = typeof q.replaces === 'string' ? q.replaces : q.replaces.endpoint; if (old && old !== q.sub.endpoint) await this.st.delete('sub:' + await sha(old)); }
        await this.st.put(k, { ...(cur || {}), sub: q.sub, group: q.group, device: clip(q.device || 'Thiết bị', 40), at: Date.now() });
        return json({ ok: true });
      }
      if (p === '/unsub') { await this.st.delete(k); return json({ ok: true }); }
      if (p === '/test') {
        const rec = await this.st.get(k); if (!rec) return json({ ok: false, notRegistered: true });
        const r = await this.send(q.sub, payloadOf({ title: 'MC Thiên Ân', body: '✅ Thông báo đang hoạt động trên máy này.', tag: 'test', url: './', kind: 'test' }), 300);
        return json({ ok: r === 'ok', r });
      }
      return json({ ok: false }, 404);
    } catch (e) { return json({ ok: false, loi: String(e && e.message || e) }, 500); }
  }
}
