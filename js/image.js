// image.js — API completa de geração de imagens (Pollinations.ai, gratuita, sem chave).
// Ordem: 1.constantes 2.config 3.detect 4.build 5.generate 6.download
// Ex: buildImageUrl('um gato', { size: '1024x1024', model: 'flux' }) → URL pronta.
import { state } from './state.js?v=7';

export const IMAGE_SIZES = {
  '512x512': { width: 512, height: 512, label: 'Pequena (512×512)' },
  '768x768': { width: 768, height: 768, label: 'Média (768×768)' },
  '1024x1024': { width: 1024, height: 1024, label: 'Quadrada (1024×1024)' },
  '768x1024': { width: 768, height: 1024, label: 'Retrato (768×1024)' },
  '1024x768': { width: 1024, height: 768, label: 'Paisagem (1024×768)' }
};

export const IMAGE_MODELS = {
  flux: 'Flux (qualidade)',
  turbo: 'Turbo (rápida)'
};

export const IMAGE_TRIGGERS = [
  /^\/imagine(\s+|$)/i,
  /^crie uma imagem( de)?(\s+|$)/i,
  /^gere uma imagem( de)?(\s+|$)/i,
  /^gerar imagem( de)?(\s+|$)/i,
  /^cria uma imagem( de)?(\s+|$)/i,
  /^create an? image( of)?(\s+|$)/i,
  /^generate an? image( of)?(\s+|$)/i
];

export function getImageSettings() {
  const saved = (state.settings && state.settings.image) || {};
  const size = IMAGE_SIZES[saved.size] ? saved.size : '1024x1024';
  const model = IMAGE_MODELS[saved.model] ? saved.model : 'flux';
  return { size, model, ...IMAGE_SIZES[size] };
}

// Extrai o prompt ou retorna null se não for pedido de imagem.
export function extractImagePrompt(text) {
  let prompt = String(text || '').trim();
  if (!IMAGE_TRIGGERS.some(re => re.test(prompt))) return null;
  IMAGE_TRIGGERS.forEach(re => { prompt = prompt.replace(re, ''); });
  prompt = prompt.trim();
  return prompt || null;
}

export function newSeed() {
  return Math.floor(Math.random() * 1000000);
}

export function buildImageUrl(prompt, opts) {
  opts = opts || {};
  const cfg = getImageSettings();
  const width = opts.width || cfg.width;
  const height = opts.height || cfg.height;
  const model = opts.model || cfg.model;
  const seed = opts.seed != null ? opts.seed : newSeed();
  return {
    url: 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
      '?width=' + width + '&height=' + height + '&seed=' + seed + '&nologo=true&model=' + model,
    prompt, seed, width, height, model
  };
}

// Gera: valida, monta e pré-carrega para confirmar antes de entregar.
export async function generateImage(prompt, opts) {
  const clean = String(prompt || '').trim();
  if (!clean) throw new Error('Descreva a imagem. Ex: crie uma imagem de um gato astronauta');
  if (clean.length > 1000) throw new Error('Prompt muito longo (máx. 1000 caracteres)');
  const built = buildImageUrl(clean, opts);
  await preloadImage(built.url);
  return built;
}

export function preloadImage(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tempo esgotado ao gerar imagem')), timeoutMs || 60000);
    const img = new Image();
    img.onload = () => { clearTimeout(timer); resolve(url); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Falha ao gerar imagem')); };
    img.src = url;
  });
}

export async function downloadImage(url, filename) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'imagem-vessie.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
