"use client";
// DS-BOX · Build-Iso — wizard: monta ISO 9660 (El Torito) do VFS, com kernel livre opcional,
// e boota no emulador v86. Mesmo núcleo usado pela ferramenta ds:iso da IA.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { vfs, TEMPLATES, seedTemplate, genreOf } from "@/lib/dsbox/vfs";
import { buildIsoCore, tryGetEmulatorUi } from "@/lib/dsbox/tools";
import { useDsbox, dsboxActions } from "@/lib/dsbox/store";
import { bootMachine } from "@/lib/dsbox/emulator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Disc3, Play, Download, Trash2, Package } from "lucide-react";

export function BuildIsoView({ lang }: { lang: "en" | "pt-BR" }) {
  const pt = lang === "pt-BR";
  const version = useSyncExternalStore(vfs.subscribe, vfs.getVersion);
  const files = useSyncExternalStore(vfs.subscribe, () => vfs.list());
  const isoShelf = useDsbox(s => s.isoShelf);
  const buildLog = useDsbox(s => s.buildLog);
  const kernelPresets = useDsbox(s => s.kernelPresets);
  const getIsoBytes = useDsbox(s => s.getIsoBytes);
  const getIsoKernel = useDsbox(s => s.getIsoKernel);
  const [name, setName] = useState("dsboxos");
  const [kernel, setKernel] = useState<string>("buildroot");
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [building, setBuilding] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [buildLog]);

  const isIncluded = (path: string): boolean => included[path] !== false; // default: tudo

  const build = async (): Promise<void> => {
    const include = files.filter(f => isIncluded(f.path)).map(f => f.path);
    if (include.length === 0) { toast(pt ? "selecione ao menos um arquivo" : "select at least one file"); return; }
    setBuilding(true);
    try {
      const { shelf, summary, bootable } = await buildIsoCore({
        name: name.trim() || "dsboxos",
        include,
        kernel: kernel === "none" ? undefined : kernel,
      });
      toast(pt ? `💿 ${summary}` : `💿 ${summary}`);
      if (bootable) {
        dsboxActions.setPanelOpen(true);
        dsboxActions.setTab("emulator");
        try {
          const k = getIsoKernel(shelf.id);
          const bytes = getIsoBytes(shelf.id);
          if (k?.kernelBytes && bytes) {
            await bootMachine({ mode: "kernel", bzimage: k.kernelBytes, initrd: k.initrdBytes, cmdline: k.cmdline, label: shelf.name }, uiRefs());
          }
        } catch { /* boot falhou — ISO segue na prateleira */ }
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  function uiRefs(): { screenContainer: HTMLDivElement; serialEl: HTMLTextAreaElement | null } {
    const refs = tryGetEmulatorUi();
    if (!refs) throw new Error(pt ? "abra a aba Emulador para bootar" : "open the Emulator tab to boot");
    return refs;
  }

  const bootShelf = async (id: string): Promise<void> => {
    try {
      const k = getIsoKernel(id);
      const bytes = getIsoBytes(id);
      if (!bytes) return;
      dsboxActions.setTab("emulator");
      if (k?.kernelBytes) {
        await bootMachine({ mode: "kernel", bzimage: k.kernelBytes, initrd: k.initrdBytes, cmdline: k.cmdline, label: "iso" }, uiRefs());
      } else {
        await bootMachine({ mode: "iso", isoBuffer: bytes.slice().buffer as ArrayBuffer, label: "iso" }, uiRefs());
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const downloadIso = (id: string): void => {
    const bytes = getIsoBytes(id);
    const item = isoShelf.find(i => i.id === id);
    if (!bytes || !item) return;
    const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${item.name}.iso`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(pt ? `⬇ ${item.name}.iso baixada` : `⬇ ${item.name}.iso downloaded`);
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 overflow-y-auto dsbox-list" data-v={version}>
      {/* sem arquivos → atalho para template linux-iso */}
      {files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-sm text-text2 mb-3">
            {pt ? "O VFS está vazio. Semear o skeleton de distribuição Linux:" : "The VFS is empty. Seed the Linux distribution skeleton:"}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {TEMPLATES.map(t => (
              <Button key={t.id} size="sm" variant="outline" className="h-8" onClick={() => { seedTemplate(t.id); toast(pt ? `🧩 ${t.label} semeado` : `🧩 ${t.label} seeded`); }}>
                <Package className="h-3.5 w-3.5 mr-1" />{t.label}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={name} onChange={e => setName(e.target.value)} className="h-8 w-40 text-xs" aria-label={pt ? "Nome da ISO" : "ISO name"} placeholder="dsboxos" />
            <select
              value={kernel}
              onChange={e => setKernel(e.target.value)}
              className="h-8 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus:border-accent max-w-[220px]"
              aria-label={pt ? "Kernel" : "Kernel"}
            >
              <option value="none">{pt ? "Sem kernel (ISO de dados)" : "No kernel (data ISO)"}</option>
              <option value="buildroot">{pt ? "Buildroot Linux (livre, ~5 MB)" : "Buildroot Linux (free, ~5 MB)"}</option>
              <option value="buildroot-alt">{pt ? "Buildroot (espelho)" : "Buildroot (mirror)"}</option>
              {kernelPresets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <Button size="sm" className="h-8" onClick={() => void build()} disabled={building}>
              <Disc3 className={`h-3.5 w-3.5 mr-1 ${building ? "gen-pulse" : ""}`} />
              {building ? (pt ? "montando…" : "building…") : (pt ? "Montar ISO + Boot" : "Build ISO + Boot")}
            </Button>
          </div>

          <div className="rounded-lg border border-border">
            <div className="px-2.5 py-1.5 text-[11px] text-text2 border-b border-border flex justify-between">
              <span>{pt ? "Arquivos incluídos na ISO" : "Files included in the ISO"}</span>
              <button className="underline hover:text-accent" onClick={() => setIncluded({})}>{pt ? "todos" : "all"}</button>
            </div>
            <div className="max-h-44 overflow-y-auto divide-y divide-border">
              {files.map(f => (
                <label key={f.path} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-hover/60 cursor-pointer">
                  <Checkbox checked={isIncluded(f.path)} onCheckedChange={c => setIncluded(prev => ({ ...prev, [f.path]: c === true }))} aria-label={f.path} />
                  <span className="font-mono text-[12px] flex-1 truncate">{f.path}</span>
                  <span className="text-[10.5px] text-muted-foreground">{genreOf(f.path)}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {/* log de build */}
      <div className="shrink-0">
        <span className="text-[11px] text-text2">{pt ? "Log do Build-Iso" : "Build-Iso log"}</span>
        <div ref={logRef} className="mt-1 h-28 overflow-y-auto rounded-lg border border-border bg-black/85 p-2 font-mono text-[11px] leading-4 text-[#12A882] whitespace-pre-wrap" aria-live="polite">
          {buildLog.length === 0 ? (pt ? "(sem execuções ainda)" : "(no runs yet)") : buildLog.join("\n")}
        </div>
      </div>

      {/* prateleira de ISOs */}
      {isoShelf.length > 0 && (
        <div className="shrink-0">
          <span className="text-[11px] text-text2">{pt ? "Prateleira de ISOs (sessão)" : "ISO shelf (session)"}</span>
          <div className="mt-1 rounded-lg border border-border divide-y divide-border">
            {isoShelf.map(i => (
              <div key={i.id} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${i.bootable ? "border-ok/50 text-ok" : "border-border text-text2"}`}>
                  {i.bootable ? (pt ? "bootável" : "bootable") : "dados"}
                </span>
                <span className="font-mono text-[12px] flex-1 truncate">{i.name}.iso</span>
                <span className="text-[10.5px] text-muted-foreground">{(i.size / 1024 / 1024).toFixed(1)} MB</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => downloadIso(i.id)} title={pt ? "Baixar .iso" : "Download .iso"}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void bootShelf(i.id)} title={pt ? "Boot no emulador" : "Boot in emulator"}>
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-danger" onClick={() => useDsbox.getState().removeIso(i.id)} title={pt ? "Descartar" : "Discard"}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10.5px] text-muted-foreground leading-relaxed">
        {pt
          ? "A ISO é 9660 real (abre no Explorer/mount/7-Zip). Bootável = kernel livre embutido + El Torito. Os presets apontam para kernels hospedados publicamente — se a rede bloquear, a ISO sai como dados e o boot usa o kernel da prateleira. Alternativa sempre disponível offline: Bash-86X."
          : "The ISO is real 9660 (opens in Explorer/mount/7-Zip). Bootable = embedded free kernel + El Torito. Presets point to publicly hosted kernels — if the network blocks them, the ISO comes out as data. Offline fallback: Bash-86X."}
      </p>
    </div>
  );
}
