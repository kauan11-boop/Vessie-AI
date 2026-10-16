// agent/agents.js - Agent management
import { state } from '../state/state.js';
import { settings } from '../config/config.js';

export function setAgentStatus(status) {
  const pill = document.getElementById('agentStatusCircle');
  if (!pill) return;

  const statusMap = {
    busy: 'busy',
    done: 'done',
    hide: 'hide'
  };

  pill.className = 'model-status-circle ' + (statusMap[status] || 'hide');
  pill.title = status;
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

export function saveAgent() {
  const name = document.getElementById('aName').value || 'Novo agent';
  const emoji = document.getElementById('aIcon').value || '🤖';
  const temp = document.getElementById('aTemp').value;
  const instr = document.getElementById('aInstr').value;

  const agent = {
    id: Date.now().toString(),
    name,
    emoji,
    temp: temp || undefined,
    instructions: instr,
    active: false,
    lastPrompt: '',
    created: Date.now()
  };

  // Add to state
  state.agents = state.agents || [];
  state.agents.push(agent);
  saveState();

  // Re-render
  renderAgentList();
  renderAgentBtn();

  closeModal('agentModal');
  showToast('Agent salvo com sucesso');
}