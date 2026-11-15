"use client";
// DS-BOX · Script Lab — exibições e previews de vários gêneros de script:
// HTML/CSS (iframe sandbox multi-arquivo), JS (worker), Shell (Bash-86X),
// Python (Pyodide via CDN), Markdown (render), JSON (pretty), SVG (inline).
import { useMemo, useState, useSyncExternalStore } from "react";
import { vfs, genreOf, TEMPLATES, seedTemplate } from "@/lib/dsbox/vfs";
import { detectGenre, bundleWeb, runJs, runShell, runPython, prettyJson, imageSrc } from "@/lib/dsbox/preview";
import { Markdown } from "@/components/vessie/markdown";
import { useDsbox } from "@/lib/dsbox/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Play, BookOpen, Braces, Code2 } from "lucide-react";

export function ScriptLab({ lang }: { lang: "en" | "pt-BR" }) {
  const pt = lang === "pt-BR";
  const version = useSyncExternalStore(vfs.subscribe, vfs.getVersion);
  const files = useSyncExternalStore(vfs.subscribe, () => vfs.list());
  const storePreview = useDsbox(s => s.scriptPreview);
  const [selected, setSelected] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const path = storePreview?.path ?? selected ?? files[0]?.path ?? null;
  const content = path ? (storePreview?.path === path ? null : vfs.read(path)) : null;
  const info = path ? detectGenre(path) : null;

  const bundledHtml = useMemo(() => {
    if (!path) return null;
    if (storePreview?.path === path) return storePreview.html;
    const g = genreOf(path);
    if (g === "web") return bundleWeb(path);
    if (g === "style") return bundleWeb(path, [path]);
    return null;
  }, [path, storePreview, version]);

  const src = path && content !== null ? imageSrc(path, content) : null;

  const run = async (): Promise<void> => {
    if (!path) return;
    setRunning(true);
    setOutput(null);
    try {
      switch (info?.mode) {
        case "worker": setOutput(await runJs(path)); break;
        case "bash86": setOutput(await runShell(path)); break;
        case "pyodide": setOutput(await runPython(path, m => setOutput(m))); break;
        default: toast(pt ? `gênero ${info?.genre} não é executável — ${info?.label}` : `genre ${info?.genre} is not runnable — ${info?.label}`);
      }
    } catch (e) {
      setOutput(`✖ ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex gap-2 sm:gap-3 h-full min-h-0" data-v={version}>
      {/* lista de arquivos por gênero — estreita no mobile */}
      <div className="w-28 sm:w-40 shrink-0 flex flex-col gap-1.5 min-h-0">
        <span className="text-[11px] text-text2">{pt ? "Gêneros" : "Genres"}</span>
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border divide-y divide-border dsbox-list">
          {files.length === 0 && (
            <div className="p-2.5 text-[11px] text-text2">
              {pt ? "VFS vazio — semear um template:" : "Empty VFS — seed a template:"}
              <div className="mt-2 flex flex-col gap-1">
                {TEMPLATES.map(t => (
                  <Button key={t.id} size="sm" variant="outline" className="h-7 text-[10.5px] justify-start" onClick={() => { seedTemplate(t.id); toast(pt ? `🧩 ${t.label} semeado` : `🧩 ${t.label} seeded`); }}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {files.map(f => (
            <button
              key={f.path}
              className={`block w-full text-left px-2 py-1.5 font-mono text-[11px] truncate hover:bg-hover/60 ${path === f.path && storePreview?.path !== f.path ? "bg-hover text-accent" : ""}`}
              onClick={() => { setSelected(f.path); setOutput(null); }}
              title={f.path}
            >
              <span className="opacity-60">{genreOf(f.path) === "web" ? "🌐" : genreOf(f.path) === "script" ? "⚙" : genreOf(f.path) === "shell" ? "🐚" : genreOf(f.path) === "python" ? "🐍" : genreOf(f.path) === "markdown" ? "📖" : genreOf(f.path) === "style" ? "🎨" : "•"}</span>{" "}
              {f.path.split("/").pop()}
            </button>
          ))}
        </div>
      </div>

      {/* preview */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {path && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="font-mono text-[11px] text-text2 truncate max-w-[110px] sm:max-w-[200px]">{path}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-accent/40 text-accent truncate max-w-[120px] sm:max-w-none">{info?.label}</span>
            {info?.runnable && (
              <Button size="sm" className="h-7 shrink-0" onClick={() => void run()} disabled={running}>
                <Play className="h-3 w-3 mr-1" />{running ? (pt ? "executando…" : "running…") : (pt ? "Executar" : "Run")}
              </Button>
            )}
            {storePreview?.path === path && (
              <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => useDsbox.getState().setScriptPreview(null)}>
                {pt ? "voltar ao arquivo" : "back to file"}
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-black/30 relative">
          {/* iframe web */}
          {bundledHtml !== null ? (
            <iframe
              key={path + version}
              srcDoc={bundledHtml}
              title={pt ? "Preview sandbox do script" : "Script sandbox preview"}
              sandbox="allow-scripts allow-modals allow-forms"
              className="w-full h-full bg-white"
            />
          ) : src ? (
            <div className="w-full h-full grid place-items-center p-4">
              <img src={src} alt={path ?? "imagem"} className="max-w-full max-h-full rounded border border-border" />
            </div>
          ) : info?.mode === "render" && content !== null ? (
            <div className="w-full h-full overflow-y-auto p-4 bg-background">
              <Markdown>{content}</Markdown>
            </div>
          ) : info?.mode === "pretty" && content !== null ? (
            <pre className="w-full h-full overflow-auto p-3 font-mono text-[12px] leading-5 text-foreground whitespace-pre-wrap">{prettyJson(content)}</pre>
          ) : content !== null ? (
            <pre className="w-full h-full overflow-auto p-3 font-mono text-[12px] leading-5 text-[#d8d2c8] whitespace-pre-wrap">{content}</pre>
          ) : (
            <div className="w-full h-full grid place-items-center text-sm text-text2 px-6 text-center">
              {pt ? "Abra um arquivo na lista (ou peça à IA: ds:preview:index.html)" : "Open a file from the list (or ask the AI: ds:preview:index.html)"}
            </div>
          )}
        </div>

        {/* saída de execução */}
        {output !== null && (
          <div className="shrink-0 rounded-lg border border-border bg-black/85 p-2.5 max-h-44 overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wide text-text2 flex items-center gap-1">
                <Braces className="h-3 w-3" /> {pt ? "saída" : "output"}
              </span>
              <button className="text-[10px] text-text2 hover:text-accent" onClick={() => setOutput(null)}>✕</button>
            </div>
            <pre className="font-mono text-[11.5px] leading-5 text-[#c8e6d8] whitespace-pre-wrap">{output}</pre>
          </div>
        )}

        {info?.note && (
          <p className="shrink-0 text-[10.5px] text-muted-foreground flex items-center gap-1">
            <BookOpen className="h-3 w-3" /> {info.note}
          </p>
        )}
      </div>
    </div>
  );
}
