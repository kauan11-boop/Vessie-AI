// router.js - Roteamento e hash navigation
export const Router = {
  init() {
    // Processar hash inicial
    this.route();
    
    // Ouvir mudanças de hash
    window.addEventListener('hashchange', () => this.route());
  },

  route() {
    const hash = window.location.hash || '#chat';
    const path = hash.replace('#', '');
    
    // Atualizar UI baseado no caminho
    this.updateActiveLink(path);
    
    // Se for página de chat (padrão)
    if (path === 'chat' || path === '') {
      renderChatInterface();
    }
    // Configurações
    else if (path === 'settings') {
      renderSettingsPage();
    }
    // Página não encontrada
    else {
      renderNotFound();
    }
  },

  updateActiveLink(currentPath) {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${currentPath}`);
    });
  }
};