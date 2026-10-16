// ui.js - Utilidades de interface do usuário
import { state } from './state.js?v=7';
import { CONFIG } from './config.js?v=7';
import { Storage } from './storage.js?v=7';

export const ui = {
  // Mostrar toast/notification
  showToast(message, type = 'info') {
    // Remover toast anterior
    const oldToast = document.querySelector('.vessie-toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'vessie-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 20px;
      font-size: 13px;
      color: var(--text);
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(0,0,0,.2);
      animation: slideUp .3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideUp .3s ease-in reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
    
    // Adicionar animação keyframe se não existir
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .vessie-toast { animation: slideUp .3s ease-out; }
      `;
      document.head.appendChild(style);
    }
  },

  // Alternar barra lateral
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    if (sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
      sidebar.classList.add('expanded');
      state.ui.sidebarCollapsed = false;
    } else {
      sidebar.classList.add('collapsed');
      sidebar.classList.remove('expanded');
      state.ui.sidebarCollapsed = true;
    }
    localStorage.setItem('vessie-ai-sidebar', sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
  },

  // Alternar tema
  toggleTheme() {
    document.body.setAttribute('data-theme', 
      document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    state.ui.theme = document.body.getAttribute('data-theme');
    localStorage.setItem('vessie-ai-theme', state.ui.theme);
    
    // Salvar configuração
    state.settings.theme = state.ui.theme;
    Storage.saveSettings();
  },

  // Focar no campo de mensagem
  focusMessageInput() {
    const input = document.getElementById('messageInput');
    if (input) {
      input.focus();
      input.select();
    }
  },

  // Atualizar badge de conexão
  updateConnectionBadge(isConnected) {
    const badge = document.querySelector('.connection-badge');
    if (!badge) return;
    
    if (isConnected) {
      badge.textContent = 'Conectado';
      badge.className = 'connection-badge ok';
    } else {
      badge.textContent = 'Desconectado';
      badge.className = 'connection-badge err';
    }
  }
};