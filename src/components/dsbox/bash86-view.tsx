"use client";
// DS-BOX · Bash-86X — terminal virtual ligado ao VFS (roda sempre, até offline).
import { useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { vfs, TEMPLATES, seedTemplate } from "@/lib/dsbox/vfs";
import { runBash86, defaultShellEnv, shellBanner } from "@/lib/dsbox/bash86";
import { Button } from "@/components/ui/button";
import { CornerDownLeft } from "lucide-react";

export function Bash86View({ lang }: { lang: "en" | "pt-BR" }) {
  const pt = lang === "pt-BR";
  const [lines, setLines] = useState<string[]>(() => shellBanner().split("\n"));
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState("/");
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<string[]>([]);
  const histIdx = useRef(-1);
  const outRef = useRef<HTMLDivElement | null>(null);
  const envRef = useRef(defaultShellEnv());
  const version = useSyncExternalStore(vfs.subscribe, vfs.getVersion);

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
  }, [lines]);

  const push = (...ls: string[]): void => setLines(prev => [...prev, ...ls].slice(-400));

  const submit = async (): Promise<void> => {
    const cmd = input.trim();
    if (!cmd || busy) return;
    setInput("");
    historyRef.current = [...historyRef.current, cmd].slice(-80);
    histIdx.current = -1;
    push(`${envRef.current.cwd}$ ${cmd}`);
    setBusy(true);
    try {
      const r = await runBash86(cmd, envRef.current);
      if (r.output === "\u0000CLEAR") {
        setLines([shellBanner()]);
      } else if (r.output) {
        push(...r.output.split("\n"));
      }
      envRef.current.cwd = r.cwd;
      setCwd(r.cwd);
      if (r.code !== 0) push(`exit ${r.code}`);
    } catch (e) {
      push(`bash-86x: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 h-full min-h-0" data-v={version}>
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATES.map(t => (
          <Button
            key={t.id} size="sm" variant="outline" className="h-7 text-[11px]"
            title={t.desc}
            onClick={() => {
              const written = seedTemplate(t.id);
              push(...written.map(w => `📄 template criado: ${w}`));
            }}
          >
            + {t.label}
          </Button>
        ))}
      </div>

      <div
        ref={outRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-black/85 p-3 font-mono text-[12px] leading-5 text-[#c8e6d8] whitespace-pre-wrap dsbox-term"
        aria-live="polite"
        aria-label={pt ? "Terminal Bash-86X" : "Bash-86X terminal"}
      >
        {lines.map((l, i) => (
          <div key={i} className={l.startsWith("exit ") || l.includes("não encontrado") ? "text-danger" : ""}>{l || "\u00A0"}</div>
        ))}
        {busy && <div className="gen-pulse text-accent">…</div>}
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] text-accent shrink-0">{cwd}$</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") void submit();
            else if (e.key === "ArrowUp") {
              e.preventDefault();
              const h = historyRef.current;
              if (h.length === 0) return;
              histIdx.current = histIdx.current < 0 ? h.length - 1 : Math.max(0, histIdx.current - 1);
              setInput(h[histIdx.current]);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const h = historyRef.current;
              if (histIdx.current < 0) return;
              histIdx.current = Math.min(h.length - 1, histIdx.current + 1);
              setInput(h[histIdx.current]);
            }
          }}
          className="flex-1 h-8 rounded-md border border-border bg-transparent px-2 font-mono text-[12px] outline-none focus:border-accent"
          placeholder={pt ? "help · ls · cat boot/boot.cfg · echo ola > nota.txt · zip projeto" : "help · ls · cat boot/boot.cfg · echo hi > note.txt · zip project"}
          aria-label={pt ? "Entrada de comando" : "Command input"}
          autoFocus
        />
        <Button size="sm" className="h-8 shrink-0" onClick={() => void submit()} disabled={busy}>
          <CornerDownLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
