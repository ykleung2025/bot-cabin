/** ntfy / relay feed reader — same hash protocol as Codila's grokbot-wallpaper. */
import { CabinStore } from './state.js';

const NTFY = 'https://ntfy.sh';
const RELAY = 'https://relay.0xcodila.com';
const TOPIC_RE = /^[A-Za-z0-9_-]{6,64}$/;
const KEEP = 500;
const TICK_MS = 30e3;

function feedBase(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  try { s = decodeURIComponent(s); } catch { /* keep */ }
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch { return null; }
}

/**
 * Parse location hash/search into { topic, servers }.
 * #topic           → both RELAY + ntfy.sh
 * #topic&ntfy=…    → that mailbox only
 * #topic@host      → that mailbox only
 * ?feed=…          → older wallpaper form
 */
export function feedFromHash(hash = '', search = '') {
  const q = new URLSearchParams(search).get('feed');
  const qBase = q && /[./:]/.test(q) ? feedBase(q) : null;
  const m = /^#([A-Za-z0-9_-]{6,64})(?:@([^&#]+)|&ntfy=([^&#]+))?/.exec(hash || '');
  const topic = m ? m[1] : (q && TOPIC_RE.test(q) ? q : null);
  if (!topic) return null;
  const named = (m && (m[2] || m[3])) ? feedBase(m[2] || m[3]) : null;
  if (named || qBase) {
    return { topic, servers: [named || qBase] };
  }
  return { topic, servers: [RELAY, NTFY] };
}

export async function connectFeed({ topic, servers }, onState) {
  const sources = servers.map((server) => ({
    server,
    tag: String(server).startsWith(RELAY) ? 'relay' : 'ntfy',
    base: `${server.replace(/\/$/, '')}/${encodeURIComponent(topic)}`,
    lastId: null,
  }));
  const usual = servers.length > 1;
  const cacheKey = usual ? `cabin.feed.${topic}` : `cabin.feed.${servers[0]}.${topic}`;
  const store = new CabinStore({ tz: 'Asia/Hong_Kong' });
  let lines = [];
  const seen = new Set();
  let saveTimer = 0;

  lines = cached(cacheKey);
  await Promise.all(sources.map(async (s) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const text = await (await fetch(`${s.base}/json?poll=1&since=12h`, { cache: 'no-store', signal: ctrl.signal })).text();
      clearTimeout(timer);
      for (const row of text.split('\n')) if (row) keep(s, JSON.parse(row));
    } catch { /* offline / slow mailbox: other sources + cache still paint the cabin */ }
  }));
  lines = lines.filter(fresh).sort((a, b) => a.time - b.time);
  for (const l of lines) ingest(l);
  for (const s of sources) s.lastId = [...lines].reverse().find((l) => l.src === s.tag)?.id ?? null;
  save();
  publish();

  for (const s of sources) follow(s);
  setInterval(() => publish(), TICK_MS);

  function cached(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  }
  function fresh(l) {
    const a = `${l.src} ${l.id}`, b = `${l.time} ${l.message}`;
    if (seen.has(a) || seen.has(b)) return false;
    seen.add(a); seen.add(b);
    return true;
  }
  function keep(s, m) {
    if (m?.event === 'message' && typeof m.id === 'string') {
      lines.push({ id: m.id, time: Number(m.time) || 0, message: m.message, src: s.tag });
    }
  }
  function take(s, m) {
    if (m?.event !== 'message' || typeof m.id !== 'string') return false;
    s.lastId = m.id;
    const l = { id: m.id, time: Number(m.time) || Date.now() / 1000, message: m.message, src: s.tag };
    if (!fresh(l)) return false;
    lines.push(l);
    if (lines.length > KEEP * 1.5) lines = lines.slice(-KEEP);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 2000);
    return ingest(l);
  }
  function ingest(l) {
    return store.applyMessage(l.message, l.time);
  }
  function publish() {
    onState(store.snapshot());
  }
  function save() {
    try { localStorage.setItem(cacheKey, JSON.stringify(lines.slice(-KEEP))); } catch { /* private */ }
  }
  function follow(s) {
    const on = (data) => { try { if (take(s, JSON.parse(data))) publish(); } catch { /* junk */ } };
    if (s.tag === 'relay') {
      let wait = 1e3, heard = Date.now();
      (function open() {
        let ws;
        try { ws = new WebSocket(`${s.base.replace(/^http/, 'ws')}/ws`); } catch { setTimeout(open, wait); wait = Math.min(wait * 2, 60e3); return; }
        const ping = setInterval(() => {
          if (Date.now() - heard > 150e3) ws.close();
          else if (ws.readyState === 1) try { ws.send('ping'); } catch {}
        }, 60e3);
        ws.onopen = () => { wait = 1e3; heard = Date.now(); catchUp(s); };
        ws.onmessage = (e) => { heard = Date.now(); if (e.data !== 'pong') on(e.data); };
        ws.onclose = () => { clearInterval(ping); setTimeout(open, wait); wait = Math.min(wait * 2, 60e3); };
      })();
      return;
    }
    const live = new EventSource(`${s.base}/sse`);
    live.onopen = () => catchUp(s);
    live.onmessage = (e) => on(e.data);
  }
  async function catchUp(s) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const text = await (await fetch(`${s.base}/json?poll=1&since=${s.lastId ?? '12h'}`, { cache: 'no-store', signal: ctrl.signal })).text();
      clearTimeout(timer);
      let changed = false;
      for (const row of text.split('\n')) if (row && take(s, JSON.parse(row))) changed = true;
      if (changed) publish();
    } catch { /* stream retries */ }
  }

  return { store, topic };
}
