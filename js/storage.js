// storage.js - Persistência local (localStorage)
import { state } from './state.js?v=7';
import { CONFIG, STORAGE_KEYS } from './config.js?v=7';

const SETTINGS_KEY = (STORAGE_KEYS && STORAGE_KEYS.settings) || 'vessie-ai-settings';
const CHATS_KEY = (STORAGE_KEYS && STORAGE_KEYS.conversations) || 'vessie-ai-chats';
const ACTIVE_KEY = 'vessie-ai-active-chat';

export const Storage = {
  // Carregar todas as configurações salvas
  loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          state.settings = { ...CONFIG.defaultSettings, ...parsed };
        }
      }
    } catch (e) {
      console.warn('Falha ao carregar configurações:', e);
    }
    return state.settings;
  },

  // Salvar configurações
  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (e) {
      console.warn('Falha ao salvar configurações:', e);
    }
  },

  // Carregar conversas (aceita formato novo {conversations:[]}, legado {chats:[]} ou array cru)
  loadConversations() {
    try {
      const saved = localStorage.getItem(CHATS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const list = Array.isArray(parsed)
          ? parsed
          : (parsed.conversations || parsed.chats || []);
        state.conversations = Array.isArray(list) ? list : [];
        // Garantir que conversas tenham IDs únicos
        state.conversations.forEach((c, i) => {
          if (!c.id) c.id = `chat_${i}`;
          if (!Array.isArray(c.messages)) c.messages = [];
        });
      }
      // Restaurar conversa ativa
      const activeId = localStorage.getItem(ACTIVE_KEY);
      if (activeId && state.conversations.some(c => c.id === activeId)) {
        state.activeChatId = activeId;
      }
    } catch (e) {
      console.warn('Falha ao carregar conversas:', e);
    }
    return state.conversations;
  },

  // Salvar conversas
  saveConversations() {
    try {
      const data = { conversations: state.conversations };
      localStorage.setItem(CHATS_KEY, JSON.stringify(data));
      if (state.activeChatId) {
        localStorage.setItem(ACTIVE_KEY, state.activeChatId);
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
    } catch (e) {
      console.warn('Falha ao salvar conversas:', e);
    }
  },

  // Adicionar nova conversa
  addConversation(title = 'Nova conversa') {
    const newChat = {
      id: Date.now().toString(),
      title,
      messages: [],
      created: Date.now(),
      lastModified: Date.now()
    };
    state.conversations.unshift(newChat);
    state.activeChatId = newChat.id;
    this.saveConversations();
    return newChat;
  },

  // Remover conversa
  removeConversation(chatId) {
    state.conversations = state.conversations.filter(c => c.id !== chatId);
    if (state.activeChatId === chatId) {
      state.activeChatId = state.conversations.length ? state.conversations[0].id : null;
    }
    this.saveConversations();
  },

  // Renomear conversa
  renameConversation(chatId, newTitle) {
    const chat = state.conversations.find(c => c.id === chatId);
    if (chat) {
      chat.title = newTitle;
      chat.lastModified = Date.now();
      this.saveConversations();
    }
  },

  // Definir chat ativo
  setActiveChat(chatId) {
    state.activeChatId = chatId;
    this.saveConversations();
  },

  // Adicionar mensagem a uma conversa
  // (o título é definido pela IA via maybeAutoTitle, com fallback local)
  addMessage(chatId, message) {
    const chat = state.conversations.find(c => c.id === chatId);
    if (chat) {
      chat.messages.push(message);
      chat.lastModified = Date.now();
      this.saveConversations();
      return chat.messages[chat.messages.length - 1];
    }
    return null;
  },

  // Limpar todas as conversas
  clearAll() {
    if (confirm('Tem certeza que deseja apagar todas as conversas?')) {
      state.conversations = [];
      state.activeChatId = null;
      localStorage.removeItem(CHATS_KEY);
      localStorage.removeItem(ACTIVE_KEY);
    }
  }
};
