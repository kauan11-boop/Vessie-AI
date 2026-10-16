// NetworkMonitor.js - Network connection monitoring
export const NetworkMonitor = {
  online: navigator.onLine,

  init() {
    window.addEventListener('online', () => {
      this.online = true;
      this.updateUI();
    });

    window.addEventListener('offline', () => {
      this.online = false;
      this.updateUI();
    });
  },

  updateUI() {
    const statusEl = document.getElementById('networkStatus');
    if (!statusEl) return;

    if (this.online) {
      statusEl.textContent = 'Online';
      statusEl.style.color = 'var(--ok)';
    } else {
      statusEl.textContent = 'Offline';
      statusEl.style.color = 'var(--danger)';
    }
  }
};
export { NetworkMonitor };