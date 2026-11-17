"use client";
// DS-BOX · TopBar do chat — barra fina com o SISTEMA ÚNICO DE MODOS.
// Um clique alterna o assistente inteiro: 💬 Chatbot (só conversa — sem internals)
// ↔ 📦 DS-BOX (criação de sistemas operacionais: ferramentas ds:*, Build-Iso, emulador).
// O modo é a MESMA configuração usada pelo prompt (src/lib/prompt-mode.ts) — /modo no
// chat e Configurações → DS-BOX mudam a MESMA chave.
import { Button } from "@/components/ui/button";
import { useDsbox, dsboxActions } from "@/lib/dsbox/store";
import { usePromptMode } from "@/lib/prompt-mode";
import { toast } from "sonner";
import { Disc3, Activity, PanelRightOpen, MessagesSquare, Package } from "lucide-react";

export function DcsTopBar({ lang }: { lang: "en" | "pt-BR" }) {
  const pt = lang === "pt-BR";
  const mode = usePromptMode(s => s.mode);
  const setMode = usePromptMode(s => s.setMode);
  const toolFeed = useDsbox(s => s.toolFeed);
  const panelOpen = useDsbox(s => s.panelOpen);
  const lastOk = toolFeed[0];
  const osdev = mode === "osdev";

  const switchMode = (next: "chatbot" | "osdev"): void => {
    if (next === mode) return;
    setMode(next);
    toast(next === "osdev"
      ? (pt ? "📦 Modo DS-BOX — criação de sistemas operacionais (.iso)" : "📦 DS-BOX mode — OS creation (.iso)")
      : (pt ? "💬 Modo CHATBOT — apenas conversa" : "💬 CHATBOT mode — conversation only"));
  };

  const openBuildIso = (): void => {
    dsboxActions.setTab("emulator");
    dsboxActions.setPanelOpen(true);
    toast(pt
      ? "💿 Build-Iso no painel — peça no chat: \"monte um sistema completo\" (ds:os) ou \"boote uma ISO\""
      : "💿 Build-Iso in panel — ask in chat: \"build a complete system\" (ds:os) or \"boot an ISO\"");
  };

  return (
    <div
      className="glass border-b border-border px-2 sm:px-3 py-1.5 flex items-center gap-2 shrink-0 min-w-0"
      role="toolbar"
      aria-label="Modo do assistente / DS-BOX"
    >
      {/* SISTEMA ÚNICO DE MODOS — 1 clique decide se o app é chatbot ou criação de SO */}
      <div
        className="flex items-center rounded-[99px] border border-border p-0.5 shrink-0"
        role="radiogroup"
        aria-label={pt ? "Modo do assistente" : "Assistant mode"}
      >
        <button
          type="button"
          role="radio"
          aria-checked={!osdev}
          onClick={() => switchMode("chatbot")}
          className={`h-6 px-2 rounded-[99px] text-[11px] flex items-center gap-1 transition-colors ${!osdev ? "bg-accent text-white" : "text-text2 hover:text-foreground"}`}
          title={pt ? "Apenas 1 chatbot — conversa natural, sem ferramentas" : "Pure chatbot — natural conversation, no tools"}
        >
          <MessagesSquare className="h-3 w-3" />
          <span className="hidden sm:inline">{pt ? "Chatbot" : "Chat"}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={osdev}
          onClick={() => switchMode("osdev")}
          className={`h-6 px-2 rounded-[99px] text-[11px] flex items-center gap-1 transition-colors ${osdev ? "bg-accent text-white" : "text-text2 hover:text-foreground"}`}
          title={pt ? "Criação de sistemas operacionais — ds:*, Build-Iso, emulador" : "OS creation — ds:*, Build-Iso, emulator"}
        >
          <Package className="h-3 w-3" />
          <span className="hidden sm:inline">DS-BOX</span>
        </button>
      </div>

      {osdev && (
        <>
          {/* Build-Iso: ícone + rótulo curto (também só ícone no mobile) */}
          <Button
            size="sm"
            className="h-7 px-2 sm:px-3 shrink-0"
            onClick={openBuildIso}
            title={pt ? "Build-Iso — criar/modificar ISO (painel)" : "Build-Iso — create/modify ISO (panel)"}
            aria-label="Build-Iso"
          >
            <Disc3 className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">ISO</span>
            <span className="sm:hidden" aria-hidden>·</span>
          </Button>

          {/* status sempre ativo neste modo */}
          <span className="text-[11px] text-text2 flex items-center gap-1.5 min-w-0" title={pt ? "ds:* + ds:os (OS Studio) — ferramentas para os modelos" : "ds:* + ds:os (OS Studio) — tools for models"}>
            <span className="h-1.5 w-1.5 rounded-full bg-ok shrink-0" aria-hidden />
            <span className="hidden sm:inline truncate">ds:* · ds:os</span>
            <span className="sm:hidden truncate">ds:*</span>
          </span>

          {/* feed de ferramentas */}
          {toolFeed.length > 0 && (
            <button
              className="text-[11px] text-text2 hover:text-accent flex items-center gap-1.5 min-w-0"
              onClick={() => dsboxActions.setPanelOpen(true)}
              title={toolFeed.slice(0, 5).map(t => `ds:${t.kind} → ${t.label}`).join("\n")}
            >
              <Activity className="h-3 w-3 text-accent shrink-0" />
              <span className="px-1.5 py-0.5 rounded-full border border-border shrink-0">{toolFeed.length}</span>
              {lastOk && (
                <span className="hidden lg:inline truncate max-w-[220px]">
                  {lastOk.ok ? "✓" : "✖"} ds:{lastOk.kind}{lastOk.target ? `:${lastOk.target}` : ""}
                </span>
              )}
            </button>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-1 shrink-0">
        <span className="hidden xl:inline text-[10.5px] text-muted-foreground">
          {osdev
            ? (pt ? "VFS local · ISO 9660 · v86 · OS Studio" : "local VFS · ISO 9660 · v86 · OS Studio")
            : (pt ? "chatbot puro — sem internals" : "pure chatbot — no internals")}
        </span>
        {osdev && !panelOpen && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { dsboxActions.setPanelOpen(true); }} aria-label="DS-BOX" title="DS-BOX">
            <PanelRightOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline ml-1">DS-BOX</span>
          </Button>
        )}
      </div>
    </div>
  );
}
