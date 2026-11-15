"use client";
// DS-BOX · TopBar do chat — switch do Dynamic Creation System + botão Build-Iso
// (aparece acima do chat quando o DCS está ativo) + acesso rápido ao painel.
// Compacta: em telas pequenas o rótulo vira "DCS", o botão DS-BOX vira ícone.
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useDsbox, dsboxActions } from "@/lib/dsbox/store";
import { toast } from "sonner";
import { Disc3, Hammer, PanelRightOpen } from "lucide-react";

export function DcsTopBar({ lang }: { lang: "en" | "pt-BR" }) {
  const pt = lang === "pt-BR";
  const dcs = useDsbox(s => s.dcs);
  const buildMode = useDsbox(s => s.buildMode);
  const panelOpen = useDsbox(s => s.panelOpen);
  const toolFeed = useDsbox(s => s.toolFeed);
  const setDcs = useDsbox(s => s.setDcs);
  const setBuildMode = useDsbox(s => s.setBuildMode);

  const startBuildIso = (): void => {
    setBuildMode(true);
    dsboxActions.setTab("build");
    dsboxActions.setPanelOpen(true);
    toast(pt
      ? "🔨 Sessão Build-Iso ativa — peça no chat: \"monte e boote uma ISO\""
      : "🔨 Build-Iso session active — ask in chat: \"build and boot an ISO\"");
  };

  return (
    <div
      className="glass border-b border-border px-2 sm:px-3 py-1.5 flex items-center gap-1.5 sm:gap-2.5 shrink-0 flex-wrap"
      role="toolbar"
      aria-label={pt ? "Dynamic Creation System" : "Dynamic Creation System"}
    >
      {/* switch DCS — rótulo curto no mobile */}
      <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer select-none min-w-0">
        <Switch checked={dcs} onCheckedChange={v => { setDcs(v); toast(v ? (pt ? "🟢 DCS + Build-Iso ligados — ferramentas ds:* ativas para os modelos" : "🟢 DCS + Build-Iso on — ds:* tools active for models") : (pt ? "DCS desligado" : "DCS off")); }} aria-label={pt ? "Ligar Dynamic Creation System" : "Toggle Dynamic Creation System"} />
        <span className="text-[12px] font-medium tracking-wide whitespace-nowrap">
          <span className="hidden md:inline">{pt ? "Dynamic Creation System" : "Dynamic Creation System"}</span>
          <span className="md:hidden" title={pt ? "Dynamic Creation System" : "Dynamic Creation System"}>DCS</span>
        </span>
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dcs ? "bg-ok" : "bg-muted-foreground"}`} aria-hidden />
      </label>

      {/* Build-Iso — ícone sempre visível, rótulo curto; ponto pulsante quando em sessão */}
      {dcs && (
        <Button
          size="sm"
          className={`h-7 px-2 sm:px-3 shrink-0 ${buildMode ? "" : "animate-in fade-in"}`}
          onClick={startBuildIso}
          title={buildMode ? (pt ? "Sessão Build-Iso ativa" : "Build-Iso session active") : "Build-Iso"}
          aria-label="Build-Iso"
        >
          <Hammer className="h-3.5 w-3.5 mr-1" />
          Build-Iso
          {buildMode && <span className="h-1.5 w-1.5 rounded-full bg-white gen-pulse ml-1.5" aria-hidden />}
        </Button>
      )}

      {/* feed de ferramentas */}
      {dcs && toolFeed.length > 0 && (
        <button
          className="text-[11px] text-text2 hover:text-accent flex items-center gap-1.5 min-w-0"
          onClick={() => dsboxActions.setTab("build")}
          title={toolFeed.slice(0, 5).map(t => `ds:${t.kind} → ${t.label}`).join("\n")}
        >
          <span className="px-1.5 py-0.5 rounded-full border border-border shrink-0">{toolFeed.length}</span>
          <span className="hidden sm:inline">{pt ? "ferramenta(s)" : "tool run(s)"}</span>
        </button>
      )}

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
        <span className="hidden xl:inline text-[10.5px] text-muted-foreground">
          {pt ? "VFS local · ISO 9660 · v86 · Web-Search/Fetch" : "local VFS · ISO 9660 · v86 · Web-Search/Fetch"}
        </span>
        {dcs && (
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={pt ? "Alternar sessão Build-Iso" : "Toggle Build-Iso session"}
            title={pt ? "Ativar/desativar sessão Build-Iso" : "Toggle Build-Iso session"}
            onClick={() => { setBuildMode(!buildMode); }}
          >
            <Disc3 className={`h-3.5 w-3.5 ${buildMode ? "text-accent" : ""}`} />
          </Button>
        )}
        {!panelOpen && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { dsboxActions.setPanelOpen(true); }} aria-label="DS-BOX" title="DS-BOX">
            <PanelRightOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline ml-1">DS-BOX</span>
          </Button>
        )}
      </div>
    </div>
  );
}
