// Vessie AI — corretor ortográfico PT-BR offline (padrão preservado do app atual)
// Protege ```code```, `inline`, URLs e e-mails antes de substituir; respeita toggle.
const PAIRS: Array<[RegExp, string]> = [
  [/\bvc\b/gi, "você"], [/\bvcs\b/gi, "vocês"], [/\btb\b/gi, "também"],
  [/\btbm\b/gi, "também"], [/\bhj\b/gi, "hoje"], [/\bqm\b/gi, "quem"],
  [/\bpq\b/gi, "porque"], [/\bmsm\b/gi, "mesmo"], [/\bagr\b/gi, "agora"],
  [/\btd\b/gi, "tudo"], [/\bblz\b/gi, "beleza"], [/\bvlw\b/gi, "valeu"],
  [/\bflw\b/gi, "falou"], [/\bmto\b/gi, "muito"], [/\bmt\b/gi, "muito"],
  [/\bsqnd\b/gi, "sem querer desanimar"], [/\bngm\b/gi, "ninguém"],
  [/\bqnd\b/gi, "quando"], [/\bpra\b/gi, "para"], [/\bpro\b/gi, "para o"],
  [/\bnaum\b/gi, "não"], [/\bnao\b/gi, "não"], [/\bta\b/gi, "está"],
  [/\btá\b/gi, "está"], [/\bto\b/gi, "estou"], [/\btô\b/gi, "estou"],
  [/\bcbç\b/gi, "cabeça"], [/\bagr\.\b/gi, "agora "],
];

function protect(text: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const re = /(```[\s\S]*?```|`[^`]+`|https?:\/\/\S+|[\w.+-]+@[\w.-]+\.\w+)/g;
  const masked = text.replace(re, m => {
    tokens.push(m);
    return `\u0000${tokens.length - 1}\u0000`;
  });
  return { text: masked, tokens };
}

function restore(text: string, tokens: string[]): string {
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)] ?? "");
}

function matchCase(source: string, replacement: string): string {
  if (source === source.toLowerCase()) return replacement;
  return replacement;
}

/** Corrige abreviações comuns de PT-BR sem tocar em código/URLs/e-mails. */
export function autoCorrect(text: string): string {
  if (!text) return text;
  const { text: masked, tokens } = protect(text);
  let out = masked;
  for (const [re, rep] of PAIRS) {
    out = out.replace(re, m => matchCase(m, rep));
  }
  return restore(out, tokens);
}
