"use client";
// Vessie AI — Gerador de Imagens (página dedicada — B.3.4)
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ImageCard } from "./message-bubble";
import { useSettings, useUi } from "@/lib/store";
import { IMAGE_SIZES, IMAGE_MODELS, buildImageUrl, toImageResult, newSeed, enhancePromptLocally } from "@/lib/image";
import { ArrowLeft, ImageIcon } from "lucide-react";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

export function ImageStudio({ lang: lg }: { lang: Lang }) {
  const setView = useUi(s => s.setView);
  const { settings, setSettings } = useSettings();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; seed: number; prompt: string; size: string; model: string } | null>(null);

  const generate = () => {
    if (!prompt.trim()) return;
    setBusy(true);
    const finalPrompt = /[a-zA-Z]/.test(prompt) ? prompt : enhancePromptLocally(prompt);
    const seed = newSeed();
    const url = buildImageUrl(finalPrompt, settings.image.size, settings.image.model, seed);
    // preload antes de mostrar (60s timeout)
    const img = new Image();
    const to = setTimeout(() => { setBusy(false); }, 60000);
    img.onload = () => {
      clearTimeout(to);
      setResult({ url, seed, prompt: finalPrompt, size: settings.image.size, model: settings.image.model });
      setBusy(false);
    };
    img.onerror = () => { clearTimeout(to); setBusy(false); };
    img.src = url;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[900px] mx-auto px-4 py-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 rounded-[99px] gap-1.5" onClick={() => setView("chat")}>
            <ArrowLeft className="h-3.5 w-3.5" /> {t(lg, "backToChat")}
          </Button>
          <h2 className="text-lg font-bold">{t(lg, "imageTitle")}</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">{t(lg, "imageSub")}</p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-5 mt-5">
          <div className="space-y-3">
            <div>
              <Label className="text-xs" htmlFor="imgPrompt">{t(lg, "imageTitle")}</Label>
              <Textarea
                id="imgPrompt"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={t(lg, "imagePromptPlaceholder")}
                className="mt-1 min-h-28"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t(lg, "imgSize")}</Label>
                <Select value={settings.image.size} onValueChange={(v: string) => setSettings({ image: { ...settings.image, size: v } })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMAGE_SIZES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t(lg, "imgModel")}</Label>
                <Select value={settings.image.model} onValueChange={(v: string) => setSettings({ image: { ...settings.image, model: v } })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMAGE_MODELS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full bg-accent text-white hover:opacity-90 rounded-[10px] gap-2" onClick={generate} disabled={busy || !prompt.trim()}>
              <ImageIcon className="h-4 w-4" />
              {busy ? t(lg, "imgGeneratingPage") : t(lg, "generateImage")}
            </Button>
          </div>

          <div className="min-h-[300px] flex items-start justify-center">
            {result ? (
              <ImageCard
                img={toImageResult(result.prompt, result.url, result.size, result.model, result.seed)}
                lang={lg}
                onVariant={() => {
                  const seed = newSeed();
                  const url = buildImageUrl(result.prompt, result.size, result.model, seed);
                  setResult({ ...result, url, seed });
                }}
              />
            ) : busy ? (
              <div className="text-sm text-muted-foreground gen-pulse mt-12">{t(lg, "imgGeneratingPage")}</div>
            ) : (
              <div className="border border-dashed border-border rounded-[14px] p-10 text-center text-xs text-muted-foreground w-full">
                <ImageIcon className="h-6 w-6 mx-auto mb-2 opacity-50" aria-hidden />
                {t(lg, "imagePromptPlaceholder")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
