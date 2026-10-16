/* PROMPT DE EDICAO: memory-core.js 1/4
   Nucleo Memory v2: arquivos + persistencia localStorage.
   Ex: Memory.putFile('a.txt','oi') | Memory.getFile('a.txt')
   Ordem: 1.estado 2.persist 3.files 4.(parte2: triggers/scripts) */
(function (global) {
'use strict';
var KEY = 'vessie-memory-v2';
var S = { files: {}, triggers: {}, scripts: {}, contents: {}, skills: {}, plugins: {}, mcps: {}, apis: {}, logs: [] };
function now() { return Date.now(); }
function safePath(p) {
  p = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (p.indexOf('..') !== -1) throw new Error('path com .. bloqueado');
  return p;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}
function restore() {
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return;
    var d = JSON.parse(raw);
    if (d.files) S.files = d.files;
    if (d.triggers) S.triggers = d.triggers;
    if (d.scripts) S.scripts = d.scripts;
    if (d.contents) S.contents = d.contents;
    if (d.skills) S.skills = d.skills;
    if (d.plugins) S.plugins = d.plugins;
    if (d.mcps) S.mcps = d.mcps;
    if (d.apis) S.apis = d.apis;
  } catch (e) {}
}
// Garante APIs de sistema sempre presentes (não sobrescreve se já existir)
function ensureSystemAPIs() {
  if (!S.apis) S.apis = {};
  if (!S.apis['pollinations-image']) {
    S.apis['pollinations-image'] = { url: 'https://image.pollinations.ai/prompt/', description: 'API pública de geração de imagens (gratuita, sem chave)', enabled: true, updated: Date.now() };
  }
  if (!S.apis['vessie-system']) {
    S.apis['vessie-system'] = { url: 'local://system-api', description: 'System API local (rotas, KV, arquivos)', enabled: true, updated: Date.now() };
  }
}
global.__memBase.ensureSystemAPIs = ensureSystemAPIs;
function log(msg, type) {
  S.logs.push({ t: now(), msg: String(msg), type: type || 'info' });
  if (S.logs.length > 300) S.logs = S.logs.slice(-300);
  try {
    var el = document.getElementById('memLog');
    if (el) { el.textContent = String(msg); }
  } catch (e) {}
}
function putFile(path, content, meta) {
  path = safePath(path);
  meta = meta || {};
  S.files[path] = { content: String(content == null ? '' : content), type: meta.type || 'text', author: meta.author || 'AI', updated: now() };
  persist(); log('salvo: ' + path);
  refreshUI();
  return S.files[path];
}
function getFile(path) { return S.files[safePath(path)] || null; }
function deleteFile(path) { delete S.files[safePath(path)]; persist(); refreshUI(); }
function listFiles() {
  return Object.keys(S.files).map(function (p) {
    return { path: p, size: S.files[p].content.length, author: S.files[p].author };
  });
}
function refreshUI() { try { if (global.MemoryUI) global.MemoryUI.refresh(); } catch (e) {} }
global.__memBase = { S: S, persist: persist, restore: restore, log: log, putFile: putFile, getFile: getFile, deleteFile: deleteFile, listFiles: listFiles, safePath: safePath, refreshUI: refreshUI, KEY: KEY };})(typeof window !== 'undefined' ? window : this);

