// settings.js - Tela e gerenciamento de configurações
import { CONFIG } from './config.js?v=7';
import { state } from './state.js?v=7';
import { Storage } from './storage.js?v=7';
import { ui } from './ui.js?v=7';
import { checkConnection } from './api.js?v=7';
import { checkLMStudioConnection } from './chat.js?v=7';

export const Settings = {
  // Carregar configurações iniciais
  async load() {
    Storage.loadSettings();
    openModal('settingsModal');

    const baseUrlInput = document.getElementById('sBaseUrl');
    const apiKeyInput = document.getElementById('sApiKey');
    const tempInput = document.getElementById('sTemp');
    const topPInput = document.getElementById('sTopP');
    const maxTokensInput = document.getElementById('sMaxTok');
    const streamCheckbox = document.getElementById('sStream');
    const autoCheckbox = document.getElementById('sAuto');
    const spellCheckbox = document.getElementById('sSpell');
    const systemPromptTextarea = document.getElementById('systemPrompt');
    const imgSizeSelect = document.getElementById('sImgSize');
    const imgModelSelect = document.getElementById('sImgModel');

    if (baseUrlInput) baseUrlInput.value = state.settings.baseUrl || CONFIG.defaultBaseUrl;
    if (apiKeyInput) apiKeyInput.value = state.settings.apiKey || 'lm-studio';
    if (tempInput) tempInput.value = state.settings.temperature;
    if (topPInput) topPInput.value = state.settings.topP;
    if (maxTokensInput) maxTokensInput.value = state.settings.maxTokens || '';
    if (streamCheckbox) streamCheckbox.checked = state.settings.stream !== false;
    if (autoCheckbox) autoCheckbox.checked = state.settings.autoConnect !== false;
    if (spellCheckbox) spellCheckbox.checked = state.settings.spellcheck !== false;
    if (systemPromptTextarea) systemPromptTextarea.value = state.settings.systemPrompt || '';
    const imgCfg = state.settings.image || {};
    if (imgSizeSelect) imgSizeSelect.value = imgCfg.size || '1024x1024';
    if (imgModelSelect) imgModelSelect.value = imgCfg.model || 'flux';

    ui.updateConnectionBadge(state.connection.isConnected);
  },

  // Salvar configurações
  save() {
    const baseUrlInput = document.getElementById('sBaseUrl');
    const apiKeyInput = document.getElementById('sApiKey');
    const tempInput = document.getElementById('sTemp');
    const topPInput = document.getElementById('sTopP');
    const maxTokensInput = document.getElementById('sMaxTok');
    const streamCheckbox = document.getElementById('sStream');
    const autoCheckbox = document.getElementById('sAuto');
    const spellCheckbox = document.getElementById('sSpell');
    const systemPromptTextarea = document.getElementById('systemPrompt');
    const imgSizeSelect = document.getElementById('sImgSize');
    const imgModelSelect = document.getElementById('sImgModel');

    if (baseUrlInput) state.settings.baseUrl = baseUrlInput.value.trim() || CONFIG.defaultBaseUrl;
    if (apiKeyInput) state.settings.apiKey = apiKeyInput.value || 'lm-studio';
    if (tempInput) state.settings.temperature = parseFloat(tempInput.value) || 0.7;
    if (topPInput) topPInput.value !== '' && (state.settings.topP = parseFloat(topPInput.value) || 1);
    if (maxTokensInput) state.settings.maxTokens = maxTokensInput.value || '';
    if (streamCheckbox) state.settings.stream = streamCheckbox.checked;
    if (autoCheckbox) state.settings.autoConnect = autoCheckbox.checked;
    if (spellCheckbox) state.settings.spellcheck = spellCheckbox.checked;
    if (systemPromptTextarea) state.settings.systemPrompt = systemPromptTextarea.value;
    state.settings.image = {
      size: (imgSizeSelect && imgSizeSelect.value) || '1024x1024',
      model: (imgModelSelect && imgModelSelect.value) || 'flux'
    };

    Storage.saveSettings();
    ui.showToast('Configurações salvas com sucesso');
    closeModal('settingsModal');
    checkAndConnect();
  },

  // Testar conexão
  async testConnection() {
    ui.showToast('Testando conexão...');
    const success = await checkLMStudioConnection();
    if (success) {
      ui.showToast('Conexão bem-sucedida!');
      await Settings.loadModels();
    }
  },

  // Popular modelos disponíveis + atualizar seletor
  async loadModels() {
    try {
      const res = await checkConnection();
      ui.updateConnectionBadge(!!res.ok);
      if (!res.ok) {
        ui.showToast('Não foi possível carregar modelos. Verifique o LM Studio.');
        return [];
      }
      const models = res.models || [];
      updateModelLabel();
      return models;
    } catch (error) {
      console.error('Erro ao carregar modelos:', error);
      ui.showToast('Não foi possível carregar modelos');
      return [];
    }
  },

  // Alternar entre tema claro/escuro
  toggleTheme() {
    ui.toggleTheme();
  }
};

export function updateModelLabel() {
  const label = document.getElementById('modelBtnLabel');
  if (!label) return;
  const m = state.settings.model;
  // Modo OFFLINE (Simulite-Message): rede neural local, sem LM Studio.
  if (m === 'OFFLINE' || (!m && state.connection && !state.connection.isConnected)) {
    label.textContent = 'OFFLINE · Simulite';
    label.title = 'Rede neural local (Simulite-Message) — responde e aprende sem LM Studio';
    return;
  }
  label.textContent = m ? (String(m).split('/').pop().replace('.gguf', '') || m) : 'selecionar modelo…';
}

// Verificar conexão automaticamente ao carregar
async function checkAndConnect() {
  const success = await checkLMStudioConnection();
  if (success) {
    updateModelLabel();
  }
}
