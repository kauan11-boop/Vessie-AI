// Vessie AI — Sub-Agents: variantes do mascote por tipo de conteúdo/prompt.
// Cada tipo de trabalho (build, código, pesquisa, correção, discord, voz) gera
// uma variável do mascote (cor + badge + rótulo) exibida antes da mensagem.
// Os agentes criados via /agent ou ds:agent também viram sub-agents.

export type AgentVariant =
  | "general"    // Vessie padrão
  | "builder"    // Build-Iso / SO / kernel
  | "coder"      // scripts, JS, Python
  | "researcher" // web-search / fetch
  | "fixer"      // diagnóstico, terminal, correções
  | "discord"    // integração Discord
  | "voice";     // TTS / ditado

export interface VariantDef {
  id: AgentVariant;
  label: string;
  labelEn: string;
  badge: string;
  hue: number;      // rotação de matiz aplicada ao mascote
  sat: number;      // saturação
}

export const VARIANTS: Record<AgentVariant, VariantDef> = {
  general:    { id: "general",    label: "Vessie",   labelEn: "Vessie",    badge: "",   hue: 0,   sat: 1 },
  builder:    { id: "builder",    label: "Builder",  labelEn: "Builder",   badge: "💿", hue: -38, sat: 1.15 },
  coder:      { id: "coder",      label: "Coder",    labelEn: "Coder",     badge: "⚡", hue: 96,  sat: 1.1 },
  researcher: { id: "researcher", label: "Pesquisa", labelEn: "Research",  badge: "🔎", hue: 158, sat: 1.05 },
  fixer:      { id: "fixer",      label: "Fixer",    labelEn: "Fixer",     badge: "🛠", hue: -104, sat: 1.2 },
  discord:    { id: "discord",    label: "Discord",  labelEn: "Discord",   badge: "🎧", hue: 224, sat: 1.1 },
  voice:      { id: "voice",      label: "Voice",    labelEn: "Voice",     badge: "🎙", hue: 300, sat: 1.1 },
};

export function variantOf(id: string | undefined | null): VariantDef {
  if (id && id in VARIANTS) return VARIANTS[id as AgentVariant];
  return VARIANTS.general;
}

/** Ferramentas ds:* que ativam uma variante específica. */
const KIND_VARIANT: Record<string, AgentVariant> = {
  iso: "builder", boot: "builder", template: "builder",
  run: "coder", script: "coder", preview: "coder",
  search: "researcher", fetch: "researcher",
  term: "fixer", send: "fixer", problem: "fixer",
  discord: "discord",
  image: "general",
};

const TEXT_HINTS: Array<{ re: RegExp; v: AgentVariant }> = [
  { re: /\b(iso|boot[aá]vel|kernel|sistema operacional|build[- ]?iso|el torito|compil)\b/i, v: "builder" },
  { re: /\b(script|python|javascript|c[oó]digo|function|classe|py\b|\.js)\b/i, v: "coder" },
  { re: /\b(pesquis|busca|search|fonte|not[ií]cia|wiki|url|site)\b/i, v: "researcher" },
  { re: /\b(erro|bug|problema|corrig|diagn[oó]stico|debug|fix|falha)\b/i, v: "fixer" },
  { re: /\b(discord|canal|servidor do discord)\b/i, v: "discord" },
  { re: /\b(voz|falar|audio|tts|dictado|ditado|narrar)\b/i, v: "voice" },
];

/**
 * Decide a variante do sub-agent para uma resposta:
 * 1) ferramentas ds:* usadas na resposta; 2) palavras-chave do texto;
 * 3) agente ativo (perfil salvo); 4) general.
 */
export function detectVariant(text: string, toolKinds: string[], activeAgentInstr?: string): AgentVariant {
  for (const k of toolKinds) {
    if (KIND_VARIANT[k]) return KIND_VARIANT[k];
  }
  for (const h of TEXT_HINTS) {
    if (h.re.test(text)) return h.v;
  }
  if (activeAgentInstr) {
    const instr = activeAgentInstr.toLowerCase();
    if (/iso|kernel|sistema|boot/.test(instr)) return "builder";
    if (/c[oó]digo|script|python|js/.test(instr)) return "coder";
    if (/pesquis|web|busca/.test(instr)) return "researcher";
    if (/discord/.test(instr)) return "discord";
    if (/erro|corrige|diagn/.test(instr)) return "fixer";
    if (/voz|fala|audio/.test(instr)) return "voice";
  }
  return "general";
}

/** CSS filter do mascote para a variante. */
export function variantFilter(v: VariantDef): string {
  if (v.hue === 0 && v.sat === 1) return "";
  return `hue-rotate(${v.hue}deg) saturate(${v.sat})`;
}
