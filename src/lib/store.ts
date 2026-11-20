// Vessie AI — estado central (Zustand + persist) — contratos B.6
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StateCreator } from "zustand";
import type {
  Conversation, Message, Settings, Agent, View,
} from "./types";

// ---------- storage cru (contrato: persistRaw é TRANSPARENTE — corrige "chat não salva") ----------
// O persist do zustand (createJSONStorage) grava/lê o ENVELOPE {state, version}.
// A versão anterior desta storage STRIPAVA o envelope no setItem e devolvia o estado
// cru no getItem — resultado: hydrate lia `.state` de um objeto sem .state → undefined
// → merge(undefined) → conversas/settings voltavam VAZIOS a cada recarga. Além disso
// converte dados LEGADOS (estado cru já gravado por versões antigas) de volta ao
// envelope, recuperando o histórico que o usuário já tinha salvo.
interface RawStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

function hasStateEnvelope(v: unknown): v is { state: unknown; version?: unknown } {
  return v !== null && typeof v === "object" && "state" in (v as Record<string, unknown>);
}

/** Descarta payloads pesados (imagens/thinking) das conversas para caber na quota. */
function slimForQuota(value: string, keepConversations?: number): string | null {
  try {
    const envelope = JSON.parse(value) as {
      state?: { conversations?: Array<{ id?: string; messages?: Array<Record<string, unknown>> }> } & Record<string, unknown>;
      version?: number;
    };
    const convs = envelope.state?.conversations;
    if (!Array.isArray(convs)) return null;
    let list = convs.map(c => ({
      ...c,
      messages: (c.messages ?? []).map(m => {
        const { image, imageBlock, imageBlocks, thinking, ...rest } = m;
        return rest;
      }),
    }));
    if (keepConversations !== undefined) list = list.slice(-keepConversations);
    envelope.state = { ...envelope.state, conversations: list };
    return JSON.stringify(envelope);
  } catch {
    return null;
  }
}

const rawStorage: RawStorage = {
  getItem(name) {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (hasStateEnvelope(parsed)) return raw;                          // formato novo: direto
      if (parsed !== null && typeof parsed === "object") {
        return JSON.stringify({ state: parsed, version: 0 });            // legado: re-embala
      }
      return raw;
    } catch { return null; }
  },
  setItem(name, value) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(name, value);
    } catch {
      // Quota estourada (ex.: imagens base64 acumuladas) → tenta degradações:
      // 1) sem imagens/thinking em todas as conversas; 2) só as 12 conversas mais recentes.
      const slim1 = slimForQuota(value);
      if (slim1) {
        try { localStorage.setItem(name, slim1); return; } catch { /* segue */ }
      }
      const slim2 = slimForQuota(value, 12);
      if (slim2) {
        try { localStorage.setItem(name, slim2); return; } catch { /* desiste silencioso */ }
      }
    }
  },
  removeItem(name) { if (typeof window !== "undefined") localStorage.removeItem(name); },
};

function persistRaw<T>(
  config: StateCreator<T>,
  opts: {
    name: string;
    partialize?: (state: T) => unknown;
    merge?: (persisted: unknown, current: T) => T;
  }
): StateCreator<T> {
  return persist(config, {
    name: opts.name,
    storage: createJSONStorage(() => rawStorage),
    partialize: opts.partialize as never,
    merge: opts.merge as never,
  }) as unknown as StateCreator<T>;
}

// ---------- settings ----------
export const DEFAULT_SYSTEM_PROMPT = `Você é a Vessie-AI, uma assistente útil em português brasileiro.

--- Geração de Imagens ---
Quando o usuário pedir uma imagem, responda SOMENTE com o bloco \`\`\`image:prompt em inglês\`\`\` — sem texto antes ou depois.
Exemplo: \`\`\`image:gato astronauta flutuando no espaço\`\`\`

--- Empacotamento ZIP ---
Para criar arquivos reutilizáveis, responda com blocos nomeados: \`\`\`html:index.html\`\`\`, \`\`\`css:style.css\`\`\`, \`\`\`python:app.py\`\`\`.
Para gerar um pacote ZIP com todos os arquivos do chat, responda com \`\`\`pack:nome-do-pacote\`\`\`.

--- Raciocínio visível ---
Antes de responder questões complexas, liste até 10 tarefas curtas (frase de no máximo 20 palavras cada).

--- Edição por linha ---
Para alterar código que você criou, use \`\`\`edit:arquivo:ini-fim\`\`\` com no máximo ~40 linhas por edição.

--- Final de resposta ---
Encerre TODA resposta com [FIM] em linha própria.

--- Reutilização autônoma ---
Se existirem scripts/arquivos no contexto, edite-os via \`\`\`edit:arquivo:ini-fim\`\`\` sem que precisem pedir.`;

