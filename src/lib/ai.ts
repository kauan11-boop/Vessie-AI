// Vessie AI — camada de IA multi-provider (corrige D7: apiKey e timeout usados de fato)
import type { Message, Settings } from "./types";
import { readSSE } from "./sse";

export interface WireMessage { role: "system" | "user" | "assistant"; content: string }

function headers(s: Settings): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (s.apiKey && s.apiKey.trim()) h["Authorization"] = `Bearer ${s.apiKey.trim()}`;
  return h;
}

function baseUrl(s: Settings): string {
  return s.baseUrl.replace(/\/+$/, "");
}

/** GET /models normalizado. */
export async function listModels(s: Settings, timeoutMs?: number): Promise<string[]> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), (timeoutMs ?? s.timeout) * 1000);
  try {
    const res = await fetch(`${baseUrl(s)}/models`, {
      headers: headers(s), signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const arr = j?.data ?? j?.models ?? [];
    return arr.map((m: { id?: string; name?: string }) => m.id ?? m.name).filter(Boolean);
  } finally {
    clearTimeout(to);
  }
}

export interface ChatResult {
  content: string;
  thinking: string;
}

/** POST /chat/completions com streaming ou não. onToken só dispara quando stream=true. */
export async function chatCompletions(
  s: Settings,
  wire: WireMessage[],
  opts: {
    stream?: boolean;
    signal?: AbortSignal;
    onToken?: (delta: string, full: string, extra: { thinking?: string }) => void;
    onThinking?: (thinking: string) => void;
    maxTokens?: number | null;
    temperature?: number;
  } = {}
): Promise<ChatResult> {
  const stream = opts.stream ?? s.stream;
  const payload: Record<string, unknown> = {
    model: s.model || "",
    messages: wire,
    temperature: opts.temperature ?? s.temperature,
    top_p: s.topP,
    stream,
  };
  const mt = opts.maxTokens ?? s.maxTokens;
  if (mt && mt > 0) payload.max_tokens = mt;

  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  const to = setTimeout(() => ctrl.abort(), Math.max(s.timeout, 30) * 1000);

  try {
    const res = await fetch(`${baseUrl(s)}/chat/completions`, {
      method: "POST",
      headers: headers(s),
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`HTTP ${res.status}${txt ? ` — ${txt}` : ""}`);
    }
    if (stream && res.headers.get("content-type")?.includes("text/event-stream")) {
      const { full, thinking } = await readSSE(res, {
        onToken: opts.onToken,
        onThinking: opts.onThinking,
        signal: ctrl.signal,
      });
      return { content: full, thinking };
    }
    const j = await res.json();
    return {
      content: j?.choices?.[0]?.message?.content ?? "",
      thinking: j?.choices?.[0]?.message?.reasoning_content ?? "",
    };
  } finally {
    clearTimeout(to);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/** Título curtíssimo (≤6 palavras) para a conversa; fallback local. */
export async function autoTitle(s: Settings, firstUser: string): Promise<string> {
  const fallback = firstUser.slice(0, 40).trim() || "Nova conversa";
  try {
    const r = await chatCompletions(s, [
      { role: "system", content: "Gere um título curtíssimo (máximo 6 palavras, sem aspas, sem ponto final) para uma conversa que começa com a mensagem do usuário. Responda só com o título." },
      { role: "user", content: firstUser.slice(0, 500) },
    ], { stream: false, maxTokens: 24, temperature: 0.3 });
    const t = r.content.trim().replace(/^["'\s]+|["'\s.]+$/g, "");
    return t ? t.slice(0, 60) : fallback;
  } catch {
    return fallback;
  }
}
