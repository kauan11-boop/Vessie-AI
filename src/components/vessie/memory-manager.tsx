"use client";
// Vessie AI — Memory Manager: 7 abas + busca + formulários + ZIP (B.3.3)
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useSettings, useUi } from "@/lib/store";
import {
  onMemoryChange, getMemoryVersion, raw as memoryRaw, putFile, getFile, deleteFile, listFiles,
  addTrigger, removeTrigger, setTriggerEnabled,
  addScript, removeScript, setScriptEnabled,
  addSkill, removeSkill, setSkillEnabled,
  addPlugin, removePlugin, addMcp, removeMcp,
  addApi, removeApi,
  exportZip, importZip, runJSAsync, stats,
} from "@/lib/memory";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload, Plus, Trash2, FileText, Search, FolderOpen } from "lucide-react";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

type TabId = "files" | "skills" | "plugins" | "mcps" | "apis" | "triggers" | "scripts";

const TABS: Array<{ id: TabId; icon: string }> = [
  { id: "files", icon: "📁" },
  { id: "skills", icon: "🧠" },
  { id: "plugins", icon: "🔌" },
  { id: "mcps", icon: "📡" },
  { id: "apis", icon: "🌐" },
  { id: "triggers", icon: "⚡" },
  { id: "scripts", icon: "📜" },
];

function useMemoryVersion(): number {
  return useSyncExternalStore(onMemoryChange, getMemoryVersion);
}

