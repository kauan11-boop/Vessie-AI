"use client";
// Vessie AI — System API com runRoute real (corrige D3) — console JS sandboxado
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUi } from "@/lib/store";
import { runJSAsync } from "@/lib/memory";
import { runRoute } from "@/lib/memory";
import { ArrowLeft, Play } from "lucide-react";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

const DOCS = `Rotas da System API (100% no navegador — localStorage):

api.list                    → lista de APIs registradas
api.files                   → arquivos do Memory
api.kv                      → KV da System API (vessie-sys:*)
api.generateImage {prompt}  → URL do Pollinations
telemetry.report / .errors  → log de erros local
telemetry.clear             → limpa telemetria

Blocos que a IA entende no chat:
\`\`\`memory:put:caminho <conteúdo>\`\`\`   → salva arquivo
\`\`\`memory:run <js>\`\`\`                 → executa no sandbox (Worker)
\`\`\`memory:trigger:nome|padrão|ação\`\`\` → cria trigger
\`\`\`mem <VessieLang>\`\`\`                → aplica .mem completo
\`\`\`sys:write:caminho <conteúdo>\`\`\`    → sys write
\`\`\`sys:read:caminho\`\`\`                → sys read
\`\`\`image:prompt\`\`\`                    → gera imagem
\`\`\`pack:nome\`\`\`                       → ZIP do chat
\`\`\`edit:arquivo:ini-fim\`\`\`            → edição por linha

Sem fetch, XMLHttpRequest, eval ou Function no sandbox.
Tudo em localStorage. Nada sai do navegador.`;

export function SystemApiPage({ lang: lg }: { lang: Lang }) {
  const setView = useUi(s => s.setView);
  const [code, setCode] = useState("api.list()");
  const [output, setOutput] = useState<string>("");

  const run = async () => {
    const src = code.trim();
    if (!src) return;
    // rotas api.* direto; resto vai pro sandbox
    const routeMatch = /^(api|telemetry)\.[a-zA-Z]+/.exec(src);
    try {
      if (routeMatch) {
        const m = /^(api|telemetry)\.([a-zA-Z]+)\s*\(\s*(\{.*\})?\s*\)$/.exec(src);
        if (m) {
          const args = m[3] ? JSON.parse(m[3]) as Record<string, unknown> : {};
          const res = runRoute(`${m[1]}.${m[2]}`, args);
          setOutput(typeof res === "string" ? res : JSON.stringify(res, null, 2));
          return;
        }
      }
      const res = await runJSAsync(src);
      setOutput(res || "(sem retorno)");
    } catch (e) {
      setOutput(`❌ ${(e as Error).message}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-4 py-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 rounded-[99px] gap-1.5" onClick={() => setView("chat")}>
            <ArrowLeft className="h-3.5 w-3.5" /> {t(lg, "backToChat")}
          </Button>
          <h2 className="text-lg font-bold">{t(lg, "apiTitle")}</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">{t(lg, "apiSub")}</p>

        <Tabs defaultValue="console" className="mt-4">
          <TabsList className="grid grid-cols-2 w-full max-w-[300px]">
            <TabsTrigger value="console">{t(lg, "apiConsole")}</TabsTrigger>
            <TabsTrigger value="docs">{t(lg, "apiDocs")}</TabsTrigger>
          </TabsList>

          <TabsContent value="console" className="mt-3">
            <div className="space-y-2">
              <Textarea
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder={t(lg, "consolePlaceholder")}
                className="font-mono text-xs min-h-28"
                aria-label={t(lg, "apiConsole")}
              />
              <Button className="bg-accent text-white hover:opacity-90 rounded-[10px] gap-2 h-8 text-xs" onClick={() => void run()}>
                <Play className="h-3.5 w-3.5" /> {t(lg, "runConsole")}
              </Button>
              <pre className="code-body whitespace-pre-wrap max-h-80 overflow-y-auto border border-border rounded-[12px]" aria-live="polite">
                {output || "—"}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="docs" className="mt-3">
            <pre className="code-body whitespace-pre-wrap border border-border rounded-[12px] text-[12px]">{DOCS}</pre>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
