// voiceControls.js - Voice control UI and integration
import { VoiceSynthesis } from '../modules/VoiceSynthesis.js';
import { settings } from '../../config/config.js';

let voiceEnabled = true;
let voiceButton = null;

export function initVoiceControls() {
  voiceButton = document.createElement('button');
  voiceButton.id = 'voiceToggle';
  voiceButton.className = 'btn';
  voiceButton.style.marginLeft = '8px';
  voiceButton.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
  voiceButton.title = 'Ativar/Desativar voz';
  voiceButton.onclick = toggleVoice;

  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn && sendBtn.parentNode) {
    sendBtn.parentNode.insertBefore(voiceButton, sendBtn.nextSibling);
  }

  updateVoiceButton();
}

function toggleVoice() {
  const currentEnabled = settings.voiceEnabled !== false;
  const newEnabled = !currentEnabled;

  if (typeof window.settings !== 'undefined') {
    window.settings.voiceEnabled = !currentEnabled;
  }

  if (!currentEnabled) {
    if (window.VoiceSynthesis && !window.VoiceSynthesis.synth) {
      VoiceSynthesis.init();
    }
  } else {
    if (window.VoiceSynthesis) {
      VoiceSynthesis.stop();
    }
  }

  updateVoiceButton();

  const status = currentEnabled ? 'desativada' : 'ativada';
  showToast(`Voz ${status}`);
}

function updateVoiceButton() {
  if (!voiceButton) return;

  const enabled = settings.voiceEnabled !== false;
  voiceButton.innerHTML = enabled 
    ? '<i class="fa-solid fa-volume-high"></i>' 
    : '<i class="fa-solid fa-volume-xmark"></i>';
  voiceButton.title = `Voz: ${settings.voiceEnabled !== false ? 'Ativada' : 'Desativada'} - Clique para alternar`;
  voiceButton.classList.toggle('active', true);
  voiceButton.style.opacity = enabled ? '1' : '0.6';
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 90px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    color: var(--text);
    z-index: 1000;
    animation: slideUp 0.3s ease-out;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideUp 0.3s ease-in reverse';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVoiceControls);
} else {
  initVoiceControls();
}

function initVoiceControls() {
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      .toast-notification { animation: slideUp 0.3s ease-out; }
    `;
    document.head.appendChild(style);
  }

  setTimeout(() => {
    if (typeof VoiceSynthesis !== 'undefined') {
      VoiceSynthesis.init();
    }
  }, 100);
}

export { initVoiceControls, toggleVoice };