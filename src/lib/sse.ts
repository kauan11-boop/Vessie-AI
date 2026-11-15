// Vessie AI — leitor SSE universal (fetch + ReadableStream), padrão B.3.1
// Suporta delta.content e delta.reasoning_content|reasoning (Qwen3). Cancelável.

export interface SSECallbacks {
  onToken?: (delta: string, full: string, extra: { thinking?: string }) => void;
  onThinking?: (thinking: string) => void;
  signal?: AbortSignal;
}

export interface SSEResult {
  full: string;
  thinking: string;
}

/** Lê uma resposta SSE de POST /chat/completions. Nunca usa EventSource (POST + headers). */
export async function readSSE(res: Response, cb: SSECallbacks): Promise<SSEResult> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response has no body");
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  let thinking = "";
  try {
    while (true) {
      if (cb.signal?.aborted) { await reader.cancel(); break; }
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const data = s.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let j: {
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string; reasoning?: string } }>;
        };
        try { j = JSON.parse(data); } catch { continue; }
        const delta = j.choices?.[0]?.delta;
        if (!delta) continue;
        const th = delta.reasoning_content ?? delta.reasoning;
        if (th) {
          thinking += th;
          cb.onThinking?.(thinking);
        }
        if (delta.content) {
          full += delta.content;
          cb.onToken?.(delta.content, full, { thinking: thinking || undefined });
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* já cancelado */ }
  }
  return { full, thinking };
}