/* PARTE 2/4: triggers + scripts + conteudos */
(function (global) {
'use strict';
var B = global.__memBase, S = B.S;
function addTrigger(name, cfg) {
  cfg = cfg || {};
  S.triggers[name] = { pattern: cfg.pattern || '', action: cfg.action || 'notify', script: cfg.script || null, category: cfg.category || 'geral', description: String(cfg.description || ''), api: cfg.api || null, enabled: cfg.enabled !== false, updated: Date.now() };
  B.persist(); B.log('trigger: ' + name); B.refreshUI();
  return S.triggers[name];
}
function removeTrigger(name) { delete S.triggers[name]; B.persist(); B.refreshUI(); }
function runAction(action, text, tname) {
  if (action === 'save-code') {
    var blocks = String(text).match(/```[\s\S]*?```/g) || [];
    blocks.forEach(function (b, i) {
      B.putFile('code/' + Date.now() + '-' + i + '.txt', b, { author: 'trigger:' + tname });
    });
    return { trigger: tname, saved: blocks.length };
  }
  if (action === 'save') {
    B.putFile('auto/' + Date.now() + '.txt', String(text), { author: 'trigger:' + tname });
    return { trigger: tname, saved: 1 };
  }
  if (action && action.indexOf('run:') === 0) {
    return global.Memory.runScript(action.slice(4), { text: text });
  }
  B.log('trigger ' + tname + ' notificou');
  return { trigger: tname, saved: 0 };
}
function fireTriggers(text) {
  var out = [];
  Object.keys(S.triggers).forEach(function (name) {
    var t = S.triggers[name];
    if (!t.enabled) return;
    if (t.pattern && String(text).indexOf(t.pattern) === -1) return;
    if (t.category === 'api') { out.push(fireApiTrigger(name, t)); return; }
    out.push(runAction(t.action, text, name));
  });
  return out;
}
// Categoria "api": busca a URL da API vinculada e salva a resposta em arquivo.
function fireApiTrigger(tname, t) {
  var api = (S.apis || {})[t.api];
  if (!api || api.enabled === false || !api.url) {
    B.log('trigger ' + tname + ': api ausente ou desativada');
    return { trigger: tname, saved: 0, error: 'api ausente' };
  }
  try {
    fetch(api.url, { method: 'GET' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (txt) {
      B.putFile('auto/trigger-' + tname + '-' + Date.now() + '.txt', String(txt).slice(0, 20000), { author: 'trigger:' + tname });
    }).catch(function (e) { B.log('trigger ' + tname + ' api erro: ' + (e && e.message)); });
  } catch (e) { return { trigger: tname, saved: 0, error: e.message }; }
  return { trigger: tname, saved: 0, api: t.api, pending: true };
}
function addScript(name, code, opts) {
  opts = opts || {};
  S.scripts[name] = { code: String(code), lang: opts.lang || 'js', desc: opts.desc || '', enabled: opts.enabled !== false, updated: Date.now() };
  B.persist(); B.refreshUI();
  return S.scripts[name];
}
function addContent(cat, text) {
  cat = String(cat || 'geral');
  if (!S.contents[cat]) S.contents[cat] = [];
  S.contents[cat].push({ text: String(text), t: Date.now() });
  B.persist(); B.refreshUI();
}
function getContent(cat) { return S.contents[cat] || []; }
// Skills: prompts reutilizáveis (nome, descrição, prompt, ativa)
function listSkills() {
  return Object.keys(S.skills).map(function (n) {
    return { name: n, description: S.skills[n].description || '', enabled: S.skills[n].enabled !== false, updated: S.skills[n].updated || 0 };
  });
}
function addSkill(name, cfg) {
  cfg = cfg || {};
  name = String(name || '').trim();
  if (!name) throw new Error('skill sem nome');
  S.skills[name] = { description: String(cfg.description || ''), prompt: String(cfg.prompt || ''), enabled: cfg.enabled !== false, updated: Date.now() };
  B.persist(); B.log('skill: ' + name); B.refreshUI();
  return S.skills[name];
}
function removeSkill(name) { delete S.skills[name]; B.persist(); B.refreshUI(); }
function setSkillEnabled(name, on) { if (S.skills[name]) { S.skills[name].enabled = !!on; B.persist(); B.refreshUI(); } }
// Plugins: extensões com código opcional executável
function listPlugins() {
  return Object.keys(S.plugins).map(function (n) {
    return { name: n, version: S.plugins[n].version || '1.0', description: S.plugins[n].description || '', enabled: S.plugins[n].enabled !== false, hasCode: !!S.plugins[n].code };
  });
}
function addPlugin(name, cfg) {
  cfg = cfg || {};
  name = String(name || '').trim();
  if (!name) throw new Error('plugin sem nome');
  S.plugins[name] = { version: String(cfg.version || '1.0'), description: String(cfg.description || ''), code: String(cfg.code || ''), enabled: cfg.enabled !== false, updated: Date.now() };
  B.persist(); B.log('plugin: ' + name); B.refreshUI();
  return S.plugins[name];
}
function removePlugin(name) { delete S.plugins[name]; B.persist(); B.refreshUI(); }
function setPluginEnabled(name, on) { if (S.plugins[name]) { S.plugins[name].enabled = !!on; B.persist(); B.refreshUI(); } }
// MCPs: registro de servidores Model Context Protocol (nome, comando/URL, descrição)
function listMCPs() {
  return Object.keys(S.mcps).map(function (n) {
    return { name: n, command: S.mcps[n].command || '', description: S.mcps[n].description || '', enabled: S.mcps[n].enabled !== false };
  });
}
function addMCP(name, cfg) {
  cfg = cfg || {};
  name = String(name || '').trim();
  if (!name) throw new Error('mcp sem nome');
  S.mcps[name] = { command: String(cfg.command || ''), description: String(cfg.description || ''), enabled: cfg.enabled !== false, updated: Date.now() };
  B.persist(); B.log('mcp: ' + name); B.refreshUI();
  return S.mcps[name];
}
function removeMCP(name) { delete S.mcps[name]; B.persist(); B.refreshUI(); }
function setMCPEnabled(name, on) { if (S.mcps[name]) { S.mcps[name].enabled = !!on; B.persist(); B.refreshUI(); } }
// APIs: endpoints/URLs que o modelo pode integrar e usar (nome, url, descrição)
function listAPIs() {
  return Object.keys(S.apis).map(function (n) {
    return { name: n, url: S.apis[n].url || '', description: S.apis[n].description || '', enabled: S.apis[n].enabled !== false };
  });
}
function addAPI(name, cfg) {
  cfg = cfg || {};
  name = String(name || '').trim();
  if (!name) throw new Error('api sem nome');
  var url = String(cfg.url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('URL inválida (use http:// ou https://)');
  S.apis[name] = { url: url, description: String(cfg.description || ''), enabled: cfg.enabled !== false, updated: Date.now() };
  B.persist(); B.log('api: ' + name); B.refreshUI();
  return S.apis[name];
}
function removeAPI(name) { delete S.apis[name]; B.persist(); B.refreshUI(); }
function setAPIEnabled(name, on) { if (S.apis[name]) { S.apis[name].enabled = !!on; B.persist(); B.refreshUI(); } }
global.__memPart2 = { addTrigger: addTrigger, removeTrigger: removeTrigger, fireTriggers: fireTriggers, addScript: addScript, addContent: addContent, getContent: getContent, listSkills: listSkills, addSkill: addSkill, removeSkill: removeSkill, setSkillEnabled: setSkillEnabled, listPlugins: listPlugins, addPlugin: addPlugin, removePlugin: removePlugin, setPluginEnabled: setPluginEnabled, listMCPs: listMCPs, addMCP: addMCP, removeMCP: removeMCP, setMCPEnabled: setMCPEnabled, listAPIs: listAPIs, addAPI: addAPI, removeAPI: removeAPI, setAPIEnabled: setAPIEnabled };
})(typeof window !== 'undefined' ? window : this);
/* PARTE 3/4: console JS seguro + parser .mem + VessieScript (Sys) */
(function (global) {
'use strict';
var B = global.__memBase;
var BLOCKED = ['fetch', 'XMLHttpRequest', 'document.write', 'location'];
// VessieScript: linguagem completa do sistema — JS seguro + API Sys.
// Sys: arquivos virtuais (Memory), KV local e log. Tudo 100% local.
function makeSys() {
  return {
    read: function (p) { var f = B.getFile(p); return f ? f.content : null; },
    write: function (p, c) { B.putFile(p, String(c == null ? '' : c), { author: 'sys' }); return p; },
    list: function (prefix) {
      return B.listFiles().map(function (f) { return f.path; })
        .filter(function (p) { return !prefix || p.indexOf(prefix) === 0; });
    },
    del: function (p) { B.deleteFile(p); return true; },
    get: function (k) { try { return localStorage.getItem('vessie-sys:' + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('vessie-sys:' + String(k), String(v)); } catch (e) {} return true; },
    log: function (m) { B.log('[sys] ' + m); return true; }
  };
}
function runJS(code, input) {
  code = String(code || '');
  for (var i = 0; i < BLOCKED.length; i++) {
    if (code.indexOf(BLOCKED[i]) !== -1) throw new Error('bloqueado: ' + BLOCKED[i]);
  }
  var M = global.Memory;
  var fn = new Function('Memory', 'Sys', 'input', '"use strict";' + code);
  return fn(M, makeSys(), input || {});
}
function parseMem(src) {
  var lines = String(src).split(/\r?\n/);
  var rep = { files: [], triggers: [], scripts: [], contents: [], runs: [] };
  var i = 0, cur = null, buf = [];
  function flush() {
    if (!cur) return;
    var text = buf.join('\n');
    if (cur.k === 'file') { B.putFile(cur.p, text, { author: 'mem' }); rep.files.push(cur.p); }
    if (cur.k === 'script') { global.__memPart2.addScript(cur.p, text, { lang: cur.l }); rep.scripts.push(cur.p); }
    if (cur.k === 'content') { global.__memPart2.addContent(cur.p, text); rep.contents.push(cur.p); }
    if (cur.k === 'run') { rep.runs.push(runJS(text, {})); }
    cur = null; buf = [];
  }
  for (; i < lines.length; i++) {
    var L = lines[i], m;
    if (!cur && (/^\s*(\/\/|#)/.test(L))) continue;
    if (!cur && (m = L.match(/^\s*@file\s+(.+)\s*$/))) { cur = { k: 'file', p: B.safePath(m[1].trim()) }; continue; }
    if (!cur && (m = L.match(/^\s*@script\s+(\S+)\s+lang\s+(\S+)/))) { cur = { k: 'script', p: m[1].trim(), l: m[2].trim() }; continue; }
    if (!cur && (m = L.match(/^\s*@content\s+(\S+)/))) { cur = { k: 'content', p: m[1].trim() }; continue; }
    if (!cur && (m = L.match(/^\s*@run\s+(js|mem)/))) { cur = { k: 'run', p: m[1] }; continue; }
    if (!cur && (m = L.match(/^\s*@trigger\s+(\S+)\s+when\s+"([^"]*)"\s+do\s+(\S+)/))) {
      global.__memPart2.addTrigger(m[1], { pattern: m[2], action: m[3] });
      rep.triggers.push(m[1]); continue;
    }
    if (/^\s*@end\s*$/.test(L)) { flush(); continue; }
    if (/^\s*@memory\s+/.test(L)) continue;
    if (cur) buf.push(L);
  }
  flush();
  return rep;
}
global.__memPart3 = { runJS: runJS, parseMem: parseMem, makeSys: makeSys };

// Garante APIs de sistema sempre presentes (fora dos IIFEs para ser global)
function ensureSystemAPIs() {
  var S = global.__memBase.S;
  if (!S.apis) S.apis = {};
  if (!S.apis['pollinations-image']) {
    S.apis['pollinations-image'] = { url: 'https://image.pollinations.ai/prompt/', description: 'API pública de geração de imagens (gratuita, sem chave)', enabled: true, updated: Date.now() };
  }
  if (!S.apis['vessie-system']) {
    S.apis['vessie-system'] = { url: 'local://system-api', description: 'System API local (rotas, KV, arquivos)', enabled: true, updated: Date.now() };
  }
}
})(typeof window !== 'undefined' ? window : this);

/* PARTE 4/4: fachada Memory + zip + IA */
(function (global) {
'use strict';
var B = global.__memBase, P2 = global.__memPart2, P3 = global.__memPart3;
B.restore();
B.ensureSystemAPIs();
var Memory = {
  putFile: B.putFile, getFile: B.getFile, deleteFile: B.deleteFile, listFiles: B.listFiles,
  addTrigger: P2.addTrigger, removeTrigger: P2.removeTrigger, fireTriggers: P2.fireTriggers,
  addScript: P2.addScript, addContent: P2.addContent, getContent: P2.getContent,
  listSkills: P2.listSkills, addSkill: P2.addSkill, removeSkill: P2.removeSkill, setSkillEnabled: P2.setSkillEnabled,
  listPlugins: P2.listPlugins, addPlugin: P2.addPlugin, removePlugin: P2.removePlugin, setPluginEnabled: P2.setPluginEnabled,
  listMCPs: P2.listMCPs, addMCP: P2.addMCP, removeMCP: P2.removeMCP, setMCPEnabled: P2.setMCPEnabled,
  listAPIs: P2.listAPIs, addAPI: P2.addAPI, removeAPI: P2.removeAPI, setAPIEnabled: P2.setAPIEnabled,
  runJS: P3.runJS, parseMem: P3.parseMem, makeSys: P3.makeSys,
  runRoute: function (name, args) { return runRoute(name, args); },
  runScript: function (name, input) {
    var s = B.S.scripts[name];
    if (!s) throw new Error('script nao existe: ' + name);
    if (s.enabled === false) throw new Error('script desativado: ' + name);
    if (s.lang === 'mem') return P3.parseMem(s.code);
    return P3.runJS(s.code, input || {});
  },
  exportZip: function () {
    var files = {}, paths = Object.keys(B.S.files);
    paths.forEach(function (p) { files[p] = B.S.files[p].content; });
    files['memory-manifest.json'] = JSON.stringify({ app: 'vessie-memory', v: 4, exported: new Date().toISOString(), triggers: B.S.triggers, scripts: B.S.scripts, contents: B.S.contents, skills: B.S.skills, plugins: B.S.plugins, mcps: B.S.mcps, apis: B.S.apis }, null, 2);
    var bytes = global.MemoryZip.write(files);
    var name = 'memory-' + Date.now() + '.zip';
    global.MemoryZip.download(bytes, name);
    return { name: name, bytes: bytes.length, count: paths.length };
  },
  importZip: function (uint8) {
    var files = global.MemoryZip.read(uint8);
    var n = 0;
    Object.keys(files).forEach(function (p) {
      if (p === 'memory-manifest.json') {
        try {
          var m = JSON.parse(files[p]);
          if (m.triggers) B.S.triggers = m.triggers;
          if (m.scripts) B.S.scripts = m.scripts;
          if (m.contents) B.S.contents = m.contents;
          if (m.skills) B.S.skills = m.skills;
          if (m.plugins) B.S.plugins = m.plugins;
          if (m.mcps) B.S.mcps = m.mcps;
          if (m.apis) B.S.apis = m.apis;
        } catch (e) {}
        return;
      }
      B.putFile(p, files[p], { author: 'zip' }); n++;
    });
    B.persist(); B.refreshUI();
    return { imported: n };
  },
  handleAiText: function (text) {
    var out = [];
    var rePut = /```memory:put:([^\s`]+)\s*\n([\s\S]*?)```/g, m;
    while ((m = rePut.exec(String(text)))) {
      B.putFile(m[1].trim(), m[2], { author: 'IA' });
      out.push({ type: 'put', path: m[1].trim() });
    }
    var reRun = /```memory:run\s*\n([\s\S]*?)```/g;
    while ((m = reRun.exec(String(text)))) {
      try { out.push({ type: 'run', result: String(P3.runJS(m[1], {})) }); }
      catch (e) { out.push({ type: 'run', error: e.message }); }
    }
    var reTri = /```memory:trigger:([^|\n`]+)\|([^|\n`]*)\|([^\s`|]+)(?:\|([^\n`|]*)\|([^\n`|]*)(?:\|([^\n`]*))?)?\s*```/g;
    while ((m = reTri.exec(String(text)))) {
      P2.addTrigger(m[1].trim(), { pattern: m[2].trim(), action: m[3].trim(), category: (m[4] || 'geral').trim() || 'geral', description: (m[5] || '').trim(), api: (m[6] || '').trim() || null });
      out.push({ type: 'trigger', name: m[1].trim() });
    }
    // API de imagem automática (Pollinations) — registrada sempre
    if (!S.apis['pollinations-image']) {
      S.apis['pollinations-image'] = { url: 'https://image.pollinations.ai/prompt/', description: 'API pública de geração de imagens (gratuita, sem chave)', enabled: true, updated: Date.now() };
    }
    var reApi = /```memory:api:([^\s`|]+)\|([^\n`]*)\n([\s\S]*?)```/g;
    while ((m = reApi.exec(String(text)))) {
      try {
        P2.addAPI(m[1].trim(), { url: m[2].trim(), description: m[3].replace(/\n$/, '') });
        out.push({ type: 'api', name: m[1].trim() });
      } catch (e) { out.push({ type: 'api', name: m[1].trim(), error: e.message }); }
    }
    var reSkill = /```memory:skill:([^\s`|]+)\|([^\n`]*)\n([\s\S]*?)```/g;
    while ((m = reSkill.exec(String(text)))) {
      P2.addSkill(m[1].trim(), { description: m[2].trim(), prompt: m[3].replace(/\n$/, '') });
      out.push({ type: 'skill', name: m[1].trim() });
    }
    var rePlug = /```memory:plugin:([^\s`|]+)\|([^\n`]*)\n([\s\S]*?)```/g;
    while ((m = rePlug.exec(String(text)))) {
      P2.addPlugin(m[1].trim(), { version: m[2].trim() || '1.0', description: m[3].replace(/\n$/, '') });
      out.push({ type: 'plugin', name: m[1].trim() });
    }
    var reMcp = /```memory:mcp:([^\s`|]+)\|([^\n`]*)\n([\s\S]*?)```/g;
    while ((m = reMcp.exec(String(text)))) {
      P2.addMCP(m[1].trim(), { command: m[2].trim(), description: m[3].replace(/\n$/, '') });
      out.push({ type: 'mcp', name: m[1].trim() });
    }
    var reMem = /```mem\s*\n([\s\S]*?)```/g;
    while ((m = reMem.exec(String(text)))) {
      out.push({ type: 'mem', report: P3.parseMem(m[1]) });
    }
    var reSysW = /```sys:write:([^\s`]+)\s*\n([\s\S]*?)```/g;
    while ((m = reSysW.exec(String(text)))) {
      B.putFile(m[1].trim(), m[2].replace(/\n$/, ''), { author: 'IA-sys' });
      out.push({ type: 'sys', action: 'write', path: m[1].trim() });
    }
    var reSysR = /```sys:read:([^\s`]+)\s*```/g;
    while ((m = reSysR.exec(String(text)))) {
      var f = B.getFile(m[1].trim());
      out.push({ type: 'sys', action: 'read', path: m[1].trim(), found: !!f });
    }
    P2.fireTriggers(String(text));
    return out;
  },
  stats: function () {
    return { files: Object.keys(B.S.files).length, triggers: Object.keys(B.S.triggers).length, scripts: Object.keys(B.S.scripts).length, cats: Object.keys(B.S.contents).length, skills: Object.keys(B.S.skills || {}).length, plugins: Object.keys(B.S.plugins || {}).length, mcps: Object.keys(B.S.mcps || {}).length, apis: Object.keys(B.S.apis || {}).length };
  },
  __raw: function () { return B.S; }
};
global.Memory = Memory;
})(typeof window !== 'undefined' ? window : this);

