// Vessie AI — voz (TTS + STT via Web Speech API) — B.3.5 (corrige D10)
// Vozes naturais: ranking de qualidade (Natural/Neural/Google/Premium) e idioma
// escolhido automaticamente conforme o texto. STT: detecção automática de idioma
// (PT/EN) — o ditado reinicia no idioma certo quando percebe troca.
//
// Fala NATURAL adaptativa: em vez de um vocabulário/ritmo padrão robótico, a fala
// é dividida em frases e cada frase ganha taxa/pausa/pitch próprios (pergunta sobe
// a entonação, exclamação acelera, vírgula respira) — menos robótica.
//
// Perfil de voz via .mp3/.wav: a IA analisa o áudio do dono (pitch médio via
// autocorrelação, ritmo por picos de energia, duração) e mapeia para a voz do
// sistema mais próxima — sotaque/variantes são representados pelos parâmetros.
let cachedVoices: SpeechSynthesisVoice[] = [];

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Ranking de qualidade: vozes "Natural/Neural/Premium/Enhanced/Google" primeiro. */
function voiceQuality(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let q = 0;
  if (n.includes("natural")) q += 8;
  if (n.includes("neural")) q += 8;
  if (n.includes("online")) q += 2;
  if (n.includes("premium") || n.includes("enhanced")) q += 6;
  if (n.includes("google")) q += 5;
  if (n.includes("microsoft")) q += 2;
  if (!v.localService) q += 1; // vozes de nuvem costumam ser mais naturais
  return q;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) cachedVoices = voices;
  return cachedVoices;
}

/** Detecta o idioma dominante do texto (pt / en / es) — para escolher a voz. */
export function detectTextLang(text: string): "pt-BR" | "en-US" | "es-ES" {
  if (/[ãáâàéêíóôõúçü]/i.test(text)) return "pt-BR";
  const words = text.toLowerCase().split(/\s+/);
  const pt = ["que", "não", "você", "uma", "para", "com", "isso", "como", "muito", "aqui", "também", "então", "sobre", "quando", "porque", "obrigado", "olá", "muito", "bem"];
  const es = ["que", "para", "como", "pero", "muy", "gracias", "hola", "bien", "también", "cuando", "porque", "esto", "aqui"];
  const en = ["the", "and", "you", "how", "what", "this", "that", "with", "have", "not", "are", "can", "please", "thanks", "hello", "about", "there"];
  let sp = 0, se = 0, sn = 0;
  for (const w of words) {
    if (pt.includes(w)) sp++;
    if (es.includes(w) && !pt.includes(w)) se++;
    if (en.includes(w)) sn++;
  }
  if (sn >= sp && sn >= se && sn > 0) return "en-US";
  if (se > sp && se > 0) return "es-ES";
  return "pt-BR";
}

function pickVoice(text: string, preferredName?: string): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (voices.length === 0) return null;
  if (preferredName) {
    const exact = voices.find(v => v.name === preferredName);
    if (exact) return exact;
  }
  const want = detectTextLang(text);
  const sameLang = voices.filter(v => v.lang.replace("_", "-") === want);
  const ptLike = voices.filter(v => v.lang?.startsWith(want.slice(0, 2)));
  const pool = sameLang.length ? sameLang : ptLike.length ? ptLike : voices;
  return [...pool].sort((a, b) => voiceQuality(b) - voiceQuality(a))[0] ?? null;
}

export function primeVoices(): void {
  if (!ttsSupported()) return;
  listVoices();
  window.speechSynthesis.onvoiceschanged = () => listVoices();
}

// ---------- perfil de voz (clone aproximado via amostra .mp3/.wav) ----------

export interface VoiceCloneProfile {
  /** pitch médio medido (Hz) */
  pitchHz: number;
  /** pitch mapeado para SpeechSynthesis (0.1–2) */
  pitch: number;
  /** ritmo estimado (sílabas/s) */
  rate: number;
  /** voz do sistema escolhida para representar o sotaque */
  voiceName?: string;
  /** registro de timbre estimado (para escolher voz F/M) */
  gender: "female" | "male" | "neutral";
  durationSec: number;
  created: number;
}

let cloneProfile: VoiceCloneProfile | null = null;

export function getVoiceClone(): VoiceCloneProfile | null { return cloneProfile; }
export function setVoiceClone(p: VoiceCloneProfile | null): void { cloneProfile = p; }

/**
 * Analisa uma amostra de voz (.mp3/.wav) e monta o perfil:
 * - pitch médio por autocorrelação (janelas de 40 ms no trecho com energia);
 * - ritmo por picos de energia (aprox. sílabas/segundo);
 * - timbre → voz F/M mais próxima + sotaque pela voz escolhida.
 */
