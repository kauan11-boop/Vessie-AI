// useSuggestion.js
export function useSuggestion(btn) {
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  if (messageInput && sendBtn && window.sendMessage) {
    messageInput.value = btn.textContent.trim();
    if (window.autoResize) autoResize();
    if (window.updateSendBtn) updateSendBtn();
    if (window.sendMessage) sendMessage();
  }
}

export { useSuggestion };