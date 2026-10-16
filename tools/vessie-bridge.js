#!/usr/bin/env node
// tools/vessie-bridge.js — Ponte Vessie-AI ↔ PC do usuário.
// Servidor HTTP LOCAL (127.0.0.1) que o site chama para agir no PC real
// (arquivos, status do sistema, LM Studio) — algo impossível só no navegador.
// Node.js puro, zero dependências. Segurança: 127.0.0.1 + token + sandbox de
// caminhos + whitelist de comandos (NUNCA shell arbitrário).
// Ordem: 1.config/token 2.helpers 3.sandbox 4.fs 5.sysinfo/lm 6.run 7.sse 8.router
// Uso: node tools/vessie-bridge.js [--port 8787]   (Ctrl+C encerra)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(__dirname, 'logs');
const ENV_PATH = path.join(ROOT, '.env');
const VERSION = '1.0.0';

// ---------- 1. config (.env) + token ----------
function parseEnvFile() {
  const out = {};
  try {
    fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).forEach(line => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const i = t.indexOf('=');
      if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    });
  } catch (e) { /* sem .env */ }
  return out;
}

function ensureToken() {
  const env = parseEnvFile();
  if (env.BRIDGE_TOKEN && env.BRIDGE_TOKEN.length >= 16) return env.BRIDGE_TOKEN;
  const tok = crypto.randomBytes(16).toString('hex');
  const extra = (fs.existsSync(ENV_PATH) ? '' : 'BASE_URL=http://localhost:1234/v1\nAPI_KEY=lm-studio\n') +
    'BRIDGE_TOKEN=' + tok + '\n';
  fs.appendFileSync(ENV_PATH, extra, 'utf8');
  return tok;
}

const ENV = parseEnvFile();
const TOKEN = ensureToken();
const PORT = Number(ENV.BRIDGE_PORT) || 8787;
// Raízes permitidas para ler/escrever (padrão: só a pasta do projeto).
const ROOTS = (ENV.ALLOWED_ROOTS || ROOT).split(';').map(p => path.resolve(p.trim())).filter(Boolean);

function log(msg) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    fs.appendFileSync(path.join(LOG_DIR, 'bridge-' + stamp + '.log'),
      '[' + new Date().toISOString() + '] ' + msg + '\n', 'utf8');
  } catch (e) { /* ignore */ }
}

// ---------- 2. helpers HTTP ----------
function cors(res) {
  // O site pode estar em outra origem (localhost:8080); limita ao token.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function send(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) { req.destroy(); reject(new Error('corpo grande demais')); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function tokenOk(query, req, bodyObj) {
  const got = query.get('token') || req.headers['x-bridge-token'] || (bodyObj && bodyObj.token) || '';
  const a = Buffer.from(String(got));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- 3. sandbox de caminhos ----------
function safePath(rel) {
  const abs = path.resolve(ROOT, String(rel || ''));
  const ok = ROOTS.some(r => abs === r || abs.startsWith(r + path.sep));
  if (!ok) throw new Error('caminho fora das raízes permitidas');
  return abs;
}

// ---------- 4. sistema de arquivos (sandboxed pelas raízes) ----------
function fsList(rel) {
  const abs = safePath(rel || '.');
  const entries = fs.readdirSync(abs, { withFileTypes: true }).map(d => ({
    name: d.name,
    type: d.isDirectory() ? 'dir' : 'file',
    size: d.isFile() ? (() => { try { return fs.statSync(path.join(abs, d.name)).size; } catch (e) { return 0; } })() : 0
  }));
  return { path: rel || '.', entries };
}

function fsRead(rel) {
  const abs = safePath(rel);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) throw new Error('é um diretório, não um arquivo');
  if (stat.size > 2e6) throw new Error('arquivo grande demais para ler (>2MB)');
  return { path: rel, size: stat.size, content: fs.readFileSync(abs, 'utf8') };
}

function fsWrite(rel, content) {
  const abs = safePath(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, String(content == null ? '' : content), 'utf8');
  const stat = fs.statSync(abs);
  log('fs.write ' + rel + ' (' + stat.size + ' bytes)');
  return { path: rel, size: stat.size, written: true };
}

// ---------- 6. ações permitidas (WHITELIST — nunca shell arbitrário) ----------
const SITE_CONTENT_CMDS = new Set(['detect', 'list', 'get', 'set', 'add', 'new-section', 'env-init', 'env-show', 'env-apply']);
const SYSTEM_MEMORY_CMDS = new Set(['init', 'list', 'get', 'put', 'edit-lines', 'new-folder', 'check', 'bundle', 'stats']);

function runAllowed(action, args) {
  args = args || [];
  return new Promise(resolve => {
    const done = (ok, out, err) => resolve({ action, ok, out: String(out || '').slice(0, 8000), err: String(err || '').slice(0, 2000) });
    if (action === 'git-status') {
      execFile('git', ['status', '--short'], { cwd: ROOT, windowsHide: true }, (e, out, err) => done(!e, out, e ? err || e.message : ''));
    } else if (action === 'git-log') {
      execFile('git', ['log', '--oneline', '-5'], { cwd: ROOT, windowsHide: true }, (e, out, err) => done(!e, out, e ? err || e.message : ''));
    } else if (action === 'node-check') {
      const abs = safePath(args[0] || '');
      execFile(process.execPath, ['--check', abs], { windowsHide: true }, (e, out, err) => done(!e, out, e ? err || e.message : ''));
    } else if (action === 'site-content') {
      const cmd = args[0];
      if (!SITE_CONTENT_CMDS.has(cmd)) return done(false, '', 'subcomando bloqueado: ' + cmd);
      execFile(process.execPath, [path.join(__dirname, 'site-content.js'), ...args.slice(0, 4)], { cwd: ROOT, windowsHide: true }, (e, out, err) => done(!e, out, e ? err || e.message : ''));
    } else if (action === 'system-memory') {
      const cmd = args[0];
      if (!SYSTEM_MEMORY_CMDS.has(cmd)) return done(false, '', 'subcomando bloqueado: ' + cmd);
      execFile(process.execPath, [path.join(__dirname, 'system-memory.js'), ...args.slice(0, 4)], { cwd: ROOT, windowsHide: true }, (e, out, err) => done(!e, out, e ? err || e.message : ''));
    } else {
      done(false, '', 'ação desconhecida/bloqueada: ' + action);
    }
  });
}