export async function analyzeVoiceSample(file: File): Promise<VoiceCloneProfile> {
  const buf = await file.arrayBuffer();
  const AC: typeof AudioContext | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AC) throw new Error("WebAudio indisponível neste navegador");
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const data = audio.getChannelData(0);
    const sr = audio.sampleRate;
    const dur = audio.duration;

    // energia por quadro de 40 ms (para ritmo e seleção de trecho sonoro)
    const frame = Math.floor(sr * 0.04);
    const frames = Math.floor(data.length / frame);
    const energies: number[] = [];
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      const off = f * frame;
      for (let i = 0; i < frame; i += 2) { const v = data[off + i] ?? 0; sum += v * v; }
      energies.push(Math.sqrt(sum / (frame / 2)));
    }
    const maxE = Math.max(...energies, 1e-9);
    // picos = sílabas aproximadas
    let peaks = 0;
    for (let f = 1; f < energies.length - 1; f++) {
      if (energies[f] > maxE * 0.2 && energies[f] >= energies[f - 1] && energies[f] > energies[f + 1]) peaks++;
    }
    const rate = Math.min(1.6, Math.max(0.7, 0.85 + (peaks / Math.max(1, dur)) * 0.11));

    // pitch por autocorrelação nos quadros mais energéticos (80–350 Hz)
    const pitches: number[] = [];
    const win = Math.floor(sr * 0.04);
    for (let f = 0; f < frames; f += 2) {
      if (energies[f] < maxE * 0.35) continue;
      const off = f * frame;
      let bestLag = -1, bestCorr = 0;
      for (let lag = Math.floor(sr / 350); lag <= Math.floor(sr / 80); lag++) {
        let corr = 0;
        for (let i = 0; i < win - lag; i += 2) corr += (data[off + i] ?? 0) * (data[off + i + lag] ?? 0);
        corr /= win;
        if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
      }
      if (bestLag > 0) pitches.push(sr / bestLag);
    }
    pitches.sort((a, b) => a - b);
    const pitchHz = pitches.length ? pitches[Math.floor(pitches.length * 0.5)] : 0;

    // mapeamento: homem ~85–180 Hz, mulher ~160–300 Hz
    const gender: VoiceCloneProfile["gender"] =
      pitchHz === 0 ? "neutral" : pitchHz < 155 ? "male" : pitchHz < 185 ? "neutral" : "female";
    // SpeechSynthesis pitch 0.5–1.5 mantém naturalidade (1 = voz padrão)
    const pitch = pitchHz === 0 ? 1 : Math.min(1.45, Math.max(0.55, 0.55 + (pitchHz - 90) / 300));

    // escolhe a voz do sistema mais próxima (gênero + idioma pt/en)
    const voices = listVoices();
    const want = gender === "female" ? ["female", "maria", "ana", "francisca", "joana", "luciana", "female"] : ["male", "ricardo", "daniel", "jorge", "male"];
    const scored = voices
      .map(v => {
        const n = v.name.toLowerCase();
        let s = voiceQuality(v);
        if (want.some(w => n.includes(w))) s += 6;
        if (gender === "neutral" && !/female|male|maria|ricardo/.test(n)) s += 2;
        return { v, s };
      })
      .sort((a, b) => b.s - a.s);
    const voiceName = scored[0]?.v?.name;

    const profile: VoiceCloneProfile = {
      pitchHz: Math.round(pitchHz),
      pitch: +pitch.toFixed(2),
      rate: +rate.toFixed(2),
      voiceName,
      gender,
      durationSec: +dur.toFixed(1),
      created: Date.now(),
    };
    cloneProfile = profile;
    return profile;
  } finally {
    void ctx.close();
  }
}

/** Descrição textual do perfil (para o chat/toast). */
export function describeClone(p: VoiceCloneProfile): string {
  return [
    `🎙 Perfil de voz criado da amostra (${p.durationSec}s):`,
    `• pitch médio ${p.pitchHz} Hz (${p.gender === "female" ? "voz feminina" : p.gender === "male" ? "voz masculina" : "neutro"}) → fator ${p.pitch}`,
    `• ritmo estimado → velocidade ${p.rate}×`,
    `• voz do sistema escolhida: ${p.voiceName ?? "automática"}`,
    "A fala agora usa esse sotaque/ritmo automaticamente.",
  ].join("\n");
}

// ---------- fala ----------

export interface SpeakOpts {
  rate?: number;
  pitch?: number;
  voiceName?: string;
  onEnd?: () => void;
  onBoundary?: () => void;
}

/** Fala simples (uma utterance) — usada internamente e por quem quer o modo direto. */
export function speak(text: string, opts: SpeakOpts = {}): boolean {
  if (!ttsSupported()) return false;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text.slice(0, 4000));
  const voice = pickVoice(text, opts.voiceName ?? cloneProfile?.voiceName);
  if (voice) utter.voice = voice;
  utter.lang = voice?.lang ?? detectTextLang(text);
  utter.rate = opts.rate ?? cloneProfile?.rate ?? 1;
  utter.pitch = opts.pitch ?? cloneProfile?.pitch ?? 1;
  if (opts.onEnd) utter.onend = opts.onEnd;
  if (opts.onBoundary) utter.onboundary = opts.onBoundary;
  window.speechSynthesis.speak(utter);
  return true;
}

/** Divide em frases com pontuação preservada (para fala natural). */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}

