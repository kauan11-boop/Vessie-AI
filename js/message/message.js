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
    <h2>Olá, eu sou a Vessie-AI</h2>
    <p>Sua assistente local e privada — rodando 100% no seu <b>LM Studio</b>. Sem nuvem, sem custo, sem limite.</p>
    <div class="setup-steps">
      <div class="step"><b>1 · Suba o servidor</b>No LM Studio: <b>Local Server → Start Server</b> (porta <code>1234</code>)</div>
      <div class="step"><b>2 · Libere o CORS</b>Na engrenagem do servidor, ative <code>Enable CORS</code>.</div>
      <div class="step"><b>3 · Conecte aqui</b>Clique no status no topo da sidebar → <b>Salvar & Conectar</b>.</div>
    </div>
    <div class="suggestions">
      <button class="suggestion-card" onclick="useSuggestion(this)">Explique como funciona um LLM em termos simples</button>
      <button class="suggestion-card" onclick="useSuggestion(this)">Escreva uma função Python que lê CSV e mostra estatísticas</button>
    </div>
  </div>`;
}