// ---------- 7. SSE: informações em tempo real para o site ----------
const sseClients = new Set();

async function broadcast() {
  if (!sseClients.size) return;
  const payload = JSON.stringify({
    type: 'tick',
    sys: sysInfo(),
    lm: await lmStatus(),
    memory: { free: Math.round(os.freemem() / 1048576), total: Math.round(os.totalmem() / 1048576) }
  });
  for (const res of sseClients) { try { res.write('data: ' + payload + '\n\n'); } catch (e) { sseClients.delete(res); } }
}

function startTicker() { setInterval(broadcast, 5000); }

// ---------- 8. router + servidor ----------
async function handle(req, res) {
  const u = new URL(req.url, 'http://127.0.0.1');
  const q = u.searchParams;
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  // /events (SSE) valida token antes de abrir o stream
  if (u.pathname === '/events') {
    if (!tokenOk(q, req, null)) return send(res, 401, { ok: false, error: 'token inválido' });
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': conectado à ponte Vessie\n\n');
    sseClients.add(res);
    broadcast();
    req.on('close', () => sseClients.delete(res));
    return;
  }

  let bodyObj = null;
  if (req.method === 'POST') {
    try { bodyObj = JSON.parse((await readBody(req)) || '{}'); } catch (e) { return send(res, 400, { ok: false, error: 'JSON inválido' }); }
  }
  if (!tokenOk(q, req, bodyObj)) return send(res, 401, { ok: false, error: 'token inválido' });

  try {
    if (u.pathname === '/health') return send(res, 200, { ok: true, version: VERSION, port: PORT, roots: ROOTS });
    if (u.pathname === '/sysinfo') return send(res, 200, { ok: true, sys: sysInfo() });
    if (u.pathname === '/lm/status') return send(res, 200, { ok: true, lm: await lmStatus() });
    if (u.pathname === '/fs/list') return send(res, 200, { ok: true, entries: fsList(q.get('path') || '.') });
    if (u.pathname === '/fs/read') return send(res, 200, { ok: true, file: fsRead(q.get('path')) });
    if (u.pathname === '/fs/write') return send(res, 200, { ok: true, result: fsWrite(bodyObj.path, bodyObj.content) });
    if (u.pathname === '/run') return send(res, 200, { ok: true, result: await runAllowed(bodyObj.action, bodyObj.args) });
    return send(res, 404, { ok: false, error: 'rota desconhecida: ' + u.pathname });
  } catch (e) {
    return send(res, 400, { ok: false, error: e.message });
  }
}

const server = http.createServer((req, res) => { handle(req, res).catch(e => send(res, 500, { ok: false, error: e.message })); });
server.listen(PORT, '127.0.0.1', () => {
  const msg = 'Ponte Vessie-AI ativa em http://127.0.0.1:' + PORT + ' (somente local, token exigido)';
  console.log(msg);
  console.log('  Raízes permitidas: ' + ROOTS.join(', '));
  console.log('  Token (no .env → BRIDGE_TOKEN): ' + TOKEN.slice(0, 8) + '…');
  log('start porta=' + PORT);
  startTicker();
});
server.on('error', e => { console.error('Falha ao subir a ponte:', e.message); log('erro: ' + e.message); });


// ---------- 5. info do sistema + status do LM Studio ----------
function sysInfo() {
  const cpus = os.cpus();
  const load = os.loadavg();
  return {
    hostname: os.hostname(),
    platform: process.platform + ' ' + os.release(),
    arch: process.arch,
    cpus: cpus.length,
    cpuModel: cpus[0] ? cpus[0].model.trim() : '?',
    load1: Number(load[0].toFixed(2)),
    memTotalMB: Math.round(os.totalmem() / 1048576),
    memFreeMB: Math.round(os.freemem() / 1048576),
    memUsedPct: Math.round((1 - os.freemem() / os.totalmem()) * 100),
    uptimeMin: Math.round(os.uptime() / 60),
    node: process.version,
    bridgeUptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString()
  };
}

function lmStatus() {
  const base = (ENV.BASE_URL || 'http://localhost:1234/v1').replace(/\/$/, '');
  return new Promise(resolve => {
    const t = setTimeout(() => resolve({ base, ok: false, error: 'timeout 2s' }), 2000);
    const req = http.get(base + '/models', r => {
      let d = '';
      r.on('data', c => { d += c; });
      r.on('end', () => {
        clearTimeout(t);
        let models = [];
        try { const j = JSON.parse(d); models = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean); } catch (e) {}
        resolve({ base, ok: r.statusCode === 200, models });
      });
    });
    req.on('error', e => { clearTimeout(t); resolve({ base, ok: false, error: e.message }); });
  });
}

