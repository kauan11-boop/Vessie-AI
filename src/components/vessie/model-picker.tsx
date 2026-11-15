"use client";
// Vessie AI — seletor de modelo com OFFLINE · Simulite (B.3.7)
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings, useChat } from "@/lib/store";
import { useConn } from "@/lib/connection";
import { Simulite } from "@/lib/simulite";
import { t } from "@/lib/i18n";
import { RefreshCcw, ChevronDown } from "lucide-react";
import type { Lang } from "@/lib/types";

export function ModelPicker({ lang: lg }: { lang: Lang }) {
  const model = useSettings(s => s.settings.model);
  const setSettings = useSettings(s => s.setSettings);
  const models = useConn(s => s.models);
  const refresh = useConn(s => s.refresh);
  const convs = useChat(s => s.conversations.length);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [simStatus, setSimStatus] = useState(Simulite.status());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(
    () => models.filter(m => m.toLowerCase().includes(query.toLowerCase())),
    [models, query]
  );

  const label = model === "OFFLINE"
    ? "OFFLINE · Simulite"
    : model || t(lg, "modelPlaceholder");

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          className="h-8 max-w-[220px] gap-1.5 rounded-[99px] text-xs font-normal justify-start"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 rounded-[99px]"
          onClick={() => void refresh()}
          aria-label={t(lg, "refreshModels")}
          title={t(lg, "refreshModels")}
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {open && (
        <div className="absolute top-10 left-0 z-50 w-[320px] bg-panel border border-border rounded-[14px] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t(lg, "searchModel")}
              className="w-full bg-background-2 border border-border rounded-[10px] px-3 py-1.5 text-sm"
              aria-label={t(lg, "searchModel")}
              autoFocus
            />
          </div>
          <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-xs text-muted-foreground">
                Nenhum modelo no servidor agora — o modo OFFLINE (Simulite) já está disponível abaixo.
              </li>
            )}
            {filtered.map(m => (
              <li key={m}>
                <button
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-hover flex items-center gap-2 ${model === m ? "bg-hover" : ""}`}
                  onClick={() => { setSettings({ model: m }); setOpen(false); }}
                  role="option"
                  aria-selected={model === m}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${model === m ? "bg-ok" : "bg-border"}`} />
                  <span className="truncate font-mono text-xs">{m}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                className={`w-full text-left px-4 py-2.5 hover:bg-hover flex items-center gap-2 border-t border-border mt-1 ${model === "OFFLINE" ? "bg-hover" : ""}`}
                onClick={() => { setSettings({ model: "OFFLINE" }); setOpen(false); }}
                role="option"
                aria-selected={model === "OFFLINE"}
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${model === "OFFLINE" ? "bg-ok" : "bg-border"}`} />
                <span className="text-sm">
                  <b>OFFLINE · Simulite</b>
                  <span className="block text-[11px] text-muted-foreground">
                    Rede neural local — responde e aprende sem servidor
                    {convs > 0 ? ` · ${simStatus.rounds} rodadas` : ""}
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
