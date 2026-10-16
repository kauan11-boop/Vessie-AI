// ConnectionQuality.js - Connection quality indicator
export const ConnectionQuality = {
  quality: 'unknown',
  lastUpdate: 0,

  async checkAndUpdate() {
    const now = performance.now();
    if (now - this.lastUpdate < 3000) return; // Update max every 3s
    this.lastUpdate = now;

    // Check network info if available
    if ('connection' in navigator) {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn) {
        const effectiveType = conn.effectiveType || 'unknown';
        const downlink = Math.round(conn.downlink || 0);

        if (effectiveType === '4g' || effectiveType === '3g' || downlink >= 2) {
          this.quality = 'good';
        } else if (effectiveType === '2g' || (effectiveType === 'slow-2g' || downlink < 1)) {
          this.quality = 'poor';
        } else {
          this.quality = 'average';
        }
      }
    }

    // Update UI
    const qualityEl = document.getElementById('qualityIndicator');
    if (qualityEl) {
      qualityEl.textContent = this.quality;
      qualityEl.className = `quality-${this.quality}`;
    }
  }
};
export { ConnectionQuality };