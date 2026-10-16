// PWAManager.js - Progressive Web App management
export const PWAManager = {
  async checkInstallability() {
    if (!window.matchMedia('(display-mode: standalone)').matches) {
      return { defer: true };
    }
    return { defer: false };
  },

  async requestInstall() {
    const deferredPrompt = window.deferredPrompt;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA install outcome: ${outcome}`);
      window.deferredPrompt = null;
      return outcome;
    }
    return null;
  },

  async handleBeforeInstall(e) {
    e.preventDefault();
    const result = await this.requestInstall();
    if (result !== 'accepted') {
      // Show install button or prompt
    }
  },

  init() {
    window.addEventListener('beforeinstallprompt', this.handleBeforeInstall.bind(this));
    window.addEventListener('appinstalled', () => {
      console.log('PWA installed successfully');
    });
  }
};
export { PWAManager };