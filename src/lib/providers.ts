// Vessie AI — presets multi-provider (B.3.8 do Prompt Master)
import type { ProviderId } from "./types";

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  baseUrl: string;
  needsKey: boolean;
  keyPlaceholder: string;
  note: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "lm-studio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    needsKey: false,
    keyPlaceholder: "lm-studio (any value works)",
    note: "Local Server → Start Server → enable 'Serve on Local Network' + 'Enable CORS'. Default port 1234.",
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    keyPlaceholder: "(none)",
    note: "Run with CORS: OLLAMA_ORIGINS=* ollama serve",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    keyPlaceholder: "sk-or-…",
    note: "Create a key at openrouter.ai/keys",
  },
  {
    id: "custom",
    label: "OpenAI-compatible (custom)",
    baseUrl: "https://api.openai.com/v1",
    needsKey: false,
    keyPlaceholder: "sk-… (optional)",
    note: "Any OpenAI-compatible endpoint works.",
  },
];

export function presetOf(id: ProviderId): ProviderPreset {
  return PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0];
}
