// lineedit.js — Edição de scripts por linha.
// A IA edita sem reescrever o arquivo inteiro: ela raciocina (think) quais
// linhas mexer e emite blocos ```edit:arquivo:ini-fim``` com o novo conteúdo.
// Manual: botão "✏️ linhas" ao lado de cada script preenche o pedido;
// o painel lateral mostra o código numerado por linha.
//
// Formato do bloco (linhas 1-based, fim omitido = linha única):
//   ```edit:app.js:12-18
//   <novas linhas 12 a 18>
//   ```
(function (global) {
'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function baseName(p) {
  return String(p || '').split('/').pop().split('\\').pop().trim();
}
function toast(msg) {
  try {
    if (global.window && global.window.ui && global.window.ui.showToast) global.window.ui.showToast(msg);
  } catch (e) {}
}

// Extrai blocos ```edit:arquivo:ini-fim``` (ou ```edit:arquivo:linha```).
function parseEditBlocks(text) {
  var out = [], re = /```edit:([^`\n]*)\n?([\s\S]*?)```/g, m;
  while ((m = re.exec(String(text || '')))) {
    var spec = String(m[1] || '').trim();
    var range = spec.match(/:(\d+)(?:\s*-\s*(\d+))?\s*$/);
    if (!range) continue;
    var file = spec.slice(0, range.index).trim();
    if (!file) continue;
    var ini = parseInt(range[1], 10), fim = range[2] ? parseInt(range[2], 10) : ini;
    if (!(ini >= 1) || !(fim >= ini)) continue;
    out.push({ file: file, start: ini, end: fim, code: String(m[2] || '').replace(/\n$/, '') });
  }
  return out;
}

function store() {
  try { return (global.window && global.window.__vessieScripts) || []; }
  catch (e) { return []; }
}
function mem() {
  try { return (global.window && global.window.Memory) || null; }
  catch (e) { return null; }
}

// Localiza o alvo: 1º scripts abertos no chat, 2º scripts do Memory, 3º arquivos do Memory.
function findTarget(file) {
  var bn = baseName(file).toLowerCase();
  var st = store(), i;
  for (i = st.length - 1; i >= 0; i--) {
    var n = String((st[i] && st[i].name) || '');
    if (n.toLowerCase() === bn || baseName(n).toLowerCase() === bn) {
      return { kind: 'chat', index: i, entry: st[i] };
    }
  }
  var M = mem();
  if (M) {
    var raws = {};
    try { raws = M.__raw().scripts || {}; } catch (e) {}
    var keys = Object.keys(raws);
    for (i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === bn || baseName(keys[i]).toLowerCase() === bn) {
        var s = raws[keys[i]] || {};
        return { kind: 'mscript', key: keys[i], entry: { name: keys[i], lang: s.lang || 'txt', code: String(s.code || '') } };
      }
    }
    try {
      var files = M.listFiles() || [];
      for (i = 0; i < files.length; i++) {
        if (baseName(files[i].path).toLowerCase() === bn) {
          var f = M.getFile(files[i].path);
          if (f) return { kind: 'mfile', path: files[i].path, entry: { name: files[i].path, lang: 'txt', code: String(f.content || '') } };
        }
      }
    } catch (e) {}
  }
  return null;
}

// Aplica UMA edição por linha; retorna {ok,...}.
function applyEdit(b) {
  var t = findTarget(b.file);
  if (!t) return { ok: false, file: b.file, error: 'arquivo não encontrado no chat nem no Memory' };
  var lines = t.entry.code.split('\n');
  if (b.start > lines.length) {
    return { ok: false, file: t.entry.name, error: 'linha ' + b.start + ' fora do arquivo (' + lines.length + ' linhas)' };
  }
  var end = Math.min(b.end, lines.length);
  var fresh = String(b.code == null ? '' : b.code).split('\n');
  var next = lines.slice(0, b.start - 1).concat(fresh, lines.slice(end)).join('\n');
  var M = mem();
  try {
    if (t.kind === 'chat') {
      t.entry.code = next;
      if (global.window && global.window.__drawerItem === t.entry) {
        try { global.window.__drawerItem = t.entry; } catch (e) {}
      }
    } else if (t.kind === 'mscript' && M) {
      M.addScript(t.key, next, { lang: t.entry.lang, desc: 'editado por linha' });
    } else if (t.kind === 'mfile' && M) {
      M.putFile(t.path, next, { author: 'edit-linha' });
      var st = store();
      for (var i = st.length - 1; i >= 0; i--) {
        if (String((st[i] && st[i].name) || '').toLowerCase() === baseName(t.path).toLowerCase()) st[i].code = next;
      }
    }
  } catch (e) {
    return { ok: false, file: t.entry.name, error: String(e.message || e) };
  }
  return { ok: true, file: t.entry.name, start: b.start, end: end, lines: fresh.length };
}

// Aplica todos os blocos edit: do texto; usado após cada resposta da IA.
function handleEditBlocks(text) {
  var blocks = parseEditBlocks(text), out = [];
  blocks.forEach(function (b) { out.push(applyEdit(b)); });
  return out;
}

// Abre o arquivo atualizado no painel lateral (pelo nome).
function openFile(name) {
  var t = findTarget(name);
  if (!t) { toast('Arquivo não encontrado: ' + name); return false; }
  try {
    if (t.kind === 'chat' && global.window.openScriptIndex) {
      global.window.openScriptIndex(t.index);
    } else {
      var st = store();
      st.push({ name: baseName(t.entry.name), lang: t.entry.lang || 'txt', code: t.entry.code });
      if (global.window.openScriptIndex) global.window.openScriptIndex(st.length - 1);
      else toast('Painel ainda carregando…');
    }
    return true;
  } catch (e) { toast('Não foi possível abrir'); return false; }
}
function openFileBtn(btn) {
  var n = '';
  try { n = (btn.getAttribute('data-edit-file') || '').trim(); } catch (e) {}
  if (n) openFile(n);
}

// Monta o inventário dos scripts existentes para injetar no contexto da IA:
// ela reutiliza via edit: sem precisar que o usuário peça.
function contextInventory(maxChars) {
  maxChars = maxChars || 8000;
  var files = collectChat();
  if (!files.length) return '';
  var out = ['--- Scripts existentes nesta conversa (REUTILIZE: altere via edit:arquivo:ini-fim, nunca recrie do zero o que já existe) ---'];
  var used = 0;
  files.forEach(function (f) {
    var code = String(f.code || '');
    var lines = code.split('\n').length;
    var head = '- ' + f.name + ' (' + (f.lang || '') + ', ' + lines + ' linhas):';
    if (used + head.length + code.length > maxChars) {
      var room = Math.max(0, maxChars - used - head.length - 30);
      code = code.slice(0, room) + '\n…(cortado)';
    }
    used += head.length + code.length;
    out.push(head + '\n```' + (f.lang || '') + '\n' + code + '\n```');
    if (used >= maxChars) return;
  });
  return out.join('\n');
}

var LineEdit = {
  parseEditBlocks: parseEditBlocks,
  findTarget: findTarget,
  applyEdit: applyEdit,
  handleEditBlocks: handleEditBlocks,
  openFile: openFile,
  openFileBtn: openFileBtn,
  contextInventory: contextInventory
};
global.LineEdit = LineEdit;
if (typeof window !== 'undefined') window.LineEdit = LineEdit;
})(typeof window !== 'undefined' ? window : this);
