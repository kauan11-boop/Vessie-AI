// Vessie-AI — SISTEMA ÚNICO DE CONFIGURAÇÃO DO PROMPT (Modo do assistente).
// UM só lugar decide o comportamento do modelo — conforme o usuário pediu:
//   • "chatbot" → apenas 1 chatbot (conversa natural; SEM DS-BOX, ferramentas, VFS ou internals)
//   • "osdev"   → criação de sistemas operacionais (ferramentas ds:*, VFS, Build-Iso, emulador)
// Toda montagem de system prompt passa por buildUnifiedSystemPrompt() — chat principal,
// anti-spam, auto-continue, continuar resposta: todos usam esta MESMA fonte.
// O modo é persistido (localStorage) e trocado por 1 clique na barra do chat ou nas
// configurações (aba DS-BOX → "Modo do assistente").
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StateCreator } from "zustand";
import { useSettings } from "./store";
import { personaCard } from "./persona";
import { raw as memoryRaw, contextInventory } from "./memory";
import { useDsbox } from "./dsbox/store";
import { vfs } from "./dsbox/vfs";
import { toolsSystemDoc, buildIsoSessionPrompt } from "./dsbox/tools";

export type AssistantMode = "chatbot" | "osdev";

export const MODE_LABEL: Record<AssistantMode, string> = {
  chatbot: "Chatbot",
  osdev: "DS-BOX · OS",
};

interface PromptModeState {
  mode: AssistantMode;
  setMode: (m: AssistantMode) => void;
  /** Alterna e devolve o novo modo (para toasts). */
  toggle: () => AssistantMode;
}

const creator: StateCreator<PromptModeState> = (set, get) => ({
  mode: "osdev", // modo de fábrica: criação de sistemas (o coração do projeto)
  setMode: m => set({ mode: m }),
  toggle: () => {
    const next: AssistantMode = get().mode === "osdev" ? "chatbot" : "osdev";
    set({ mode: next });
    return next;
  },
});

export const usePromptMode = create<PromptModeState>()(
  persist(creator, {
    name: "vessie-prompt-mode",
    storage: createJSONStorage(() => localStorage),
    partialize: s => ({ mode: s.mode }) as PromptModeState,
    merge: (persisted, current) => ({
      ...current,
      mode: (persisted as { mode?: AssistantMode })?.mode === "chatbot" ? "chatbot" : "osdev",
    }) as PromptModeState,
  })
);

/** Leitura fora do React. */
export function getAssistantMode(): AssistantMode {
  return usePromptMode.getState().mode;
}

/** Regras humanas de conversa — comuns aos dois modos (o tom muda, a naturalidade não). */
function humanRules(short: boolean, osdev: boolean): string {
  if (osdev) {
    return short
      ? "### Regra de conversa humana\nConversa normal: no máximo 20 LETRAS na resposta (uma palavra ou frase curtinha, como mensagem de WhatsApp). Fale como pessoa — nunca como manual. Quando enviar um bloco ds:*, NÃO escreva texto nenhum antes/depois do bloco (silêncio total até o sistema responder). NUNCA mencione DS-BOX, ferramentas, VFS ou internals — só se o usuário perguntar diretamente."
      : "NUNCA mencione DS-BOX, ferramentas ds:*, VFS ou internals do sistema a menos que o usuário pergunte explicitamente sobre isso. Quando enviar um bloco ds:*, escreva apenas o(s) bloco(s) sem prosa ao redor.";
  }
  // chatbot puro: sem nenhum vocabulário interno
  return short
    ? "### Regra de conversa humana\nResponda como uma pessoa real: no máximo 20 LETRAS quando for papo normal (como mensagem de WhatsApp). Natural, direto, sem virar manual — só alongue quando o dono pedir detalhe."
    : "Fale como pessoa real, natural e direta. Não use jargão de sistema, não invente ferramentas e não fale de internals — é só uma conversa.";
}

/** Bloco de chatbot puro: como reagir quando pedirem criação de SO estando no modo errado. */
function chatbotHandoff(): string {
  return [
    "### Limites deste modo",
    "Agora você é APENAS um chatbot de conversa. Não há ferramentas de arquivos, compilação ou emulação disponíveis.",
    "Se o usuário pedir para criar/montar/compilar sistema operacional, ISO, script em arquivo ou imagem de disco: responda com naturalidade (1–2 frases) que para isso é preciso LIGAR o Modo DS-BOX — o botão \"DS-BOX\" na barra do chat (ou Configurações → DS-BOX → Modo do assistente) — e ofereça fazer isso junto. NÃO tente executar nada técnico; não invente que criou arquivos ou ISOs.",
    "Continue ajudando em tudo o mais (conversa, dúvidas, ideias, explicações) normalmente.",
  ].join("\n");
}

/**
 * CONSTRUTOR ÚNICO do system prompt.
 * extra = acréscimo pontual por chamada (anti-spam, continuação cortada…).
 */
export function buildUnifiedSystemPrompt(opts?: { extra?: string }): string {
  const s = useSettings.getState().settings;
  const mode = getAssistantMode();

  // base editável pelo dono + memória adaptativa (nos dois modos)
  let sys = s.systemPrompt;
  if (s.personaMemory) {
    const persona = personaCard();
    if (persona) sys += `\n\n${persona}`;
  }

  const mem = memoryRaw();
  const memEmpty =
    Object.keys(mem.files).length === 0 &&
    Object.keys(mem.scripts).length === 0 &&
    Object.keys(mem.triggers).length === 0;
  if (!memEmpty && mode === "osdev") {
    sys += "\n\nVocê tem acesso ao Memory (pasta virtual).\n" +
      "Para SALVAR: responda com ```memory:put:nome/do/arquivo.txt <conteúdo> ```\n" +
      "Para EXECUTAR JS: responda com ```memory:run <código JS> ```\n" +
      "Para CRIAR TRIGGER: ```memory:trigger:nome|padrão|script ```\n" +
      "O site intercepta esses blocos, executa e mostra o resultado no chat.\n" +
      "Nunca invente que salvou — só após o bloco o sistema confirma.";
    const inv = contextInventory(8000);
    if (inv) sys += `\n\n${inv}`;
  }

  if (mode === "osdev") {
    // CRIAÇÃO DE SISTEMAS OPERACIONAIS — protocolo completo
    const ds = useDsbox.getState();
    sys += "\n\n" + toolsSystemDoc();
    sys += "\n\n" + humanRules(s.shortReplies, true);
    const st = vfs.stats();
    if (st.files > 0) {
      sys += "\n\n### Projeto atual no VFS (arquitetura auto-enviada)\n" +
        `${st.files} arquivo(s), ${st.bytes} bytes. Árvore:\n\`\`\`\n${vfs.tree()}\n\`\`\``;
    } else {
      sys += "\n\n(O VFS está vazio — crie arquivos com ds:write quando fizer sentido.)";
    }
    if (ds.buildMode) {
      sys += "\n\n" + buildIsoSessionPrompt();
    }
  } else {
    // CHATBOT PURO — zero internals
    sys += "\n\n" + humanRules(s.shortReplies, false);
    sys += "\n\n" + chatbotHandoff();
  }

  if (opts?.extra) sys += `\n\n${opts.extra}`;
  return sys;
}
