"use client";
// Vessie AI — System API agora é um CONJUNTO DE INSTRUÇÕES em formato de prompt:
// você copia e cola em qualquer IA (ou usa como system prompt) para que ela
// consiga interagir e usar todos os sistemas do Vessie-AI (Memory, DS-BOX,
// Build-Iso, imagens, agentes, Discord).
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useUi, useSettings } from "@/lib/store";
import { useDsbox } from "@/lib/dsbox/store";
import { toolsSystemDoc } from "@/lib/dsbox/tools";
import { vfs } from "@/lib/dsbox/vfs";
import { ArrowLeft, Copy, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

/** Monta o prompt de instruções completo do Vessie-AI. */
function buildApiPrompt(lang: Lang): string {
  const pt = lang === "pt-BR";
  const st = vfs.stats();
  const shelf = useDsbox.getState().isoShelf;
  const model = useSettings.getState().settings.model;
  const head = pt
    ? [
        "# SYSTEM PROMPT — Operador do Vessie-AI",
        "Você vai operar o app Vessie-AI Chat respondendo com blocos especiais que o app intercepta e executa localmente. Regra de ouro: NUNCA finja que executou algo — o app confirma o resultado na próxima mensagem.",
        "",
        "## Protocolos do chat (Memory + arquivos + imagens)",
        "- ```memory:put:caminho/arquivo.txt``` + conteúdo → salva arquivo no Memory persistente.",
        "- ```memory:run <código JS>``` → executa JS no sandbox (Worker).",
        "- ```memory:trigger:nome|padrão|script``` → cria trigger automático.",
        "- ```mem <gramática .mem>``` → aplica memória completa.",
        "- ```image:prompt em inglês``` → gera imagem dentro do chat.",
        "- ```html:index.html``` / ```css:style.css``` / ```python:app.py``` → arquivos do chat.",
        "- ```pack:nome``` → ZIP com todos os arquivos da conversa.",
        "- ```edit:arquivo:ini-fim``` → edição por linha (~40 linhas por edição).",
        "",
        `## Estado atual: modelo alvo "${model || "(qualquer)"}" · VFS com ${st.files} arquivo(s)${shelf.length ? ` · ISOs: ${shelf.map(i => i.name).join(", ")}` : ""}`,
        "",
        "## Protocolo DS-BOX (sandbox local — ISO 9660, v86, terminal, web)",
      ]
    : [
        "# SYSTEM PROMPT — Vessie-AI operator",
        "You will operate the Vessie-AI Chat app by replying with special fenced blocks the app intercepts and runs locally. Golden rule: NEVER pretend you ran something — the app confirms the result in the next message.",
        "",
        "## Chat protocols (Memory + files + images)",
        "- ```memory:put:path/file.txt``` + content → saves to persistent Memory.",
        "- ```memory:run <js code>``` → runs JS in the sandbox (Worker).",
        "- ```memory:trigger:name|pattern|script``` → auto trigger.",
        "- ```image:english prompt``` → generates an image inside the chat.",
        "- ```html:index.html``` / ```css:style.css``` / ```python:app.py``` → chat files.",
        "- ```pack:name``` → ZIP of all chat files.",
        "- ```edit:file:start-end``` → line-based edit (~40 lines per edit).",
        "",
        `## Current state: target model "${model || "(any)"}" · VFS with ${st.files} file(s)${shelf.length ? ` · ISOs: ${shelf.map(i => i.name).join(", ")}` : ""}`,
        "",
        "## DS-BOX protocol (local sandbox — ISO 9660, v86, terminal, web)",
      ];
  return [...head, toolsSystemDoc()].join("\n");
}

export function SystemApiPage({ lang: lg }: { lang: Lang }) {
  const setView = useUi(s => s.setView);
  const [copied, setCopied] = useState(false);
  // reload permite regenerar com o estado atual (árvore/ISOs mudam com o uso)
  const [nonce, setNonce] = useState(0);
  const prompt = useMemo(() => buildApiPrompt(lg), [lg, nonce]);
  const pt = lg === "pt-BR";

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast(pt ? "📋 Prompt copiado — cole em qualquer IA" : "📋 Prompt copied — paste into any AI");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(pt ? "Não foi possível copiar" : "Could not copy");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-4 py-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="sm" className="h-8 rounded-[99px] gap-1.5" onClick={() => setView("chat")}>
            <ArrowLeft className="h-3.5 w-3.5" /> {t(lg, "backToChat")}
          </Button>
          <h2 className="text-lg font-bold">{t(lg, "apiTitle")}</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {pt
            ? "Isto é um CONJUNTO DE INSTRUÇÕES em formato de prompt: copie e envie para qualquer IA para que ela interaja e utilize os sistemas do Vessie-AI (Memory, DS-BOX, Build-Iso, imagens, agentes, Discord)."
            : "This is a set of instructions in prompt format: copy and send it to any AI so it can interact with and use the Vessie-AI systems (Memory, DS-BOX, Build-Iso, images, agents, Discord)."}
        </p>

        <div className="flex items-center gap-2 mt-4">
          <Button className="bg-accent text-white hover:opacity-90 rounded-[10px] gap-2 h-8 text-xs" onClick={() => void copy()}>
            <Copy className="h-3.5 w-3.5" /> {copied ? (pt ? "Copiado!" : "Copied!") : (pt ? "Copiar prompt" : "Copy prompt")}
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setNonce(n => n + 1)}>
            <RefreshCcw className="h-3.5 w-3.5" /> {pt ? "Atualizar com estado atual" : "Refresh with current state"}
          </Button>
          <span className="text-[11px] text-muted-foreground ml-auto">{prompt.length.toLocaleString()} chars</span>
        </div>

        <pre className="code-body whitespace-pre-wrap border border-border rounded-[12px] text-[12px] mt-3 p-4 max-h-[60vh] overflow-y-auto" aria-label={pt ? "Prompt de instruções" : "Instructions prompt"}>
          {prompt}
        </pre>
      </div>
    </div>
  );
}
