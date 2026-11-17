"use client";
// DS-BOX · Painel lateral — o usuário controla 2 abas MANUAIS: Emulador e Files.
// As demais views (Bash-86X, Script Lab, Build-Iso) são TOTALMENTE administradas
// pela IA via ferramentas ds:* — quando a IA navega até elas, aparecem com um
// selo "gerenciado pela IA" (sem botão de aba manual).
// Desktop: coluna à direita do chat. Mobile: overlay em tela cheia.
import { X, MonitorPlay, Terminal, FlaskConical, FolderTree, Disc3, Activity, Bot } from "lucide-react";
import { useDsbox, type DsboxTab } from "@/lib/dsbox/store";
import { EmulatorView } from "./emulator-view";
import { Bash86View } from "./bash86-view";
import { ScriptLab } from "./script-lab";
import { FilesView } from "./files-view";
import { BuildIsoView } from "./build-iso-view";

/** Abas manuais (as únicas 2 que o usuário vê). */
const MANUAL_TABS: { id: DsboxTab; icon: typeof MonitorPlay; en: string; pt: string }[] = [
  { id: "emulator", icon: MonitorPlay, en: "Emulator", pt: "Emulador" },
  { id: "files", icon: FolderTree, en: "Files", pt: "Files" },
];

/** Views ocultas — navegação exclusiva da IA (ds:run/preview/term/iso). */
const AI_VIEWS: { id: DsboxTab; icon: typeof MonitorPlay; en: string; pt: string }[] = [
  { id: "bash86", icon: Terminal, en: "Bash-86X (AI)", pt: "Bash-86X (IA)" },
  { id: "scripts", icon: FlaskConical, en: "Script Lab (AI)", pt: "Script Lab (IA)" },
  { id: "build", icon: Disc3, en: "Build-Iso (AI)", pt: "Build-Iso (IA)" },
];

export function DSBoxPanel({ lang }: { lang: "en" | "pt-BR" }) {
  const pt = lang === "pt-BR";
  const panelOpen = useDsbox(s => s.panelOpen);
  const tab = useDsbox(s => s.tab);
  const setTab = useDsbox(s => s.setTab);
  const setPanelOpen = useDsbox(s => s.setPanelOpen);
  const toolFeed = useDsbox(s => s.toolFeed);

  if (!panelOpen) return null;
  const lastTool = toolFeed[0];
  const isAiView = AI_VIEWS.some(v => v.id === tab);

  return (
    <aside
      className="dsbox-panel fixed inset-0 z-40 flex flex-col bg-background-2 lg:static lg:inset-auto lg:z-auto lg:w-[460px] lg:min-w-[380px] lg:border-l lg:border-border pb-[env(safe-area-inset-bottom)]"
      aria-label={pt ? "Painel DS-BOX" : "DS-BOX panel"}
    >
      {/* cabeçalho */}
      <div className="glass border-b border-border px-2 sm:px-3 py-2 flex items-center gap-2 shrink-0">
        <Disc3 className="h-4 w-4 text-accent shrink-0" />
        <span className="text-sm font-semibold tracking-wide">DS-BOX</span>
        {isAiView && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-accent-2/50 text-accent-2 flex items-center gap-1">
            <Bot className="h-3 w-3" />
            {pt ? "gerenciado pela IA" : "AI-managed"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {lastTool && (
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-text2 max-w-[190px] truncate" title={`${lastTool.kind}: ${lastTool.label}`}>
              <Activity className="h-3 w-3 text-accent" />
              {lastTool.ok ? "✓" : "✖"} ds:{lastTool.kind}
              {lastTool.target ? `:${lastTool.target}` : ""}
            </span>
          )}
          <button
            className="h-8 w-8 grid place-items-center rounded-full hover:bg-hover lg:hidden"
            onClick={() => setPanelOpen(false)}
            aria-label={pt ? "Fechar painel" : "Close panel"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* abas MANUAIS (apenas 2) — quando a IA está numa view oculta, as manuais
          continuam clicáveis para o usuário voltar */}
      <div className="flex border-b border-border px-1 sm:px-2 py-1.5 gap-1 shrink-0" role="tablist">
        {MANUAL_TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] whitespace-nowrap shrink-0 transition-colors ${
                active ? "bg-hover text-accent font-medium" : "text-text2 hover:bg-hover/50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {pt ? t.pt : t.en}
            </button>
          );
        })}
        {/* indicador discreto da view da IA (sem vira aba manual) */}
        {isAiView && (
          <span className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] text-accent-2 bg-hover/40 ml-auto min-w-0">
            {(() => {
              const v = AI_VIEWS.find(v => v.id === tab);
              if (!v) return null;
              const Icon = v.icon;
              return <><Icon className="h-3.5 w-3.5" />{pt ? v.pt : v.en}</>;
            })()}
          </span>
        )}
      </div>

      {/* conteúdo */}
      <div className="flex-1 min-h-0 p-3 overflow-y-auto">
        {tab === "emulator" && <EmulatorView lang={lang} />}
        {tab === "files" && <FilesView lang={lang} />}
        {tab === "bash86" && <Bash86View lang={lang} />}
        {tab === "scripts" && <ScriptLab lang={lang} />}
        {tab === "build" && <BuildIsoView lang={lang} />}
      </div>
    </aside>
  );
}
