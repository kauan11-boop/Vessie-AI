#!/usr/bin/env node
// tools/site-content.js — Sistema de tags + detecção de URL do site (Vessie).
// Node.js puro (fs/path/child_process), zero dependências externas.
// Ordem: 1.args 2.log 3.config 4.detect 5.tags 6.comandos 7.dispatch
// Ex: node tools/site-content.js detect [--url https://user.github.io/repo/]
//     node tools/site-content.js new-section promo --title "Novidade"

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(__dirname, 'logs');
const CONFIG_PATH = path.join(__dirname, 'site.config.json');
const DEFAULT_LOCAL = 'http://localhost:8080';

// ---------- 1. args ----------
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

// ---------- 2. log próprio por comando ----------
function log(cmd, lines) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = path.join(LOG_DIR, cmd + '-' + stamp + '.log');
  const body = ['[' + new Date().toISOString() + '] cmd=' + cmd].concat(lines, '').join('\n');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

// ---------- 3. config ----------
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { return {}; }
}
function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

// ---------- 4. detecção de URL + ambiente ----------
function classify(url) {
  try {
    const h = new URL(url).hostname;
    if (h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h) || h.startsWith('10.')) return 'localhost';
    if (h.endsWith('github.io')) return 'github-pages';
    return 'custom';
  } catch (e) { return 'unknown'; }
}

function gitRemoteUrl() {
  try {
    const out = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = out.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (m) return 'https://' + m[1] + '.github.io/' + m[2] + '/';
    return out;
  } catch (e) { return null; }
}

function detectSite(args) {
  const steps = [];
  const finish = (url, source) => {
    const finalUrl = url.endsWith('/') ? url : url + '/';
    if (!args.url && !process.env.SITE_URL && !readConfig().baseUrl) {
      try { if (!fs.existsSync(CONFIG_PATH)) writeConfig({ baseUrl: finalUrl, detectedFrom: source }); } catch (e) {}
    }
    return { url: finalUrl, environment: classify(finalUrl), source, steps };
  };
  if (args.url && typeof args.url === 'string') { steps.push('--url: ' + args.url); return finish(args.url, 'flag --url'); }
  if (process.env.SITE_URL) { steps.push('SITE_URL: ' + process.env.SITE_URL); return finish(process.env.SITE_URL, 'env SITE_URL'); }
  const cfg = readConfig();
  if (cfg.baseUrl) { steps.push('site.config.json: ' + cfg.baseUrl); return finish(cfg.baseUrl, 'tools/site.config.json'); }
  const git = gitRemoteUrl();
  if (git) { steps.push('git remote: ' + git); return finish(git, 'git remote origin'); }
  const hasPages = fs.existsSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'));
  steps.push(hasPages ? 'pages.yml presente, mas sem git remote local' : 'sem pages.yml e sem git remote');
  return finish(DEFAULT_LOCAL, hasPages ? 'fallback (deploy GitHub Pages detectado)' : 'fallback localhost');
}

// ---------- 5. sistema de tags ----------
function htmlFiles() {
  return fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(ROOT, f));
}

function scanTags() {
  const found = [];
  for (const file of htmlFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /<!--\s*tag:([\w-]+)\s*-->([\s\S]*?)<!--\s*\/tag:\1\s*-->/g;
    let m;
    while ((m = re.exec(src))) found.push({ tag: m[1], file: path.relative(ROOT, file), kind: 'comment', chars: m[2].trim().length });
    const reEl = /data-tag="([\w-]+)"/g;
    while ((m = reEl.exec(src))) {
      if (!found.some(t => t.tag === m[1] && t.file === path.relative(ROOT, file))) {
        found.push({ tag: m[1], file: path.relative(ROOT, file), kind: 'element', chars: 0 });
      }
    }
  }
  return found;
}

function readTag(tag) {
  const safe = String(tag).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const file of htmlFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const m = src.match(new RegExp('<!--\\s*tag:' + safe + '\\s*-->([\\s\\S]*?)<!--\\s*/tag:' + safe + '\\s*-->'));
    if (m) return { file: path.relative(ROOT, file), content: m[1].trim() };
  }
  return null;
}

function writeTag(tag, content) {
  const safe = String(tag).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const file of htmlFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const re = new RegExp('(<!--\\s*tag:' + safe + '\\s*-->)([\\s\\S]*?)(<!--\\s*/tag:' + safe + '\\s*-->)');
    if (re.test(src)) {
      fs.writeFileSync(file, src.replace(re, '$1\n' + content + '\n$3'), 'utf8');
      return { file: path.relative(ROOT, file), action: 'set' };
    }
  }
  return null;
}

