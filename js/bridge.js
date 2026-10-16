// js/bridge.js — Cliente da Ponte Vessie-AI ↔ PC (tools/vessie-bridge.js).
// O site (navegador, sandbox) chama um servidor Node local em 127.0.0.1 para
// AGIR no PC real (arquivos, status do sistema, LM Studio) — impossível só no
// navegador. Toda chamada é assinada com o token do .env. Se a ponte não estiver
// rodando ou o navegador bloquear, tudo degrada em silêncio (badge "PC offline").
// Ordem: 1.config 2.fetch 3.REST 4.SSE 5.badge 6.init/status

(function () {
  const env = window.__VESSIE_ENV__ || {};
  const PORT = Number(env.BRIDGE_PORT) || 8787;
  const BASE = 'http://127.0.0.1:' + PORT;
  const TOKEN = env.BRIDGE_TOKEN || '';

  let connected = false;
  let lastSys = null;
  let lastLm = null;
  const listeners = new Set();

  async function call(pathname, opts = {}) {
    const isGet = !opts.method || opts.method === 'GET';
    const sep = pathname.includes('?') ? '&' : '?';
    const url = isGet ? BASE + pathname + sep + 'token=' + encodeURIComponent(TOKEN) : BASE + pathname;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: Object.assign({ 'X-Bridge-Token': TOKEN }, opts.method === 'POST'
        ? { 'Content-Type': 'application/json' } : {}),
      body: opts.method === 'POST' ? JSON.stringify(Object.assign({ token: TOKEN }, opts.body)) : undefined
    });
    if (!res.ok) throw new Error('ponte respondeu ' + res.status);
    return res.json();
  }

  // ---------- REST ----------
  const health = () => call('/health');
  const sysinfo = async () => { const j = await call('/sysinfo'); lastSys = j.sys; emit(); return j.sys; };
  const lmStatus = async () => { const j = await call('/lm/status'); lastLm = j.lm; emit(); return j.lm; };
  const ls = (p) => call('/fs/list?path=' + encodeURIComponent(p || '.'));
  const read = (p) => call('/fs/read?path=' + encodeURIComponent(p));
  const write = (p, content) => call('/fs/write', { method: 'POST', body: { path: p, content } });
  // run só aceita ações whitelisted no servidor (git-status, node-check, site-content, system-memory…)
  const run = (action, args) => call('/run', { method: 'POST', body: { action, args } });

  // ---------- SSE: info em tempo real ----------
  let es = null;
  function subscribeEvents() {
    if (es) return;
    try {
      es = new EventSource(BASE + '/events?token=' + encodeURIComponent(TOKEN));
      es.onmessage = (ev) => {
        try {
          const j = JSON.parse(ev.data);
          if (j.type === 'tick') { lastSys = j.sys; lastLm = j.lm; emit(); }
        } catch (e) { /* ignora */ }
      };
      es.onerror = () => { setConnected(false); try { es.close(); } catch (e) {} es = null; };
    } catch (e) { /* EventSource indisponível */ }
  }

  // ---------- badge + estado ----------
  function setConnected(v) {
    if (connected === v) return;
    connected = v;
    emit();
  }
  function badge() { return document.getElementById('bridgeBadge'); }
  function paint() {
    const b = badge();
    if (!b) return;
    b.textContent = connected ? 'PC conectado' : 'PC offline';
    b.title = connected
      ? 'Ponte Vessie-AI ↔ PC ativa (127.0.0.1:' + PORT + ')'
      : 'Rode "node tools/vessie-bridge.js" para conectar o PC';
    b.classList.toggle('on', connected);
  }
  function emit() {
    paint();
    const snap = { connected, sys: lastSys, lm: lastLm };
    listeners.forEach(fn => { try { fn(snap); } catch (e) {} });
  }
  const onUpdate = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // ---------- init ----------
  async function init() {
    try {
      await health();
      setConnected(true);
      subscribeEvents();
      await Promise.all([sysinfo(), lmStatus()]);
    } catch (e) {
      setConnected(false); // ponte desligada ou navegador bloqueou: segue offline
    }
    paint();
  }

  const status = () => ({ connected, base: BASE, sys: lastSys, lm: lastLm });

  window.Bridge = { init, status, health, sysinfo, lmStatus, ls, read, write, run, subscribeEvents, onUpdate };
})();
