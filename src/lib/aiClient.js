// Cliente para qualquer backend compatível com a API "chat/completions" da OpenAI.
// Funciona direto com o LM Studio (padrão: http://localhost:1234/v1), com a API
// da OpenAI, ou com qualquer proxy compatível. Configurável em tempo de execução
// pela tela de Configurações (fica salvo no localStorage do navegador).

const DEFAULT_SETTINGS = {
  baseUrl: "http://localhost:1234/v1",
  apiKey: "",
  model: "local-model",
  temperature: 0.4,
  reasoningEffort: "",
  webSearchApiKey: "",
};

const STORAGE_KEY = "vessie-agent-settings";

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function formatAIError(error, baseUrl = loadSettings().baseUrl) {
  if (error?.name === "AbortError") return "Operação interrompida.";
  const message = error?.message || "Erro desconhecido";
  if (/failed to fetch|networkerror|load failed|fetch failed|err_connection/i.test(message)) {
    return `Não foi possível conectar ao modelo em ${baseUrl || "(URL vazia)"}. Confirme a URL, que o servidor e o modelo estão ativos e que o navegador tem permissão de conexão (CORS).`;
  }
  if (/\b(401|403)\b/.test(message)) {
    return `A API recusou a autenticação em ${baseUrl}. Confira a chave de API nas Configurações.`;
  }
  if (/\b404\b/.test(message)) {
    return `O endpoint ou modelo não foi encontrado em ${baseUrl}. Confira a URL base e o identificador exato do modelo.`;
  }
  if (/\b(400|422)\b/.test(message)) {
    return `O servidor recusou o pedido para o modelo configurado. Confira o identificador e os parâmetros do modelo. Detalhe: ${message}`;
  }
  return `Não foi possível concluir a solicitação à IA: ${message}`;
}

function buildChatPayload(settings, messages, stream) {
  return {
    model: settings.model,
    messages,
    stream,
    ...(settings.reasoningEffort
      ? { reasoning_effort: settings.reasoningEffort }
      : { temperature: Number(settings.temperature ?? 0.4) }),
  };
}

export async function testModel(settings) {
  const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(buildChatPayload(settings, [{ role: "user", content: "Responda somente OK." }], false)),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha na requisição (${response.status}): ${detail || response.statusText}`);
  }
  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content;
  if (typeof answer !== "string") throw new Error("O servidor respondeu sem conteúdo. Confira se o modelo está carregado e é compatível com chat completions.");
  return answer.trim();
}

export async function searchWeb(query, signal, settings = loadSettings()) {
  const apiKey = settings.webSearchApiKey?.trim();
  if (!apiKey) throw new Error("A busca web está desativada. Adicione uma chave Tavily nas Configurações.");

  let response;
  try {
    response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(`Não foi possível acessar a busca Tavily. Confira a conexão e se o serviço permite chamadas CORS do navegador. ${error.message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`A busca Tavily recusou a solicitação (${response.status}): ${detail || response.statusText}`);
  }

  const result = await response.json();
  const sources = (Array.isArray(result.results) ? result.results : []).map((item, index) =>
    `${index + 1}. ${item.title || "Sem título"}\nURL: ${item.url || ""}\nResumo: ${(item.content || "").slice(0, 1800)}`
  );
  return sources.length ? sources.join("\n\n") : "A busca não encontrou resultados relevantes.";
}

export async function listModels(settings) {
  const url = `${settings.baseUrl.replace(/\/$/, "")}/models`;
  const response = await fetch(url, {
    headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha na conexão (${response.status}): ${detail || response.statusText}`);
  }
  const result = await response.json();
  return Array.isArray(result.data) ? result.data.map((model) => model.id).filter(Boolean) : [];
}

/**
 * Envia uma conversa para o backend e transmite os pedaços de texto conforme chegam.
 * @param {Array<{role:string, content:string}>} messages
 * @param {(chunk:string) => void} onToken
 * @param {AbortSignal} signal
 */
export async function streamChat(messages, onToken, signal) {
  const settings = loadSettings();
  const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(buildChatPayload(settings, messages, true)),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha na requisição (${res.status}): ${text || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer.trim()) buffer += "\n";
    } else {
      buffer += decoder.decode(value, { stream: true });
    }

    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          onToken(delta);
        }
      } catch {
        // linha incompleta ou não-JSON: ignora
      }
    }
    if (done) break;
  }

  return full;
}

/** Versão sem streaming (usada nas rodadas automáticas do agente). */
export async function chatOnce(messages, signal) {
  const settings = loadSettings();
  const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(buildChatPayload(settings, messages, false)),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha na requisição (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}
