"use client";
// Vessie AI — barra de input com enviar/parar, dita por voz (STT com detecção
// automática de idioma) e auto-resize.
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessage, cancelGeneration } from "@/lib/chat-flow";
import { useSettings, useUi, useStream } from "@/lib/store";
import { startDictation, stopSpeaking, primeVoices } from "@/lib/voice";
import { t } from "@/lib/i18n";
import { ArrowUp, Square, Mic, MicOff } from "lucide-react";
import type { Lang } from "@/lib/types";
import { toast } from "sonner";

export function InputBar({ lang: lg }: { lang: Lang }) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [detected, setDetected] = useState<"pt-BR" | "en-US" | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sttRef = useRef<{ stop: () => void } | null>(null);
  const live = useStream(s => s.live);
  const settings = useSettings(s => s.settings);
  const setHelpOpen = useUi(s => s.setHelpOpen);

  useEffect(() => {
    primeVoices();
  }, []);

  const autoResize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  };

  const submit = () => {
    if (live) { cancelGeneration(); return; }
    const text = value.trim();
    if (!text) return;
    setValue("");
    requestAnimationFrame(autoResize);
    stopSpeaking();
    void sendMessage(text);
  };

  const toggleMic = () => {
    if (listening) {
      sttRef.current?.stop();
      sttRef.current = null;
      setListening(false);
      setDetected(null);
      return;
    }
    const handle = startDictation(
      settings.dictation,
      (text, isFinal, det) => {
        setDetected(det ?? null);
        setValue(prev => (isFinal ? text : (prev ? `${prev} ${text}` : text)));
        requestAnimationFrame(autoResize);
      },
      () => { setListening(false); sttRef.current = null; }
    );
    if (!handle) { toast(t(lg, "micFail")); return; }
    sttRef.current = handle;
    setListening(true);
  };

  return (
    <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-3 pb-3 px-4">
      <div className="mx-auto max-w-[800px]">
        <div
          className={`glass rounded-[26px] flex items-end gap-2 p-2 shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all ${listening ? "ring-2 ring-accent" : "focus-within:ring-2 focus-within:ring-accent/40"}`}
        >
          <Button
            variant="ghost"
            size="sm"
            className={`h-10 w-10 p-0 rounded-[99px] shrink-0 ${listening ? "text-accent bg-hover" : ""}`}
            onClick={toggleMic}
            aria-label={listening ? "Parar ditado" : "Ditar mensagem"}
            title={listening ? "Parar ditado" : "Ditar mensagem"}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Textarea
            ref={taRef}
            value={value}
            onChange={e => { setValue(e.target.value); autoResize(); }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={listening
              ? (detected === "en-US" ? "🎙️ listening (EN)…" : "🎙️ ouvindo…")
              : t(lg, "inputPlaceholder")}
            aria-label="Digite sua mensagem"
            className="flex-1 max-h-[200px] min-h-10 border-0 bg-transparent focus-visible:ring-0 resize-none py-2 text-[14.5px]"
            rows={1}
          />
          <Button
            className={`h-10 w-10 p-0 rounded-[99px] shrink-0 transition-transform hover:scale-105 ${live ? "bg-danger text-white hover:bg-danger" : "bg-accent text-white hover:opacity-90"}`}
            onClick={submit}
            aria-label={live ? t(lg, "stop") : t(lg, "send")}
            title={live ? t(lg, "stop") : t(lg, "send")}
          >
            {live ? <Square className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10.5px] text-muted-foreground text-center mt-1.5 leading-snug px-2">
          <span className="hidden sm:inline">
            <b>Vessie AI</b> — <b>/agent</b> cria sub-agentes · <b>/discord</b> controla o Discord · <b>DS-BOX</b> compila e boota ISOs · tudo roda no navegador.
          </span>
          <button className="text-accent-2 hover:underline ml-1" onClick={() => setHelpOpen(true)}>
            {lg === "pt-BR" ? "Comandos" : "Commands"}
          </button>
        </p>
      </div>
    </div>
  );
}
