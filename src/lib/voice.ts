// Vessie AI — voz (TTS + STT via Web Speech API) — B.3.5 (corrige D10)
let cachedVoice: SpeechSynthesisVoice | null = null;

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Voz pt-BR preferida: lang pt-BR → pt-* → nome contém portuguese/brasil → primeira. */
function findPortugueseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return (
    voices.find(v => v.lang === "pt-BR") ??
    voices.find(v => v.lang?.startsWith("pt")) ??
    voices.find(v => /portuguese|brasil/i.test(v.name)) ??
    voices[0]
  );
}

export function primeVoices(): void {
  if (!ttsSupported()) return;
  cachedVoice = findPortugueseVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = findPortugueseVoice();
  };
}

export interface SpeakOpts {
  rate?: number;
  pitch?: number;
  onEnd?: () => void;
  onBoundary?: () => void;
}

export function speak(text: string, opts: SpeakOpts = {}): boolean {
  if (!ttsSupported()) return false;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text.slice(0, 4000));
  const voice = cachedVoice ?? findPortugueseVoice();
  if (voice) utter.voice = voice;
  utter.lang = voice?.lang ?? "pt-BR";
  utter.rate = opts.rate ?? 1;
  utter.pitch = opts.pitch ?? 1;
  if (opts.onEnd) utter.onend = opts.onEnd;
  if (opts.onBoundary) utter.onboundary = opts.onBoundary;
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

// ---------- STT ----------
type SRType = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getSR(): SRType | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, SRType | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttSupported(): boolean {
  return getSR() !== null;
}

export interface SttHandle {
  stop: () => void;
}

export function startDictation(
  lang: "en" | "pt-BR",
  onText: (text: string, isFinal: boolean) => void,
  onEnd?: () => void
): SttHandle | null {
  const SR = getSR();
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang === "pt-BR" ? "pt-BR" : "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = ev => {
    let interim = "";
    let final = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      const t = res[0]?.transcript ?? "";
      if (res.isFinal) final += t; else interim += t;
    }
    if (final) onText(final, true);
    else if (interim) onText(interim, false);
  };
  rec.onend = () => onEnd?.();
  rec.onerror = () => onEnd?.();
  rec.start();
  return {
    stop: () => {
      try { rec.stop(); } catch { /* já parado */ }
    },
  };
}
