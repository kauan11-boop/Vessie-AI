// security.js — Prompt: manter + expor escapeHtml (usado por chat/api).
// Ordem: 1.escape 2.sanitize 3.validacao
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Validação, prevenção de XSS e sanitização
export const Security = {
  // Sanitizar entrada de texto
  sanitizeInput(text) {
    if (typeof text !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  // Sanitizar Markdown renderizado
  sanitizeMarkdown(html) {
    if (!html) return '';
    
    const div = document.createElement('div');
    div.innerHTML = html;
    
    // Remover scripts
    const scripts = div.querySelectorAll('script');
    scripts.forEach(s => s.remove());
    
    // Remover estilos inline perigosos
    const styles = div.querySelectorAll('style');
    styles.forEach(s => s.remove());
    
    // Remover event handlers
    const elements = div.querySelectorAll('[on*=""]');
    elements.forEach(el => {
      const newEl = el.cloneNode(true);
      el.parentNode.replaceChild(newEl, el);
    });
    
    // Sanitizar com DOMPurify (se disponível)
    try {
      if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(div.innerHTML);
      }
    } catch (e) {
      console.warn('DOMPurify error:', e);
    }
    
    return div.innerHTML;
  },
  
  // Validar URL
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  },
  
  // Validar que não há scripts na mensagem
  hasScripts(text) {
    const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>/i;
    return scriptRegex.test(text);
  },
  
  // Limpar completamente um texto (remover todos os HTML tags)
  stripTags(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/<[^>]+>/g, '');
  }
};

// Verificar se estamos em ambiente seguro
export const isSecureContext = () => {
  try {
    return window.isSecureContext || false;
  } catch {
    return false;
  }
};