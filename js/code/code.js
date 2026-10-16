// code/code.js - Code block handling and syntax highlighting
import { escapeHtml } from '../chat/renderChat.js';

export function initCodeBlocks() {
  // Initialize highlight.js on code blocks
  if (window.hljs) {
    document.querySelectorAll('pre code').forEach(block => {
      hljs.highlightBlock(block);
    });
  }

  // Add copy button to code blocks
  document.querySelectorAll('.msg-content pre.code').forEach(pre => {
    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `<span>Código</span><button class="copy-btn" onclick="copyCode(this)">Copiar</button>`;
    pre.parentNode.insertBefore(header, pre);

    const btn = header.querySelector('button');
    btn.onclick = e => {
      e.stopPropagation();
      const code = pre.querySelector('code');
      if (code) {
        navigator.clipboard.writeText(code.textContent).then(() => {
          btn.textContent = 'Copiado!';
          setTimeout(() => btn.textContent = 'Copiar', 1500);
        });
      }
    };
  });
}

export function copyCode(btn) {
  const pre = btn.parentNode.querySelector('pre');
  const code = pre.querySelector('code');
  if (code) {
    navigator.clipboard.writeText(code.textContent).then(() => {
      btn.textContent = 'Copiado!';
      setTimeout(() => btn.textContent = 'Copiar', 1500);
    });
  }
}