// chat/renderChat.js - Chat rendering functions
import { state } from '../../state/state.js';
import { settings } from '../../config/config.js';

function estimateTokens(text) { return Math.ceil((text || '').length / 4); }

export function activeChat() { return state.conversations.find(c => c.id === state.activeChatId); }
export function scrollBottom() { const chatArea = document.getElementById('chatArea'); if (chatArea) chatArea.scrollTop = chatArea.scrollHeight; }
export function updateTokenBadge() { const c = activeChat(); const n = c ? c.messages.reduce((a, m) => a + estimateTokens(m.content), 0) + estimateTokens(settings.system) : 0; const badge = document.getElementById('tokenBadge'); if (badge) badge.textContent = '~' + n.toLocaleString('pt-BR') + ' tok'; }
export { scrollBottom, updateTokenBadge, activeChat, estimateTokens };
