/** Render glossy blob bots into cabin corners + side panel. */

const STATUS_ZH = {
  working: '忙碌中',
  idle: '休息中',
  waiting_user: '等你回覆',
  error: '出錯',
  done: '剛完成',
};

let selectedId = null;
let onSelect = () => {};

export function initCabin({ onSelectBot } = {}) {
  onSelect = onSelectBot || (() => {});
  document.getElementById('cabin')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.bot');
    if (!btn) return;
    select(btn.dataset.id);
  });
}

export function select(id) {
  selectedId = id || null;
  onSelect(selectedId);
}

export function getSelected() { return selectedId; }

export function renderCabin(state) {
  if (!state) return;
  for (const corner of ['sofa', 'desk', 'window', 'fireplace']) {
    const host = document.getElementById(`bots-${corner}`);
    if (!host) continue;
    const ids = state.corners[corner] || [];
    const existing = new Map([...host.querySelectorAll('.bot')].map((el) => [el.dataset.id, el]));
    const keep = new Set();
    for (const id of ids) {
      const bot = state.bots[id];
      if (!bot) continue;
      keep.add(id);
      let el = existing.get(id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'bot';
        el.dataset.id = id;
        el.innerHTML = `
          <span class="status-ring"></span>
          <span class="blob"></span>
          <span class="face"><span class="eyes"><span class="eye"></span><span class="eye"></span></span></span>
          <span class="acc" hidden></span>
          <span class="name"></span>`;
        host.appendChild(el);
      }
      paintBot(el, bot);
    }
    for (const [id, el] of existing) if (!keep.has(id)) el.remove();
  }

  // counts
  const s = state.summary || {};
  for (const k of ['working', 'idle', 'waiting_user', 'error', 'done']) {
    const el = document.getElementById(`c-${k}`);
    if (el) el.textContent = String(s[k] || 0);
  }

  // usage
  const chip = document.getElementById('usage-chip');
  const fill = document.getElementById('usage-fill');
  const ut = document.getElementById('usage-text');
  const pct = state.usage?.total_used_pct;
  if (chip && fill && ut) {
    if (pct == null) {
      chip.hidden = true;
    } else {
      chip.hidden = false;
      const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
      fill.style.width = `${clamped}%`;
      let reset = '';
      if (state.usage.resets_at) {
        try {
          reset = ' · 重置 ' + new Date(state.usage.resets_at).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { /* ignore */ }
      }
      ut.textContent = `用量 ${clamped.toFixed(1)}%${reset}`;
    }
  }

  // clock
  const clock = document.getElementById('clock');
  if (clock) {
    clock.textContent = new Date().toLocaleString('zh-HK', {
      timeZone: 'Asia/Hong_Kong', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }) + '（香港時間）';
  }

  // feed
  const feed = document.getElementById('feed');
  if (feed) {
    feed.innerHTML = (state.feed || []).slice(0, 12).map((f) => {
      const when = f.t ? new Date(f.t).toLocaleTimeString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit' }) : '';
      return `<li><span class="when">${esc(when)}</span><span class="who">${esc(f.name)}</span> · ${esc(STATUS_ZH[f.status] || f.status)}${f.step ? ` — ${esc(f.step)}` : ''}</li>`;
    }).join('') || '<li class="muted">尚未有動態</li>';
  }

  renderSelected(state);
}

function paintBot(el, bot) {
  const look = bot.look || {};
  el.dataset.status = bot.effective_status;
  el.dataset.shape = look.shape || 'sphere';
  el.classList.toggle('selected', bot.id === selectedId);
  el.style.setProperty('--bot-color', look.color || bot.color || '#E8A87C');
  el.title = `${bot.name} · ${STATUS_ZH[bot.effective_status] || bot.effective_status}`;
  el.querySelector('.name').textContent = bot.name;
  const acc = el.querySelector('.acc');
  const a = look.accessory || 'none';
  if (a === 'none') {
    acc.hidden = true;
    acc.className = 'acc';
  } else {
    acc.hidden = false;
    acc.className = `acc ${a}`;
  }
}

export function renderSelected(state) {
  const card = document.getElementById('selected-card');
  if (!card) return;
  const bot = selectedId && state?.bots?.[selectedId];
  if (!bot) {
    card.innerHTML = `<p class="panel-hint">點選小屋裡的 bot 看詳情</p>`;
    return;
  }
  const routines = (bot.routines || []).slice(0, 3).map((r) =>
    `<li>${esc(r.name)}${r.schedule ? ` · ${esc(r.schedule)}` : ''}</li>`).join('');
  card.innerHTML = `
    <div class="bot-detail">
      <div class="title">
        <span class="swatch" style="--c:${esc(bot.color)}"></span>
        <div>
          <h3>${esc(bot.name)}</h3>
          <p class="meta">${esc(STATUS_ZH[bot.effective_status] || bot.effective_status)} · ${esc(bot.corner_label || bot.corner || '')}${bot.group ? `（${esc(bot.group)}）` : ''}</p>
        </div>
      </div>
      <p class="step">${esc(bot.step || '（沒有步驟說明）')}</p>
      ${bot.usage_pct != null ? `<p class="meta">本週用量佔比約 ${Number(bot.usage_pct).toFixed(1)}%</p>` : ''}
      ${routines ? `<ul class="meta" style="margin:0.4rem 0 0;padding-left:1.1rem">${routines}</ul>` : ''}
      <button type="button" class="chat-btn" id="open-chat" ${bot.chat_url ? '' : 'disabled'}>${bot.chat_url ? '打開對話' : '未設定對話連結'}</button>
    </div>`;
  const btn = card.querySelector('#open-chat');
  if (btn && bot.chat_url) {
    btn.addEventListener('click', () => { location.href = bot.chat_url; });
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
