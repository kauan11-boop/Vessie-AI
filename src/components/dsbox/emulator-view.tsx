"use client";
// DS-BOX · Emulador — v86 (x86 em WebAssembly) com tela + console serial.
// Estrutura exigida pelo v86: container com <div> (texto) + <canvas> (gráfico).
// REGRAS DESTE MÓDULO: a execução de sistema operacional é SEMPRE a partir de um
// arquivo .iso da prateleira (kernel extraído de dentro dele pelo iso-reader);
// o botão Fábrica compila a ISO de fábrica com o kernel selecionado e boota.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Play, Power, RotateCcw, Keyboard, Wrench, Factory } from "lucide-react";
import { useDsbox } from "@/lib/dsbox/store";
import {
  powerOff, resetMachine, sendKeyboardText,
  onEmulatorChange, getEmulatorStatus, serialLines, type EmulatorStatus,
} from "@/lib/dsbox/emulator";
import { registerEmulatorUi, bootIsoFromShelf } from "@/lib/dsbox/tools";
import { buildFactoryIso } from "@/lib/dsbox/factory-iso";
import { terminalLines, onTerminalChange, problemMessage } from "@/lib/dsbox/terminal";
import { sendMessage } from "@/lib/chat-flow";
import { toast } from "sonner";

function useTerminal(): string[] {
  return useSyncExternalStore(onTerminalChange, terminalLines, () => [] as string[]);
}

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
  const [factoryBusy, setFactoryBusy] = useState(false);
  const isoShelf = useDsbox(s => s.isoShelf);
  const kernelPresets = useDsbox(s => s.kernelPresets);
  const pushBuildLog = useDsbox(s => s.pushBuildLog);
  const term = useTerminal();
  const termEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => onEmulatorChange((st, m) => { setStatus(st); setMsg(m); }), []);
  useEffect(() => {
    termEndRef.current?.scrollIntoView({ block: "end" });
  }, [term.length]);

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
      pushBuildLog(`[boot] por arquivo .iso: ${item.name}`);
      await bootIsoFromShelf(item.id); // valida CD001 + extrai boot/bzimage DO arquivo
    } catch (e) {
      toast(pt ? `Falha no boot: ${(e as Error).message}` : `Boot failed: ${(e as Error).message}`);
      setStatus("error");
    }
  };

  /** Fábrica: compila a ISO de fábrica (projeto OS compilável + kernel selecionado),
   *  salva na prateleira, entrega o .iso e boota a partir do ARQUIVO. */
  const bootFactory = async (): Promise<void> => {
    setFactoryBusy(true);
    try {
      const r = await buildFactoryIso({ kernel: presetId });
      toast(pt
        ? `🏭 ${r.name}.iso compilada, salva e entregue`
        : `🏭 ${r.name}.iso built, saved and delivered`);
      await bootIsoFromShelf(r.name);
    } catch (e) {
      toast(pt ? `Falha: ${(e as Error).message}` : `Failed: ${(e as Error).message}`);
      pushBuildLog(`[factory] erro: ${(e as Error).message}`);
    } finally {
      setFactoryBusy(false);
    }
  };

  /** Botão PROBLEMA: captura terminal + serial + build log e envia à IA para corrigir. */
  const reportProblem = (): void => {
    void sendMessage(problemMessage("manual"));
    toast(pt ? "🛠 Enviando problema à IA — ela lê os comandos e corrige" : "🛠 Sending problem to AI — it reads the commands and fixes");
  };

  // últimas linhas da serial do convidado (espelho em formato terminal)
  const serialTail = serialLines().slice(-8).join("\n");

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* controles — boot */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={isoId} onValueChange={setIsoId}>
          <SelectTrigger className="h-8 w-[150px] sm:w-[180px] text-xs" aria-label={pt ? "ISO da prateleira" : "ISO from shelf"}>
            <SelectValue placeholder={pt ? "ISO da prateleira…" : "Shelf ISO…"} />
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

        {/* kernel selecionado = o que será EMBUTIDO na ISO de fábrica */}
        <Select value={presetId} onValueChange={setPresetId}>
          <SelectTrigger className="h-8 w-[150px] sm:w-[170px] text-xs" aria-label={pt ? "Kernel da fábrica" : "Factory kernel"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="buildroot">{pt ? "Buildroot Linux (livre)" : "Buildroot Linux (free)"}</SelectItem>
            <SelectItem value="buildroot-alt">{pt ? "Buildroot (espelho)" : "Buildroot (mirror)"}</SelectItem>
            {kernelPresets.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8" disabled={busy || factoryBusy} onClick={() => void bootFactory()} title={pt ? "Compila a ISO de fábrica, salva, entrega o .iso e boota a partir do ARQUIVO" : "Builds the factory ISO, saves it, delivers the .iso and boots from the FILE"}>
          <Factory className={`h-3.5 w-3.5 mr-1 ${factoryBusy ? "gen-pulse" : ""}`} /> {pt ? "Fábrica" : "Factory"}
        </Button>

        <Select value={memoryMB} onValueChange={setMemoryMB}>
          <SelectTrigger className="h-8 w-[86px] text-xs" aria-label={pt ? "Memória" : "Memory"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["64", "128", "256", "512"].map(m => <SelectItem key={m} value={m}>{m} MB</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* controles — energia + problema */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8" onClick={() => void resetMachine()} disabled={status !== "running"}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> {pt ? "Reiniciar" : "Reset"}
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-danger" onClick={() => void powerOff()} disabled={status === "idle"}>
          <Power className="h-3.5 w-3.5 mr-1" /> {pt ? "Desligar" : "Off"}
        </Button>
        <Button
          size="sm"
          className="h-8 bg-accent text-white hover:opacity-90 ml-auto"
          onClick={reportProblem}
          title={pt ? "Envia o terminal (comandos + saída) para a IA corrigir automaticamente" : "Sends the terminal (commands + output) for the AI to auto-fix"}
          aria-label={pt ? "Reportar problema à IA" : "Report problem to AI"}
        >
          <Wrench className="h-3.5 w-3.5 mr-1" /> Problema
        </Button>
        <span className="text-[11px] text-text2 flex items-center gap-1.5 w-full sm:w-auto" role="status">
          <span className={`h-1.5 w-1.5 rounded-full ${status === "running" ? "bg-ok" : status === "error" ? "bg-danger" : status === "idle" ? "bg-muted-foreground" : "bg-accent gen-pulse"}`} />
          <span className="truncate">{msg || (status === "idle" ? (pt ? "emulador parado" : "emulator idle") : status)}</span>
        </span>
      </div>

      {/* tela v86 (estrutura exigida: div texto + canvas) */}
      <div className="rounded-lg border border-border bg-black/85 overflow-hidden shrink-0">
        <div
          ref={screenRef}
          className="dsbox-screen flex justify-center items-start py-2 min-h-[150px] sm:min-h-[220px]"
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
          placeholder={pt ? "comando para o SO emulado (Enter envia)…" : "guest command (Enter sends)…"}
          aria-label={pt ? "Enviar comando ao convidado" : "Send command to guest"}
        />
        <Button
          size="sm" variant="outline" className="h-8 shrink-0"
          onClick={() => { if (keyText.trim()) { sendKeyboardText(keyText); setKeyText(""); } }}
        >
          <Keyboard className="h-3.5 w-3.5 mr-1" /> {pt ? "Enviar" : "Send"}
        </Button>
      </div>

      {/* terminal unificado (formato terminal): relatórios de ISO, comandos da IA, espelho serial */}
      <div className="flex-1 min-h-[130px] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-text2">
            {pt ? "Terminal (relatório da ISO + comandos)" : "Terminal (ISO report + commands)"}
          </span>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            {pt ? "serial ↓" : "serial ↓"}
          </span>
        </div>
        <div
          className="flex-1 min-h-[110px] max-h-[220px] overflow-y-auto rounded-lg border border-border bg-black/85 p-2 font-mono text-[11.5px] leading-5 text-[#c8e6d8] whitespace-pre-wrap dsbox-term"
          aria-live="polite"
          aria-label={pt ? "Terminal DS-BOX" : "DS-BOX terminal"}
        >
          {term.length === 0 ? (
            <span className="text-muted-foreground">
              {pt ? "— terminal vazio: compile uma ISO no chat (ds:iso) e o relatório aparece aqui —" : "— empty terminal: build an ISO in chat (ds:iso) and the report shows here —"}
            </span>
          ) : (
            <>
              {term.slice(-60).map((l, i) => (
                <div key={i}>{l || "\u00A0"}</div>
              ))}
              <div ref={termEndRef} />
            </>
          )}
        </div>
        {serialTail && (
          <pre className="mt-1.5 max-h-[64px] overflow-hidden rounded border border-border/60 bg-black/70 px-2 py-1 font-mono text-[10.5px] leading-4 text-[#12A882] whitespace-pre-wrap" aria-hidden>
            {serialTail}
          </pre>
        )}
      </div>

      <p className="text-[10.5px] text-muted-foreground leading-relaxed">
        {pt
          ? "2 variantes de uso: ESTA aba é a sua (tela + serial clicável); a variante da Vessie-AI opera por ds:term/ds:send e o resultado entra no terminal acima. Problema → botão 🛠 (ou automático em erro)."
          : "2 usage variants: THIS tab is yours (screen + clickable serial); the Vessie-AI variant operates via ds:term/ds:send and its output lands in the terminal above. Problem → 🛠 button (or automatic on error)."}
      </p>
    </div>
  );
}
