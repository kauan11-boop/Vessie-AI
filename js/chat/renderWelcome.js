// chat/renderWelcome.js
export function renderWelcome() {
  const chatArea = document.getElementById('chatArea');
  if (!chatArea) return;

  chatArea.innerHTML = `<div class="welcome">
    <div class="welcome-logo"><svg class="mascot" viewBox="0 0 120 120" role="img" aria-label="Mascote Vessie"><use href="#vessieMascot"/></svg></div>
    <h2>Olá, eu sou a Vessie-AI</h2>
    <p>Sua assistente local e privada — rodando 100% no seu <b>LM Studio</b>. Sem nuvem, sem custo, sem limite.</p>
    <div class="setup-steps">
      <div class="step"><b>1 · Suba o servidor</b>No LM Studio: <b>Local Server → Start Server</b> (porta <code>1234</code>).</div>
      <div class="step"><b>2 · Libere o CORS</b>Na engrenagem do servidor, ative <code>Enable CORS</code>.</div>
      <div class="step"><b>3 · Conecte aqui</b>Clique no status no topo da sidebar → <b>Salvar & Conectar</b>.</div>
      <div class="step"><b>4 · No GitHub Pages?</b>Se der erro de <code>https → http</code>, use <code>ngrok http 1234</code> e cole a URL https nas configurações.</div>
    </div>
    <div class="suggestions">
      <button class="suggestion-card" onclick="useSuggestion(this)">Explique como funciona um LLM em termos simples</button>
      <button class="suggestion-card" onclick="useSuggestion(this)">Escreva uma função Python que lê CSV e mostra estatísticas</button>
      <button class="suggestion-card" onclick="useSuggestion(this)">Me ajude a debugar um erro de JavaScript com exemplo</button>
      <button class="suggestion-card" onclick="useSuggestion(this)">Crie uma imagem de um gato astronauta no espaço, estilo cinematográfico</button>
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