// api/connection.js - API connection and model management
import { settings } from '../../config/config.js';
import { state } from '../../state/state.js';
import { escapeHtml } from '../../chat/renderChat.js';

function setConn(status, text) {
  const dot = document.getElementById('connDot');
  if (dot) dot.className = 'dot' + (status === 'ok' ? ' ok' : status === 'err' ? ' err' : status === 'busy' ? ' busy' : '');
  const modelCircle = document.getElementById('modelStatusCircle');
  if (modelCircle) {
    modelCircle.className = 'model-status-circle ' + (status === 'ok' ? 'ok' : status === 'err' ? 'err' : status === 'busy' ? 'busy' : '');
  }
}

export async function api(path, opts = {}) {
  const { settings } = await import('../../config/config.js');
  const url = settings.baseUrl + path;
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (settings.apiKey) headers['Authorization'] = 'Bearer ' + settings.apiKey;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), settings.timeout * 1000);
  try {
    const r = await fetch(url, Object.assign({}, opts, { headers, signal: opts.signal || ctrl.signal }));
    return r;
  } finally { clearTimeout(t); }
}

/* ---------- Modelos customizÃ¡veis ---------- */
let allModels = [];
let modelMeta = { aliases: {}, hidden: [], custom: [], pins: [] };
let showHidden = false;

function saveModelMeta() { try { localStorage.setItem('lmchat_models', JSON.stringify(modelMeta)); } catch (e) { } }
function loadModelMeta() {
  try {
    const d = JSON.parse(localStorage.getItem('lmchat_models'));
    if (d && d.aliases) { modelMeta = Object.assign(modelMeta, d); }
  } catch (e) { }
}

function shortModelName(id) { return (id || '').split('/').pop().replace(/\.gguf$/i, '') || id; }
function displayName(id) { return modelMeta.aliases[id] || shortModelName(id); }
function persistSettings() { try { localStorage.setItem('lmchat_settings', JSON.stringify(settings)); } catch (e) { } }

function visibleModels() {
  const seen = new Set(), out = [];
  [...modelMeta.pins, ...modelMeta.custom, ...allModels].forEach(id => { if (id && !seen.has(id)) { seen.add(id); out.push(id); } });
  return out.filter(id => showHidden || !modelMeta.hidden.includes(id));
}

function selectModel(id) { 
  settings.model = id; 
  persistSettings(); 
  renderModelBtn(); 
  renderModelDrop(); 
}

function renderModelBtn() {
  const id = settings.model;
  const label = document.getElementById('modelBtnLabel');
  if (label) label.textContent = id ? displayName(id) : 'selecionar modeloâ€¦';
  const btn = document.getElementById('modelBtn');
  if (btn) btn.title = id || 'Escolher e customizar modelos';
}

function toggleModelDrop(e) {
  if (e) e.stopPropagation();
  const d = document.getElementById('modelDrop');
  const willOpen = !d.classList.contains('open');
  d.classList.toggle('open', willOpen);
  if (willOpen) { renderModelDrop(); setTimeout(() => document.getElementById('modelSearch').focus(), 50); }
}

function toggleHiddenModels() {
  showHidden = !showHidden;
  const toggle = document.getElementById('hiddenToggle');
  if (toggle) toggle.textContent = showHidden ? 'ðŸ™ˆ ocultar' : 'ðŸ‘ ocultos';
  renderModelDrop();
}

function addCustomModel() {
  const id = prompt('ID do modelo (igual ao exibido no LM Studio):');
  if (id && id.trim() && !modelMeta.custom.includes(id.trim())) {
    modelMeta.custom.push(id.trim());
    saveModelMeta();
    renderModelDrop();
  }
}

