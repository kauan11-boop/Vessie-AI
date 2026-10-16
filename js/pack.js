// pack.js — Empacotador ZIP: junta os scripts do chat + arquivos do Memory
// e baixa um .zip onde os .html abrem no navegador e os demais arquivos
// (css/js/img/...) vão junto no pacote, no mesmo nível (referências
// relativas como "style.css" e "app.js" continuam funcionando).
//
// Como a IA usa: ao pedir "empacote/zip", ela responde com os arquivos em
// blocos nomeados (```html:index.html ... ```, ```css:style.css ... ```,
// ```javascript:app.js ... ```) e finaliza com um bloco ```pack:nome```.
// O bloco pack vira botão de download (ver js/markdown.js).
// Manual: botão 📦 no topo ou window.VessiePack.downloadFromChat().
(function (global) {
'use strict';

var SPECIAL = { pack: 1, edit: 1, image: 1, memory: 1, sys: 1, api: 1 };
var LANG_EXT = {
  python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh', shell: 'sh',
  sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', cs: 'cs',
  go: 'go', rust: 'rs', rs: 'rs', ruby: 'rb', rb: 'rb', php: 'php',
  yaml: 'yml', yml: 'yml', xml: 'xml', markdown: 'md', md: 'md',
  text: 'txt', plaintext: 'txt', vessie: 'vessie'
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Extrai blocos de código que representam ARQUIVOS (com nome). Snippets sem
// nome (```python ... ``` puro) são ignorados — não viram arquivo no ZIP.
function parseFences(text) {
  var out = [];
  var re = /```([^\n`]*)\n?([\s\S]*?)```/g, m;
  while ((m = re.exec(String(text || '')))) {
    var raw = String(m[1] || '').trim();
    var head = raw.split(':')[0].trim().toLowerCase();
    if (SPECIAL[head]) continue;
    var lang = '', name = '';
    if (raw.indexOf(':') >= 0) {
      var parts = raw.split(':');
      lang = (parts[0] || '').trim().toLowerCase();
      name = parts.slice(1).join(':').trim();
    } else if (raw.indexOf('.') >= 0) {
      name = raw;
      var ext0 = raw.split('.').pop().toLowerCase();
      var back = {}; Object.keys(LANG_EXT).forEach(function (k) { back[LANG_EXT[k]] = k; });
      lang = back[ext0] || ext0;
    } else {
      continue; // sem nome de arquivo: snippet, não entra no pacote
    }
    if (!name || name.indexOf('.') < 0) continue;
    out.push({ name: baseName(name), lang: lang || 'txt', code: String(m[2] || '').replace(/\n$/, '') });
  }
  return out;
}

function baseName(p) {
  var b = String(p || '').split('/').pop().split('\\').pop().trim();
  b = b.replace(/\.\.+/g, '_').replace(/[<>:"|?*\x00-\x1F]/g, '_');
  return b.slice(0, 120) || 'arquivo.txt';
}

function getState() {
  try { return global.window && global.window.state ? global.window.state : (global.state || null); }
  catch (e) { return null; }
}

// Coleta os arquivos citados nos blocos de código da conversa.
function collectChat(chatId) {
  var st = getState();
  var chats = (st && st.conversations) || [];
  var chat = null;
  for (var i = 0; i < chats.length; i++) {
    if (chats[i].id === (chatId || (st && st.activeChatId))) { chat = chats[i]; break; }
  }
  if (!chat) return [];
  var byName = {}, order = [];
  (chat.messages || []).forEach(function (msg) {
    parseFences(msg.content).forEach(function (f) {
      if (!byName[f.name]) order.push(f.name);
      byName[f.name] = f; // último bloco com o mesmo nome vence
    });
  });
  return order.map(function (n) { return byName[n]; });
}

// Coleta arquivos + scripts salvos no Memory (não sobrescreve nomes do chat).
function collectMemory(skipNames) {
  var out = [];
  try {
    var M = global.window && global.window.Memory;
    if (!M) return out;
    (M.listFiles() || []).forEach(function (f) {
      var b = baseName(f.path);
      if (skipNames[b]) return;
      var got = M.getFile(f.path);
      var content = got && got.content != null ? String(got.content) : '';
      if (!content) return;
      skipNames[b] = 1;
      out.push({ name: b, lang: 'txt', code: content });
    });
    var raws = [];
    try { raws = M.__raw().scripts || {}; } catch (e) {}
    Object.keys(raws).forEach(function (n) {
      var s = raws[n] || {};
      if (!s.code) return;
      var file = String(n).indexOf('.') >= 0 ? String(n) : String(n) + '.' + (LANG_EXT[(s.lang || '').toLowerCase()] || 'txt');
      var b = baseName(file);
      if (skipNames[b]) return;
      skipNames[b] = 1;
      out.push({ name: b, lang: s.lang || 'txt', code: String(s.code) });
    });
  } catch (e) { /* Memory indisponível: só chat */ }
  return out;
}

function isHtml(n) { return /\.(html?)$/i.test(n); }
function isCss(n) { return /\.css$/i.test(n); }
function isJs(n) { return /\.js$/i.test(n); }

// Gera um index.html que inclui os .css/.js do pacote e lista os arquivos,
// para o pacote abrir algo útil mesmo quando a IA não criou nenhum .html.
function generatedIndex(files, packName) {
  var css = files.filter(function (f) { return isCss(f.name); });
  var js = files.filter(function (f) { return isJs(f.name); });
  var lis = files.filter(function (f) { return f.name !== 'index.html'; }).map(function (f) {
    return '    <li><a href="' + esc(f.name) + '">' + esc(f.name) + '</a></li>';
  }).join('\n');
  var links = css.map(function (f) { return '  <link rel="stylesheet" href="' + esc(f.name) + '">'; }).join('\n');
  var scripts = js.map(function (f) { return '  <script src="' + esc(f.name) + '"><\/script>'; }).join('\n');
  return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '  <title>' + esc(packName) + '</title>\n' + (links ? links + '\n' : '') + '</head>\n<body>\n' +
    '  <h1>' + esc(packName) + '</h1>\n  <p>Pacote gerado pela Vessie-AI. Arquivos inclusos:</p>\n  <ul>\n' + lis + '\n  </ul>\n' +
    (scripts ? scripts + '\n' : '') + '</body>\n</html>\n';
}

// Menu simples quando há vários .html mas nenhum se chama index.html.
function menuIndex(htmls, packName) {
  var lis = htmls.map(function (n) {
    return '    <li><a href="' + esc(n) + '">' + esc(n) + '</a></li>';
  }).join('\n');
  return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '  <title>' + esc(packName) + '</title>\n</head>\n<body>\n' +
    '  <h1>' + esc(packName) + '</h1>\n  <p>Escolha uma página:</p>\n  <ul>\n' + lis + '\n  </ul>\n</body>\n</html>\n';
}

// Monta o projeto: tudo no mesmo nível do ZIP para que os .html abram
// direto (duplo clique) com css/js/img conectados por caminho relativo.
function buildProject(files, packName) {
  packName = String(packName || 'vessie-pacote').trim() || 'vessie-pacote';
  var seen = {}, flat = [];
  files.forEach(function (f) {
    var b = baseName(f.name), base = b, n = 2;
    while (seen[b]) {
      var dot = base.lastIndexOf('.');
      b = (dot > 0 ? base.slice(0, dot) : base) + '(' + (n++) + ')' + (dot > 0 ? base.slice(dot) : '');
    }
    seen[b] = 1;
    flat.push({ name: b, code: String(f.code == null ? '' : f.code) });
  });
  var zf = {};
  flat.forEach(function (f) { zf[f.name] = f.code; });
  var htmls = flat.filter(function (f) { return isHtml(f.name); }).map(function (f) { return f.name; });
  if (!htmls.length) {
    zf['index.html'] = generatedIndex(flat, packName);
  } else if (!seen['index.html'] && !seen['INDEX.HTML']) {
    zf['index.html'] = menuIndex(htmls, packName);
  }
  var list = Object.keys(zf).map(function (n) { return ' - ' + n; }).join('\n');
  var entry = seen['index.html'] ? 'index.html (do pacote)' : 'index.html (menu gerado)';
  zf['README.txt'] = packName + ' — pacote gerado pela Vessie-AI\n\n' +
    'Como abrir: extraia o ZIP e dê duplo clique no index.html.\n' +
    'Ponto de entrada: ' + entry + '\n\nArquivos:\n' + list + '\n';
  return zf;
}

function toast(msg) {
  try {
    if (global.window && global.window.ui && global.window.ui.showToast) global.window.ui.showToast(msg);
    else if (typeof showToast === 'function') showToast(msg);
  } catch (e) {}
}

function downloadFromChat(chatId, packName) {
  var chatFiles = collectChat(chatId);
  var skip = {};
  chatFiles.forEach(function (f) { skip[f.name] = 1; });
  var memFiles = collectMemory(skip);
  var all = chatFiles.concat(memFiles);
  if (!all.length) { toast('Nada para empacotar: sem arquivos no chat nem no Memory'); return null; }
  var name = String(packName || 'vessie-pacote').trim() || 'vessie-pacote';
  var zf = buildProject(all, name);
  try {
    var bytes = global.window.MemoryZip.write(zf);
    global.window.MemoryZip.download(bytes, name + '.zip');
    toast('Pacote "' + name + '.zip" com ' + (Object.keys(zf).length - 1) + ' arquivo(s)');
  } catch (e) {
    toast('Falha ao gerar o ZIP');
    return null;
  }
  return { name: name, files: Object.keys(zf) };
}

var VessiePack = {
  parseFences: parseFences,
  collectChat: collectChat,
  collectMemory: collectMemory,
  buildProject: buildProject,
  downloadFromChat: downloadFromChat,
  downloadPackBtn: function (btn) {
    var n = '';
    try { n = (btn.getAttribute('data-pack') || '').trim(); } catch (e) {}
    if (!n || n === 'pacote') n = undefined;
    return downloadFromChat(undefined, n);
  }
};
global.VessiePack = VessiePack;
if (typeof window !== 'undefined') window.VessiePack = VessiePack;
})(typeof window !== 'undefined' ? window : this);
