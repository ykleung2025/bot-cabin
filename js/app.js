import { feedFromHash, connectFeed } from './feed.js';
import { initCabin, renderCabin, select, getSelected } from './cabin.js';

const gate = document.getElementById('gate');
const conn = document.getElementById('conn-label');

initCabin({
  onSelectBot: () => {
    /* re-render selection from last state */
    if (window.__cabinState) renderCabin(window.__cabinState);
  },
});

const feed = feedFromHash(location.hash, location.search);
if (!feed) {
  gate.hidden = false;
  if (conn) conn.textContent = '等待主題…（網址加 #TOPIC）';
} else {
  gate.hidden = true;
  if (conn) {
    const servers = feed.servers.map((s) => {
      try { return new URL(s).hostname; } catch { return 'ntfy'; }
    }).join(' + ');
    conn.textContent = `已連接 · ${servers} · 主題留在 # 後面`;
  }
  connectFeed(feed, (state) => {
    window.__cabinState = state;
    if (getSelected() && !state.bots[getSelected()]) select(null);
    renderCabin(state);
  }).catch((err) => {
    console.error(err);
    if (conn) conn.textContent = '連接失敗，請檢查主題或網路';
  });
  addEventListener('hashchange', () => location.reload());
}

// keep clock fresh
setInterval(() => {
  if (window.__cabinState) renderCabin(window.__cabinState);
}, 15e3);
