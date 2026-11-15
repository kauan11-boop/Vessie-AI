"use client";
// Vessie AI — sidebar de conversas (drawer real no mobile — corrige D26)
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Mascot } from "./mascot";
import { chatActions, useChat, useUi, useStream } from "@/lib/store";
import { t } from "@/lib/i18n";
import {
  Plus, Brain, SquarePen, Trash2, Copy, Clock3, Loader2,
} from "lucide-react";
import type { Lang } from "@/lib/types";

export function SidebarContent({ lang: lg }: { lang: Lang }) {
  const conversations = useChat(s => s.conversations);
  const activeChatId = useChat(s => s.activeChatId);
  const setView = useUi(s => s.setView);
  const setSidebar = useUi(s => s.setSidebar);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [ctxFor, setCtxFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  const liveConvId = useStream(s => s.live?.convId ?? null);
  const streamingConvIds = new Set(liveConvId ? [liveConvId] : []);

  const select = (id: string) => {
    chatActions.selectChat(id);
    setSidebar(false);
    setView("chat");
  };

  const dup = (id: string) => {
    chatActions.duplicateChat(id);
    toast(t(lg, "newChatToast"));
  };

  return (
    <div className="flex h-full flex-col bg-sidebar-c">
      <div className="px-4 pt-5 pb-3 flex items-center gap-2.5">
        <Mascot size={42} float />
        <div className="min-w-0">
          <h1 className="text-[15px] font-bold leading-tight">{t(lg, "appName")}</h1>
          <p className="text-[10.5px] text-muted-foreground leading-snug">{t(lg, "tagline")}</p>
        </div>
      </div>

      <div className="px-3 pb-2">
        <Button
          className="w-full rounded-[10px] bg-accent text-white hover:opacity-90 gap-2"
          onClick={() => { chatActions.newChat(); toast(t(lg, "newChatToast")); select(useChat.getState().activeChatId!); }}
        >
          <SquarePen className="h-4 w-4" /> {t(lg, "newChat")}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1" aria-label={t(lg, "newChat")}>
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-4">{t(lg, "newChat")} →</p>
        )}
        <ul className="space-y-0.5" role="list">
          {conversations.map(c => (
            <li key={c.id} className="relative">
              <button
                className={`chat-item w-full text-left px-3 py-2 rounded-[10px] text-sm transition-colors hover:bg-hover flex items-center gap-2 ${activeChatId === c.id ? "bg-hover border border-accent/40" : "border border-transparent"}`}
                onClick={() => select(c.id)}
                onContextMenu={e => { e.preventDefault(); setCtxFor(c.id); }}
                aria-current={activeChatId === c.id}
              >
                {streamingConvIds.has(c.id) ? (
                  <Loader2 className="h-3.5 w-3.5 text-accent animate-spin shrink-0" />
                ) : (
                  <Clock3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                {renaming === c.id ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        chatActions.renameChat(c.id, draft || c.title);
                        setRenaming(null);
                      }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="bg-background border border-border rounded px-1.5 text-sm w-full"
                    aria-label={t(lg, "rename")}
                  />
                ) : (
                  <span className="truncate flex-1">{c.title}</span>
                )}
                <span className="text-[10px] text-muted-foreground shrink-0">{c.messages.length}</span>
              </button>
              {ctxFor === c.id && (
                <div className="absolute right-2 top-2 z-10 bg-panel border border-border rounded-[10px] shadow-lg py-1 w-36">
                  <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-hover" onClick={() => {
                    setRenaming(c.id);
                    setDraft(c.title);
                    setCtxFor(null);
                  }}>
                    ✏️ {t(lg, "edit")}
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-hover" onClick={() => { dup(c.id); setCtxFor(null); }}>
                    <Copy className="inline h-3 w-3 mr-1" /> Duplicar
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-hover" onClick={() => {
                    chatActions.deleteChat(c.id);
                    toast(t(lg, "deletedConv"));
                    setCtxFor(null);
                  }}>
                    <Trash2 className="inline h-3 w-3 mr-1" /> {t(lg, "delete")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-3 border-t border-border">
        <Button variant="outline" className="w-full rounded-[10px] gap-2" onClick={() => { setView("memory"); setSidebar(false); }}>
          <Brain className="h-4 w-4 text-accent" /> {t(lg, "memoryManager")}
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({ lang: lg }: { lang: Lang }) {
  const sidebarOpen = useUi(s => s.sidebarOpen);
  const setSidebar = useUi(s => s.setSidebar);
  return (
    <>
      {/* desktop */}
      <aside className="hidden lg:block w-[280px] shrink-0 border-r border-border">
        <SidebarContent lang={lg} />
      </aside>
      {/* mobile drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-40 transition-opacity ${sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setSidebar(false)}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-black/50" />
      </div>
      <aside
        className={`lg:hidden fixed left-0 top-0 h-full w-[280px] z-50 shadow-2xl transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        role="dialog"
        aria-modal={sidebarOpen}
        aria-label={t(lg, "appName")}
      >
        <SidebarContent lang={lg} />
      </aside>
    </>
  );
}

export { Plus };
