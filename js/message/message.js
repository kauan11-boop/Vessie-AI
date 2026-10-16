// message/message.js - Message utilities
import { escapeHtml, renderMarkdownSafe } from '../chat/renderChat.js';

export function formatMessage(content, options = {}) {
  const { isUser = false, addMeta = true } = options;

  const role = isUser ? 'user' : 'assistant';
  const avatarClass = isUser ? 'user' : 'bot';

  return `<div class="message ${isUser ? 'user-msg' : ''}">
    <div class="avatar ${avatarClass}">${isUser ? 'U' : 'BOT'}</div>
    <div class="msg-body">
      <div class="msg-role">${role}</div>
      <div class="msg-content">${renderMarkdownSafe(content || '')}</div>
    </div>
    <div class="msg-meta">${addMeta ? '<span>Enviado</span>' : ''}</div>
  </div>`;
}

export function formatWelcome() {
  return `<div class="welcome">
    <div class="welcome-logo"><svg class="mascot" viewBox="0 0 120 120" role="img" aria-label="Mascote Vessie"><use href="#vessieMascot"/></svg></div>
    <h2>Olá! Eu sou a Vessie-AI 👋</h2>
    <p>Oi, que bom te ver por aqui! Eu sou a Vessie-AI, sua parceira para pensar, criar e resolver — falo com você de um jeito natural e humano, e estou pronta para ajudar no que você precisar. Por onde a gente começa?</p>
    <div class="welcome-chips">
      <button class="chip" onclick="useSuggestion(this)">O que você pode fazer?</button>
      <button class="chip" onclick="useSuggestion(this)">Crie um script Python de exemplo</button>
    </div>
  </div>`;
}