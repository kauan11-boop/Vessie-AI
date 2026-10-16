// image/image-gen.js - Image generation via Pollinations API
import { settings } from '../../config/config.js';

export function isImageRequest(text) {
  const lower = (text || '').toLowerCase();
  return lower.startsWith('/imagine') || lower.startsWith('create image') || lower.startsWith('genere uma imagem') || lower.startsWith('genere imagem');
}

export function buildImagePayload(chat, userMessage) {
  const lower = (userMessage || '').toLowerCase();

  // Detect image request patterns
  if (!isImageRequest(userMessage)) return null;

  // Clean the prompt - remove /imagine or similar prefixes
  let prompt = userMessage.replace(/^\/imagine\s*/i, '').replace(/^(create image|genere uma imagem|genere imagem)\s*/i, '').trim();

  // If empty after cleaning, suggest something
  if (!prompt) {
    prompt = 'uma paisagem tranquila ao entardecer';
  }

  return {
    prompt,
    format: 'json',
    model: 'image'
  };
}

export function buildImageCard(url, prompt, metadata = {}) {
  const title = metadata.title || 'Imagem gerada';
  const desc = metadata.desc || prompt.substring(0, 80) + (prompt.length > 80 ? '…' : '');

  return `<div class="img-card">
    <div class="img-head">
      <span>${title}</span>
      <span class="tiny">↓ Baixar</span>
    </div>
    <div class="img-body">
      <img src="${url}" alt="${prompt}" loading="lazy">
    </div>
    <div class="img-foot">
      <span>${desc}</span>
      <button class="btn tiny" onclick="copyImageUrl(this)">Copiar URL</button>
    </div>
  </div>`;
}

export function copyImageUrl(btn) {
  const card = btn.closest('.img-card');
  const img = card.querySelector('img');
  if (img && img.src) {
    navigator.clipboard.writeText(img.src).then(() => {
      showToast('URL da imagem copiada');
    });
  }
}