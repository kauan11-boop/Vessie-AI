// conversations.js - Gerenciamento completo de conversas
import { state } from './state.js?v=7';
import { Storage } from './storage.js?v=7';
import { ui } from './ui.js?v=7';
import { renderChat } from './chat.js?v=7';

export const Conversations = {
  // Criar nova conversa
  newChat() {
    const chat = Storage.addConversation();
    renderChatSidebar();
    renderChat();
    ui.focusMessageInput();
    ui.showToast('Nova conversa iniciada');
    return chat;
  },

  // Selecionar conversa
  selectChat(chatId) {
    state.activeChatId = chatId;
    Storage.setActiveChat(chatId);
    renderChatSidebar();
    renderChat();
    ui.focusMessageInput();
  },

  // Renomear conversa
  renameChat(chatId, newTitle) {
    Storage.renameConversation(chatId, newTitle);
    renderChatSidebar();
    ui.showToast('Conversa renomeada');
  },

  // Excluir conversa
  deleteChat(chatId) {
    if (confirm('Tem certeza que deseja excluir esta conversa?')) {
      Storage.removeConversation(chatId);
      renderChatSidebar();
      renderChat();
      ui.showToast('Conversa excluída');
    }
  },

  // Exportar conversa
  exportChat(chatId) {
    const chat = state.conversations.find(c => c.id === chatId);
    if (!chat) return null;

    const exportData = {
      id: chat.id,
      title: chat.title,
      created: chat.created,
      lastModified: chat.lastModified,
      messages: chat.messages
    };

    return JSON.stringify(exportData, null, 2);
  },

  // Importar conversa
  importChat(exportedJson) {
    try {
      const data = JSON.parse(exportedJson);

      // Validar estrutura mínima
      if (!data.messages || !Array.isArray(data.messages)) {
        throw new Error('Formato de conversa inválido');
      }

      // Adicionar às conversas
      const chat = {
        id: data.id || Date.now().toString(),
        title: data.title || 'Conversa importada',
        messages: data.messages,
        created: data.created || Date.now(),
        lastModified: Date.now()
      };

      state.conversations.unshift(chat);
      state.activeChatId = chat.id;
      Storage.saveConversations();
      renderChatSidebar();
      renderChat();
      ui.showToast('Conversa importada com sucesso');
      return chat;
    } catch (error) {
      console.error('Erro ao importar conversa:', error);
      ui.showToast('Erro ao importar conversa: ' + error.message);
      return null;
    }
  },

  // Duplicar conversa
  duplicateChat(chatId) {
    const chat = state.conversations.find(c => c.id === chatId);
    if (!chat) return null;

    const duplicated = {
      id: Date.now().toString(),
      title: `${chat.title} (cópia)`,
      messages: [...chat.messages],
      created: Date.now(),
      lastModified: Date.now()
    };

    state.conversations.unshift(duplicated);
    Storage.saveConversations();
    renderChatSidebar();
    ui.showToast('Conversa duplicada');
    return duplicated;
  },

  // Pesquisar no histórico
  searchHistory(term) {
    if (!term || term.trim().length === 0) return [];

    const termLower = term.trim().toLowerCase();
    const results = [];

    state.conversations.forEach((chat, chatIndex) => {
      (chat.messages || []).forEach((msg, msgIndex) => {
        const content = (msg.content || '').toLowerCase();
        const role = (msg.role || '').toLowerCase();

        if (content.includes(termLower) || role.includes(termLower)) {
          const full = msg.content || '';
          results.push({
            chatIndex,
            msgIndex,
            chatTitle: chat.title,
            preview: full.substring(0, 100) + (full.length > 100 ? '...' : ''),
            role: msg.role
          });
        }
      });
    });

    return results;
  }
};

// Renderizar sidebar de conversas
export function renderChatSidebar() {
  const chatList = document.getElementById('chatList');
  if (!chatList) return;

  if (!state.conversations.length) {
    chatList.innerHTML = '<div class="chat-empty">Nenhuma conversa ainda.<br>Clique em <b>Nova conversa</b> para começar.</div>';
    return;
  }

  chatList.innerHTML = '';

  state.conversations.forEach(chat => {
    const div = document.createElement('div');
    div.className = 'chat-item' + (chat.id === state.activeChatId ? ' active' : '');
    div.title = chat.title || 'Sem título';
    const count = (chat.messages || []).length;
    div.innerHTML = `
      <div class="chat-item-title">${escapeHtml(chat.title || 'Sem título')}</div>
      <span class="chat-item-count">${count}</span>
    `;
    div.onclick = () => Conversations.selectChat(chat.id);
    div.oncontextmenu = (e) => {
      e.preventDefault();
      showChatContextMenu(e.clientX, e.clientY, chat.id);
    };
    chatList.appendChild(div);
  });
}

// Menu de contexto (botão direito) nas conversas: abrir / excluir
function showChatContextMenu(x, y, chatId) {
  hideChatContextMenu();
  const chat = state.conversations.find(c => c.id === chatId);

  const menu = document.createElement('div');
  menu.className = 'chat-context-menu';
  menu.id = 'chatContextMenu';
  menu.innerHTML = `
    <div class="chat-context-title">${escapeHtml(chat?.title || 'Sem título')}</div>
    <button class="chat-context-item" data-action="open"><i class="fa-solid fa-folder-open"></i> Abrir conversa</button>
    <button class="chat-context-item danger" data-action="delete"><i class="fa-solid fa-trash"></i> Excluir conversa</button>
  `;

  menu.querySelector('[data-action="open"]').onclick = () => {
    hideChatContextMenu();
    Conversations.selectChat(chatId);
  };
  menu.querySelector('[data-action="delete"]').onclick = () => {
    hideChatContextMenu();
    Conversations.deleteChat(chatId);
  };

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px';
}

function hideChatContextMenu() {
  document.getElementById('chatContextMenu')?.remove();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__chatCtxBound) {
  window.__chatCtxBound = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('#chatContextMenu')) hideChatContextMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideChatContextMenu();
  });
  window.addEventListener('blur', hideChatContextMenu);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
