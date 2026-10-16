// A11yEnhancements.js - Accessibility enhancements
export const A11yEnhancements = {
  init() {
    // Add skip link focus styling
    const style = document.createElement('style');
    style.textContent = `
      a.skip-link:focus-visible {
        background: var(--accent);
        color: #0f0f1a;
        padding: 8px 12px;
        border-radius: 6px;
        z-index: 1000;
      }
    `;
    document.head.appendChild(style);

    // Add aria-live region for message announcements
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('role', 'alert');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0)';
    document.body.appendChild(liveRegion);
    this.liveRegion = liveRegion;
  },

  announce(message) {
    if (this.liveRegion) {
      this.liveRegion.textContent = message;
    }
  }
};
export { A11yEnhancements };