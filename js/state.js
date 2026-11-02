/** Lightweight cabin state reducer — same ntfy JSON protocol, groups = room corners. */
import { botIdFor, cleanStr, hashColor, makeTime, normLook, parseTime } from './util.js';

const STATUS_MAP = {
  working:'working', idle:'idle', waiting_user:'waiting_user', error:'error', done:'done',
  waiting:'waiting_user', waiting_for_user:'waiting_user', awaiting_user:'waiting_user', waiting_input:'waiting_user',
  failed:'error', fail:'error', failure:'error', errored:'error',
  finished:'done', complete:'done', completed:'done', success:'done', succeeded:'done',
  running:'working', busy:'working', active:'working', in_progress:'working',
  sleeping:'idle', paused:'idle', stopped:'idle',
};

const QUIET_MS = 20 * 60e3;
const DONE_MS = 60e3;
const IDLE_MS = 3 * 3600e3;
const MAX_BOTS = 400;
const HISTORY = 20;
const FEED = 80;

/** Map a group / team string onto one of four cozy corners. */
export function cornerFor(group) {
  const s = String(group || '').trim().toLowerCase();
  if (!s) return 'fireplace';
  if (/sofa|couch|客廳|沙發|lounge|living/.test(s)) return 'sofa';
  if (/desk|work|書|辦公|coding|dev|寫|studio/.test(s)) return 'desk';
  if (/window|窗|view|watch|scout|觀/.test(s)) return 'window';
  if (/fire|壁爐|hearth|warm|home|協調|coord/.test(s)) return 'fireplace';
  // stable hash into 4 corners
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ['sofa', 'desk', 'window', 'fireplace'][h % 4];
}

const CORNER_LABEL = { sofa: '沙發', desk: '書桌', window: '窗邊', fireplace: '壁爐' };

export class CabinStore {
  constructor({ tz = 'Asia/Hong_Kong' } = {}) {
    this.time = makeTime(tz);
    this.bots = new Map();
    this.cfg = new Map(); // id -> { look, chat_url, group }
    this.usage = { total: null, resetsAt: null, updatedAt: null, bots: {} };
    this.routines = new Map();
    this.feed = [];
    this.version = 1;
  }

  applyMessage(message, timeSec) {
    if (typeof message !== 'string' || message.length > 4096) return false;
    let rec;
    try { rec = JSON.parse(message); } catch { return false; }
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
    const tIso = typeof rec.t === 'string' ? rec.t : this.time.iso((Number(timeSec) || Date.now() / 1000) * 1000);
    const ms = parseTime(tIso) ?? Date.now();

    if (Array.isArray(rec.roster)) {
      for (const name of rec.roster.slice(0, 400)) {
        if (typeof name === 'string' && name.trim()) this.ensureBot(name, ms, true);
      }
      this.version++;
      return true;
    }
    if (isMap(rec.looks)) {
      for (const [name, look] of Object.entries(rec.looks).slice(0, 400)) {
        const id = botIdFor(name);
        const e = this.cfg.get(id) || {};
        e.look = normLook(look);
        this.cfg.set(id, e);
        this.ensureBot(name, ms, true);
      }
      this.version++;
      return true;
    }
    if (isMap(rec.groups)) {
      for (const [name, team] of Object.entries(rec.groups).slice(0, 400)) {
        if (typeof team !== 'string' || !team.trim()) continue;
        const id = botIdFor(name);
        const e = this.cfg.get(id) || {};
        e.group = team.trim().slice(0, 40);
        this.cfg.set(id, e);
        const bot = this.ensureBot(name, ms, true);
        bot.group = e.group;
        bot.corner = cornerFor(e.group);
      }
      this.version++;
      return true;
    }
    if (isMap(rec.chat)) {
      for (const [name, url] of Object.entries(rec.chat).slice(0, 400)) {
        if (typeof url !== 'string') continue;
        const u = url.trim();
        if (!/^(grokbot|https):\/\//i.test(u)) continue;
        const id = botIdFor(name);
        const e = this.cfg.get(id) || {};
        e.chat_url = u;
        this.cfg.set(id, e);
        this.ensureBot(name, ms, true);
      }
      this.version++;
      return true;
    }
    if (isMap(rec.routines)) {
      const name = typeof rec.routines.bot === 'string' ? rec.routines.bot.trim().slice(0, 80) : '';
      if (!name || !Array.isArray(rec.routines.items)) return false;
      const items = rec.routines.items.slice(0, 50).filter(isMap).map((r) => ({
        name: String(r.name ?? '').slice(0, 80),
        schedule: String(r.schedule ?? '').slice(0, 80),
        next_run: Number.isFinite(Date.parse(r.next_run)) ? new Date(r.next_run).toISOString() : null,
      })).filter((r) => r.name);
      this.routines.set(botIdFor(name), items);
      this.version++;
      return true;
    }
    if (rec.type === 'usage') {
      const total = Number(rec.total_used_pct);
      if (Number.isFinite(total) && total >= 0) this.usage.total = total;
      if (typeof rec.resets_at === 'string') this.usage.resetsAt = rec.resets_at;
      this.usage.updatedAt = tIso;
      if (isMap(rec.bots)) {
        const m = {};
        for (const [k, v] of Object.entries(rec.bots)) {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) m[botIdFor(k)] = n;
        }
        this.usage.bots = m;
      }
      this.version++;
      return true;
    }

    // status line
    const name = cleanStr(rec.bot, 80);
    if (!name) return false;
    const bot = this.ensureBot(name, ms, false);
    const step = cleanStr(rec.step, 160);
    const status = normalizeStatus(rec.status, !!step, bot.status);
    const group = cleanStr(rec.group, 60);
    if (group) {
      bot.group = group;
      bot.corner = cornerFor(group);
      const e = this.cfg.get(bot.id) || {};
      e.group = group;
      this.cfg.set(bot.id, e);
    }
    if (status !== bot.status) bot.sinceMs = ms;
    bot.status = status;
    bot.step = step;
    bot.lastMs = ms;
    bot.seenMs = ms;
    bot.history.unshift({ t: this.time.iso(ms), status, step });
    if (bot.history.length > HISTORY) bot.history.length = HISTORY;
    this.feed.unshift({ t: this.time.iso(ms), bot: bot.id, name: bot.name, status, step });
    if (this.feed.length > FEED) this.feed.length = FEED;
    this.version++;
    return true;
  }

