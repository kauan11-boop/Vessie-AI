// Vessie AI — geração de imagens via Pollinations (B.3.4)
import type { ImageResult, Settings } from "./types";

export const IMAGE_SIZES = [
  { id: "512x512", label: "Pequena (512×512)" },
  { id: "768x768", label: "Média (768×768)" },
  { id: "1024x1024", label: "Quadrada (1024×1024)" },
  { id: "768x1024", label: "Retrato (768×1024)" },
  { id: "1024x768", label: "Paisagem (1024×768)" },
];

export const IMAGE_MODELS = [
  { id: "flux", label: "Flux (qualidade)" },
  { id: "turbo", label: "Turbo (rápida)" },
];

const TRIGGERS: RegExp[] = [
  /\/imagine\s+/i,
  /crie\s+uma\s+imagem\s+(de|do|da)?\s*/i,
  /cria\s+uma\s+imagem\s+(de|do|da)?\s*/i,
  /gere\s+uma\s+imagem\s+(de|do|da)?\s*/i,
  /gerar\s+imagem\s+(de|do|da)?\s*/i,
  /create\s+an?\s+image\s+(of)?\s*/i,
  /generate\s+an?\s+image\s+(of)?\s*/i,
];

const INTENT_NOUNS = /(imagem|foto|ilustra|desenho|picture|image|painting)/i;
const INTENT_VERBS = /(criar|crie|gerar|gere|fazer|desenhar|pintar|create|generate|draw|make)/i;

export function extractImagePrompt(text: string): string | null {
  for (const re of TRIGGERS) {
    if (re.test(text)) {
      const prompt = text.replace(re, "").trim();
      if (prompt) return prompt;
    }
  }
  return null;
}

export function isImageIntent(text: string): boolean {
  return INTENT_VERBS.test(text) && INTENT_NOUNS.test(text) && text.length < 300;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 999999);
}

export function buildImageUrl(prompt: string, size: string, model: string, seed: number): string {
  const [w, h] = size.split("x").map(n => parseInt(n, 10));
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=${model}`;
}

export function toImageResult(prompt: string, url: string, size: string, model: string, seed: number): ImageResult {
  const [w, h] = size.split("x").map(n => parseInt(n, 10));
  return { url, prompt, seed, width: w, height: h, model };
}

// dicionário PT→EN local + sufixos de qualidade (fallback offline)
const PT_EN: Array<[RegExp, string]> = [
  [/\bgato\b/gi, "cat"], [/\bcachorro\b/gi, "dog"], [/\bpássaro\b/gi, "bird"],
  [/\bespaço\b/gi, "space"], [/\bestrela\b/gi, "star"], [/\bmundo\b/gi, "world"],
  [/\bcidade\b/gi, "city"], [/\bfloresta\b/gi, "forest"], [/\bmontanha\b/gi, "mountain"],
  [/\boceano\b/gi, "ocean"], [/\bpessoa\b/gi, "person"], [/\bmulher\b/gi, "woman"],
  [/\bhomem\b/gi, "man"], [/\bcriança\b/gi, "child"], [/\bflores?\b/gi, "flowers"],
  [/\bsol\b/gi, "sun"], [/\blua\b/gi, "moon"], [/\bnoite\b/gi, "night"],
  [/\bdia\b/gi, "day"], [/\bfogo\b/gi, "fire"], [/\bágua\b/gi, "water"],
  [/\brobo|\brobô\b/gi, "robot"], [/\bdragão\b/gi, "dragon"], [/\bfantasia\b/gi, "fantasy"],
  [/\bnave\b/gi, "spaceship"], [/\bastronauta\b/gi, "astronaut"], [/\bcenoura\b/gi, "carrot"],
];
const QUALITY = "masterpiece, best quality, ultra detailed, 8k, cinematic lighting, sharp focus";

export function enhancePromptLocally(prompt: string): string {
  let en = prompt;
  for (const [re, rep] of PT_EN) en = en.replace(re, rep);
  return `${en}, ${QUALITY}`;
}

/** Verifica se a imagem carregou (com timeout). Resolve com a URL ou lança. */
export function preloadImage(url: string, timeoutMs = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const to = setTimeout(() => { img.src = ""; reject(new Error("Tempo esgotado ao gerar imagem")); }, timeoutMs);
    img.onload = () => { clearTimeout(to); resolve(); };
    img.onerror = () => { clearTimeout(to); reject(new Error("Falha ao gerar imagem")); };
    img.src = url;
  });
}

export function extractImageBlocks(text: string): string[] {
  const re = /```image:([^\n]+)\n?```/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].trim());
  return out;
}

export function stripImageBlocks(text: string): string {
  return text.replace(/```image:[^\n]+```/g, "").trim();
}

export function downloadImageUrl(url: string, seed: number): Promise<void> {
  return fetch(url)
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `vessie-${seed}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
}
