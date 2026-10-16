// app.js - Ponto de entrada principal (único init da aplicação)
import { state } from './state.js?v=7';
import { Storage } from './storage.js?v=7';
import { ui } from './ui.js?v=7';
import { initElements, renderChat, sendMessage, cancelGeneration, checkLMStudioConnection, setupKeyboardShortcuts, autoResize, askSuggestion, regenerateImage, regenerateImageFromBlock, downloadImageUrl, copyImageUrl, __imgErr, editMessage, saveEdit, deleteMessage, resendMessage, regenerateFrom, copyMessage, continueResponse, generatingActive } from './chat.js?v=14';
import { Conversations, renderChatSidebar } from './conversations.js?v=7';
import { Settings, updateModelLabel } from './settings.js?v=7';
import { autoCorrect } from './spelling.js?v=7';
import { generateImage, buildImageUrl, downloadImage } from './image.js?v=7';
import { runSandbox, runVessieBlock } from './sandbox.js?v=7';
import { Simulite } from './simulite/SimuliteMessage.js?v=1';
import './telemetry.js?v=7';

// Expõe funções/objetos usados pelos onclick inline do HTML
window.ui = ui;
window.state = state;
window.Storage = Storage;
window.Settings = Settings;
window.Conversations = Conversations;
window.sendMessage = sendMessage;
window.autoCorrect = autoCorrect;
window.askSuggestion = askSuggestion;
window.regenerateImage = regenerateImage;
window.regenerateImageFromBlock = regenerateImageFromBlock;
window.downloadImageUrl = downloadImageUrl;
window.copyImageUrl = copyImageUrl;
window.__imgErr = __imgErr;
window.editMessage = editMessage;
window.saveEdit = saveEdit;
window.deleteMessage = deleteMessage;
window.resendMessage = resendMessage;
window.regenerateFrom = regenerateFrom;
window.continueResponse = continueResponse;
window.copyMessage = copyMessage;
window.runSandbox = runSandbox;
window.runVessieBlock = runVessieBlock;
window.generateImageFull = generateImage;
window.buildImageUrl = buildImageUrl;
window.downloadImageFull = downloadImage;
window.cancelGeneration = cancelGeneration;
window.renderChat = renderChat;
window.renderChatSidebar = renderChatSidebar;
window.Simulite = Simulite;
window.updateModelLabel = updateModelLabel;

document.addEventListener('DOMContentLoaded', () => {
  loadSavedState();
  migrateLegacyUndefinedKey();
  Storage.loadSettings();  Storage.loadConversations();
  initElements();
  applySavedParamsToInputs();
  renderChatSidebar();

  if (!state.activeChatId || !state.conversations.some(c => c.id === state.activeChatId)) {
    if (state.conversations.length) {
      state.activeChatId = state.conversations[0].id;
    } else {
      Storage.addConversation('Nova conversa');
    }
    renderChatSidebar();
  }
  renderChat();
  updateModelLabel();
  try { Simulite.init(); } catch (e) { console.warn('Simulite init falhou:', e); }
  try { if (window.Bridge) window.Bridge.init(); } catch (e) { console.warn('Bridge init falhou:', e); }
  setupKeyboardShortcuts();
  wireSendButton();
  wireTextarea();
  wireOverlay();

  const input = document.getElementById('messageInput');
  if (input) autoResize(input);

  ui.showToast('Vessie AI Chat pronto');

  const auto = document.getElementById('sAuto');
  const shouldAuto = !auto || auto.checked !== false;
  if (shouldAuto) {
    checkLMStudioConnection().then(ok => {
      if (ok) {
        updateModelLabel();
        Settings.loadModels();
      }
    });
  }

  setTimeout(() => ui.focusMessageInput(), 100);

  route();
  window.addEventListener('hashchange', route);
});

function route() {
  const raw = window.location.hash || '';
  let view = currentView();
  if (!view) {
    view = 'chat';
  }
  const canonical = '#/' + view;
  if (raw !== canonical) {
    window.location.hash = canonical;
    return;
  }
  applyView(view);
}

// Sistema de detecção de aba: 'chat' | 'memory' | 'api' | 'image'
function currentView() {
  const m = (window.location.hash || '').match(/^#\/?(chat|memory|api|image)\/?$/);
  return m ? m[1] : null;
}

function applyView(view) {
  const isMemory = view === 'memory';
  const isApi = view === 'api';
  const isImage = view === 'image';
  document.body.classList.toggle('view-memory', isMemory);
  document.body.classList.toggle('view-api', isApi);
  document.body.classList.toggle('view-image', isImage);
  document.body.dataset.view = view;
  // Leitura direta: window.AppView / window.getCurrentView()
  window.AppView = view;
  document.title = isMemory ? 'Memory Manager — Vessie AI Chat' : isApi ? 'System API — Vessie AI Chat' : isImage ? 'Gerador de Imagens — Vessie AI Chat' : 'Vessie AI Chat';
  // Sidebar nav active state
  document.querySelectorAll('.side-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.route === view);
  });
  if (isMemory) {
    // Garante a página com largura total (fecha drawer sobreposto)
    document.getElementById('codeDrawer')?.classList.remove('open');
    document.getElementById('drawerScrim')?.classList.remove('open');
    if (typeof window.renderMemoryManager === 'function') {
      window.renderMemoryManager();
    }
  }
  if (isApi && typeof window.toggleApiTab === 'function') {
    window.toggleApiTab('apis');
  }
  window.dispatchEvent(new CustomEvent('viewchange', { detail: { view } }));
}

window.getCurrentView = () => document.body.dataset.view || window.AppView || 'chat';

function loadSavedState() {
  const savedSidebar = localStorage.getItem('vessie-ai-sidebar');
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    if (savedSidebar === 'collapsed') {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
  }
  const savedTheme = localStorage.getItem('vessie-ai-theme');
  if (savedTheme) document.body.setAttribute('data-theme', savedTheme);
}

// Migra dados salvos pela versão com bug (chave literal "undefined")
function migrateLegacyUndefinedKey() {
  try {
    const raw = localStorage.getItem('undefined');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.conversations) && !localStorage.getItem('vessie-ai-chats')) {
        localStorage.setItem('vessie-ai-chats', raw);
      } else if (!Array.isArray(parsed) && !parsed.conversations && !localStorage.getItem('vessie-ai-settings')) {
        localStorage.setItem('vessie-ai-settings', raw);
      }
    }
    localStorage.removeItem('undefined');
  } catch (e) { /* ignora */ }
}

function applySavedParamsToInputs() {
  // Os parâmetros (temperatura, max tokens, system prompt) ficam na aba
  // Geral das configurações — sem inputs duplicados na área de digitação.
}

function wireSendButton() {
  const btn = document.getElementById('sendBtn');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => sendMessage());
  }
}

function wireTextarea() {
  const input = document.getElementById('messageInput');
  if (input && !input.dataset.autosize) {
    input.dataset.autosize = '1';
    input.addEventListener('input', () => autoResize(input));
  }
}

function wireOverlay() {
  const overlay = document.getElementById('overlay');
  if (overlay && !overlay.dataset.bound) {
    overlay.dataset.bound = '1';
    overlay.addEventListener('click', () => ui.toggleSidebar());
  }
}