  ensureBot(name, ms, listed) {
    const id = botIdFor(name);
    let bot = this.bots.get(id);
    if (!bot) {
      if (this.bots.size >= MAX_BOTS) return null;
      const cfg = this.cfg.get(id) || {};
      bot = {
        id, name: name.trim().slice(0, 80),
        status: 'idle', step: null,
        group: cfg.group || null,
        corner: cornerFor(cfg.group),
        sinceMs: ms, lastMs: listed ? null : ms, seenMs: listed ? null : ms,
        history: [],
      };
      this.bots.set(id, bot);
    }
    return bot;
  }

  effective(bot, now = Date.now()) {
    if (bot.lastMs === null) return 'idle';
    const age = now - bot.lastMs;
    if (age > IDLE_MS) return 'idle';
    switch (bot.status) {
      case 'done': return age <= DONE_MS ? 'done' : 'idle';
      case 'working': return age > QUIET_MS ? 'idle' : 'working';
      default: return bot.status;
    }
  }

  snapshot() {
    const now = Date.now();
    const bots = {};
    const counts = { working: 0, idle: 0, waiting_user: 0, error: 0, done: 0, total: 0 };
    const corners = { sofa: [], desk: [], window: [], fireplace: [] };

    for (const bot of this.bots.values()) {
      const cfg = this.cfg.get(bot.id) || {};
      const look = cfg.look || {};
      const eff = this.effective(bot, now);
      const corner = bot.corner || cornerFor(cfg.group || bot.group);
      counts[eff] = (counts[eff] || 0) + 1;
      counts.total++;
      const row = {
        id: bot.id,
        name: bot.name,
        status: bot.status,
        effective_status: eff,
        step: bot.step,
        group: bot.group || cfg.group || null,
        corner,
        corner_label: CORNER_LABEL[corner],
        since: this.time.iso(bot.sinceMs),
        last_event: this.time.iso(bot.lastMs),
        chat_url: cfg.chat_url || null,
        color: look.color || hashColor(bot.id),
        look: { shape: look.shape || 'sphere', color: look.color || hashColor(bot.id), accessory: look.accessory || 'none' },
        usage_pct: this.usage.bots[bot.id] ?? null,
        history: bot.history.slice(0, 8),
        routines: this.routines.get(bot.id) || [],
      };
      bots[bot.id] = row;
      corners[corner].push(bot.id);
    }

    return {
      version: this.version,
      now: this.time.iso(now),
      tz: this.time.tz,
      summary: counts,
      usage: {
        total_used_pct: this.usage.total,
        resets_at: this.usage.resetsAt,
        updated_at: this.usage.updatedAt,
        bots: { ...this.usage.bots },
      },
      corners,
      bots,
      feed: this.feed.slice(0, 40),
    };
  }
}

function normalizeStatus(raw, hasStep, previous) {
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (STATUS_MAP[key]) return STATUS_MAP[key];
  }
  if (hasStep) return 'working';
  return previous || 'idle';
}

function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
