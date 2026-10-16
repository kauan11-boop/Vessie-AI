// ClipboardFallback - Clipboard with fallback for older browsers
export const ClipboardFallback = {
  async copy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (e) {
      console.warn('Clipboard copy failed:', e);
      return false;
    }
  }
};
export { ClipboardFallback };