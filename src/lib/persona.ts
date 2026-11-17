// Vessie AI — Persona adaptativa: memória que a IA coleta continuamente das
// conversas (fatos, tópicos, estilo do dono) e injeta no system prompt, que se
// adapta com o tempo para as respostas saírem naturais e humanas.
// É a "memória conectada ao system prompt" — também usada pelo Discord para
// responder como o dono. Persistida em localStorage (vessie-persona-v1).
import { useChat } from "./store";

export interface PersonaFact { text: string; t: number; source: "chat" | "discord" }
export interface PersonaState {
  facts: PersonaFact[];       // fatos aprendidos sobre o dono (nome, gostos, projetos…)
  topics: string[];           // assuntos recorrentes
  exchanges: number;          // nº de trocas observadas
  avgUserLen: number;         // tamanho médio das mensagens do dono
  lastUpdated: number;
}

const KEY = "vessie-persona-v1";
const MAX_FACTS = 24;
const MAX_TOPICS = 10;

let state: PersonaState = {
  facts: [],
  topics: [],
  exchanges: 0,
  avgUserLen: 0,
  lastUpdated: 0,
};

let loaded = false;

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...state, ...(JSON.parse(raw) as PersonaState) };
  } catch { /* estado novo */ }
}

function save(): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* noop */ }
}

const STOP = new Set([
  "que", "para", "com", "uma", "não", "nao", "você", "voce", "mais", "isso", "aqui",
  "como", "muito", "quero", "mas", "por", "das", "dos", "ele", "ela", "nos", "já", "ja",
  "tem", "ser", "está", "esta", "the", "and", "you", "are", "have", "this", "that", "with",
]);

/** Extrai candidatos a fato: frases em que o dono fala de si. */
function extractFacts(text: string): string[] {
  const out: string[] = [];
  const sentences = text.split(/[.!?;\n]+/).map(s => s.trim()).filter(s => s.length >= 10 && s.length <= 220);
  const PATTERNS: RegExp[] = [
    /\b(meu nome é|me chamo|sou o|sou a|eu sou)\b/i,
    /\b(eu (gosto|amo|odeio|prefiro|quero|preciso|uso|trabalho|estudo|faço|faco|tenho|mor[oa])\b)/i,
    /\b(minha (casa|escola|empresa|equipe|máquina|maquina|conta|playlist|idade))\b/i,
    /\b(queria que|preciso de| tô construindo|estou construindo|estou criando|estou fazendo)\b/i,
    /\b(meu (projeto|sistema|discord|canal|servidor|jogo|app|site|kernel|iso|sistema operacional))\b/i,
    /\b(sempre|nunca) (fale|responda|responda|use|escreva)\b/i,
    /\b(me explica|explica|lembra|lembre)\b/i,
  ];
  for (const s of sentences) {
    if (PATTERNS.some(p => p.test(s))) out.push(s.slice(0, 200));
  }
  return out;
}

function extractTopics(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length >= 5 && !STOP.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
}

/** Dedup aproximado — não guarda o mesmo fato duas vezes. */
function isDuplicate(facts: PersonaFact[], text: string): boolean {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, " ").trim();
  const a = norm(text);
  return facts.some(f => norm(f.text) === a || (norm(f.text).length > 20 && a.includes(norm(f.text))));
}

/** Aprende com uma troca do CHAT (mensagem do dono + resposta da IA). */
export function learnFromExchange(userText: string): void {
  load();
  const text = userText.trim();
  if (text.length < 4) return;
  const facts = extractFacts(text);
  let changed = false;
  for (const f of facts) {
    if (!isDuplicate(state.facts, f)) {
      state.facts.push({ text: f, t: Date.now(), source: "chat" });
      changed = true;
    }
  }
  if (state.facts.length > MAX_FACTS) state.facts = state.facts.slice(-MAX_FACTS);
  const topics = extractTopics(text);
  for (const tp of topics) {
    if (!state.topics.includes(tp)) {
      state.topics.push(tp);
      changed = true;
    }
  }
  if (state.topics.length > MAX_TOPICS) state.topics = state.topics.slice(-MAX_TOPICS);
  const prevAvg = state.avgUserLen || text.length;
  state.avgUserLen = Math.round(prevAvg * 0.9 + text.length * 0.1);
  state.exchanges++;
  state.lastUpdated = Date.now();
  if (changed || state.exchanges % 5 === 0) save();
}

/** Aprende com mensagens do DONO lidas do Discord. */
export function learnFromDiscord(ownerMessages: string[]): void {
  load();
  for (const m of ownerMessages) {
    const text = m.trim();
    if (text.length < 4) continue;
    for (const f of extractFacts(text)) {
      if (!isDuplicate(state.facts, f)) {
        state.facts.push({ text: f, t: Date.now(), source: "discord" });
        if (state.facts.length > MAX_FACTS) state.facts = state.facts.slice(-MAX_FACTS);
      }
    }
    for (const tp of extractTopics(text)) {
      if (!state.topics.includes(tp)) state.topics.push(tp);
    }
  }
  if (state.topics.length > MAX_TOPICS) state.topics = state.topics.slice(-MAX_TOPICS);
  state.exchanges += ownerMessages.length;
  state.lastUpdated = Date.now();
  save();
}

/** Cartão adaptativo injetado no system prompt (vazio nas primeiras trocas). */
export function personaCard(): string {
  load();
  if (state.facts.length === 0 && state.exchanges < 3) return "";
  const bits: string[] = ["### Memória adaptativa (aprendida do dono — use para soar natural e humano)"];
  if (state.facts.length > 0) {
    bits.push("Fatos sobre o dono:");
    for (const f of state.facts.slice(-8)) bits.push(`- ${f.text}${f.source === "discord" ? " (via Discord)" : ""}`);
  }
  if (state.topics.length > 0) bits.push(`Assuntos recorrentes: ${state.topics.slice(-6).join(", ")}`);
  if (state.avgUserLen > 0) {
    bits.push(
      state.avgUserLen < 40
        ? "O dono escreve frases curtas — responda do mesmo jeito, curto e direto."
        : state.avgUserLen < 120
          ? "O dono escreve frases médias — mantenha o mesmo ritmo."
          : "O dono escreve mensagens longas — pode detalhar mais.",
    );
  }
  bits.push("Adapte o tom a cada conversa: fale como pessoa, não como manual. Nunca repita a mesma resposta — mude as palavras a cada vez.");
  return bits.join("\n");
}

/** Resumo para exibição (comando /persona). */
export function personaSummary(): string {
  load();
  const lines = [
    `🧠 Persona adaptativa — ${state.exchanges} troca(s) observada(s)`,
    state.facts.length ? `Fatos: ${state.facts.slice(-5).map(f => f.text).join(" · ")}` : "Fatos: (aprendendo…)",
    state.topics.length ? `Tópicos: ${state.topics.slice(-6).join(", ")}` : "Tópicos: —",
  ];
  return lines.join("\n");
}

/** Zera a memória adaptativa. */
export function resetPersona(): void {
  state = { facts: [], topics: [], exchanges: 0, avgUserLen: 0, lastUpdated: 0 };
  save();
}

/** Reinicializa aprendendo de TODO o histórico já existente (primeira ativação). */
export function bootstrapFromHistory(): void {
  load();
  if (state.exchanges > 0) return;
  const msgs = useChat.getState().conversations
    .flatMap(c => c.messages)
    .filter(m => m.role === "user")
    .slice(-60);
  for (const m of msgs) learnFromExchange(m.content);
}
