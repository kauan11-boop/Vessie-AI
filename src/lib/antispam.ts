// Vessie AI — bloqueio de spam: impede que o modelo repita o mesmo conteúdo
// sem parar (no chat, no loop agêntico e no Discord). Comparação por trigramas
// com similaridade de Jaccard — barata, roda em qualquer dispositivo.

/** Normaliza texto: minúsculas, sem acentos/pontuação/emoji, palavras > 2 chars. */
function tokens(text: string): Set<string> {
  const clean = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = clean.split(" ").filter(w => w.length > 2);
  // trigramas de palavras — capturam repetição de frases inteiras
  const set = new Set<string>();
  if (words.length < 3) { words.forEach(w => set.add(w)); return set; }
  for (let i = 0; i <= words.length - 3; i++) set.add(words.slice(i, i + 3).join(" "));
  return set;
}

/** Similaridade de Jaccard entre dois textos (0–1). */
export function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Detecta spam: a resposta nova é "a mesma coisa" que algo que a IA já disse
 * recentemente (similaridade alta com as últimas N respostas).
 */
export function isSpam(newText: string, previous: string[], threshold = 0.62): boolean {
  const clean = newText.replace(/```[\s\S]*?```/g, "").trim();
  if (clean.length < 8) return false; // "ok", "pronto" etc. nunca é spam
  return previous.slice(-4).some(p => similarity(clean, p) >= threshold);
}

/** Distância mínima exigida entre envios do Discord (anti-flood). */
export function floodGuard(lastSent: string[], candidate: string, threshold = 0.55): boolean {
  return lastSent.some(p => similarity(candidate, p) >= threshold);
}
