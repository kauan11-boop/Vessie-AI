// Vessie AI — integração Discord DIRETO NA CONTA (sem bot).
// Modo padrão "user": a IA usa o SEU token de conta (Authorization: <token>) e
// age como você — lê canais, aprende seu jeito de falar e responde como se fosse
// você, com memória adaptativa ligada ao system prompt. Sem criar bot, sem
// portal de desenvolvedor, sem convite de servidor.
// Modo "bot" continua disponível como alternativa para quem preferir a API oficial.
//
// AVISO (exibido nas configurações): acesso com token de conta não é API oficial
// do Discord e viola os termos deles — use por sua conta e risco.
import { useSettings, useChat } from "./store";
import { personaCard, learnFromDiscord } from "./persona";
import { floodGuard } from "./antispam";

const API = "https://discord.com/api/v10";

export interface DiscordMsg {
  id: string;
  author: { username: string; bot?: boolean };
  content: string;
  timestamp: string;
}

function cfg() { return useSettings.getState().settings.discord; }

export function discordConfigured(): boolean {
  const c = cfg();
  return c.token.trim().length > 40 && /^\d{5,}$/.test(c.channelId.trim());
}

function authHeader(): string {
  const c = cfg();
  // modo "user" = conta direta; modo "bot" = API oficial
  return c.mode === "bot" ? `Bot ${c.token.trim()}` : c.token.trim();
}

async function discordFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

/** Identidade da conta conectada (modo user = a sua própria conta). */
export async function discordWhoAmI(): Promise<{ username: string; id: string }> {
  const res = await discordFetch("/users/@me");
  const u = (await res.json()) as { username: string; id: string };
  return { username: u.username, id: u.id };
}

/** Últimas mensagens do canal (mais antigas primeiro). */
export async function discordRead(limit = 20): Promise<DiscordMsg[]> {
  const c = cfg();
  const res = await discordFetch(`/channels/${c.channelId.trim()}/messages?limit=${Math.min(100, Math.max(1, limit))}`);
  const list = (await res.json()) as DiscordMsg[];
  // coleta os jeitos de falar do dono para a memória adaptativa
  try {
    if (!c.styleCard) {
      const me = await discordWhoAmI();
      const mine = list.filter(m => m.author.username === me.username).map(m => m.content);
      if (mine.length > 0) learnFromDiscord(mine);
    }
  } catch { /* aprendizado não bloqueia leitura */ }
  return list.reverse();
}

// ---------- anti-spam de envio ----------
const sentHistory: string[] = [];
let lastSendAt = 0;

