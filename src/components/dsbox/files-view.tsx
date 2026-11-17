"use client";
// DS-BOX · Arquivos — navegador do VFS: criar, importar, baixar, remover, EDITAR
// qualquer arquivo in-place (acesso total, igual à IA via ds:write); árvore do projeto.
import { useSyncExternalStore, useRef, useState } from "react";
import { vfs, normalizePath, genreOf } from "@/lib/dsbox/vfs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDsbox } from "@/lib/dsbox/store";
import { toast } from "sonner";
import { FilePlus2, Upload, FolderDown, Copy, Trash2, Eye, FileArchive, Download, PencilLine, Save, X } from "lucide-react";

export function FilesView({ lang }: { lang: "en" | "pt-BR" }) {
  const pt = lang === "pt-BR";
  const version = useSyncExternalStore(vfs.subscribe, vfs.getVersion);
  const files = useSyncExternalStore(vfs.subscribe, () => vfs.list());
  const setTab = useDsbox(s => s.setTab);
  const setScriptPreview = useDsbox(s => s.setScriptPreview);
  const newFileRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const zipRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const preview = (path: string): void => {
    const content = vfs.read(path) ?? "";
    const genre = genreOf(path);
    const escaped = content.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c);
    const html = genre === "web"
      ? content
      : `<pre style="font: 13px ui-monospace, monospace; white-space: pre-wrap; padding: 16px; color:#d8d2c8">${escaped}</pre>`;
    setScriptPreview({ path, html });
    setTab("scripts");
  };

  const createFile = (): void => {
    const raw = newFileRef.current?.value.trim();
    if (!raw) return;
    const path = normalizePath(raw);
    const err = vfs.write(path, "");
    if (err) { toast(err); return; }
    if (newFileRef.current) newFileRef.current.value = "";
    toast(pt ? `📄 ${path} criado` : `📄 ${path} created`);
  };

  const startEdit = (path: string): void => {
    setEditing(path);
    setDraft(vfs.read(path) ?? "");
  };

  const saveEdit = (): void => {
    if (!editing) return;
    const err = vfs.write(editing, draft);
    if (err) { toast(err); return; }
    toast(pt ? `💾 ${editing} salvo` : `💾 ${editing} saved`);
    setEditing(null);
  };

  const downloadFile = (path: string): void => {
    const content = vfs.read(path) ?? "";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() ?? "arquivo.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0" data-v={version}>
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
          <Input ref={newFileRef} placeholder={pt ? "caminho/novo.txt" : "path/new.txt"} className="h-8 text-xs" onKeyDown={e => { if (e.key === "Enter") createFile(); }} aria-label={pt ? "Caminho do novo arquivo" : "New file path"} />
          <Button size="sm" className="h-8 shrink-0" onClick={createFile}><FilePlus2 className="h-3.5 w-3.5 mr-1" />{pt ? "Criar" : "Create"}</Button>
        </div>
        <input ref={uploadRef} type="file" multiple className="hidden" onChange={async e => {
          const list = [...(e.target.files ?? [])];
          let ok = 0;
          for (const f of list) {
            const text = await f.text();
            if (!vfs.write(f.name, text)) ok++;
          }
          toast(pt ? `${ok} arquivo(s) importado(s)` : `${ok} file(s) imported`);
          e.target.value = "";
        }} />
        <Button size="sm" variant="outline" className="h-8" onClick={() => uploadRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1" />{pt ? "Importar" : "Import"}
        </Button>
        <input ref={zipRef} type="file" accept=".zip" className="hidden" onChange={async e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const res = vfs.importZip(await f.arrayBuffer());
          toast(typeof res === "number" ? (pt ? `📦 ${res} arquivo(s) do ZIP` : `📦 ${res} file(s) from ZIP`) : res);
          e.target.value = "";
        }} />
        <Button size="sm" variant="outline" className="h-8" onClick={() => zipRef.current?.click()}>
          <FileArchive className="h-3.5 w-3.5 mr-1" />{pt ? "Abrir ZIP" : "Open ZIP"}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={async () => {
          const n = await vfs.downloadZip("dsbox-projeto");
          toast(pt ? `📦 ZIP com ${n} arquivo(s)` : `📦 ZIP with ${n} file(s)`);
        }}>
          <FolderDown className="h-3.5 w-3.5 mr-1" />{pt ? "Baixar ZIP" : "Download ZIP"}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={async () => {
          try { await navigator.clipboard.writeText(vfs.tree()); toast(pt ? "🌳 árvore copiada" : "🌳 tree copied"); }
          catch { toast(pt ? "não foi possível copiar" : "could not copy"); }
        }}>
          <Copy className="h-3.5 w-3.5 mr-1" />{pt ? "Copiar árvore" : "Copy tree"}
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-danger" onClick={() => {
          vfs.clear();
          toast(pt ? "VFS limpo" : "VFS cleared");
        }}>
          <Trash2 className="h-3.5 w-3.5 mr-1" />{pt ? "Limpar" : "Clear"}
        </Button>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-accent truncate flex-1">✎ {editing}</span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" />{pt ? "Cancelar" : "Cancel"}</Button>
            <Button size="sm" className="h-7" onClick={saveEdit}><Save className="h-3.5 w-3.5 mr-1" />{pt ? "Salvar" : "Save"}</Button>
          </div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-[180px] w-full resize-none rounded-lg border border-border bg-panel p-2.5 font-mono text-[12px] leading-relaxed outline-none focus:border-accent"
            aria-label={pt ? "Conteúdo do arquivo" : "File content"}
          />
        </div>
      ) : files.length === 0 ? (
        <div className="flex-1 grid place-items-center text-center text-sm text-text2">
          {pt
            ? "VFS vazio. Use os templates no Bash-86X, crie arquivos acima, ou peça à IA: \"crie um sistema operacional\" — ela instala, edita e compila sozinha."
            : "Empty VFS. Use the templates in Bash-86X, create files above, or ask the AI: \"create an operating system\" — it installs, edits and compiles by itself."}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border divide-y divide-border dsbox-list">
          {files.map(f => (
            <div key={f.path} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-hover/60 group">
              <span className="text-[11px] px-1.5 py-0.5 rounded border border-border text-text2 shrink-0 uppercase">{genreOf(f.path)}</span>
              <button className="font-mono text-[12px] flex-1 text-left truncate hover:text-accent" onClick={() => preview(f.path)} title={f.path}>
                {f.path}
              </button>
              <span className="text-[10.5px] text-muted-foreground shrink-0">{(f.content.length / 1024).toFixed(1)}K</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(f.path)} title={pt ? "Editar" : "Edit"}>
                  <PencilLine className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => preview(f.path)} title={pt ? "Preview" : "Preview"}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => downloadFile(f.path)} title={pt ? "Baixar" : "Download"}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-danger" onClick={() => { vfs.rm(f.path); toast(pt ? `🗑️ ${f.path} removido` : `🗑️ ${f.path} removed`); }} title={pt ? "Excluir" : "Delete"}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <pre className="shrink-0 max-h-40 overflow-auto rounded-lg border border-border bg-panel p-2.5 text-[11px] font-mono text-text2 whitespace-pre" aria-label={pt ? "Árvore do projeto" : "Project tree"}>
        {vfs.tree(40)}
      </pre>
    </div>
  );
}
