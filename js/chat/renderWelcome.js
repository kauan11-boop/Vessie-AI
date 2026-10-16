// chat/renderWelcome.js
const WELCOME_POOL_FALLBACK = [
  'O que você pode fazer?',
  'Crie um script Python de exemplo',
  'Explique como funciona o Memory Manager',
  'Me ajude a escrever um texto',
  'Resuma este texto para mim',
  'Crie uma lista de estudos para programação',
  'Me explique um conceito como se eu tivesse 10 anos',
  'Revise meu código e sugira melhorias'
];
export function renderWelcome() {
  const chatArea = document.getElementById('chatArea');
  if (!chatArea) return;

  const pool = [...WELCOME_POOL_FALLBACK];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, 2);

  chatArea.innerHTML = `<div class="welcome">
    <div class="welcome-logo"><svg class="mascot" viewBox="0 0 120 120" role="img" aria-label="Mascote Vessie"><use href="#vessieMascot"/></svg></div>
    <h2>Olá! Eu sou a Vessie-AI 👋</h2>
    <p>Oi, que bom te ver por aqui! Eu sou a Vessie-AI, sua parceira para pensar, criar e resolver — falo com você de um jeito natural e humano, e estou pronta para ajudar no que você precisar. Por onde a gente começa?</p>
    <div class="welcome-chips">
      ${picks.map(t => `<button class="chip" onclick="useSuggestion(this)">${t}</button>`).join('')}
    </div>
  </div>`;
}

export function useSuggestion(btn) {
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  if (messageInput && sendBtn && window.sendMessage) {
    messageInput.value = btn.textContent.trim();
    if (window.autoResize) autoResize();
    if (window.updateSendBtn) updateSendBtn();
    if (window.sendMessage) sendMessage();
  }
}