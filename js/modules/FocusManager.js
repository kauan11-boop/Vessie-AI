// FocusManager.js - Focus management for accessibility
export const FocusManager = {
  lastFocused: null,

  trapFocus(containerId, allowedKeys = ['Tab', 'Shift+Tab', 'Escape']) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const focusableEls = container.querySelectorAll(
      'a[href], button, input, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableEls[0];
    const lastFocusable = focusableEls[focusableEls.length - 1];

    let focusedIndex = 0;

    container.addEventListener('keydown', e => {
      if (allowedKeys.some(k => e.key === k || e.key === 'Escape')) {
        // Handle Tab cycling
        if (e.key === 'Tab') {
          e.preventDefault();
          focusedIndex = (focusedIndex + 1) % focusableEls.length;
          focusableEls[focusedIndex].focus();
        }

        // Handle Escape to close
        if (e.key === 'Escape') {
          this.releaseFocus();
        }
      }
    });

    // Initial focus
    if (firstFocusable) firstFocusable.focus();

    return () => this.releaseFocus();
  },

  releaseFocus() {
    document.removeEventListener('keydown', arguments.callee);
    this.lastFocused = null;
  }
};
export { FocusManager };