function renderModelDrop() {
  const q = (document.getElementById('modelSearch')?.value || '').toLowerCase();
  const box = document.getElementById('modelDropList'); 
  box.innerHTML = '';
  const list = visibleModels().filter(id => !q || id.toLowerCase().includes(q) || displayName(id).toLowerCase().includes(q));
  if (!list.length) { 
    box.innerHTML = '<div class="drop-empty">Nenhum modelo. Recarregue ðŸ”„ ou adicione manual ï¼‹.</div>'; 
    return; 
  }
  list.forEach(id => {
    const row = document.createElement('div');
    const isCur = id === settings.model, isHid = modelMeta.hidden.includes(id);
    row.className = 'model-row' + (isCur ? ' current' : '') + (isHid ? ' is-hidden' : '');
    row.title = id;
    const dot = document.createElement('span'); dot.className = 'm-dot';
    const info = document.createElement('span'); info.className = 'm-info';
    const nm = document.createElement('span'); nm.className = 'm-name'; 
    nm.textContent = (modelMeta.pins.includes(id) ? 'ðŸ“Œ ' : '') + displayName(id);
    const sub = document.createElement('span'); sub.className = 'm-id'; sub.textContent = id;
    info.appendChild(nm); info.appendChild(sub);
    const act = document.createElement('span'); act.className = 'm-actions';
    const mk = (t, fn, title) => {
      const b = document.createElement('button');
      b.className = 'mini-btn';
      b.title = title;
      b.textContent = t;
      b.onclick = e => { e.stopPropagation(); fn(); };
      return b;
    };
    act.appendChild(mk('âœï¸', () => { 
      const cur = modelMeta.aliases[id] || ''; 
      const v = prompt(`Apelido para:\n${id}`, cur); 
      if (v === null) return; 
      if (v.trim()) modelMeta.aliases[id] = v.trim(); 
      else delete modelMeta.aliases[id]; 
      saveModelMeta(); 
      renderModelBtn(); 
      renderModelDrop(); 
    }, 'Renomear (apelido)'));
    act.appendChild(mk('ðŸ“Œ', () => { 
      const i = modelMeta.pins.indexOf(id); 
      if (i >= 0) modelMeta.pins.splice(i, 1); 
      else modelMeta.pins.push(id); 
      saveModelMeta(); 
      renderModelDrop(); 
    }, 'Fixar no topo'));
    if (modelMeta.custom.includes(id)) act.appendChild(mk('ðŸ—‘', () => { 
      if (!confirm(`Remover "${id}" da lista?`)) return; 
      modelMeta.custom = modelMeta.custom.filter(x => x !== id); 
      if (settings.model === id) settings.model = visibleModels()[0] || ''; 
      persistSettings(); 
      saveModelMeta(); 
      renderModelBtn(); 
      renderModelDrop(); 
    }, 'Remover manual'));
    else act.appendChild(mk(isHid ? 'ðŸ‘' : 'ðŸš«', () => { 
      if (isHid) modelMeta.hidden = modelMeta.hidden.filter(x => x !== id); 
      else modelMeta.hidden.push(id); 
      saveModelMeta(); 
      renderModelBtn(); 
      renderModelDrop(); 
    }, isHid ? 'Mostrar' : 'Ocultar'));
    row.appendChild(dot); 
    row.appendChild(info); 
    row.appendChild(act); 
    row.onclick = () => { selectModel(id); document.getElementById('modelDrop').classList.remove('open'); };
    document.getElementById('modelDropList').appendChild(row);
  });
}

export async function checkConnection(silent) {
  setConn('busy', 'Conectandoâ€¦');
  try {
    const r = await api('/models');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const models = data.data || data.models || [];
    allModels = models.map(m => m.id || m.name).filter(Boolean);
    if (!allModels.length && !modelMeta.custom.length) {
      renderModelBtn(); renderModelDrop();
      setConn('err', 'Servidor ok, sem modelo â€” carregue um no LM Studio');
      return false;
    }
    const known = [...modelMeta.custom, ...allModels];
    if (!(settings.model && known.includes(settings.model))) { 
      settings.model = visibleModels()[0] || ''; 
      persistSettings(); 
    }
    renderModelBtn(); 
    renderModelDrop();
    setConn('ok', 'Conectado Â· ' + allModels.length + ' modelo(s)');
    return true;
  } catch (e) {
    console.warn(e);
    setConn('err', 'Desconectado â€” clique p/ configurar');
    if (!silent) showConnError(e);
    return false;
  }
}

export async function refreshModels() { await checkConnection(); }

function showConnError(e) {
  const chat = activeChat();
  const msg = `<div class="error-box"><b>âŒ NÃ£o consegui falar com o LM Studio</b> em <code>${escapeHtml(settings.baseUrl)}</code><br><br>
  â€¢ O LM Studio estÃ¡ aberto com o servidor ligado? (<b>Local Server â†’ Start Server</b>)<br>
  â€¢ <b>CORS</b> estÃ¡ ativado nas opÃ§Ãµes do servidor?<br>
  â€¢ Se este site estÃ¡ em <b>https</b> (GitHub Pages), o navegador pode bloquear <code>http://localhost</code> â€” use um tÃºnel https (ngrok/cloudflared) ou rode o site localmente.<br><br>
  <span style="opacity:.7">Detalhe tÃ©cnico: ${escapeHtml(e.message || e)}</span><br><br>
  <button class="btn" style="display:inline-flex" onclick="openModal('helpModal')">ðŸ“– Abrir guia de conexÃ£o</button></div>`;
  appendSystemMsg(msg, true);
}

/* ---------- chats ---------- */
function activeChat() { return state.conversations.find(c => c.id === state.activeChatId); }

function newChat() {
  const c = { id: Date.now().toString(), title: 'Nova conversa', messages: [], created: Date.now() };
  state.conversations.unshift(c); state.activeChatId = c.id;
  saveState(); renderSidebar(); renderChat(); toggleSidebar(false); messageInput.focus();
}

function switchChat(id) {
  state.activeChatId = id; saveState(); renderSidebar(); renderChat(); toggleSidebar(false);
}

function deleteChat(id) {
  if (!confirm('Excluir esta conversa?')) return;
  state.conversations = state.conversations.filter(c => c.id !== id);
  if (state.activeChatId === id) state.activeChatId = state.conversations.length ? state.conversations[0].id : null;
  saveState(); renderSidebar(); renderChat();
}

function clearCurrentChat() {
  const c = activeChat(); if (!c || state.isGenerating) return;
  if (!confirm('Apagar mensagens desta conversa?')) return;
  c.messages = []; saveState(); renderChat(); updateTokenBadge();
}

function startRename(id) {
  const chat = state.conversations.find(c => c.id === id); if (!chat) return;
  const name = prompt('Renomear conversa:', chat.title);
  if (name && name.trim()) { chat.title = name.trim().substring(0, 60); saveState(); renderSidebar(); }
}

export { setConn, api, checkConnection, refreshModels, showConnError, activeChat, newChat, switchChat, deleteChat, clearCurrentChat, startRename };
