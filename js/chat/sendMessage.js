// sendMessage.js - Wrapper for sendMessage
import { state } from '../../state/state.js';
import { settings } from '../../config/config.js';
import { checkConnection } from '../api/connection.js';
import { saveState } from '../../state/state.js';
import { renderChat, renderSidebar } from './chat.js';
import { generate } from './send.js';

export async function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  const text = messageInput?.value.trim();
  const { state } = await import('../../state/state.js');
  const { settings } = await import('../../config/config.js');
  const { checkConnection } = await import('../api/connection.js');
  const { newChat, activeChat, saveState, renderSidebar } = await import('./chat.js');
  const { renderChat } = await import('./renderChat.js');
  const { sendMessage: generate } = await import('./send.js');

  const messageInput = document.getElementById('messageInput');
  const text = messageInput?.value.trim();
  const { state } = await import('../../state/state.js');

  if (!text || state.isGenerating) return;

  state.isGenerating = true;
  if (window.updateSendBtn) updateSendBtn();

  try {
    if (!state.activeChatId) { 
      const { newChat } = await import('./chat.js');
      newChat();
    }
    const chat = activeChat();
    if (!chat) return;
    if (!settings.model) {
      const ok = await checkConnection();
      if (!ok) return;
    }
    chat.messages.push({ role: 'user', content: text });
    if (chat.messages.length === 1) chat.title = text.substring(0, 50) + (text.length > 50 ? '…' : '');
    saveState();
    if (window.renderSidebar) renderSidebar();
    messageInput.value = '';
    autoResize();
    updateSendBtn();
    renderChat();
    await generate(chat);
  } finally { 
    const { state } = await import('../../state/state.js');
    state.isGenerating = false;
    if (window.updateSendBtn) updateSendBtn();
  }
}

export { sendMessage };