function addTag(tag, content, opts) {
  opts = opts || {};
  const block = '<!-- tag:' + tag + ' -->\n' + content + '\n<!-- /tag:' + tag + ' -->';
  if (opts.after) {
    const safe = String(opts.after).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const file of htmlFiles()) {
      const src = fs.readFileSync(file, 'utf8');
      const m = src.match(new RegExp('<!--\\s*/tag:' + safe + '\\s*-->'));
      if (m) {
        const idx = src.indexOf(m[0]) + m[0].length;
        fs.writeFileSync(file, src.slice(0, idx) + '\n' + block + src.slice(idx), 'utf8');
        return { file: path.relative(ROOT, file), action: 'add-after:' + opts.after };
      }
    }
    return null;
  }
  const file = path.join(ROOT, opts.in || 'index.html');
  const src = fs.readFileSync(file, 'utf8');
  const idx = src.lastIndexOf('</body>');
  if (idx < 0) return null;
  fs.writeFileSync(file, src.slice(0, idx) + block + '\n' + src.slice(idx), 'utf8');
  return { file: path.relative(ROOT, file), action: 'add-before-</body>' };
}

function newSection(tag, title) {
  const safe = String(tag).replace(/[^\w-]/g, '-');
  const content = [
    '<section id="' + safe + '-section" data-tag="' + safe + '">',
    '  <h2>' + (title || safe) + '</h2>',
    '  <p>Conteúdo novo criado pelo sistema de tags — edite via tools/site-content.js set ' + safe + '.</p>',
    '</section>'
  ].join('\n');
  return addTag(safe, content, { in: 'index.html' });
}

// ---------- 5b. kit .env (conexão com a API do Vessie-AI) ----------
const ENV_PATH = path.join(ROOT, '.env');
const ENV_CONFIG_PATH = path.join(ROOT, 'js', 'env-config.js');
const ENV_DEFAULTS = {
  BASE_URL: 'http://localhost:1234/v1',
  API_KEY: 'lm-studio',
  MODEL: '',
  SITE_URL: '',
  BRIDGE_PORT: '8787',
  BRIDGE_TOKEN: ''
};

function parseEnv(text) {
  const out = {};
  String(text || '').split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i < 1) return;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  });
  return out;
}

function readEnvFile() {
  try { return parseEnv(fs.readFileSync(ENV_PATH, 'utf8')); } catch (e) { return {}; }
}

function envInit() {
  if (fs.existsSync(ENV_PATH)) return { action: 'ja existe', env: Object.assign({}, ENV_DEFAULTS, readEnvFile()) };
  const body = [
    '# .env — configuração da API do Vessie-AI (não commite este arquivo)',
    'BASE_URL=' + ENV_DEFAULTS.BASE_URL,
    'API_KEY=' + ENV_DEFAULTS.API_KEY,
    'MODEL=',
    'SITE_URL=' + detectSite({}).url,
    '# Ponte Vessie-AI ↔ PC (tools/vessie-bridge.js)',
    'BRIDGE_PORT=' + ENV_DEFAULTS.BRIDGE_PORT,
    'BRIDGE_TOKEN=' + crypto.randomBytes(16).toString('hex')
  ].join('\n') + '\n';
  fs.writeFileSync(ENV_PATH, body, 'utf8');
  return { action: 'criado', env: parseEnv(body) };
}

function envShow() {
  return Object.assign({}, ENV_DEFAULTS, readEnvFile());
}

function envSet(pair) {
  const s = String(pair || '');
  const i = s.indexOf('=');
  if (i < 1) return null;
  const env = readEnvFile();
  const key = s.slice(0, i).trim();
  env[key] = s.slice(i + 1).trim();
  fs.writeFileSync(ENV_PATH, Object.keys(env).map(k => k + '=' + env[k]).join('\n') + '\n', 'utf8');
  return { key, value: env[key] };
}

function envApply() {
  const env = Object.assign({}, ENV_DEFAULTS, readEnvFile());
  const cfg = {
    BASE_URL: env.BASE_URL || ENV_DEFAULTS.BASE_URL,
    API_KEY: env.API_KEY || ENV_DEFAULTS.API_KEY,
    MODEL: env.MODEL || '',
    SITE_URL: env.SITE_URL || '',
    BRIDGE_PORT: env.BRIDGE_PORT || ENV_DEFAULTS.BRIDGE_PORT,
    BRIDGE_TOKEN: env.BRIDGE_TOKEN || ''
  };
  const js = [
    '// js/env-config.js — GERADO por tools/site-content.js env-apply (não edite à mão).',
    '// Valores vêm do .env na raiz; sem .env, fica com os padrões abaixo.',
    'window.__VESSIE_ENV__ = ' + JSON.stringify(cfg, null, 2) + ';',
    ''
  ].join('\n');
  fs.writeFileSync(ENV_CONFIG_PATH, js, 'utf8');
  return { file: 'js/env-config.js', config: cfg };
}


