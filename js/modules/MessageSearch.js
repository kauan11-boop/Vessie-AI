// MessageSearch.js - Search through chat messages
export const MessageSearch = {
  search(term) {
    if (!term || term.trim().length === 0) return [];

    const messages = document.querySelectorAll('.message');
    const termLower = term.toLowerCase().trim();
    const results = [];

    messages.forEach((msg, idx) => {
      const content = (msg.querySelector('.msg-content') || {}).innerText || '';
      const role = (msg.querySelector('.msg-role') || {}).innerText || '';

      if (content.toLowerCase().includes(termLower) || role.toLowerCase().includes(termLower)) {
        results.push({ index: idx, element: msg, content });
      }
    });

    return results;
  },

  highlightSearch(term) {
    if (!term || term.trim().length === 0) return;

    const termLower = term.toLowerCase().trim();
    const messages = document.querySelectorAll('.message');

    messages.forEach(msg => {
      const content = msg.querySelector('.msg-content');
      if (!content) return;

      const originalHTML = content.innerHTML;
      const highlighted = originalHTML.replace(
        new RegExp(`(${termLower})`, 'gi'),
        '<span class="search-highlight">$1</span>'
      );
      content.innerHTML = highlighted;
    });
  },

  clearHighlight() {
    const highlights = document.querySelectorAll('.search-highlight');
    highlights.forEach(span => {
      const parent = span.parentNode;
      parent.replaceChild(document.createTextNode(span.textContent), span);
    });
  }
};
export { MessageSearch };