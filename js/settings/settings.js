// settings/settings.js - Settings management
import { settings } from '../config/config.js';
import { saveState } from '../state/state.js';

export function saveSettings(connect = false) {
  // Update settings from DOM
  const baseUrl = document.getElementById('sBaseUrl');
  const apiKey = document.getElementById('sApiKey');
  const system = document.getElementById('sSystem');
  const temp = document.getElementById('sTemp');
  const topP = document.getElementById('sTopP');
  const maxTok = document.getElementById('sMaxTok');
  const timeout = document.getElementById('sTimeout');
  const stream = document.getElementById('sStream');
  const auto = document.getElementById('sAuto');

  if (baseUrl) settings.baseUrl = baseUrl.value || 'http://localhost:1234/v1';
  if (apiKey) settings.apiKey = apiKey.value || 'lm-studio';
  if (system) settings.system = system.value;
  if (temp) settings.temp = parseFloat(temp.value) || 0.7;
  if (topP) settings.topP = parseFloat(topP.value) || 1;
  if (maxTok) settings.maxTok = maxTok.value === '' ? '' : maxTok.value;
  if (timeout) settings.timeout = parseInt(timeout.value) || 120;
  if (stream !== undefined) settings.stream = stream.checked;
  if (auto !== undefined) settings.auto = auto.checked;

  persistSettings();
  saveState();

  if (connect) {
    checkConnection();
  }

  closeModal('settingsModal');
  showToast('Configurações salvas');
}

export function setSettingsTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.settings-content').forEach(c => c.style.display = 'none');
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));

  // Show selected tab
  document.getElementById(`settings-content-${tabName}`).style.display = 'block';
  event.target.classList.add('active');
}

// Initialize model selector in settings
export function initSettingsModelSelect() {
  const { settings } = await import('../config/config.js');
  renderModelBtn();
  renderModelDrop();
}