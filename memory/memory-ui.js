/* PROMPT DE EDICAO: memory/memory-ui.js 1/2
   Interface da pasta virtual Memory: painel + abas + console.
   Ex: MemoryUI.refresh() redesenha arquivos/triggers/scripts.
   Ordem: 1.painel 2.abas 3.console/arquivos 4.refresh */
(function (global) {
'use strict';
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function ensurePanel() {
  if (document.getElementById('memPanel')) return;
  var d = document.createElement('div');
  d.id = 'memPanel';
  d.className = 'mem-panel';
  d.innerHTML = '<div class="mem-head"><b>Memory</b><span id="memLog">pronto</span><button id="memClose">x</button></div>'
    + '<div class="mem-tabs"><button data-t="files">Arquivos</button><button data-t="console">Console</button><button data-t="triggers">Triggers</button><button data-t="reuse">Reuso</button></div>'
    + '<div class="mem-body"><div id="memFiles"></div><div id="memConsole" style="display:none"><textarea id="memInput" rows="4" placeholder="JS sandbox. Ex: Memory.putFile(\'a.txt\',\'oi\'); \'ok\'"></textarea><br><button id="memRun">Executar</button><button id="memZip">Exportar .zip</button><input type="file" id="memZipIn" accept=".zip"><pre id="memOut"></pre></div><div id="memTriggers" style="display:none"></div><div id="memReuse" style="display:none"></div></div>';
  document.body.appendChild(d);
  var close = document.getElementById('memClose');
  if (close) close.onclick = function () { d.classList.remove('open'); };
  var tabs = d.querySelectorAll('.mem-tabs button');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].onclick = (function (t) {
      return function () {
        var ids = ['files', 'console', 'triggers', 'reuse'];
        for (var j = 0; j < ids.length; j++) {
          var el = document.getElementById('mem' + ids[j][0].toUpperCase() + ids[j].slice(1));
          if (el) el.style.display = ids[j] === t ? 'block' : 'none';
        }
        if (t === 'reuse') renderReuse();
        if (t === 'files' || t === 'triggers') refresh();
      };
    })(tabs[i].getAttribute('data-t'));
  }
  var run = document.getElementById('memRun');
  if (run) run.onclick = function () {
    var code = document.getElementById('memInput').value;
    var out = document.getElementById('memOut');
    try { out.textContent = String(global.Memory.runJS(code, {})); }
    catch (e) { out.textContent = 'ERRO: ' + e.message; }
  };
  var zip = document.getElementById('memZip');
  if (zip) zip.onclick = function () {
    var info = global.Memory.exportZip();
    var out = document.getElementById('memOut');
    if (out) out.textContent = 'ZIP: ' + info.name + ' (' + info.bytes + ' bytes)';
  };
  var zin = document.getElementById('memZipIn');
  if (zin) zin.onchange = function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var rep = global.Memory.importZip(new Uint8Array(r.result));
      var out = document.getElementById('memOut');
      if (out) out.textContent = 'importados: ' + rep.imported;
      refresh();
    };
    r.readAsArrayBuffer(f);
  };
}
function refresh() {
  ensurePanel();
  renderFiles(); renderTriggers();
}
function renderFiles() {
  var box = document.getElementById('memFiles');
  if (!box || !global.Memory) return;
  var files = global.Memory.listFiles();
  if (!files.length) { box.innerHTML = '<p class="mem-empty">Vazio. IA pode salvar com ```memory:put:nome ```</p>'; return; }
  var h = '<div class="mem-list">';
  files.forEach(function (f) {
    h += '<div class="mem-item"><span>' + esc(f.path) + ' (' + f.size + 'b)</span><button data-v="' + esc(f.path) + '">ver</button><button data-r="' + esc(f.path) + '">reusar</button><button data-d="' + esc(f.path) + '">x</button></div>';
  });
  box.innerHTML = h + '</div>';
  var btns = box.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    (function (b) {
      b.onclick = function () {
        var M = global.Memory;
        if (b.hasAttribute('data-v')) { var f = M.getFile(b.getAttribute('data-v')); alert(f ? f.content.slice(0, 2000) : '(vazio)'); }
        if (b.hasAttribute('data-d')) { if (confirm('excluir?')) M.deleteFile(b.getAttribute('data-d')); }
        if (b.hasAttribute('data-r')) { reuseFile(b.getAttribute('data-r')); }
      };
    })(btns[i]);
  }
}
function reuseFile(path) {
  var f = global.Memory.getFile(path);
  if (!f) return;
  var input = document.getElementById('messageInput');
  if (input) { input.value = 'Reutilize este conteudo de ' + path + ':\n\n' + f.content.slice(0, 4000); input.focus(); }
  var p = document.getElementById('memPanel');
  if (p) p.classList.remove('open');
}
function renderTriggers() {
  var box = document.getElementById('memTriggers');
  if (!box || !global.Memory) return;
  box.innerHTML = '<button id="memNewTri">+ trigger</button><div id="memTriList"></div><hr><button id="memNewScript">+ script</button><div id="memScriptList"></div>';
  paintTriScript();
  document.getElementById('memNewTri').onclick = function () {
    var n = prompt('nome do trigger:'); if (!n) return;
    var p = prompt('padrao (texto que dispara):', '```'); if (p == null) return;
    var a = prompt('acao: save | save-code | notify | run:nomescript', 'save-code'); if (!a) return;
    global.Memory.addTrigger(n, { pattern: p, action: a });
    paintTriScript();
  };
  document.getElementById('memNewScript').onclick = function () {
    var n = prompt('nome do script:'); if (!n) return;
    var c = prompt('codigo JS (use return ...):', 'return "ok";'); if (!c) return;
    global.Memory.addScript(n, c, { lang: 'js' });
    paintTriScript();
  };
}
global.__memUI1 = { ensurePanel: ensurePanel, refresh: refresh, renderFiles: renderFiles, renderTriggers: renderTriggers, reuseFile: reuseFile };
})(typeof window !== 'undefined' ? window : this);
/* PARTE 2/2: reuso + boot */
(function (global) {
'use strict';
function paintTriScript() {
  var M = global.Memory;
  var tl = document.getElementById('memTriList');
  if (tl) {
    var names = Object.keys(M.__raw().triggers);
    tl.innerHTML = names.length ? names.map(function (n) { return '<div class="mem-item"><span>TRIGGER ' + n + '</span></div>'; }).join('') : '<p class="mem-empty">sem triggers</p>';
  }
  var sl = document.getElementById('memScriptList');
  if (sl) {
    var sn = Object.keys(M.__raw().scripts);
    var h = sn.length ? '' : '<p class="mem-empty">sem scripts</p>';
    sn.forEach(function (n) {
      h += '<div class="mem-item"><span>SCRIPT ' + n + '</span><button data-s="' + n + '">rodar</button></div>';
    });
    sl.innerHTML = h;
    var btns = sl.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = (function (b) {
        return function () {
          try { alert(String(M.runScript(b.getAttribute('data-s'), {}))); }
          catch (e) { alert('ERRO: ' + e.message); }
        };
      })(btns[i]);
    }
  }
}
function renderReuse() {
  var box = document.getElementById('memReuse');
  if (!box) return;
  var M = global.Memory;
  var files = M.listFiles();
  var h = '<p>1 clique para jogar o conteudo no chat:</p><div class="mem-list">';
  files.forEach(function (f) {
    h += '<div class="mem-item"><span>' + f.path + '</span><button data-r="' + f.path + '">reusar</button></div>';
  });
  box.innerHTML = h + '</div>';
  var btns = box.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    btns[i].onclick = (function (b) {
      return function () { global.__memUI1.reuseFile(b.getAttribute('data-r')); };
    })(btns[i]);
  }
}
global.__memUI2 = { paintTriScript: paintTriScript, renderReuse: renderReuse };
global.MemoryUI = { refresh: function () { global.__memUI1.refresh(); }, open: function () { global.__memUI1.ensurePanel(); document.getElementById('memPanel').classList.add('open'); } };
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    try { global.__memUI1.ensurePanel(); } catch (e) {}
  });
}
})(typeof window !== 'undefined' ? window : this);