/** Envia mensagem para o canal (com anti-flood: mínimo 4 s entre envios). */
export async function discordSend(text: string): Promise<void> {
  const c = cfg();
  const now = Date.now();
  const wait = Math.max(0, 4000 - (now - lastSendAt));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  await discordFetch(`/channels/${c.channelId.trim()}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: text.slice(0, 2000) }),
  });
  lastSendAt = Date.now();
  sentHistory.push(text);
  if (sentHistory.length > 12) sentHistory.shift();
}

// ---------- perfil de estilo ----------

export interface StyleProfile {
  avgLen: number;
  emojiRate: number;       // emojis por mensagem
  questionRate: number;
  upperStart: number;      // % que começa com maiúscula
  punct: string[];         // pontuação característica
  commonWords: string[];
  samples: string[];
  card: string;            // cartão de estilo textual (prompt)
}

/**
 * Perfil de estilo a partir das mensagens do usuário no chat — é assim que a
 * IA troca o jeito de falar e monta um gênero fiel ao dono.
 */
export function buildStyleProfile(userMessages: string[]): StyleProfile {
  const msgs = userMessages.map(m => m.trim()).filter(m => m.length > 0 && !m.startsWith("```")).slice(-200);
  const empty: StyleProfile = {
    avgLen: 0, emojiRate: 0, questionRate: 0, upperStart: 0, punct: [],
    commonWords: [], samples: [], card: "",
  };
  if (msgs.length === 0) return empty;
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu;
  const avgLen = Math.round(msgs.reduce((s, m) => s + m.length, 0) / msgs.length);
  const emojiRate = +(msgs.reduce((s, m) => s + (m.match(emojiRe)?.length ?? 0), 0) / msgs.length).toFixed(2);
  const questionRate = +(msgs.filter(m => m.includes("?")).length / msgs.length).toFixed(2);
  const upperStart = Math.round(msgs.filter(m => /^[A-ZÀ-Ú]/.test(m)).length / msgs.length * 100);
  const punct = ["!", "?", "…", "rs", "kkk", "haha", "😂", "🤣", "❤️", "👋"].filter(p => msgs.some(m => m.toLowerCase().includes(p.toLowerCase())));
  const freq = new Map<string, number>();
  for (const m of msgs) {
    for (const w of m.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/)) {
      if (w.length >= 4) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const commonWords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w);
  const samples = [...msgs].sort((a, b) => b.length - a.length).slice(0, 6).map(m => m.slice(0, 140));
  const card = [
    `Estilo do dono (${msgs.length} mensagens analisadas):`,
    `- tamanho médio: ${avgLen} caracteres (${avgLen < 40 ? "frases curtas" : avgLen < 120 ? "frases médias" : "frases longas"})`,
    `- emojis: ${emojiRate}/mensagem · perguntas: ${Math.round(questionRate * 100)}% · começa maiúscula: ${upperStart}%`,
    `- marcações típicas: ${punct.length ? punct.join(" ") : "nenhuma"}`,
    `- palavras frequentes: ${commonWords.slice(0, 8).join(", ") || "—"}`,
    `- exemplos reais: ${samples.slice(0, 3).map(s => `"${s}"`).join(" / ") || "—"}`,
    "Responda imitando esse estilo: mesmo tamanho de frase, mesma pontuação, mesmos emojis, mesmo nível de formalidade. Nunca pareça um assistente corporativo. Nunca repita a mesma resposta duas vezes.",
  ].join("\n");
  return { avgLen, emojiRate, questionRate, upperStart, punct, commonWords, samples, card };
}

/** Gera a resposta "como o dono" (modelo conectado) ou null se OFFLINE. */
export async function composeStyledReply(
  incoming: DiscordMsg[],
  history: DiscordMsg[],
  styleCard: string
): Promise<string | null> {
  const { chatCompletions } = await import("./ai");
  const s = useSettings.getState().settings;
  if (s.model === "OFFLINE") return null;
  const persona = s.personaMemory ? personaCard() : "";
  const wire = [
    {
      role: "system" as const,
      content:
        `Você controla a conta Discord do dono da Vessie-AI. Responda a conversa do canal EXATAMENTE no estilo dele — curto, natural, como pessoa real. Nunca revele que é uma IA nem que é um bot. Nunca repita a mesma resposta que já foi enviada antes.\n\n${styleCard}${persona ? `\n\n${persona}` : ""}`,
    },
    ...history.slice(-10).map(m => ({
      role: m.author.bot ? ("assistant" as const) : ("user" as const),
      content: `${m.author.username}: ${m.content}`.slice(0, 400),
    })),
    {
      role: "user" as const,
      content: incoming.map(m => `${m.author.username}: ${m.content}`.slice(0, 400)).join("\n"),
    },
  ];
  const r = await chatCompletions(s, wire, { stream: false, maxTokens: 220, temperature: 0.9 });
  const text = r.content.trim().replace(/^["“”]|["“”]$/g, "");
  return text || null;
}

// ---------- poller ----------
type PollCb = (info: { sent: boolean; reason?: string }) => void;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastMsgId = "";

/** Monitora o canal e responde sozinho quando autoReply ligado. */
export function startDiscordPolling(onEvent: PollCb): void {
  stopDiscordPolling();
  const intervalMs = Math.max(15, cfg().intervalSec) * 1000;
  pollTimer = setInterval(() => { void pollOnce(onEvent); }, intervalMs);
  void pollOnce(onEvent);
}

export function stopDiscordPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

export function isPolling(): boolean { return pollTimer !== null; }

async function pollOnce(onEvent: PollCb): Promise<void> {
  const c = cfg();
  if (!c.autoReply || !discordConfigured()) return;
  try {
    const msgs = await discordRead(20);
    if (msgs.length === 0) return;
    const fresh = lastMsgId ? msgs.filter(m => m.id > lastMsgId && !m.author.bot) : [];
    lastMsgId = msgs[msgs.length - 1].id;
    if (fresh.length === 0) return;
    const profile = c.styleCard
      ? { card: c.styleCard }
      : buildStyleProfile(collectUserMessages());
    const reply = await composeStyledReply(fresh, msgs.slice(0, -1), profile.card);
    if (!reply) { onEvent({ sent: false, reason: "OFFLINE — não inventa resposta" }); return; }
    // bloqueio de spam: não reenviar o mesmo conteúdo
    if (floodGuard(sentHistory, reply)) {
      onEvent({ sent: false, reason: "resposta repetida bloqueada (anti-spam)" });
      return;
    }
    await discordSend(reply);
    onEvent({ sent: true });
  } catch (e) {
    onEvent({ sent: false, reason: (e as Error).message });
  }
}

/** Mensagens do usuário em todas as conversas (para o perfil de estilo). */
function collectUserMessages(): string[] {
  return useChat.getState().conversations
    .flatMap(c => c.messages)
    .filter(m => m.role === "user")
    .map(m => m.content);
}
