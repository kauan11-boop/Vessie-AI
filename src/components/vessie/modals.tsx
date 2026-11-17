"use client";
// Vessie AI — guia rápido de comandos.
// (Sem tutorial de LM Studio: o propósito do projeto É usar servidores locais —
// quem instala sabe ligar o servidor. Só o essencial de conexão HTTPS.)
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUi } from "@/lib/store";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

export function HelpModal({ lang: lg }: { lang: Lang }) {
  const open = useUi(s => s.helpOpen);
  const setOpen = useUi(s => s.setHelpOpen);
  const setSettingsOpen = useUi(s => s.setSettingsOpen);
  const pt = lg === "pt-BR";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[560px] max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
        <DialogHeader>
          <DialogTitle>{pt ? "Comandos rápidos" : "Quick commands"}</DialogTitle>
        </DialogHeader>

        <div className="text-sm space-y-3">
          <div className="border border-border rounded-[12px] p-3">
            <b className="text-accent">/agent &lt;descrição&gt;</b>
            <p className="text-xs text-muted-foreground mt-1">
              {pt
                ? "A IA cria um sub-agente sozinha (persona, emoji, temperatura), salva e ativa — sem formulário. `/agents` lista todos."
                : "The AI creates a sub-agent by itself (persona, emoji, temperature), saves and activates it. `/agents` lists them."}
            </p>
          </div>
          <div className="border border-border rounded-[12px] p-3">
            <b className="text-accent">/discord [read · send · auto on/off]</b>
            <p className="text-xs text-muted-foreground mt-1">
              {pt
                ? "Controla seu Discord: lê o canal, envia no SEU estilo (perfil aprendido do chat) e o modo automático responde sozinho. Configure o bot token em Configurações → Discord."
                : "Controls your Discord: reads the channel, sends in YOUR style and auto-mode replies by itself. Configure the bot token in Settings → Discord."}
            </p>
          </div>
          <div className="border border-border rounded-[12px] p-3">
            <b className="text-accent">Build-Iso · DS-BOX</b>
            <p className="text-xs text-muted-foreground mt-1">
              {pt
                ? "Peça no chat: “monte e boote uma ISO chamada minios”. A IA escreve os arquivos, compila (ISO 9660 + El Torito), boota no emulador e interage com o sistema por ds:send. Modificar = editar os arquivos e recompilar com o MESMO nome."
                : "Ask in chat: \"build and boot an ISO named minios\". The AI writes files, compiles (ISO 9660 + El Torito), boots the emulator and interacts via ds:send. Modify = edit files and recompile with the SAME name."}
            </p>
          </div>
          <div className="border border-border rounded-[12px] p-3">
            <b className="text-accent">{pt ? "Imagens e voz" : "Images & voice"}</b>
            <p className="text-xs text-muted-foreground mt-1">
              {pt
                ? "Imagens aparecem no próprio chat (peça “gere uma imagem de…”). Voz natural em Configurações → Voice; o microfone detecta o idioma automaticamente."
                : "Images appear inside the chat (ask \"generate an image of…\"). Natural voice in Settings → Voice; the mic auto-detects your language."}
            </p>
          </div>
          <div className="border border-accent/40 bg-hover rounded-[12px] p-3 text-xs">
            <b>{pt ? "Conexão" : "Connection"}</b> — {pt
              ? "aponte para um servidor compatível OpenAI (LM Studio, Ollama, OpenRouter…) em Configurações. Publicado em HTTPS? Use túnel https para o servidor local."
              : "point to an OpenAI-compatible server (LM Studio, Ollama, OpenRouter…) in Settings. On HTTPS? Use an https tunnel for the local server."}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>{t(lg, "close")}</Button>
          <Button className="bg-accent text-white hover:opacity-90" onClick={() => { setOpen(false); setSettingsOpen(true); }}>
            {t(lg, "settings")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