// ---------- 6. comandos ----------
function contentFromArgs(args) {
  if (args['content-file']) return fs.readFileSync(path.resolve(ROOT, args['content-file']), 'utf8');
  if (args.content) return String(args.content);
  if (!process.stdin.isTTY) return fs.readFileSync(0, 'utf8');
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'help';
  const lines = ['args: ' + JSON.stringify(args)];
  let result = null, human = '';
  switch (cmd) {
    case 'detect': {
      result = detectSite(args);
      human = 'URL: ' + result.url + '\nAmbiente: ' + result.environment + '\nOrigem: ' + result.source + '\nPassos:\n- ' + result.steps.join('\n- ');
      break;
    }
    case 'list': {
      result = scanTags();
      human = result.length ? result.map(t => t.tag + '  [' + t.kind + ']  ' + t.file + '  (' + t.chars + ' chars)').join('\n') : 'Nenhuma tag encontrada.';
      break;
    }
    case 'get': {
      const r = readTag(args._[1]);
      if (!r) { console.error('Tag não encontrada: ' + args._[1]); log(cmd, ['ERRO: tag não encontrada: ' + args._[1]]); process.exit(1); }
      result = r; human = r.content;
      break;
    }
    case 'set': {
      const content = contentFromArgs(args);
      if (!content) { console.error('Sem conteúdo: use --content-file, --content ou pipe'); process.exit(1); }
      const r = writeTag(args._[1], content);
      if (!r) { console.error('Tag não encontrada: ' + args._[1]); process.exit(1); }
      result = r; human = '✓ set ' + args._[1] + ' em ' + r.file;
      break;
    }
    case 'add': {
      const content = contentFromArgs(args);
      if (!content) { console.error('Sem conteúdo: use --content-file, --content ou pipe'); process.exit(1); }
      const r = addTag(args._[1], content, { after: typeof args.after === 'string' ? args.after : null, in: typeof args.in === 'string' ? args.in : null });
      if (!r) { console.error('Falha ao adicionar a tag ' + args._[1]); process.exit(1); }
      result = r; human = '✓ add ' + args._[1] + ' em ' + r.file + ' (' + r.action + ')';
      break;
    }
    case 'new-section': {
      if (!args._[1]) { console.error('Uso: new-section <tag> [--title "Título"]'); process.exit(1); }
      const r = newSection(args._[1], typeof args.title === 'string' ? args.title : null);
      if (!r) { console.error('Falha ao criar a seção ' + args._[1]); process.exit(1); }
      result = Object.assign({ tag: args._[1] }, r);
      human = '✓ seção ' + args._[1] + ' criada em ' + r.file;
      break;
    }
    case 'env-init': { result = envInit(); human = '✓ .env ' + result.action + '\n' + Object.keys(result.env).map(k => k + '=' + result.env[k]).join('\n'); break; }
    case 'env-show': { result = envShow(); human = Object.keys(result).map(k => k + '=' + result[k]).join('\n'); break; }
    case 'env-set': {
      result = envSet(args._[1]);
      if (!result) { console.error('Uso: env-set CHAVE=valor'); process.exit(1); }
      human = '✓ ' + result.key + '=' + result.value;
      break;
    }
    case 'env-apply': { result = envApply(); human = '✓ js/env-config.js gerado\n' + JSON.stringify(result.config, null, 2); break; }
    default:
      human = [
        'Uso: node tools/site-content.js <comando> [opções]',
        '  detect [--url URL]              detecta a URL onde o site roda e o ambiente',
        '  list                            lista as tags do sistema',
        '  get <tag>                       mostra o conteúdo da tag',
        '  set <tag> --content-file a.html substitui o conteúdo da tag',
        '  add <tag> --after <tag2>        cria nova tag logo após outra',
        '  new-section <tag> --title "…"   monta seção nova no index.html',
        '  env-init                        cria o .env com os padrões da API do Vessie-AI',
        '  env-show                        mostra a configuração efetiva (.env + padrões)',
        '  env-set CHAVE=valor             altera uma chave do .env',
        '  env-apply                       gera js/env-config.js a partir do .env',
        'Ambiente: localhost | github-pages | custom',
        'Logs: tools/logs/<comando>-<data>.log'
      ].join('\n');
  }
  const logfile = log(cmd, lines.concat(['result: ' + JSON.stringify(result)]));
  console.log(human + '\n(log: ' + path.relative(ROOT, logfile) + ')');
}

main();


