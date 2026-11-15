"use client";
// DS-BOX · Emulador — v86 (x86 em WebAssembly) com tela + console serial.
// Estrutura exigida pelo v86: container com <div> (texto) + <canvas> (gráfico).
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Play, Power, RotateCcw, Keyboard } from "lucide-react";
import { useDsbox } from "@/lib/dsbox/store";
import {
  bootMachine, bootKernelFromUrl, powerOff, resetMachine, sendKeyboardText,
  onEmulatorChange, getEmulatorStatus, type EmulatorStatus,
} from "@/lib/dsbox/emulator";
import { registerEmulatorUi } from "@/lib/dsbox/tools";
import { toast } from "sonner";

export function EmulatorView({ lang }: { lang: "en" | "pt-BR" }) {
  const pt = lang === "pt-BR";
  const screenRef = useRef<HTMLDivElement | null>(null);
  const serialRef = useRef<HTMLTextAreaElement | null>(null);
  const [status, setStatus] = useState<EmulatorStatus>(getEmulatorStatus());
  const [msg, setMsg] = useState("");
  const [isoId, setIsoId] = useState<string>("none");
  const [presetId, setPresetId] = useState<string>("buildroot");
  const [memoryMB, setMemoryMB] = useState("128");
  const [keyText, setKeyText] = useState("");
  const isoShelf = useDsbox(s => s.isoShelf);
  const kernelPresets = useDsbox(s => s.kernelPresets);
  const getIsoBytes = useDsbox(s => s.getIsoBytes);
  const getIsoKernel = useDsbox(s => s.getIsoKernel);
  const pushBuildLog = useDsbox(s => s.pushBuildLog);

  useEffect(() => onEmulatorChange((st, m) => { setStatus(st); setMsg(m); }), []);

  // registra as refs para que as ferramentas ds:iso/ds:boot possam bootar
  useEffect(() => {
    registerEmulatorUi(() => {
      if (!screenRef.current) return null;
      return { screenContainer: screenRef.current, serialEl: serialRef.current };
    });
    return () => registerEmulatorUi(null);
  }, []);

  const busy = status === "loading" || status === "booting";

  const bootFromShelf = async (): Promise<void> => {
    const item = isoShelf.find(i => i.id === isoId);
    if (!item) { toast(pt ? "Selecione uma ISO da prateleira" : "Select an ISO from the shelf"); return; }
    try {
      const kernel = getIsoKernel(item.id);
      const bytes = getIsoBytes(item.id);
      if (kernel?.kernelBytes && bytes) {
        pushBuildLog(`[boot] kernel direto: ${item.name}`);
        await bootMachine({
          mode: "kernel",
          bzimage: kernel.kernelBytes,
          initrd: kernel.initrdBytes,
          cmdline: kernel.cmdline,
          memoryMB: parseInt(memoryMB, 10),
          label: item.name,
        }, { screenContainer: screenRef.current!, serialEl: serialRef.current });
      } else if (bytes) {
        pushBuildLog(`[boot] cdrom: ${item.name}`);
        await bootMachine({
          mode: "iso",
          isoBuffer: bytes.slice().buffer as ArrayBuffer,
          memoryMB: parseInt(memoryMB, 10),
          label: item.name,
        }, { screenContainer: screenRef.current!, serialEl: serialRef.current });
      }
    } catch (e) {
      toast(pt ? `Falha no boot: ${(e as Error).message}` : `Boot failed: ${(e as Error).message}`);
      setStatus("error");
    }
  };

  const bootPreset = async (): Promise<void> => {
    const presetUrls: Record<string, string> = {
      buildroot: "https://k.copy.sh/buildroot-bzimage-busybox.bin",
      "buildroot-alt": "https://copy.sh/v86/images/buildroot-bzimage.bin",
    };
    const custom = kernelPresets.find(p => p.id === presetId);
    const bzimage = custom?.bzimage ?? presetUrls[presetId] ?? presetUrls.buildroot;
    const cmdline = custom?.cmdline ?? "console=ttyS0 rw";
    try {
      await bootKernelFromUrl({
        bzimage,
        cmdline,
        memoryMB: parseInt(memoryMB, 10),
        label: presetId,
      }, { screenContainer: screenRef.current!, serialEl: serialRef.current }, m => {
        setMsg(m);
        pushBuildLog(`[boot] ${m}`);
      });
    } catch (e) {
      toast(pt ? `Falha: ${(e as Error).message}` : `Failed: ${(e as Error).message}`);
      pushBuildLog(`[boot] erro: ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* controles */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={isoId} onValueChange={setIsoId}>
          <SelectTrigger className="h-8 w-[180px] text-xs" aria-label={pt ? "ISO da prateleira" : "ISO from shelf"}>
            <SelectValue placeholder={pt ? "ISO da prateleira" : "Shelf ISO"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" disabled>{pt ? "ISO da prateleira…" : "Shelf ISO…"}</SelectItem>
            {isoShelf.map(i => (
              <SelectItem key={i.id} value={i.id}>{i.name} · {(i.size / 1024 / 1024).toFixed(1)}MB{i.bootable ? " ▶" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8" disabled={busy || isoId === "none"} onClick={() => void bootFromShelf()}>
          <Play className="h-3.5 w-3.5 mr-1" /> {pt ? "Boot ISO" : "Boot ISO"}
        </Button>

        <Select value={presetId} onValueChange={setPresetId}>
          <SelectTrigger className="h-8 w-[170px] text-xs" aria-label={pt ? "Kernel livre" : "Free kernel"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="buildroot">{pt ? "Buildroot Linux (livre)" : "Buildroot Linux (free)"}</SelectItem>
            <SelectItem value="buildroot-alt">{pt ? "Buildroot (espelho)" : "Buildroot (mirror)"}</SelectItem>
            {kernelPresets.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void bootPreset()}>
          <Play className="h-3.5 w-3.5 mr-1" /> {pt ? "Boot kernel" : "Boot kernel"}
        </Button>

        <Select value={memoryMB} onValueChange={setMemoryMB}>
          <SelectTrigger className="h-8 w-[92px] text-xs" aria-label={pt ? "Memória" : "Memory"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["64", "128", "256", "512"].map(m => <SelectItem key={m} value={m}>{m} MB</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-8" onClick={() => void resetMachine()} disabled={status !== "running"}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> {pt ? "Reiniciar" : "Reset"}
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-danger" onClick={() => void powerOff()} disabled={status === "idle"}>
          <Power className="h-3.5 w-3.5 mr-1" /> {pt ? "Desligar" : "Power off"}
        </Button>
        <span className="text-[11px] text-text2 flex items-center gap-1.5" role="status">
          <span className={`h-1.5 w-1.5 rounded-full ${status === "running" ? "bg-ok" : status === "error" ? "bg-danger" : status === "idle" ? "bg-muted-foreground" : "bg-accent gen-pulse"}`} />
          {msg || (status === "idle" ? (pt ? "emulador parado" : "emulator idle") : status)}
        </span>
      </div>

      {/* tela v86 (estrutura exigida: div texto + canvas) — altura mínima para parecer uma tela mesmo parada */}
      <div className="rounded-lg border border-border bg-black/85 overflow-hidden shrink-0">
        <div
          ref={screenRef}
          className="dsbox-screen flex justify-center items-start py-2 min-h-[170px] sm:min-h-[220px]"
          tabIndex={0}
          aria-label={pt ? "Tela do emulador x86" : "x86 emulator screen"}
        >
          <div style={{ whiteSpace: "pre", font: "14px var(--font-jbmono, monospace)", lineHeight: "14px", color: "#d8d2c8" }} />
          <canvas style={{ display: "none" }} />
        </div>
      </div>

      {/* teclado texto → convidado */}
      <div className="flex items-center gap-2">
        <Input
          value={keyText}
          onChange={e => setKeyText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && keyText.trim()) {
              sendKeyboardText(keyText);
              setKeyText("");
            }
          }}
          className="h-8 text-xs font-mono"
          placeholder={pt ? "comando para o convidado (Enter envia)…" : "guest command (Enter sends)…"}
          aria-label={pt ? "Enviar comando ao convidado" : "Send command to guest"}
        />
        <Button
          size="sm" variant="outline" className="h-8 shrink-0"
          onClick={() => { if (keyText.trim()) { sendKeyboardText(keyText); setKeyText(""); } }}
        >
          <Keyboard className="h-3.5 w-3.5 mr-1" /> {pt ? "Enviar" : "Send"}
        </Button>
      </div>

      {/* console serial */}
      <div className="flex-1 min-h-0 flex flex-col">
        <span className="text-[11px] text-text2 mb-1">{pt ? "Console serial (ttyS0) — cliquável para digitar direto" : "Serial console (ttyS0) — click and type directly"}</span>
        <textarea
          ref={serialRef}
          className="flex-1 min-h-[120px] w-full resize-none rounded-lg border border-border bg-black/85 text-[12px] leading-5 p-2 text-[#12A882] font-mono outline-none dsbox-serial"
          spellCheck={false}
          aria-label={pt ? "Console serial" : "Serial console"}
        />
      </div>

      <p className="text-[10.5px] text-muted-foreground leading-relaxed">
        {pt
          ? "v86 executa x86 real em WebAssembly (Pentium 4 ~ SSE3). Kernel/ISO são carregados de URLs ou da prateleira; sem rede no convidado por padrão. Se o CDN do v86 estiver inacessível, o Bash-86X (aba ao lado) continua funcionando offline."
          : "v86 runs real x86 in WebAssembly (Pentium 4 ~ SSE3). Kernels/ISOs load from URLs or the shelf; no guest network by default. If the v86 CDN is unreachable, the Bash-86X tab still works offline."}
      </p>
    </div>
  );
}
