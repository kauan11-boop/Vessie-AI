"use client";
// Vessie AI — modal de configurações (multi-provider, voz natural, ditado automático,
// Discord, imagem, DS-BOX — B.3.8/B.4). Sem instruções de "como usar LM Studio"
// (o propósito do projeto é conectar servidores locais — o dono sabe).
import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings, useUi, DEFAULT_SYSTEM_PROMPT } from "@/lib/store";
import { useDsbox } from "@/lib/dsbox/store";
import { usePromptMode } from "@/lib/prompt-mode";
import type { KernelPreset } from "@/lib/dsbox/iso";
import { useConn } from "@/lib/connection";
import { PROVIDERS } from "@/lib/providers";
import { IMAGE_SIZES, IMAGE_MODELS } from "@/lib/image";
import { ttsSupported, listVoices, analyzeVoiceSample, describeClone, setVoiceClone } from "@/lib/voice";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import type { Settings, ProviderId, Lang } from "@/lib/types";

export function SettingsModal({ lang: lg }: { lang: Lang }) {
  const open = useUi(s => s.settingsOpen);
  const setOpen = useUi(s => s.setSettingsOpen);
  const setConnection = useUi(s => s.setConnection);
  const { settings, setSettings } = useSettings();
  const check = useConn(s => s.check);
  const refresh = useConn(s => s.refresh);
  const [draft, setDraft] = useState<Settings>(settings);
  const autoLoop = useDsbox(s => s.autoLoop);
  const setAutoLoop = useDsbox(s => s.setAutoLoop);
  const mode = usePromptMode(s => s.mode);
  const setMode = usePromptMode(s => s.setMode);
  const kernelPresets = useDsbox(s => s.kernelPresets);
  const setKernelPresets = useDsbox(s => s.setKernelPresets);
  const [presetsJson, setPresetsJson] = useState<string>(() => JSON.stringify(kernelPresets));
  // Radix Dialog desmonta o conteúdo ao fechar: useState(settings) reinicia a cada abertura.
  // Vozes carregadas no primeiro render do conteúdo (fora do effect — evita cascata).
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  if (open && !voicesLoaded && ttsSupported()) {
    setVoices(listVoices());
    setVoicesLoaded(true);
  }

  const save = async (reconnect: boolean) => {
    setSettings(draft);
    // aplica o perfil de voz derivado da amostra (mp3/wav) ao motor de fala
    try { setVoiceClone(draft.voice.clone ?? null); } catch { /* noop */ }
    // presets de kernel do DS-BOX (JSON válido é salvo; inválido é ignorado com aviso)
    try {
      const parsed = JSON.parse(presetsJson) as KernelPreset[];
      if (Array.isArray(parsed)) {
        setKernelPresets(parsed.filter(p => p && typeof p.id === "string" && typeof p.bzimage === "string"));
      }
    } catch {
      toast(lg === "pt-BR" ? "JSON de presets de kernel inválido — mantido o anterior" : "Invalid kernel presets JSON — previous kept");
    }
    if (reconnect) {
      toast(t(draft.language, "savedSettings"));
      setConnection("connecting");
      const ok = await check(true);
      if (ok) void refresh();
    } else {
      toast(t(draft.language, "savedSettings"));
    }
    setOpen(false);
  };

  const preset = PROVIDERS.find(p => p.id === draft.provider) ?? PROVIDERS[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[640px] max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
        <DialogHeader>
          <DialogTitle>{t(lg, "settingsTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">{t(lg, "settingsNote")}</p>

        <Tabs defaultValue="api" className="mt-1">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="api">{t(lg, "tabApi")}</TabsTrigger>
            <TabsTrigger value="general">{t(lg, "tabGeneral")}</TabsTrigger>
            <TabsTrigger value="image">{t(lg, "tabImage")}</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="discord">Discord</TabsTrigger>
            <TabsTrigger value="dsbox">DS-BOX</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">{t(lg, "provider")}</Label>
              <Select
                value={draft.provider}
                onValueChange={(v: ProviderId) => {
                  const p = PROVIDERS.find(x => x.id === v)!;
                  setDraft(d => ({ ...d, provider: v, baseUrl: p.baseUrl }));
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">{preset.note}</p>
            </div>
            <div>
              <Label className="text-xs" htmlFor="sBaseUrl">{t(lg, "baseUrl")}</Label>
              <Input id="sBaseUrl" value={draft.baseUrl} onChange={e => setDraft(d => ({ ...d, baseUrl: e.target.value }))} className="mt-1 font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground mt-1">
                {lg === "pt-BR" ? "Endpoint compatível OpenAI (termina em /v1)." : "OpenAI-compatible endpoint (ends with /v1)."}
              </p>
            </div>
            <div>
              <Label className="text-xs" htmlFor="sApiKey">{t(lg, "apiKey")}</Label>
              <Input id="sApiKey" type="password" value={draft.apiKey} onChange={e => setDraft(d => ({ ...d, apiKey: e.target.value }))} placeholder={preset.keyPlaceholder} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs" htmlFor="sTemp">{t(lg, "temperature")}</Label>
                <Input id="sTemp" type="number" step="0.1" min="0" max="2" value={draft.temperature} onChange={e => setDraft(d => ({ ...d, temperature: parseFloat(e.target.value) || 0.7 }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs" htmlFor="sTopP">{t(lg, "topP")}</Label>
                <Input id="sTopP" type="number" step="0.05" min="0" max="1" value={draft.topP} onChange={e => setDraft(d => ({ ...d, topP: parseFloat(e.target.value) || 1 }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs" htmlFor="sMaxTok">{t(lg, "maxTokens")}</Label>
                <Input id="sMaxTok" type="number" min="1" value={draft.maxTokens ?? ""} onChange={e => setDraft(d => ({ ...d, maxTokens: e.target.value ? parseInt(e.target.value, 10) : null }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs" htmlFor="sTimeout">{t(lg, "timeout")}</Label>
                <Input id="sTimeout" type="number" min="10" value={draft.timeout} onChange={e => setDraft(d => ({ ...d, timeout: parseInt(e.target.value, 10) || 120 }))} className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sStream" checked={draft.stream} onCheckedChange={v => setDraft(d => ({ ...d, stream: v }))} />
              <Label htmlFor="sStream" className="text-xs">{t(lg, "streaming")}</Label>
            </div>
          </TabsContent>

          <TabsContent value="general" className="space-y-3 mt-2">
            <div>
              <Label className="text-xs" htmlFor="sPrompt">{t(lg, "systemPromptLabel")}</Label>
              <Textarea id="sPrompt" value={draft.systemPrompt} onChange={e => setDraft(d => ({ ...d, systemPrompt: e.target.value }))} className="mt-1 min-h-40 font-mono text-xs" />
              <Button variant="ghost" size="sm" className="h-6 text-[11px] mt-1 px-2" onClick={() => setDraft(d => ({ ...d, systemPrompt: DEFAULT_SYSTEM_PROMPT }))}>
                restaurar prompt padrão
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sAuto" checked={draft.autoConnect} onCheckedChange={v => setDraft(d => ({ ...d, autoConnect: v }))} />
              <Label htmlFor="sAuto" className="text-xs">{t(lg, "autoConnect")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sSpell" checked={draft.spellcheck} onCheckedChange={v => setDraft(d => ({ ...d, spellcheck: v }))} />
              <Label htmlFor="sSpell" className="text-xs">{t(lg, "spellcheck")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sShort" checked={draft.shortReplies} onCheckedChange={v => setDraft(d => ({ ...d, shortReplies: v }))} />
              <Label htmlFor="sShort" className="text-xs">
                {lg === "pt-BR" ? "Respostas curtas humanas (≤ 20 letras) + silêncio durante ferramentas" : "Short human replies (≤ 20 letters) + silence during tools"}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sPersona" checked={draft.personaMemory} onCheckedChange={v => setDraft(d => ({ ...d, personaMemory: v }))} />
              <Label htmlFor="sPersona" className="text-xs">
                {lg === "pt-BR" ? "Memória adaptativa ligada ao system prompt (fica natural e humano)" : "Adaptive memory wired into the system prompt (natural, human)"}
              </Label>
            </div>
            <div>
              <Label className="text-xs" htmlFor="sDict">{lg === "pt-BR" ? "Idioma do microfone (ditado)" : "Microphone language (dictation)"}</Label>
              <Select value={draft.dictation} onValueChange={(v: "auto" | "en" | "pt-BR") => setDraft(d => ({ ...d, dictation: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{lg === "pt-BR" ? "Automático (detecta o idioma)" : "Auto (detects the language)"}</SelectItem>
                  <SelectItem value="pt-BR">Português (BR)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {lg === "pt-BR" ? "No modo automático o ditado reinicia no idioma detectado — fala em português sai em português." : "In auto mode dictation restarts in the detected language."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t(lg, "theme")}</Label>
                <Select value={draft.theme} onValueChange={(v: "dark" | "light") => setDraft(d => ({ ...d, theme: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Dark terracota</SelectItem>
                    <SelectItem value="light">Light creme</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t(lg, "language")}</Label>
                <Select value={draft.language} onValueChange={(v: Lang) => setDraft(d => ({ ...d, language: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="pt-BR">Português (BR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="image" className="space-y-3 mt-2">
            <p className="text-[11px] text-muted-foreground">
              {lg === "pt-BR"
                ? "Imagens agora aparecem DENTRO do chat (ds:image / blocos image:) — não há mais aba de imagem. Aqui você escolhe tamanho/modelo da API."
                : "Images now appear INSIDE the chat (ds:image / image: blocks) — no separate tab. Choose the API size/model here."}
            </p>
            <div>
              <Label className="text-xs">{t(lg, "imgSize")}</Label>
              <Select value={draft.image.size} onValueChange={(v: string) => setDraft(d => ({ ...d, image: { ...d.image, size: v } }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMAGE_SIZES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t(lg, "imgModel")}</Label>
              <Select value={draft.image.model} onValueChange={(v: string) => setDraft(d => ({ ...d, image: { ...d.image, model: v } }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">API Pollinations — gratuita, sem chave.</p>
          </TabsContent>

          <TabsContent value="voice" className="space-y-3 mt-2">
            <div className="flex items-center gap-2">
              <Switch id="sVoice" checked={draft.voice.enabled} onCheckedChange={v => setDraft(d => ({ ...d, voice: { ...d.voice, enabled: v } }))} />
              <Label htmlFor="sVoice" className="text-xs">{t(lg, "voiceTts")}</Label>
            </div>
            <div>
              <Label className="text-xs" htmlFor="sVoiceSel">{lg === "pt-BR" ? "Voz (naturais primeiro)" : "Voice (naturals first)"}</Label>
              <Select
                value={draft.voice.name ?? "auto"}
                onValueChange={(v: string) => setDraft(d => ({ ...d, voice: { ...d.voice, name: v === "auto" ? undefined : v } }))}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder={lg === "pt-BR" ? "Automática (mais natural por idioma)" : "Auto (most natural per language)"} /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="auto">{lg === "pt-BR" ? "Automática (mais natural por idioma)" : "Auto (most natural per language)"}</SelectItem>
                  {voices.map(v => <SelectItem key={v.name} value={v.name}>{v.name} ({v.lang})</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {lg === "pt-BR"
                  ? "O idioma da fala é detectado do texto de cada resposta (pt/en/es). Voces Natural/Neural/Google têm prioridade."
                  : "Speech language is detected from each reply's text (pt/en/es). Natural/Neural/Google voices rank first."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs" htmlFor="sRate">{t(lg, "ttsRate")}</Label>
                <Input id="sRate" type="number" step="0.1" min="0.5" max="2" value={draft.voice.rate} onChange={e => setDraft(d => ({ ...d, voice: { ...d.voice, rate: parseFloat(e.target.value) || 1 } }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs" htmlFor="sPitch">{t(lg, "ttsPitch")}</Label>
                <Input id="sPitch" type="number" step="0.1" min="0.5" max="2" value={draft.voice.pitch} onChange={e => setDraft(d => ({ ...d, voice: { ...d.voice, pitch: parseFloat(e.target.value) || 1 } }))} className="mt-1" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">STT: <b>Configurações → Geral → Idioma do microfone</b> (Automático = detecta pt/en).</p>

            <div className="pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch id="sNatural" checked={draft.voice.natural !== false} onCheckedChange={v => setDraft(d => ({ ...d, voice: { ...d.voice, natural: v } }))} />
                <Label htmlFor="sNatural" className="text-xs">
                  {lg === "pt-BR" ? "Fala natural adaptativa (prosódia por frase — menos robótica)" : "Adaptive natural speech (per-sentence prosody — less robotic)"}
                </Label>
              </div>
            </div>
            <div>
              <Label className="text-xs" htmlFor="sClone">
                {lg === "pt-BR" ? "Voz por amostra de áudio (.mp3/.wav) — sotaque, ritmo e timbre recriados" : "Voice from audio sample (.mp3/.wav) — accent, rhythm and timbre recreated"}
              </Label>
              <Input
                id="sClone" type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*"
                className="mt-1 text-xs"
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    toast(lg === "pt-BR" ? "Analisando a voz da amostra…" : "Analyzing the sample voice…");
                    const p = await analyzeVoiceSample(f);
                    setDraft(d => ({ ...d, voice: { ...d.voice, clone: p } }));
                    toast(describeClone(p));
                  } catch (err) {
                    toast(lg === "pt-BR" ? `Falha ao analisar: ${(err as Error).message}` : `Analysis failed: ${(err as Error).message}`);
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {lg === "pt-BR"
                  ? draft.voice.clone
                    ? `Perfil ativo: ${draft.voice.clone.pitchHz} Hz (${draft.voice.clone.gender}) · ritmo ${draft.voice.clone.rate}× · voz "${draft.voice.clone.voiceName ?? "auto"}" — a fala agora usa esse sotaque automaticamente.`
                    : "A IA extrai pitch, ritmo e timbre do áudio e troca a voz automaticamente para recrear a do áudio com perfeição possível no dispositivo."
                  : draft.voice.clone
                    ? `Active profile: ${draft.voice.clone.pitchHz} Hz (${draft.voice.clone.gender}) · rate ${draft.voice.clone.rate}× · voice "${draft.voice.clone.voiceName ?? "auto"}" — speech now uses this accent automatically.`
                    : "The AI extracts pitch, rhythm and timbre from the audio and swaps the voice to recreate the sample as faithfully as the device allows."}
              </p>
              {draft.voice.clone && (
                <Button variant="ghost" size="sm" className="h-6 text-[11px] mt-1 px-2"
                  onClick={() => setDraft(d => ({ ...d, voice: { ...d.voice, clone: null } }))}>
                  {lg === "pt-BR" ? "remover perfil de voz" : "remove voice profile"}
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="discord" className="space-y-3 mt-2">
            <p className="text-[11px] text-muted-foreground">
              {lg === "pt-BR"
                ? "Conecte DIRETO NA SUA CONTA (sem bot): modo “Conta direta” usa o seu token de conta e a IA age como você no canal — lê, aprende o seu jeito de falar (memória adaptativa) e responde como se fosse você. Prefere API oficial? Use o modo Bot. Aviso: acesso com token de conta não é API oficial do Discord — use por sua conta e risco. Para pegar o token: Discord Web → DevTools → Application → Local Storage → token."
                : "Connect DIRECTLY to YOUR ACCOUNT (no bot): “Direct account” mode uses your account token and the AI acts as you in the channel — reads, learns how you talk (adaptive memory) and replies as you. Prefer the official API? Use Bot mode. Warning: account-token access is not an official Discord API — use at your own risk."}
            </p>
            <div>
              <Label className="text-xs">{lg === "pt-BR" ? "Modo de conexão" : "Connection mode"}</Label>
              <Select value={draft.discord.mode} onValueChange={(v: "user" | "bot") => setDraft(d => ({ ...d, discord: { ...d.discord, mode: v } }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{lg === "pt-BR" ? "Conta direta (sem bot — age como você)" : "Direct account (no bot — acts as you)"}</SelectItem>
                  <SelectItem value="bot">{lg === "pt-BR" ? "Bot oficial (API de bots)" : "Official bot (bot API)"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="sDiscToken">
                {draft.discord.mode === "bot" ? (lg === "pt-BR" ? "Token do bot" : "Bot token") : (lg === "pt-BR" ? "Token da sua conta" : "Your account token")}
              </Label>
              <Input id="sDiscToken" type="password" value={draft.discord.token} onChange={e => setDraft(d => ({ ...d, discord: { ...d.discord, token: e.target.value } }))} placeholder={draft.discord.mode === "bot" ? "MTAx… (Bot Token)" : "MTAx… (User Token)"} className="mt-1 font-mono text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs" htmlFor="sDiscChan">{lg === "pt-BR" ? "ID do canal" : "Channel ID"}</Label>
                <Input id="sDiscChan" value={draft.discord.channelId} onChange={e => setDraft(d => ({ ...d, discord: { ...d.discord, channelId: e.target.value } }))} placeholder="1234…" className="mt-1 font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs" htmlFor="sDiscInt">{lg === "pt-BR" ? "Intervalo do monitor (s)" : "Poll interval (s)"}</Label>
                <Input id="sDiscInt" type="number" min="15" value={draft.discord.intervalSec} onChange={e => setDraft(d => ({ ...d, discord: { ...d.discord, intervalSec: parseInt(e.target.value, 10) || 30 } }))} className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sDiscAuto" checked={draft.discord.autoReply} onCheckedChange={v => setDraft(d => ({ ...d, discord: { ...d.discord, autoReply: v } }))} />
              <Label htmlFor="sDiscAuto" className="text-xs">
                {lg === "pt-BR" ? "Responder automaticamente no estilo do dono" : "Auto-reply in the owner's style"}
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {lg === "pt-BR"
                ? "No chat: /discord read · /discord send <texto> · /discord auto on|off. A IA coleta memória adaptativa das suas mensagens (do chat E do Discord) e o system prompt vai se adaptando para as respostas saírem naturais, humanas e no seu estilo. Anti-spam: nunca repete a mesma resposta."
                : "In chat: /discord read · /discord send <text> · /discord auto on|off. The AI collects adaptive memory from your messages (chat AND Discord) and the system prompt keeps adapting for natural, human replies in your style. Anti-spam: never repeats the same reply."}
            </p>
          </TabsContent>

          <TabsContent value="dsbox" className="space-y-3 mt-2">
            {/* SISTEMA ÚNICO DE MODOS — 1 config decide o prompt inteiro */}
            <div>
              <Label className="text-xs">{lg === "pt-BR" ? "Modo do assistente (sistema único de prompt)" : "Assistant mode (single prompt system)"}</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button
                  type="button" size="sm" variant={mode === "chatbot" ? "default" : "outline"}
                  className={mode === "chatbot" ? "bg-accent text-white" : ""}
                  onClick={() => { setMode("chatbot"); toast(lg === "pt-BR" ? "💬 Modo CHATBOT — só conversa, sem ferramentas de sistema" : "💬 CHATBOT mode — pure chat, no OS tools"); }}
                >
                  💬 {lg === "pt-BR" ? "Chatbot puro" : "Pure chatbot"}
                </Button>
                <Button
                  type="button" size="sm" variant={mode === "osdev" ? "default" : "outline"}
                  className={mode === "osdev" ? "bg-accent text-white" : ""}
                  onClick={() => { setMode("osdev"); toast(lg === "pt-BR" ? "📦 Modo DS-BOX — criação de sistemas operacionais" : "📦 DS-BOX mode — OS creation"); }}
                >
                  📦 DS-BOX · {lg === "pt-BR" ? "Criar sistemas" : "OS creation"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {lg === "pt-BR"
                  ? "UMA chave configura o prompt inteiro: no Chatbot puro a IA é só uma conversa (zero ferramentas, zero internals); no DS-BOX ela monta, compila e executa sistemas operacionais (.iso). Também vale /modo no chat e o botão na barra do chat."
                  : "ONE switch configures the whole prompt: Pure chatbot makes the AI just a conversation (no tools, no internals); DS-BOX lets it assemble, compile and run operating systems (.iso). Also /modo in chat and the button in the chat bar."}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {lg === "pt-BR"
                ? "Ferramentas DS-BOX: sandbox com VFS local, Build-Iso (ISO 9660 + El Torito), emulador x86 (v86), Bash-86X, terminal da IA (ds:term/ds:send), scripts JS+Python e ferramentas ds:* / ds:os (OS Studio) para os modelos. O painel tem 2 abas manuais (Emulador e Files) — o resto é gerenciado pela IA."
                : "DS-BOX tools: sandbox with local VFS, Build-Iso (ISO 9660 + El Torito), x86 emulator (v86), Bash-86X, the AI terminal (ds:term/ds:send), JS+Python scripts and ds:* / ds:os (OS Studio) tools for models. The panel has 2 manual tabs (Emulator and Files) — everything else is AI-managed."}
            </p>
            <div className="flex items-center gap-2">
              <Switch id="sAutoLoop" checked={autoLoop} onCheckedChange={v => setAutoLoop(v)} />
              <Label htmlFor="sAutoLoop" className="text-xs">
                {lg === "pt-BR" ? "Loop agêntico: devolver resultados das ferramentas ao modelo automaticamente" : "Agentic loop: feed tool results back to the model automatically"}
              </Label>
            </div>
            <div>
              <Label className="text-xs" htmlFor="sPresets">{lg === "pt-BR" ? "Presets de kernel extras (JSON — array com id, label, bzimage, cmdline)" : "Extra kernel presets (JSON — array with id, label, bzimage, cmdline)"}</Label>
              <Input id="sPresets" value={presetsJson} onChange={e => setPresetsJson(e.target.value)} className="mt-1 font-mono text-[11px]" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {lg === "pt-BR"
                ? "VFS: dsbox-vfs-v1 · Estado: dsbox-state · ISOs ficam em memória na sessão atual."
                : "VFS: dsbox-vfs-v1 · State: dsbox-state · ISOs stay in memory for the current session."}
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>{t(lg, "close")}</Button>
          <Button variant="outline" onClick={() => void save(false)}>{lg === "pt-BR" ? "Salvar" : "Save"}</Button>
          <Button className="bg-accent text-white hover:opacity-90" onClick={() => void save(true)}>{t(lg, "saveConnect")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
