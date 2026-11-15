"use client";
// Vessie AI — modal de configurações (multi-provider, voz, imagem — B.3.8/B.4)
import { useState } from "react";
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
import type { KernelPreset } from "@/lib/dsbox/iso";
import { useConn } from "@/lib/connection";
import { PROVIDERS } from "@/lib/providers";
import { IMAGE_SIZES, IMAGE_MODELS } from "@/lib/image";
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
  // Radix Dialog desmonta o conteúdo ao fechar: useState(settings) reinicia a cada abertura.
  const autoLoop = useDsbox(s => s.autoLoop);
  const setAutoLoop = useDsbox(s => s.setAutoLoop);
  const kernelPresets = useDsbox(s => s.kernelPresets);
  const setKernelPresets = useDsbox(s => s.setKernelPresets);
  const [presetsJson, setPresetsJson] = useState<string>(() => JSON.stringify(kernelPresets));

  const save = async (reconnect: boolean) => {
    setSettings(draft);
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
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="api">{t(lg, "tabApi")}</TabsTrigger>
            <TabsTrigger value="general">{t(lg, "tabGeneral")}</TabsTrigger>
            <TabsTrigger value="image">{t(lg, "tabImage")}</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
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
              <p className="text-[11px] text-muted-foreground mt-1">Padrão LM Studio: http://localhost:1234/v1 · HTTPS publicado? Use túnel https (ex.: ngrok → porta 1234).</p>
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
            <p className="text-[11px] text-muted-foreground">API Pollinations — gratuita, sem chave. A IA também responde com blocos ```image:```.</p>
          </TabsContent>

          <TabsContent value="voice" className="space-y-3 mt-2">
            <div className="flex items-center gap-2">
              <Switch id="sVoice" checked={draft.voice.enabled} onCheckedChange={v => setDraft(d => ({ ...d, voice: { ...d.voice, enabled: v } }))} />
              <Label htmlFor="sVoice" className="text-xs">{t(lg, "voiceTts")}</Label>
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
            <p className="text-[11px] text-muted-foreground">Voz pt-BR preferida automaticamente. STT (microfone) disponível no input quando o navegador suporta.</p>
          </TabsContent>

          <TabsContent value="dsbox" className="space-y-3 mt-2">
            <p className="text-[11px] text-muted-foreground">
              {lg === "pt-BR"
                ? "DS-BOX: sandbox com VFS local, Build-Iso (ISO 9660 + El Torito), emulador x86 (v86), Bash-86X e ferramentas ds:* para os modelos. O switch principal fica na barra acima do chat."
                : "DS-BOX: sandbox with local VFS, Build-Iso (ISO 9660 + El Torito), x86 emulator (v86), Bash-86X and ds:* tools for models. The main switch lives in the bar above the chat."}
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
              <p className="text-[11px] text-muted-foreground mt-1">
                {lg === "pt-BR"
                  ? "Ex.: [{\"id\":\"meukernel\",\"label\":\"Meu Linux\",\"bzimage\":\"https://…/bzImage\",\"cmdline\":\"console=ttyS0\"}]"
                  : "e.g. [{\"id\":\"mykernel\",\"label\":\"My Linux\",\"bzimage\":\"https://…/bzImage\",\"cmdline\":\"console=ttyS0\"}]"}
              </p>
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