export function MemoryManager({ lang: lg }: { lang: Lang }) {
  useMemoryVersion();
  const setView = useUi(s => s.setView);
  const [tab, setTab] = useState<TabId>("files");
  const [query, setQuery] = useState("");
  const [viewFile, setViewFile] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const st = stats();

  const doImport = async (file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    const { imported } = importZip(buf);
    toast(`${imported} arquivo(s) importados`);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-4 py-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="sm" className="h-8 rounded-[99px] gap-1.5" onClick={() => setView("chat")}>
            <ArrowLeft className="h-3.5 w-3.5" /> {t(lg, "backToChat")}
          </Button>
          <h2 className="text-lg font-bold">{t(lg, "memoryTitle")}</h2>
          <div className="ml-auto flex gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" className="h-8 rounded-[99px] gap-1.5" onClick={() => fileInput.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> {t(lg, "importZip")}
            </Button>
            <Button variant="outline" size="sm" className="h-8 rounded-[99px] gap-1.5" onClick={() => exportZip()}>
              <Download className="h-3.5 w-3.5" /> {t(lg, "exportZip")}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">{t(lg, "memorySub")}</p>

        <div className="grid grid-cols-1 md:grid-cols-[232px_1fr] gap-4 mt-5">
          <nav className="flex md:flex-col gap-1.5 md:gap-1 flex-wrap" aria-label="Memory tabs">
            {TABS.map(tb => (
              <button
                key={tb.id}
                className={`px-3 py-2 rounded-[10px] text-sm text-left flex items-center gap-2 transition-colors ${tab === tb.id ? "bg-hover border border-accent/40" : "hover:bg-hover border border-transparent"}`}
                onClick={() => { setTab(tb.id); setViewFile(null); }}
                aria-current={tab === tb.id}
              >
                <span aria-hidden>{tb.icon}</span>
                <span className="flex-1">{t(lg, `tab${tb.id[0].toUpperCase()}${tb.id.slice(1)}` as Parameters<typeof t>[1])}</span>
                <span className="text-[10px] font-mono text-muted-foreground bg-background-2 border border-border rounded-[99px] px-1.5">
                  {st[tb.id] ?? 0}
                </span>
              </button>
            ))}
            <div className="hidden md:block mt-2 px-3 py-2 text-[10px] font-mono text-muted-foreground border-t border-border">
              {st.files} files · {st.scripts} scripts · {st.triggers} triggers
            </div>
          </nav>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={t(lg, "search")} className="pl-8 h-8 text-xs" aria-label={t(lg, "search")} />
              </div>
              <TabCreateButton tab={tab} lang={lg} />
            </div>

            {tab === "files" && <FilesPane lg={lg} query={query} viewFile={viewFile} setViewFile={setViewFile} />}
            {tab === "skills" && <SkillsPane lg={lg} query={query} />}
            {tab === "plugins" && <PluginsPane lg={lg} query={query} />}
            {tab === "mcps" && <McpsPane lg={lg} query={query} />}
            {tab === "apis" && <ApisPane lg={lg} query={query} />}
            {tab === "triggers" && <TriggersPane lg={lg} query={query} />}
            {tab === "scripts" && <ScriptsPane lg={lg} query={query} />}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------- panes ---------- */

function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-border rounded-[12px] p-8 text-center text-xs text-muted-foreground">
      <FolderOpen className="h-6 w-6 mx-auto mb-2 opacity-50" aria-hidden />
      {text}
    </div>
  );
}

function FilesPane({ lg, query, viewFile, setViewFile }: { lg: Lang; query: string; viewFile: string | null; setViewFile: (v: string | null) => void }) {
  const version = useMemoryVersion();
  const files = useMemo(
    () => listFiles().filter(f => f.path.toLowerCase().includes(query.toLowerCase())),
    [query, version]
  );
  const rec = viewFile ? getFile(viewFile) : null;
  if (viewFile && rec) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px]" onClick={() => setViewFile(null)}>← voltar</Button>
          <span className="font-mono text-xs">{viewFile}</span>
          <span className="text-[10px] text-muted-foreground">{rec.author} · {rec.content.length} chars</span>
          <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px] ml-auto text-danger" onClick={() => { deleteFile(viewFile); setViewFile(null); }}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        <pre className="code-body whitespace-pre-wrap">{rec.content}</pre>
      </div>
    );
  }
  if (files.length === 0) return <Empty text={t(lg, "emptyFiles")} />;
  return (
    <ul className="space-y-1.5">
      {files.map(f => (
        <li key={f.path} className="border border-border rounded-[10px] px-3 py-2 flex items-center gap-2 hover:bg-hover transition-colors">
          <FileText className="h-3.5 w-3.5 text-accent shrink-0" aria-hidden />
          <button className="flex-1 text-left min-w-0" onClick={() => setViewFile(f.path)}>
            <span className="font-mono text-xs truncate block">{f.path}</span>
            <span className="text-[10px] text-muted-foreground">{f.size} chars · {f.author}</span>
          </button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label={t(lg, "view")} onClick={() => setViewFile(f.path)}>
            <FileText className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-danger" aria-label={t(lg, "remove")} onClick={() => deleteFile(f.path)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function SkillsPane({ lg, query }: { lg: Lang; query: string }) {
  useMemoryVersion();
  const data = memoryRaw().skills;
  const names = Object.keys(data).filter(n => n.toLowerCase().includes(query.toLowerCase()));
  if (names.length === 0) return <Empty text={t(lg, "emptySkills")} />;
  return (
    <ul className="space-y-1.5">
      {names.map(n => {
        const s = data[n];
        return (
          <li key={n} className="border border-border rounded-[10px] p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold flex-1 truncate min-w-0">{n}</span>
              <Switch checked={s.enabled} onCheckedChange={v => setSkillEnabled(n, v)} aria-label={n} />
              <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px]" onClick={() => {
                useSettings.getState().setSettings({ systemPrompt: s.prompt });
                toast(t(lg, "skillApplied", n));
              }}>
                {t(lg, "applySkill")}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-danger" aria-label={t(lg, "remove")} onClick={() => removeSkill(n)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
          </li>
        );
      })}
    </ul>
  );
}

