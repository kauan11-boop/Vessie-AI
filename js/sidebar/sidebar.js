// sidebar/sidebar.js - Sidebar rendering and management
import { renderSidebar } from './sidebar.js';
import { state, saveState, activeChat } from '../state/state.js';
import { settings } from '../config/config.js';
import { checkConnection, refreshModels } from '../api/connection.js';
import { renderAgentList, renderAgentBtn } from '../agent/agents.js';

export function renderSidebar() {
  const chatList = document.getElementById('chatList');
  if (!chatList) return;

  const chats = state.conversations;

  if (!state.activeChatId || chats.length === 0) {
    chatList.innerHTML = '<div class=\"chat-item\"><div>Nenhuma conversa</div></div>';
    return;
  }

  chatList.innerHTML = '';

  chats.forEach(chat => {
    const div = document.createElement('div');
    div.className = 'chat-item' + (chat.id === state.activeChatId ? ' active' : '');
    div.title = chat.title || 'Sem título';
    div.innerHTML = `<div class="chat-item-title">${chat.title || 'Nova conversa'}</div>`;
    div.onclick = () => switchChat(chat.id);
    chatList.appendChild(div);
  });
}

export function renderAgentList() {
  const agentList = document.getElementById('agentList');
  if (!agentList) return;

  const agents = state.agents || [];

  if (!agents.length) {
    agentList.innerHTML = '<div>Nenhum agent criado</div>';
    return;
  }

  agentList.innerHTML = '';

  agents.forEach(agent => {
    const div = document.createElement('div');
    div.className = 'agent-item' + (agent.active ? ' active' : '');
    div.innerHTML = `<span class="a-ico">${agent.emoji || '🤖'}</span><div class="a-info"><div class="a-name">${agent.name || 'Agent'}</div><div class="a-prev">${agent.lastPrompt || ''}</div></div>`;
    agentList.appendChild(div);
  });
}