// KeyboardShortcuts.js - Global keyboard shortcuts
export const KeyboardShortcuts = {
  init() {
    const self = this;
    const handlers = {};

    document.addEventListener('keydown', e => {
      // Ctrl/Cmd + Enter to send message
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn && !state.isGenerating) {
          sendBtn.click();
        }
      }

      // Escape to clear input or close modals
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal-back.open');
        if (openModal) {
          closeModal(openModal.id);
        } else {
          const textarea = document.getElementById('messageInput');
          if (textarea) textarea.value = '';
        }
      }

      // Ctrl/Cmd + K to focus input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const textarea = document.getElementById('messageInput');
        if (textarea) textarea.focus();
      }
    });
  }
};
export { KeyboardShortcuts };