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
      return purify.sanitize(html, { ADD_TAGS: ['span', 'button'], ADD_ATTR: ['class', 'data-memory', 'data-script-idx', 'data-pack', 'data-edit-file', 'title', 'onclick'] });
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
  const _w = (typeof window !== 'undefined' ? window : globalThis);
  if (!_w.__vessieScripts) _w.__vessieScripts = [];
  // 1. Isola blocos de código: em vez de mostrar o script, cria botão com nome + ícone.
  // Suporta ```lang, ```lang:arquivo.ext e ```arquivo.ext
  let html = String(md).replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (m, info, code) => {
    const raw = String(info || '').trim();
    // Bloco pack: não é script — vira botão que empacota tudo em ZIP.
    if (/^pack(?::|$)/i.test(raw)) {
      const pname = raw.includes(':') ? raw.split(':').slice(1).join(':').trim().slice(0, 60) : '';
      const safeP = escapeHtml(pname || 'pacote');
      codeBlocks.push(`<button class="script-open-btn pack-btn" data-pack="${safeP.replace(/"/g, '&quot;')}" onclick="VessiePack.downloadPackBtn(this)" title="Baixar tudo em ZIP"><span class="script-ico">📦</span><span class="script-txt"><span class="script-name">📦 Empacotar: ${safeP || 'pacote'}</span><span class="script-lang">zip · html abre no navegador + arquivos conectados</span></span><span class="script-arrow">›</span></button>`);
      return `\u0000CODE${codeBlocks.length - 1}\u0000`;
    }
    // Bloco edit: não é script novo — vira selo da edição aplicada (clica e abre o arquivo).
    if (/^edit(?::|$)/i.test(raw)) {
      const espec = raw.includes(':') ? raw.split(':').slice(1).join(':').trim() : '';
      const mr = espec.match(/:(\d+)(?:\s*-\s*(\d+))?\s*$/);
      const efname = mr ? espec.slice(0, mr.index).trim() : espec;
      const erange = mr ? (mr[2] ? 'linhas ' + mr[1] + '–' + mr[2] : 'linha ' + mr[1]) : '';
      const safeF = escapeHtml(efname || 'arquivo');
      codeBlocks.push(`<button class="edit-chip" data-edit-file="${safeF.replace(/"/g, '&quot;')}" onclick="LineEdit.openFileBtn(this)" title="Abrir arquivo atualizado">✏️ Edição aplicada: ${safeF}${erange ? ' · ' + escapeHtml(erange) : ''}</button>`);
      return `\u0000CODE${codeBlocks.length - 1}\u0000`;
    }
    let lang = '', name = '';
    if (raw.includes(':')) {
      const parts = raw.split(':');
      lang = (parts[0] || '').trim().toLowerCase();
      name = parts.slice(1).join(':').trim();
    } else if (raw.includes('.')) {
      name = raw;
      const ext = raw.split('.').pop().toLowerCase();
      const map = { py: 'python', js: 'javascript', ts: 'typescript', html: 'html', css: 'css', json: 'json', sh: 'bash', yml: 'yaml', yaml: 'yaml', md: 'markdown', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', rs: 'rust', go: 'go', php: 'php' };
      lang = map[ext] || ext;
    } else {
      lang = raw.toLowerCase();
    }
    const cleanCode = String(code || '').replace(/\n$/, '');
    if (!name) name = cleanCode.split('\n')[0].slice(0, 40).trim() || ('script.' + (lang || 'txt'));
    if (name.length > 42) name = name.slice(0, 42) + '…';
    const icons = { python: '🐍', javascript: '🟨', typescript: '🔷', html: '🌐', css: '🎨', json: '📦', bash: '💻', shell: '💻', sql: '🗄️', java: '☕', markdown: '📝' };
    const icon = icons[lang] || '📄';
    const idx = _w.__vessieScripts.length;
    _w.__vessieScripts.push({ name, lang: lang || 'txt', code: cleanCode });
    const safeName = escapeHtml(name);
    const safeLang = escapeHtml(lang || 'script');
    const safeAttr = safeName.replace(/"/g, '&quot;');
    codeBlocks.push(`<button class="script-open-btn" data-script-idx="${idx}" onclick="openScriptFromBtn(this)" title="Abrir ${safeAttr} no painel lateral"><span class="script-ico">${icon}</span><span class="script-txt"><span class="script-name">${safeName}</span><span class="script-lang">${safeLang} · clique para ver</span></span><span class="script-arrow">›</span></button>`);
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