function PluginsPane({ lg, query }: { lg: Lang; query: string }) {
  useMemoryVersion();
  const data = memoryRaw().plugins;
  const names = Object.keys(data).filter(n => n.toLowerCase().includes(query.toLowerCase()));
  if (names.length === 0) return <Empty text={t(lg, "emptyPlugins")} />;
  return (
    <ul className="space-y-1.5">
      {names.map(n => {
        const p = data[n];
        return (
          <li key={n} className="border border-border rounded-[10px] p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">{n}</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-2">v{p.version}</span>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>
            </div>
            {p.code && (
              <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px]" onClick={() => void runJSAsync(p.code).then(r => toast(`▶ ${r.slice(0, 200)}`)).catch(e => toast(`erro: ${e.message}`))}>
                {t(lg, "run")}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-danger" aria-label={t(lg, "remove")} onClick={() => removePlugin(n)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function McpsPane({ lg, query }: { lg: Lang; query: string }) {
  useMemoryVersion();
  const data = memoryRaw().mcps;
  const names = Object.keys(data).filter(n => n.toLowerCase().includes(query.toLowerCase()));
  if (names.length === 0) return <Empty text={t(lg, "emptyMcp")} />;
  return (
    <ul className="space-y-1.5">
      {names.map(n => {
        const m = data[n];
        return (
          <li key={n} className="border border-border rounded-[10px] p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">{n}</span>
              <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">{m.command}</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-danger" aria-label={t(lg, "remove")} onClick={() => removeMcp(n)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function ApisPane({ lg, query }: { lg: Lang; query: string }) {
  useMemoryVersion();
  const data = memoryRaw().apis;
  const names = Object.keys(data).filter(n => n.toLowerCase().includes(query.toLowerCase()));
  if (names.length === 0) return <Empty text={t(lg, "emptyApis")} />;
  return (
    <ul className="space-y-1.5">
      {names.map(n => {
        const a = data[n];
        return (
          <li key={n} className="border border-border rounded-[10px] p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">{n}</span>
              <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">{a.url}</p>
            </div>
            {/^https?:/.test(a.url) && (
              <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px]"
                onClick={() => {
                  const ctrl = new AbortController();
                  const to = setTimeout(() => ctrl.abort(), 10000);
                  fetch(a.url, { mode: "no-cors", signal: ctrl.signal })
                    .then(() => toast(`✅ ${n}: respondeu`))
                    .catch(() => toast(`❌ ${n}: sem resposta`))
                    .finally(() => clearTimeout(to));
                }}>
                {t(lg, "test")}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-danger" aria-label={t(lg, "remove")} onClick={() => removeApi(n)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function TriggersPane({ lg, query }: { lg: Lang; query: string }) {
  useMemoryVersion();
  const data = memoryRaw().triggers;
  const names = Object.keys(data).filter(n => n.toLowerCase().includes(query.toLowerCase()));
  if (names.length === 0) return <Empty text={t(lg, "emptyTriggers")} />;
  return (
    <ul className="space-y-1.5">
      {names.map(n => {
        const tr = data[n];
        return (
          <li key={n} className="border border-border rounded-[10px] p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">{n}</span>
              <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                when &quot;{tr.pattern}&quot; → {tr.action}{tr.category === "api" ? ` (${tr.api})` : ""}
              </p>
            </div>
            <Switch checked={tr.enabled} onCheckedChange={v => setTriggerEnabled(n, v)} aria-label={n} />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-danger" aria-label={t(lg, "remove")} onClick={() => removeTrigger(n)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function ScriptsPane({ lg, query }: { lg: Lang; query: string }) {
  useMemoryVersion();
  const data = memoryRaw().scripts;
  const names = Object.keys(data).filter(n => n.toLowerCase().includes(query.toLowerCase()));
  if (names.length === 0) return <Empty text={t(lg, "emptyScripts")} />;
  return (
    <ul className="space-y-1.5">
      {names.map(n => {
        const sc = data[n];
        return (
          <li key={n} className="border border-border rounded-[10px] p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold font-mono">{n}</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-2">{sc.lang} · {sc.code.length} chars</span>
            </div>
            <Switch checked={sc.enabled} onCheckedChange={v => setScriptEnabled(n, v)} aria-label={n} />
            <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px]" disabled={!sc.enabled || sc.lang === "mem"}
              onClick={() => void runJSAsync(sc.code).then(r => toast(`▶ ${r.slice(0, 200)}`)).catch(e => toast(`erro: ${e.message}`))}>
              {t(lg, "run")}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-danger" aria-label={t(lg, "remove")} onClick={() => removeScript(n)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Botão de criação rápida por aba (formulário inline). */
function TabCreateButton({ tab, lang: lg }: { tab: TabId; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<string[]>([]);

  const FORMS: Record<TabId, { labels: string[]; submit: (v: string[]) => void }> = {
    files: {
      labels: ["caminho (ex.: guia/nota.txt)", "conteúdo"],
      submit: ([p, c]) => { putFile(p, c, { author: "user" }); toast(t(lg, "memSaved", p)); },
    },
    skills: {
      labels: ["nome", "descrição", "prompt"],
      submit: ([n, d, p]) => { addSkill(n, d, p, true); toast(`🧠 ${n}`); },
    },
    plugins: {
      labels: ["nome", "versão", "código js"],
      submit: ([n, v, c]) => { addPlugin(n, v || "1.0.0", "plugin de usuário", c); toast(`🔌 ${n}`); },
    },
    mcps: {
      labels: ["nome", "comando"],
      submit: ([n, c]) => { addMcp(n, c, "MCP de usuário"); toast(`📡 ${n}`); },
    },
    apis: {
      labels: ["nome", "url (http/https)"],
      submit: ([n, u]) => { addApi(n, u, "API de usuário"); toast(`🌐 ${n}`); },
    },
    triggers: {
      labels: ["nome", "padrão", "ação (save|save-code|notify|run:x|append:f.txt)"],
      submit: ([n, p, a]) => { addTrigger(n, { pattern: p, action: a, category: "geral" }); toast(`⚡ ${n}`); },
    },
    scripts: {
      labels: ["nome", "código js"],
      submit: ([n, c]) => { addScript(n, c, { lang: "js", desc: "script de usuário" }); toast(`📜 ${n}`); },
    },
  };

  const form = FORMS[tab];

  return (
    <>
      <Button size="sm" className="h-8 rounded-[99px] gap-1 bg-accent text-white hover:opacity-90" onClick={() => { setOpen(true); setValues(form.labels.map(() => "")); }}>
        <Plus className="h-3.5 w-3.5" /> {t(lg, "create")}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={t(lg, "create")}>
          <div className="bg-panel border border-border rounded-[14px] p-4 w-[420px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">{t(lg, "create")} — {tab}</h3>
            {form.labels.map((lb, i) => (
              <div key={i} className="mb-2">
                <Label className="text-xs">{lb}</Label>
                {lb.includes("código js") || lb === "conteúdo" || lb === "prompt" ? (
                  <Textarea value={values[i] ?? ""} onChange={e => setValues(vals => vals.map((v, j) => (j === i ? e.target.value : v)))} className="mt-1 min-h-20 text-xs font-mono" />
                ) : (
                  <Input value={values[i] ?? ""} onChange={e => setValues(vals => vals.map((v, j) => (j === i ? e.target.value : v)))} className="mt-1 text-xs" />
                )}
              </div>
            ))}
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="outline" size="sm" className="h-8 text-xs rounded-[99px]" onClick={() => setOpen(false)}>{t(lg, "editCancel")}</Button>
              <Button size="sm" className="h-8 text-xs rounded-[99px] bg-accent text-white hover:opacity-90" onClick={() => {
                form.submit(values);
                setOpen(false);
              }}>
                {t(lg, "create")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
