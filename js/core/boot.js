// boot.js - Main entry point for Vessie-AI
// All ES modules are imported here. Requires HTTP server (not file://).

import './modules/TouchGestures.js';
import './modules/VirtualKeyboard.js';
import './modules/PWAManager.js';
import './modules/NetworkMonitor.js';
import './modules/PerformanceMonitor.js';
import './modules/ThemeSync.js';
import './modules/A11yEnhancements.js';
import './modules/KeyboardShortcuts.js';
import './modules/LazyImageLoader.js';
import './modules/MessageSearch.js';
import './modules/DraftManager.js';
import './modules/ConnectionQuality.js';
import './modules/ErrorRecovery.js';
import './modules/SettingsMigration.js';
import './modules/ViewportFix.js';
import './modules/SystemThemeSync.js';
import './modules/ClipboardFallback.js';
import './modules/IdleManager.js';
import './modules/ResourcePreloader.js';
import './modules/Telemetry.js';

import { state } from './state/state.js';
import { config } from './config/config.js';
import { connection } from './api/connection.js';
import { sendMessage } from './chat/send.js';
import { renderChat, renderWelcome, scrollBottom, updateTokenBadge } from './chat/renderChat.js';
import { renderSidebar } from './sidebar/sidebar.js';
import { openModal, closeModal } from './modal/modals.js';
import { initVoiceControls } from './chat/voiceControls.js';

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // Load saved state
  loadState();

  // Initialize core modules
  ThemeSync.init();
  SystemThemeSync.init();
  NetworkMonitor.init();
  ViewportFix.init();
  ResourcePreloader.init();
  A11yEnhancements.init();
  KeyboardShortcuts.init();

  // Initialize voice controls
  initVoiceControls();

  // Check connection and load models
  checkConnection().then(success => {
    if (success) {
      renderModelBtn();
    }
  });

  // Render welcome on first chat or no active chat
  const chatArea = document.getElementById('chatArea');
  if (chatArea) {
    const activeChat = state.conversations.find(c => c.id === state.activeChatId);
    if (!state.activeChatId || activeChat.messages.length === 0) {
      renderWelcome();
    }
  }

  // Handle window focus to stop generation when switching tabs
  window.addEventListener('focus', () => {
    if (state.isGenerating && viewingGenChat()) {
      // User returned - let the generation continue
    }
  });

  // Handle visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.isGenerating) {
      stopGeneration();
    }
  });
});