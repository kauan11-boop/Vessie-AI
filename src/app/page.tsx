"use client";
// Vessie AI Chat — shell único com views (chat | memory | api) — B.2
// Imagens agora são geradas DENTRO do chat (ds:image / blocos image:) — sem aba própria.
// Sem botão "testar conexão" e sem ícone de agentes manual (uso /agent no chat).
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mascot, MascotDefs } from "@/components/vessie/mascot";
import { Sidebar } from "@/components/vessie/sidebar";
import { ChatArea } from "@/components/vessie/chat-area";
import { InputBar } from "@/components/vessie/input-bar";
import { ModelPicker } from "@/components/vessie/model-picker";
import { SettingsModal } from "@/components/vessie/settings-modal";
import { HelpModal } from "@/components/vessie/modals";
import { MemoryManager } from "@/components/vessie/memory-manager";
import { SystemApiPage } from "@/components/vessie/system-api";
import { DSBoxPanel } from "@/components/dsbox/dsbox-panel";
import { DcsTopBar } from "@/components/dsbox/topbar";
import { useChat, chatActions, useSettings, useUi, useAgents } from "@/lib/store";
import { useConn } from "@/lib/connection";
import { Simulite } from "@/lib/simulite";
import { packChatZip } from "@/lib/pack";
import { initDsboxIntegrations } from "@/lib/chat-flow";
import { usePromptMode } from "@/lib/prompt-mode";
import { toast } from "sonner";
import {
  Menu, Settings as SettingsIcon, HelpCircle, Package, Brain,
  TerminalSquare,
} from "lucide-react";
import { t } from "@/lib/i18n";

export default function Page() {
  const lang = useSettings(s => s.settings.language);
  const theme = useSettings(s => s.settings.theme);
  const autoConnect = useSettings(s => s.settings.autoConnect);
  const view = useUi(s => s.view);
  const setView = useUi(s => s.setView);
  const connection = useUi(s => s.connection);
  const setSidebar = useUi(s => s.setSidebar);
  const toggleSidebar = useUi(s => s.toggleSidebar);
  const setSettingsOpen = useUi(s => s.setSettingsOpen);
  const setHelpOpen = useUi(s => s.setHelpOpen);
  const agentStatus = useUi(s => s.agentStatus);
  const conversations = useChat(s => s.conversations);
  void conversations;
  const activeChatId = useChat(s => s.activeChatId);
  const check = useConn(s => s.check);
  const activeAgent = useAgents(s => s.agents.find(a => a.active) ?? null);
  const dsboxMode = usePromptMode(s => s.mode) === "osdev";

  // boot: tema, simulite, auto-conexão (respeita preferência — corrige D6)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    Simulite.init();
    chatActions.ensureConversation();
    // Sub-Agents/DS-BOX em segundo plano: watcher de problemas + Discord automático
    initDsboxIntegrations();
  }, []);

  useEffect(() => {
    if (autoConnect) void check(true);
    else useUi.getState().setConnection("fail");
  }, []);

  const lg = lang;
  const isChatView = view === "chat";

  return (
    <div className="h-screen flex overflow-hidden bg-background text-foreground">
      <MascotDefs />
      <Sidebar lang={lg} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* header */}
        <header className="glass border-b border-border px-3 py-2 flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" className="lg:hidden h-8 w-8 p-0" onClick={toggleSidebar} aria-label="Toggle sidebar">
            <Menu className="h-4 w-4" />
          </Button>

          <ModelPicker lang={lg} />

          {/* badges de conexão */}
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-[99px] border ${
              connection === "ok" ? "border-ok/50 text-ok" : connection === "connecting" ? "border-border text-muted-foreground" : "border-danger/50 text-danger"
            }`}
            role="status"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connection === "ok" ? "bg-ok" : connection === "connecting" ? "bg-muted-foreground gen-pulse" : "bg-danger"}`} />
            {connection === "ok" ? t(lg, "connected") : connection === "connecting" ? "…" : t(lg, "disconnected")}
          </span>
          <span className="hidden md:inline-flex text-[11px] px-2 py-1 rounded-[99px] border border-accent/40 text-accent">⚡ {t(lg, "streamBadge")}</span>

          {activeAgent && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-[99px] border border-accent-2/40 text-accent-2">
              {activeAgent.emoji} {t(lg, "agentActive")} · {activeAgent.name}
              {agentStatus === "busy" && <span className="gen-pulse">…</span>}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-[99px]" onClick={() => setView("api")} aria-label={t(lg, "systemApi")} title={t(lg, "systemApi")}>
              <TerminalSquare className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-[99px]" onClick={() => setView("memory")} aria-label={t(lg, "memoryManager")} title={t(lg, "memoryManager")}>
              <Brain className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm" className="hidden sm:inline-flex h-8 w-8 p-0 rounded-[99px]"
              aria-label={t(lg, "packZip")} title={t(lg, "packZip")}
              onClick={() => {
                if (activeChatId) void packChatZip(activeChatId, "vessie-pack");
              }}
            >
              <Package className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex h-8 w-8 p-0 rounded-[99px]" onClick={() => setHelpOpen(true)} aria-label={t(lg, "help")} title={t(lg, "help")}>
              <HelpCircle className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-[99px]" onClick={() => setSettingsOpen(true)} aria-label={t(lg, "settings")} title={t(lg, "settings")}>
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* views */}
        {isChatView ? (
          <div className="flex-1 flex min-h-0">
            <main className="flex-1 flex flex-col min-h-0 min-w-0">
              <DcsTopBar lang={lg} />
              <ChatArea lang={lg} />
              <InputBar lang={lg} />
            </main>
            {/* painel DS-BOX só existe no modo criação de sistemas — chatbot puro não o vê */}
            {dsboxMode && <DSBoxPanel lang={lg} />}
          </div>
        ) : view === "memory" ? (
          <main className="flex-1 min-h-0"><MemoryManager lang={lg} /></main>
        ) : (
          <main className="flex-1 min-h-0"><SystemApiPage lang={lg} /></main>
        )}
      </div>

      <SettingsModal lang={lg} />
      <HelpModal lang={lg} />
    </div>
  );
}
