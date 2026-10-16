// markdown.js — Prompt: corrigir parse (C3), remover import UMD, escapar código.
// Ordem: 1.escapeHtml 2.simpleMarkdown 3.renderMarkdownSafe
// Ex: simpleMarkdown('**oi**') → '<strong>oi</strong>'
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPurify() {
  try {
    if (typeof window !== 'undefined' && window.DOMPurify) return window.DOMPurify;
  } catch (e) { /* sem DOMPurify global */ }
  return null;
}

export function renderMarkdownSafe(md) {
  const html = simpleMarkdown(md || '');
  try {
    const purify = getPurify();
    if (purify) {
      return purify.sanitize(html, { ADD_TAGS: ['span'], ADD_ATTR: ['class', 'data-memory'] });
    }
  } catch (e) {
    console.error('Erro no DOMPurify:', e);
  }
  return html;
}

// Markdown simples - converter marcadores básicos em HTML (texto sempre escapado primeiro)
export function simpleMarkdown(md) {
  if (!md) return '';

  const codeBlocks = [];
  // 1. Isola blocos de código e escapa o conteúdo (corrige inversão < / > do original)
  let html = String(md).replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    codeBlocks.push('<pre><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });

  // 2. Escapa todo o restante
  html = escapeHtml(html);

  // 3. Aplica formatação sobre texto já seguro
  html = html
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')

    // Negrito e itálico
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+?)`/g, '<code>$1</code>')

    // Listas
    .replace(/^- (.+)$/gm, '<li>$1</li>')

    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

    // Quebras de linha
    .replace(/\n/g, '<br>');

  // 4. Restaura blocos de código
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (m, i) => codeBlocks[Number(i)] || '');

  return html;
}