/** Shared helpers (protocol-compatible slug + time). Asia/Hong_Kong default for this cabin. */

const CYR = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
  і:'i',ї:'yi',є:'ye',ґ:'g',
};

export function slugify(input, maxLen = 48) {
  let s = String(input ?? '').normalize('NFC').toLowerCase();
  s = s.replace(/[а-яёіїєґ]/g, (c) => CYR[c] ?? '');
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/g, '');
  return s;
}

export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hashColor(str) {
  const h = hash32(String(str));
  const hue = (h * 137.508) % 360;
  const s = 0.72, l = 0.52;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + hue / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

export function cleanStr(v, max) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  let s = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (!s) return null;
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
  return s;
}

export function parseTime(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
  if (typeof v !== 'string' || !v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

export function makeTime(tz = 'Asia/Hong_Kong') {
  let fmt;
  try { fmt = makeFormatter(tz); } catch { tz = 'UTC'; fmt = makeFormatter(tz); }
  const memo = new Map();
  function parts(ms) {
    const o = {};
    for (const p of fmt.formatToParts(ms)) o[p.type] = p.value;
    return o;
  }
  function offsetOf(p) {
    const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(p.timeZoneName || '');
    if (!m) return '+00:00';
    return `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`;
  }
  function iso(ms) {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
    const key = Math.floor(ms / 1000);
    const hit = memo.get(key);
    if (hit) return hit;
    const p = parts(key * 1000);
    const hour = p.hour === '24' ? '00' : p.hour;
    const out = `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}${offsetOf(p)}`;
    if (memo.size > 4000) memo.clear();
    memo.set(key, out);
    return out;
  }
  return { tz, iso };
}

function makeFormatter(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    timeZoneName: 'longOffset',
  });
}

export const LOOK_SHAPES = [
  'sphere','rounded_cube','pill','triangle','cone','pentagon','hexagon',
  'star4','star6','clover','rounded_square','trio','cloud','bubble','flower','drop',
];
export const LOOK_ACCESSORIES = ['none','glasses','stem','antenna','bow'];

const HEX6 = /^#?[0-9a-f]{6}$/i;

export function normLook(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  let shape = null;
  if (typeof v.shape === 'string') {
    const s = v.shape.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (LOOK_SHAPES.includes(s)) shape = s;
  }
  const color = typeof v.color === 'string' && HEX6.test(v.color.trim())
    ? `#${v.color.trim().replace('#', '').toUpperCase()}` : null;
  let accessory = 'none';
  if (typeof v.accessory === 'string') {
    const a = v.accessory.trim().toLowerCase();
    if (LOOK_ACCESSORIES.includes(a)) accessory = a;
  }
  if (!shape && !color) return null;
  return { shape, color, accessory };
}

export function botIdFor(name) {
  const slug = slugify(name);
  if (!slug) {
    const h = Array.from(new TextEncoder().encode(String(name)), (b) => b.toString(16).padStart(2, '0')).join('');
    return `bot-${slugify(h.slice(0, 12)) || 'x'}`;
  }
  return slug;
}