/**
 * Fala NATURAL adaptativa: cada frase ganha prosódia própria.
 * - pergunta  → pitch sobe no fim (entonação interrogativa);
 * - exclamação → rate +8%, pitch +5%;
 * - vírgulas/pausas → micro-silêncio entre utterances;
 * - variação aleatória ±4% evita metrônomo (menos robótica).
 */
export function speakNatural(text: string, opts: SpeakOpts = {}): boolean {
  if (!ttsSupported()) return false;
  window.speechSynthesis.cancel();
  const parts = sentences(text.replace(/```[\s\S]*?```/g, " (código) "));
  if (parts.length === 0) return false;
  const voice = pickVoice(text, opts.voiceName ?? cloneProfile?.voiceName);
  const baseRate = opts.rate ?? cloneProfile?.rate ?? 1;
  const basePitch = opts.pitch ?? cloneProfile?.pitch ?? 1;
  const jitter = () => 1 + (Math.random() * 0.08 - 0.04);

  const speakAt = (i: number): void => {
    if (i >= parts.length) { opts.onEnd?.(); return; }
    const s = parts[i];
    const u = new SpeechSynthesisUtterance(s);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? detectTextLang(text);
    let rate = baseRate * jitter();
    let pitch = basePitch * jitter();
    if (/[?¿]/.test(s)) pitch *= 1.09;
    if (/[!]/.test(s)) { rate *= 1.08; pitch *= 1.05; }
    if (/[…]$/.test(s)) rate *= 0.92;
    u.rate = +Math.min(2, Math.max(0.5, rate)).toFixed(2);
    u.pitch = +Math.min(2, Math.max(0.3, pitch)).toFixed(2);
    if (opts.onBoundary) u.onboundary = opts.onBoundary;
    if (i === parts.length - 1 && opts.onEnd) {
      u.onend = opts.onEnd;
    } else {
      // pausa respiratória entre frases
      u.onend = () => { setTimeout(() => speakAt(i + 1), /[,.]/.test(s) ? 140 : 60); };
    }
    window.speechSynthesis.speak(u);
  };
  speakAt(0);
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

/** Heurística de idioma para resultados do reconhecedor (PT vs EN). */
function guessSpokenLang(text: string): "pt-BR" | "en-US" {
  if (/[ãõáâàéêíóôúç]/i.test(text)) return "pt-BR";
  const t = ` ${text.toLowerCase()} `;
  const ptHits = [" que ", " não ", " você ", " uma ", " para ", " como ", " isso ", " muito ", " aqui ", " estou ", " está ", " mesmo ", " porque ", " também ", " quero ", " fazer ", " bom ", " dia ", " obrigado ", " então "].filter(k => t.includes(k)).length;
  const enHits = [" the ", " and ", " you ", " how ", " what ", " this ", " that ", " with ", " have ", " not ", " are ", " can ", " please ", " about ", " there ", " i'm ", " want "].filter(k => t.includes(k)).length;
  if (enHits > ptHits && enHits >= 2) return "en-US";
  if (ptHits >= 2) return "pt-BR";
  return ptHits >= enHits ? "pt-BR" : "en-US";
}

/**
 * Ditado com detecção automática de idioma (mode "auto"): começa em pt-BR,
 * avalia os parciais e REINICIA no idioma detectado quando há confiança —
 * corrige o bug "falo português e sai inglês".
 */
export function startDictation(
  mode: "auto" | "en" | "pt-BR",
  onText: (text: string, isFinal: boolean, detected?: "pt-BR" | "en-US") => void,
  onEnd?: () => void
): SttHandle | null {
  const SR = getSR();
  if (!SR) return null;

  let currentLang: string = mode === "en" ? "en-US" : "pt-BR";
  let settled = mode !== "auto";
  let accumulated = "";
  let stopped = false;
  let rec: SpeechRecognitionLike | null = null;

  const spawn = (): void => {
    const r = new SR();
    rec = r;
    r.lang = currentLang;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = ev => {
      let interim = "";
      let final = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const tr = res[0]?.transcript ?? "";
        if (res.isFinal) final += tr; else interim += tr;
      }
      const sample = (interim || final).trim();
      if (final) accumulated = `${accumulated} ${final}`.trim();
      onText(accumulated || interim, accumulated.length > 0);
      // detecção automática: com ~2 palavras já tentamos classificar
      if (!settled && sample.split(/\s+/).length >= 2) {
        const guess = guessSpokenLang(sample);
        if (guess !== currentLang) {
          // reinicia no idioma certo, preservando o texto já ditado
          currentLang = guess;
          settled = true;
          try { r.onend = null; r.abort(); } catch { /* noop */ }
          spawn();
          return;
        }
        settled = true;
      }
    };
    r.onend = () => { if (!stopped) onEnd?.(); };
    r.onerror = () => { if (!stopped) onEnd?.(); };
    try { r.start(); } catch { /* já rodando */ }
  };

  spawn();
  return {
    stop: () => {
      stopped = true;
      try { rec?.stop(); } catch { /* já parado */ }
    },
  };
}
