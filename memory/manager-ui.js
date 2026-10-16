/* manager-ui.js — UI completa do Memory Manager (página #/memory).
   Requer: memory-core.js (window.Memory). Expõe globais usadas pelo HTML:
   toggleMemTab, renderMemoryManager, viewMemoryFile, exportMemoryZip,
   importMemoryZip, openMemoryManager, memSearch, memShowForm, memHideForm,
   memSubmit, memApplySkill, memRunPlugin, memCheckMCP.
   Skills são 100% autônomas (criadas pela IA); plugins/MCPs/triggers via
   formulário próprio. Sem dependências de módulos. */
(function () {
'use strict';

/* ---------- Estado da UI ---------- */
var Q = { files: '', skills: '', plugins: '', mcps: '', apis: '', triggers: '', scripts: '' };
var ACTIVE_SKILL_KEY = 'vessie-active-skill';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function M() { return window.Memory || null; }
function toast(msg) {
  if (typeof window.showToast === 'function') window.showToast(msg);
}
function match(q, s) {
  return !q || String(s || '').toLowerCase().indexOf(q.toLowerCase()) !== -1;
}

/* ---------- Abas ---------- */
window.toggleMemTab = function (name) {
  document.querySelectorAll('#memoryPage .settings-tab').forEach(function (t) { t.classList.remove('active'); });
  document.querySelectorAll('#memoryPage .mem-pane').forEach(function (p) { p.style.display = 'none'; });
  var btn = document.querySelector('#memoryPage [onclick="toggleMemTab(\'' + name + '\')"]');
  if (btn) btn.classList.add('active');
  var pane = document.getElementById('memPage-' + name);
  if (pane) pane.style.display = 'block';
};

window.openMemoryManager = function () { location.hash = '#/memory'; };

/* ---------- Render geral ---------- */
window.renderMemoryManager = function () {
  var mem = M();
  var stats = document.getElementById('memPageStats');
  var panes = ['files', 'skills', 'plugins', 'mcps', 'triggers', 'scripts', 'view'];
  if (!mem) {
    if (stats) stats.textContent = 'Memory indisponível.';
    panes.forEach(function (p) {
      var el = document.getElementById('memPage-' + p);
      if (el) el.innerHTML = '<div class="empty-state">Memory não carregado.</div>';
    });
    return;
  }
  var st = { files: 0, skills: 0, plugins: 0, mcps: 0, apis: 0, triggers: 0, scripts: 0 };
  try { st = Object.assign(st, mem.stats()); } catch (e) {}
  if (stats) stats.textContent = st.files + ' arquivo(s) · ' + st.skills + ' skill(s) · ' + st.plugins + ' plugin(s) · ' + st.mcps + ' MCP(s) · ' + st.apis + ' API(s) · ' + st.triggers + ' trigger(s) · ' + st.scripts + ' script(s)';
  ['files', 'skills', 'plugins', 'mcps', 'apis', 'triggers', 'scripts'].forEach(function (k) {
    var badge = document.getElementById('memCount-' + k);
    if (badge) badge.textContent = st[k] || 0;
  });
  renderFilesPane();
  renderSkillsPane();
  renderPluginsPane();
  renderMCPsPane();
  renderAPIsPane();
  renderTriggersPane();
  renderScriptsPane();
};

function toolbar(kind, btnLabel) {
  return '<div class="mem-toolbar">' +
    '<input class="mem-search" placeholder="Buscar…" value="' + esc(Q[kind]) + '" oninput="memSearch(\'' + kind + '\', this.value)">' +
    (btnLabel ? '<button class="mini-btn" onclick="memShowForm(\'' + kind + '\')">＋ ' + btnLabel + '</button>' : '') +
    '</div><div class="mem-form" id="memForm-' + kind + '" style="display:none;"></div>';
}

/* ---------- Arquivos ---------- */
function renderFilesPane() {
  var pane = document.getElementById('memPage-files');
  if (!pane || !M()) return;
  var files = [];
  try { files = M().listFiles() || []; } catch (e) {}
  files = files.filter(function (f) { return match(Q.files, f.path); });
  var h = toolbar('files', null);
  h += files.length ? '' : '<div class="empty-state">Nenhum arquivo salvo ainda.<br>Todo script que a IA gerar é salvo aqui automaticamente.</div>';
  pane.innerHTML = h;
  files.forEach(function (f) {
    var row = document.createElement('div');
    row.className = 'mem-row';
    row.innerHTML = '<span class="mem-row-name">' + esc(f.path) + '</span><span class="mem-row-meta">' + f.size + ' chars</span>';
    row.appendChild(miniBtn('Ver', function () { viewMemoryFile(f.path); }));
    row.appendChild(miniBtn('Excluir', function () {
      if (confirm('Excluir "' + f.path + '"?')) { M().deleteFile(f.path); renderFilesPane(); refreshStats(); }
    }));
    pane.appendChild(row);
  });
}

window.viewMemoryFile = function (path) {
  var viewPane = document.getElementById('memPage-view');
  if (!viewPane || !M()) return;
  var file = null;
  try { file = M().getFile(path); } catch (e) {}
  if (!file) { toast('Arquivo não encontrado'); return; }
  document.querySelectorAll('#memoryPage .settings-tab').forEach(function (t) { t.classList.remove('active'); });
  document.querySelectorAll('#memoryPage .mem-pane').forEach(function (p) { p.style.display = 'none'; });
  viewPane.style.display = 'block';
  viewPane.innerHTML = '';
  var title = document.createElement('h4');
  title.textContent = path;
  var pre = document.createElement('pre');
  pre.className = 'prompt-block';
  pre.textContent = file.content;
  var backBtn = document.createElement('button');
  backBtn.className = 'btn';
  backBtn.textContent = 'Voltar';
  backBtn.style.marginTop = '12px';
  backBtn.onclick = function () { window.toggleMemTab('files'); };
  viewPane.appendChild(title);
  viewPane.appendChild(pre);
  viewPane.appendChild(backBtn);
};

/* ---------- Skills ---------- */
function renderSkillsPane() {
  var pane = document.getElementById('memPage-skills');
  if (!pane || !M()) return;
  var skills = [];
  try { skills = M().listSkills() || []; } catch (e) {}
  var active = null;
  try { active = localStorage.getItem(ACTIVE_SKILL_KEY); } catch (e) {}
  var shown = skills.filter(function (s) { return match(Q.skills, s.name + ' ' + s.description); });
  var h = toolbar('skills', null) + '<div class="mem-cards">';
  pane.innerHTML = h;
  var wrap = document.createElement('div');
  wrap.className = 'mem-cards';
  if (!shown.length) wrap.innerHTML = '<div class="empty-state">Nenhuma skill ainda.<br>A IA cria uma automaticamente a cada resposta — depois ative as que quiser usar.</div>';
  shown.forEach(function (s) {
    var card = document.createElement('div');
    card.className = 'mem-card';
    card.innerHTML = '<div class="mem-card-head"><b>' + esc(s.name) + '</b>' +
      (active === s.name ? '<span class="mem-badge">Em uso</span>' : '') + '</div>' +
      '<p>' + esc(s.description || 'Sem descrição') + '</p>';
    var full = null;
    try { full = M().__raw().skills[s.name]; } catch (e) {}
    var bar = document.createElement('div');
    bar.className = 'mem-card-actions';
    bar.appendChild(miniBtn(s.enabled ? 'Desativar' : 'Ativar', function () { M().setSkillEnabled(s.name, !s.enabled); window.renderMemoryManager(); }));
    bar.appendChild(miniBtn('Aplicar no chat', function () { memApplySkill(s.name); }));
    bar.appendChild(miniBtn('Excluir', function () {
      if (confirm('Excluir skill "' + s.name + '"?')) { M().removeSkill(s.name); window.renderMemoryManager(); }
    }));
    card.appendChild(bar);
    if (full && full.prompt) {
      var det = document.createElement('details');
      det.className = 'mem-details';
      det.innerHTML = '<summary>Ver prompt</summary>';
      var pre = document.createElement('pre');
      pre.className = 'prompt-block';
      pre.textContent = full.prompt;
      det.appendChild(pre);
      card.appendChild(det);
    }
    wrap.appendChild(card);
  });
  pane.appendChild(wrap);
}

window.memApplySkill = function (name) {
  try {
    var raw = M().__raw().skills[name];
    if (!raw || !raw.prompt) { toast('Skill sem prompt'); return; }
    if (window.state) window.state.settings.systemPrompt = raw.prompt;
    if (window.Storage) window.Storage.saveSettings();
    try { localStorage.setItem(ACTIVE_SKILL_KEY, name); } catch (e) {}
    toast('Skill "' + name + '" aplicada no chat');
    window.renderMemoryManager();
  } catch (e) { toast('Falha ao aplicar: ' + e.message); }
};

/* ---------- Plugins ---------- */
function renderPluginsPane() {
  var pane = document.getElementById('memPage-plugins');
  if (!pane || !M()) return;
  var plugins = [];
  try { plugins = M().listPlugins() || []; } catch (e) {}
  var shown = plugins.filter(function (p) { return match(Q.plugins, p.name + ' ' + p.description); });
  pane.innerHTML = toolbar('plugins', 'Novo plugin');
  var wrap = document.createElement('div');
  wrap.className = 'mem-cards';
  if (!shown.length) wrap.innerHTML = '<div class="empty-state">Nenhum plugin. Crie um ou instale do catálogo.</div>';
  shown.forEach(function (p) {
    var card = document.createElement('div');
    card.className = 'mem-card';
    card.innerHTML = '<div class="mem-card-head"><b>' + esc(p.name) + '</b><span class="mem-badge">v' + esc(p.version) + '</span>' +
      (p.enabled ? '' : '<span class="mem-badge off">off</span>') + '</div><p>' + esc(p.description || 'Sem descrição') + '</p>';
    var bar = document.createElement('div');
    bar.className = 'mem-card-actions';
    bar.appendChild(miniBtn(p.enabled ? 'Desativar' : 'Ativar', function () { M().setPluginEnabled(p.name, !p.enabled); window.renderMemoryManager(); }));
    if (p.hasCode) bar.appendChild(miniBtn('▶ Rodar', function () { memRunPlugin(p.name); }));
    bar.appendChild(miniBtn('Excluir', function () {
      if (confirm('Excluir plugin "' + p.name + '"?')) { M().removePlugin(p.name); window.renderMemoryManager(); }
    }));
    card.appendChild(bar);
    wrap.appendChild(card);
  });
  pane.appendChild(wrap);
}

window.memRunPlugin = function (name) {
  try {
    var raw = M().__raw().plugins[name];
    if (!raw || !raw.code) { toast('Plugin sem código'); return; }
    var r = M().runJS(raw.code, {});
    toast('▶ ' + name + ': ' + String(r).slice(0, 160));
  } catch (e) { toast('ERRO: ' + e.message); }
};

/* ---------- MCPs ---------- */
function renderMCPsPane() {
  var pane = document.getElementById('memPage-mcps');
  if (!pane || !M()) return;
  var mcps = [];
  try { mcps = M().listMCPs() || []; } catch (e) {}
  var shown = mcps.filter(function (m) { return match(Q.mcps, m.name + ' ' + m.command + ' ' + m.description); });
  pane.innerHTML = toolbar('mcps', 'Novo MCP');
  var wrap = document.createElement('div');
  wrap.className = 'mem-cards';
  if (!shown.length) wrap.innerHTML = '<div class="empty-state">Nenhum MCP registrado. Adicione um ou instale do catálogo.</div>';
  shown.forEach(function (mcp) {
    var card = document.createElement('div');
    card.className = 'mem-card';
    card.innerHTML = '<div class="mem-card-head"><b>' + esc(mcp.name) + '</b>' +
      (mcp.enabled ? '' : '<span class="mem-badge off">off</span>') + '</div>' +
      '<p>' + esc(mcp.description || 'Sem descrição') + '</p>' +
      '<code class="mem-code">' + esc(mcp.command) + '</code>';
    var bar = document.createElement('div');
    bar.className = 'mem-card-actions';
    bar.appendChild(miniBtn(mcp.enabled ? 'Desativar' : 'Ativar', function () { M().setMCPEnabled(mcp.name, !mcp.enabled); window.renderMemoryManager(); }));
    bar.appendChild(miniBtn('Verificar', function () { memCheckMCP(mcp.name); }));
    bar.appendChild(miniBtn('Excluir', function () {
      if (confirm('Excluir MCP "' + mcp.name + '"?')) { M().removeMCP(mcp.name); window.renderMemoryManager(); }
    }));
    card.appendChild(bar);
    wrap.appendChild(card);
  });
  pane.appendChild(wrap);
}

window.memCheckMCP = function (name) {
  try {
    var raw = M().__raw().mcps[name];
    if (!raw || !raw.command) { toast('MCP sem comando'); return; }
    toast('✓ "' + name + '" configurado. Rode o servidor: ' + raw.command.slice(0, 80));
  } catch (e) { toast('Falha: ' + e.message); }
};

/* ---------- APIs ---------- */
function renderAPIsPane() {
  var pane = document.getElementById('memPage-apis');
  if (!pane || !M()) return;
  var apis = [];
  try { apis = M().listAPIs() || []; } catch (e) {}
  var shown = apis.filter(function (a) { return match(Q.apis, a.name + ' ' + a.url + ' ' + a.description); });
  pane.innerHTML = toolbar('apis', 'Nova API');
  var wrap = document.createElement('div');
  wrap.className = 'mem-cards';
  if (!shown.length) wrap.innerHTML = '<div class="empty-state">Nenhuma API integrada.<br>A IA registra sozinha as URLs que citar — ou crie uma.</div>';
  shown.forEach(function (api) {
    var card = document.createElement('div');
    card.className = 'mem-card';
    card.innerHTML = '<div class="mem-card-head"><b>' + esc(api.name) + '</b>' +
      (api.enabled ? '' : '<span class="mem-badge off">off</span>') + '</div>' +
      '<p>' + esc(api.description || 'Sem descrição') + '</p>' +
      '<code class="mem-code">' + esc(api.url) + '</code>';
    var bar = document.createElement('div');
    bar.className = 'mem-card-actions';
    bar.appendChild(miniBtn(api.enabled ? 'Desativar' : 'Ativar', function () { M().setAPIEnabled(api.name, !api.enabled); window.renderMemoryManager(); }));
    bar.appendChild(miniBtn('Testar', function () { memTestAPI(api.name); }));
    bar.appendChild(miniBtn('Excluir', function () {
      if (confirm('Excluir API "' + api.name + '"?')) { M().removeAPI(api.name); window.renderMemoryManager(); }
    }));
    card.appendChild(bar);
    wrap.appendChild(card);
  });
  pane.appendChild(wrap);
}

window.memTestAPI = function (name) {
  try {
    var raw = M().__raw().apis[name];
    if (!raw || !raw.url) { toast('API sem URL'); return; }
    toast('Testando "' + name + '"…');
    var ctrl = new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 10000);
    fetch(raw.url, { method: 'GET', mode: 'no-cors', signal: ctrl.signal }).then(function () {
      clearTimeout(timer);
      toast('✓ "' + name + '" alcançável');
    }).catch(function (e) {
      clearTimeout(timer);
      toast('✗ "' + name + '" inacessível: ' + (e && e.message));
    });
  } catch (e) { toast('Falha: ' + e.message); }
};

/* ---------- Triggers / Scripts ---------- */
function renderTriggersPane() {
  var pane = document.getElementById('memPage-triggers');
  if (!pane || !M()) return;
  var raw = {};
  try { raw = M().__raw() || {}; } catch (e) {}
  var names = Object.keys(raw.triggers || {}).filter(function (n) {
    var t = raw.triggers[n] || {};
    return match(Q.triggers, n + ' ' + (t.pattern || '') + ' ' + (t.action || '') + ' ' + (t.category || '') + ' ' + (t.description || ''));
  });
  pane.innerHTML = toolbar('triggers', 'Novo trigger');
  if (!names.length) pane.innerHTML += '<div class="empty-state">Nenhum trigger criado. A IA cria sozinha quando preciso — ou crie um.</div>';
  var catName = { geral: 'Geral', salvar: 'Salvamento', api: 'API' };
  names.forEach(function (n) {
    var t = raw.triggers[n] || {};
    var cat = t.category || 'geral';
    var row = document.createElement('div');
    row.className = 'mem-row';
    row.innerHTML = '<span class="mem-row-name">' + esc(n) + '</span>' +
      '<span class="mem-badge">' + esc(catName[cat] || cat) + '</span>' +
      '<span class="mem-row-meta">' + esc(t.pattern || '') + ' → ' + esc(cat === 'api' && t.api ? 'API:' + t.api : (t.action || '')) + '</span>';
    if (t.description) {
      var desc = document.createElement('div');
      desc.className = 'mem-row-desc';
      desc.textContent = t.description;
      row.appendChild(desc);
    }
    row.appendChild(miniBtn(t.enabled === false ? 'Ativar' : 'Desativar', function () {
      M().addTrigger(n, { pattern: t.pattern, action: t.action, category: cat, description: t.description, api: t.api, enabled: t.enabled === false });
      window.renderMemoryManager();
    }));
    row.appendChild(miniBtn('Remover', function () {
      if (confirm('Remover trigger "' + n + '"?')) { M().removeTrigger(n); window.renderMemoryManager(); }
    }));
    pane.appendChild(row);
  });
}

function renderScriptsPane() {
  var pane = document.getElementById('memPage-scripts');
  if (!pane || !M()) return;
  var raw = {};
  try { raw = M().__raw() || {}; } catch (e) {}
  var names = Object.keys(raw.scripts || {}).filter(function (n) { return match(Q.scripts, n); });
  pane.innerHTML = toolbar('scripts', null);
  if (!names.length) pane.innerHTML += '<div class="empty-state">Nenhum script salvo. A IA cria via blocos ```mem com @script.</div>';
  names.forEach(function (n) {
    var row = document.createElement('div');
    row.className = 'mem-row';
    row.innerHTML = '<span class="mem-row-name">' + esc(n) + '</span>';
    row.appendChild(miniBtn('▶ Rodar', function () {
      try { toast('▶ ' + n + ': ' + String(M().runScript(n, {})).slice(0, 160)); }
      catch (e) { toast('ERRO: ' + e.message); }
    }));
    pane.appendChild(row);
  });
}

function refreshStats() {
  try {
    var st = M().stats();
    var el = document.getElementById('memPageStats');
    if (el) el.textContent = st.files + ' arquivo(s) · ' + st.skills + ' skill(s) · ' + st.plugins + ' plugin(s) · ' + st.mcps + ' MCP(s) · ' + st.apis + ' API(s) · ' + st.triggers + ' trigger(s) · ' + st.scripts + ' script(s)';
    ['files', 'skills', 'plugins', 'mcps', 'apis', 'triggers', 'scripts'].forEach(function (k) {
      var badge = document.getElementById('memCount-' + k);
      if (badge) badge.textContent = st[k] || 0;
    });
  } catch (e) {}
}

/* ---------- Busca + formulários ---------- */
window.memSearch = function (kind, value) {
  Q[kind] = value || '';
  if (kind === 'files') renderFilesPane();
  if (kind === 'skills') renderSkillsPane();
  if (kind === 'plugins') renderPluginsPane();
  if (kind === 'mcps') renderMCPsPane();
  if (kind === 'apis') renderAPIsPane();
  if (kind === 'triggers') renderTriggersPane();
  if (kind === 'scripts') renderScriptsPane();
  // mantém o foco no campo de busca
  var inputs = document.querySelectorAll('#memoryPage .mem-search');
  inputs.forEach(function (inp) {
    if (inp.value === (value || '') && document.activeElement !== inp) {
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
    }
  });
};

window.memShowForm = function (kind) {
  var box = document.getElementById('memForm-' + kind);
  if (!box) return;
  var fields = '';
  if (kind === 'plugins') fields = fld('Nome', 'memF-name', '') + fld('Versão', 'memF-version', '1.0') + fld('Descrição', 'memF-desc', '') + tarea('Código JS (opcional)', 'memF-code', '');
  if (kind === 'mcps') fields = fld('Nome', 'memF-name', '') + fld('Comando/URL', 'memF-command', '') + fld('Descrição', 'memF-desc', '');
  if (kind === 'apis') fields = fld('Nome', 'memF-name', '') + fld('URL (http:// ou https://)', 'memF-url', 'https://') + fld('Descrição', 'memF-desc', '');
  if (kind === 'triggers') {
    var apis = [];
    try { apis = M().listAPIs() || []; } catch (e) {}
    var opts = apis.map(function (a) { return '<option value="' + esc(a.name) + '">' + esc(a.name) + '</option>'; }).join('');
    fields = fld('Nome', 'memF-name', '') +
      '<label class="mem-label">Categoria<select id="memF-category" onchange="memTriggerCat()">' +
      '<option value="geral">Geral (notificar)</option>' +
      '<option value="salvar">Salvamento (guarda texto/código)</option>' +
      '<option value="api">API (ativa e utiliza uma API)</option></select></label>' +
      fld('Padrão (quando o texto contém…)', 'memF-pattern', '') +
      '<div id="memF-apiRow" style="display:none;"><label class="mem-label">API vinculada<select id="memF-api">' + opts + '</select></label></div>' +
      fld('Ação (save | save-code | notify | run:script)', 'memF-action', 'notify') +
      fld('Descrição (obrigatória na categoria API)', 'memF-desc', '');
  }
  box.innerHTML = fields +
    '<div class="mem-card-actions"><button class="mini-btn" onclick="memSubmit(\'' + kind + '\')">Salvar</button>' +
    '<button class="mini-btn" onclick="memHideForm(\'' + kind + '\')">Cancelar</button></div>';
  box.style.display = 'block';
};

window.memTriggerCat = function () {
  var cat = document.getElementById('memF-category');
  var row = document.getElementById('memF-apiRow');
  if (row) row.style.display = (cat && cat.value === 'api') ? 'block' : 'none';
};

window.memHideForm = function (kind) {
  var box = document.getElementById('memForm-' + kind);
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
};

window.memSubmit = function (kind) {
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  try {
    if (kind === 'plugins') {
      if (!val('memF-name')) { toast('Preencha o nome'); return; }
      M().addPlugin(val('memF-name'), { version: val('memF-version') || '1.0', description: val('memF-desc'), code: val('memF-code') });
    } else if (kind === 'mcps') {
      if (!val('memF-name') || !val('memF-command')) { toast('Preencha nome e comando'); return; }
      M().addMCP(val('memF-name'), { command: val('memF-command'), description: val('memF-desc') });
    } else if (kind === 'triggers') {
      if (!val('memF-name')) { toast('Preencha o nome'); return; }
      var cat = (document.getElementById('memF-category') || {}).value || 'geral';
      var apiName = (document.getElementById('memF-api') || {}).value || null;
      if (cat === 'api') {
        if (!apiName) { toast('Escolha a API a vincular'); return; }
        if (!val('memF-desc')) { toast('Descreva o que este trigger faz com a API'); return; }
      }
      M().addTrigger(val('memF-name'), { pattern: val('memF-pattern'), action: val('memF-action') || 'notify', category: cat, description: val('memF-desc'), api: cat === 'api' ? apiName : null });
    } else if (kind === 'apis') {
      if (!val('memF-name') || !val('memF-url')) { toast('Preencha nome e URL'); return; }
      M().addAPI(val('memF-name'), { url: val('memF-url'), description: val('memF-desc') });
    }
    toast('✓ Salvo');
    window.renderMemoryManager();
  } catch (e) { toast('Falha: ' + e.message); }
};

function fld(label, id, ph) {
  return '<label class="mem-label">' + esc(label) + '<input id="' + id + '" placeholder="' + esc(ph) + '"></label>';
}
function tarea(label, id, ph) {
  return '<label class="mem-label">' + esc(label) + '<textarea id="' + id + '" rows="4" placeholder="' + esc(ph) + '"></textarea></label>';
}

function miniBtn(label, fn) {
  var b = document.createElement('button');
  b.className = 'mini-btn';
  b.textContent = label;
  b.onclick = fn;
  return b;
}

/* ---------- Zip ---------- */
window.exportMemoryZip = function () {
  if (!M()) { toast('Memory indisponível'); return; }
  try {
    var info = M().exportZip();
    toast('ZIP exportado: ' + info.count + ' arquivo(s)');
  } catch (e) { toast('Falha ao exportar: ' + e.message); }
};

window.importMemoryZip = function (event) {
  var file = event && event.target && event.target.files && event.target.files[0];
  if (!file) return;
  if (!M()) { toast('Memory indisponível'); return; }
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var rep = M().importZip(new Uint8Array(reader.result));
      window.renderMemoryManager();
      toast('ZIP importado: ' + rep.imported + ' arquivo(s)');
    } catch (e) { toast('Falha ao importar: ' + e.message); }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
};

})();
