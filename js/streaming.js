// streaming.js - Processamento de streaming SSE e cancelamento
export const Streaming = {
  // Iniciar streaming de resposta
  start(abortController, onFragment, onComplete, onError) {
    // Esta função é chamada por chat.js, que gerencia o EventSource
    // Aqui apenas exportamos helpers para processamento
  },
  
  // Processar fragmento de resposta
  processFragment(text, contentDiv, fullResponse) {
    fullResponse += text;
    // Atualizar apenas o conteúdo, sem reconstruir toda a interface
    contentDiv.innerHTML = this.sanitize(fullResponse);
    // Manter rolagem
    // contentDiv.parentNode.parentNode.scrollTop = contentDiv.parentNode.parentNode.scrollHeight;
  },
  
  sanitize(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    // Remover scripts e estilos perigosos
    const scripts = div.querySelectorAll('script');
    scripts.forEach(s => s.remove());
    const styles = div.querySelectorAll('style');
    styles.forEach(s => s.remove());
    return div.innerHTML || div.textContent;
  },
  
  // Cancelar streaming ativo
  cancel() {
    // Sinalizar para o EventSource fechar
  }
};