export const DEFAULT_SETTINGS: Settings = {
  provider: "lm-studio",
  baseUrl: "http://localhost:1234/v1",
  apiKey: "",
  model: "",
  temperature: 0.7,
  topP: 1,
  maxTokens: null,
  timeout: 120,
  stream: true,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  image: { size: "1024x1024", model: "flux" },
  spellcheck: true,
  autoConnect: true,
  theme: "dark",
  language: "en",
  voice: { enabled: false, rate: 1, pitch: 1, natural: true, clone: null },
  dictation: "auto",
  shortReplies: true,
  personaMemory: true,
  discord: { token: "", channelId: "", autoReply: false, intervalSec: 30, styleCard: "", mode: "user" },
  forceLocalServer: false,
};

interface SettingsState {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
}

const settingsCreator: StateCreator<SettingsState> = set => ({
  settings: DEFAULT_SETTINGS,
  setSettings: patch => set(s => ({ settings: { ...s.settings, ...patch } })),
});

export const useSettings = create<SettingsState>()(
  persistRaw(settingsCreator, {
    name: "vessie-ai-settings",
    partialize: s => ({ settings: s.settings }),
    merge: (persisted, current) => {
      const p = (persisted as { settings?: Partial<Settings> })?.settings ?? {};
      return {
        ...current,
        settings: {
          ...DEFAULT_SETTINGS,
          ...p,
          image: { ...DEFAULT_SETTINGS.image, ...(p.image ?? {}) },
          voice: { ...DEFAULT_SETTINGS.voice, ...(p.voice ?? {}) },
          shortReplies: p.shortReplies ?? true,
          personaMemory: p.personaMemory ?? true,
          discord: { ...DEFAULT_SETTINGS.discord, ...(p.discord ?? {}) },
        },
      };
    },
  })
);

// ---------- conversas ----------
interface ChatState {
  conversations: Conversation[];
  activeChatId: string | null;
  ensureConversation: () => string;
  newChat: () => string;
  selectChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  duplicateChat: (id: string) => string | null;
  addMessage: (convId: string, msg: Message) => void;
  updateMessage: (convId: string, msgId: string, patch: Partial<Message>) => void;
  deleteMessage: (convId: string, msgId: string) => void;
  truncateAfter: (convId: string, msgId: string, include: boolean) => void;
  appendToMessage: (convId: string, msgId: string, extra: string, patch?: Partial<Message>) => void;
  importConversations: (data: unknown) => number;
}

