// Vessie AI — tipos centrais (contratos do Prompt Master B.6)
export type Role = "user" | "assistant";

export interface ImageResult {
  url: string;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  model: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  thinking?: string;
  finished?: boolean;
  image?: ImageResult;
  imageBlock?: ImageResult;
  imageBlocks?: ImageResult[];
  meta?: { model: string; noInfo?: boolean; agent?: string };
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created: number;
  lastModified: number;
}

export type ProviderId = "lm-studio" | "ollama" | "openrouter" | "custom";

/** Perfil de voz derivado de uma amostra .mp3/.wav (voice.ts analisa o áudio). */
export interface VoiceCloneProfile {
  pitchHz: number;
  pitch: number;
  rate: number;
  voiceName?: string;
  gender: "female" | "male" | "neutral";
  durationSec: number;
  created: number;
}

export interface Settings {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number | null;
  timeout: number;
  stream: boolean;
  systemPrompt: string;
  image: { size: string; model: string };
  spellcheck: boolean;
  autoConnect: boolean;
  theme: "dark" | "light";
  language: "en" | "pt-BR";
  voice: { enabled: boolean; rate: number; pitch: number; name?: string; natural?: boolean; clone?: VoiceCloneProfile | null };
  dictation: "auto" | "en" | "pt-BR";
  /** Respostas naturais curtas (≤ ~20 letras) e silêncio enquanto ds:* roda. */
  shortReplies: boolean;
  /** Memória adaptativa coletada e ligada ao system prompt. */
  personaMemory: boolean;
  discord: { token: string; channelId: string; autoReply: boolean; intervalSec: number; styleCard: string; mode: "user" | "bot" };
  /** Tentar mesmo assim chamar servidor local a partir de página pública (só com Private Network Access desabilitado no navegador). */
  forceLocalServer: boolean;
}

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  temp: number;
  instructions: string;
  active: boolean;
  created: number;
}

// ---------- Memory (contrato vessie-memory-v2) ----------
export interface MemFile { content: string; type: string; author: string; updated: number }
export interface MemTrigger {
  pattern: string; action: string; script: string; category: string;
  description: string; api: string; enabled: boolean; updated: number;
}
export interface MemScript { code: string; lang: string; desc: string; enabled: boolean; updated: number }
export interface MemContent { text: string; t: number }
export interface MemSkill { description: string; prompt: string; enabled: boolean; updated: number }
export interface MemPlugin { version: string; description: string; code: string; enabled: boolean; updated: number }
export interface MemMcp { command: string; description: string; enabled: boolean; updated: number }
export interface MemApi { url: string; description: string; enabled: boolean; updated: number }
export interface MemLog { msg: string; type: string; t: number }

export interface MemoryData {
  files: Record<string, MemFile>;
  triggers: Record<string, MemTrigger>;
  scripts: Record<string, MemScript>;
  contents: Record<string, MemContent[]>;
  skills: Record<string, MemSkill>;
  plugins: Record<string, MemPlugin>;
  mcps: Record<string, MemMcp>;
  apis: Record<string, MemApi>;
  logs: MemLog[];
}

export interface MemReport {
  files: string[];
  triggers: string[];
  scripts: string[];
  contents: string[];
  runs: string[];
}

export interface BlockResult {
  kind: "put" | "run" | "trigger" | "api" | "skill" | "plugin" | "mcp" | "mem" | "sys" | "image" | "pack" | "edit" | "script";
  ok: boolean;
  label: string;
  detail?: string;
}

export type View = "chat" | "memory" | "api";
export type Lang = "en" | "pt-BR";