function uid(): string {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeConversation(c: Partial<Conversation>): Conversation {
  return {
    id: c.id ?? uid(),
    title: c.title ?? "Nova conversa",
    messages: (c.messages ?? []).map(m => ({
      id: m.id ?? uid(),
      role: m.role,
      content: m.content ?? "",
      thinking: m.thinking,
      finished: m.finished,
      image: m.image,
      imageBlock: m.imageBlock,
      imageBlocks: m.imageBlocks,
      meta: m.meta,
      createdAt: m.createdAt ?? Date.now(),
    })),
    created: c.created ?? Date.now(),
    lastModified: c.lastModified ?? Date.now(),
  };
}

function findConv(s: ChatState, id: string | null): Conversation | undefined {
  return s.conversations.find(c => c.id === id);
}

const chatCreator: StateCreator<ChatState> = (set, get) => ({
  conversations: [],
  activeChatId: null,

  ensureConversation() {
    const s = get();
    if (s.activeChatId && findConv(s, s.activeChatId)) return s.activeChatId;
    return get().newChat();
  },
  newChat() {
    const conv = normalizeConversation({});
    set(s => ({ conversations: [conv, ...s.conversations], activeChatId: conv.id }));
    if (typeof window !== "undefined") localStorage.setItem("vessie-ai-active-chat", conv.id);
    return conv.id;
  },
  selectChat(id) {
    set({ activeChatId: id });
    if (typeof window !== "undefined") localStorage.setItem("vessie-ai-active-chat", id);
  },
  renameChat(id, title) {
    set(s => {
      const conv = findConv(s, id);
      if (conv) { conv.title = title.slice(0, 60); conv.lastModified = Date.now(); }
      return { conversations: [...s.conversations] };
    });
  },
  deleteChat(id) {
    set(s => {
      const conversations = s.conversations.filter(c => c.id !== id);
      const activeChatId = s.activeChatId === id ? conversations[0]?.id ?? null : s.activeChatId;
      if (activeChatId && typeof window !== "undefined") localStorage.setItem("vessie-ai-active-chat", activeChatId);
      return { conversations, activeChatId };
    });
  },
  duplicateChat(id) {
    const conv = findConv(get(), id);
    if (!conv) return null;
    const copy = normalizeConversation({ ...conv, id: undefined, title: `${conv.title} (cópia)` });
    set(s => ({ conversations: [copy, ...s.conversations], activeChatId: copy.id }));
    return copy.id;
  },
  addMessage(convId, msg) {
    set(s => {
      const conv = findConv(s, convId);
      if (!conv) return s;
      conv.messages.push(msg);
      conv.lastModified = Date.now();
      return { conversations: [...s.conversations] };
    });
  },
  updateMessage(convId, msgId, patch) {
    set(s => {
      const conv = findConv(s, convId);
      if (!conv) return s;
      const idx = conv.messages.findIndex(m => m.id === msgId);
      if (idx >= 0) conv.messages[idx] = { ...conv.messages[idx], ...patch };
      conv.lastModified = Date.now();
      return { conversations: [...s.conversations] };
    });
  },
  deleteMessage(convId, msgId) {
    set(s => {
      const conv = findConv(s, convId);
      if (!conv) return s;
      conv.messages = conv.messages.filter(m => m.id !== msgId);
      conv.lastModified = Date.now();
      return { conversations: [...s.conversations] };
    });
  },
  truncateAfter(convId, msgId, include) {
    set(s => {
      const conv = findConv(s, convId);
      if (!conv) return s;
      const idx = conv.messages.findIndex(m => m.id === msgId);
      if (idx < 0) return s;
      conv.messages = conv.messages.slice(0, include ? idx : idx + 1);
      conv.lastModified = Date.now();
      return { conversations: [...s.conversations] };
    });
  },
  appendToMessage(convId, msgId, extra, patch) {
    set(s => {
      const conv = findConv(s, convId);
      if (!conv) return s;
      const msg = conv.messages.find(m => m.id === msgId);
      if (msg) {
        msg.content = msg.content + extra;
        Object.assign(msg, patch ?? {});
      }
      conv.lastModified = Date.now();
      return { conversations: [...s.conversations] };
    });
  },
  importConversations(data) {
    let list: Partial<Conversation>[] = [];
    if (Array.isArray(data)) list = data;
    else if (data && typeof data === "object") {
      const obj = data as { conversations?: Partial<Conversation>[]; chats?: Partial<Conversation>[] };
      list = obj.conversations ?? obj.chats ?? [];
    }
    const normalized = list
      .filter(c => c && typeof c === "object")
      .map(normalizeConversation);
    if (normalized.length === 0) return 0;
    set(s => ({ conversations: [...normalized, ...s.conversations] }));
    return normalized.length;
  },
});

export const useChat = create<ChatState>()(
  persistRaw(chatCreator, {
    name: "vessie-ai-chats",
    partialize: s => ({ conversations: s.conversations, activeChatId: s.activeChatId }),
    merge: (persisted, current) => {
      const p = (persisted as { conversations?: Partial<Conversation>[]; activeChatId?: string | null }) ?? {};
      let conversations: Conversation[] = [];
      const rawList = p.conversations;
      if (Array.isArray(rawList)) conversations = rawList.map(normalizeConversation);
      else if (Array.isArray((p as { chats?: Partial<Conversation>[] }).chats)) {
        conversations = ((p as { chats: Partial<Conversation>[] }).chats).map(normalizeConversation);
      }
      let activeChatId = p.activeChatId ?? null;
      if (typeof window !== "undefined" && !activeChatId) {
        activeChatId = localStorage.getItem("vessie-ai-active-chat");
      }
      if (activeChatId && !conversations.some(c => c.id === activeChatId)) {
        activeChatId = conversations[0]?.id ?? null;
      }
      return { ...current, conversations, activeChatId };
    },
  })
);

/** Proxy das ações do chat (API estável para módulos fora do React). */
export const chatActions = {
  ensureConversation: () => useChat.getState().ensureConversation(),
  newChat: () => useChat.getState().newChat(),
  selectChat: (id: string) => useChat.getState().selectChat(id),
  renameChat: (id: string, title: string) => useChat.getState().renameChat(id, title),
  deleteChat: (id: string) => useChat.getState().deleteChat(id),
  duplicateChat: (id: string) => useChat.getState().duplicateChat(id),
  addMessage: (convId: string, msg: Message) => useChat.getState().addMessage(convId, msg),
  updateMessage: (convId: string, msgId: string, patch: Partial<Message>) => useChat.getState().updateMessage(convId, msgId, patch),
  deleteMessage: (convId: string, msgId: string) => useChat.getState().deleteMessage(convId, msgId),
  truncateAfter: (convId: string, msgId: string, include: boolean) => useChat.getState().truncateAfter(convId, msgId, include),
  appendToMessage: (convId: string, msgId: string, extra: string, patch?: Partial<Message>) => useChat.getState().appendToMessage(convId, msgId, extra, patch),
  importConversations: (data: unknown) => useChat.getState().importConversations(data),
};

// ---------- agentes ----------
interface AgentsState {
  agents: Agent[];
  addAgent: (a: Omit<Agent, "id" | "created" | "active">) => string;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  activateAgent: (id: string | null) => void;
}

const agentsCreator: StateCreator<AgentsState> = set => ({
  agents: [],
  addAgent(a) {
    const agent: Agent = { ...a, id: uid(), created: Date.now(), active: false };
    set(s => ({ agents: [...s.agents, agent] }));
    return agent.id;
  },
  updateAgent(id, patch) {
    set(s => ({ agents: s.agents.map(a => (a.id === id ? { ...a, ...patch } : a)) }));
  },
  deleteAgent(id) {
    set(s => ({ agents: s.agents.filter(a => a.id !== id) }));
  },
  activateAgent(id) {
    set(s => ({ agents: s.agents.map(a => ({ ...a, active: a.id === id })) }));
  },
});

export const useAgents = create<AgentsState>()(
  persistRaw(agentsCreator, {
    name: "vessie-ai-agents",
    partialize: s => ({ agents: s.agents }),
    merge: (persisted, current) => ({
      ...current,
      agents: (persisted as { agents?: Agent[] })?.agents ?? current.agents,
    }),
  })
);

/** Proxy das ações de agentes. */
export const agentActions = {
  addAgent: (a: Omit<Agent, "id" | "created" | "active">) => useAgents.getState().addAgent(a),
  updateAgent: (id: string, patch: Partial<Agent>) => useAgents.getState().updateAgent(id, patch),
  deleteAgent: (id: string) => useAgents.getState().deleteAgent(id),
  activateAgent: (id: string | null) => useAgents.getState().activateAgent(id),
};

// ---------- UI (transiente) ----------
interface UiState {
  view: View;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  helpOpen: boolean;
  agentsOpen: boolean;
  connection: "connecting" | "ok" | "fail";
  agentStatus: "busy" | "done" | "hide";
  setView: (v: View) => void;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setHelpOpen: (v: boolean) => void;
  setAgentsOpen: (v: boolean) => void;
  setConnection: (c: UiState["connection"]) => void;
  setAgentStatus: (s: UiState["agentStatus"]) => void;
}
export const useUi = create<UiState>(set => ({
  view: "chat",
  sidebarOpen: false,
  settingsOpen: false,
  helpOpen: false,
  agentsOpen: false,
  connection: "connecting",
  agentStatus: "hide",
  setView: v => set({ view: v }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar: open => set({ sidebarOpen: open }),
  setSettingsOpen: v => set({ settingsOpen: v }),
  setHelpOpen: v => set({ helpOpen: v }),
  setAgentsOpen: v => set({ agentsOpen: v }),
  setConnection: c => set({ connection: c }),
  setAgentStatus: s => set({ agentStatus: s }),
}));

// ---------- stream (transiente — geração sobrevive à troca de conversa; corrige D30) ----------
export interface StreamLive {
  convId: string;
  msgId: string;
  content: string;
  thinking: string;
  phase: "streaming" | "continuing";
}
interface StreamStore {
  live: StreamLive | null;
  begin: (live: StreamLive) => void;
  update: (patch: Partial<StreamLive>) => void;
  finish: () => void;
}
export const useStream = create<StreamStore>(set => ({
  live: null,
  begin: live => set({ live }),
  update: patch => set(s => ({ live: s.live ? { ...s.live, ...patch } : null })),
  finish: () => set({ live: null }),
}));

export function isGenerating(): boolean {
  return useStream.getState().live !== null;
}
