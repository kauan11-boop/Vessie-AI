"use client";
// Vessie AI — bolha de mensagem com ações, raciocínio visível e imagens (B.3.1/B.3.4)
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "./markdown";
import { Mascot } from "./mascot";
import { downloadImageUrl } from "@/lib/image";
import type { ImageResult } from "@/lib/types";
import { speak, stopSpeaking } from "@/lib/voice";
import {
  MoreHorizontal, Pencil, RefreshCcw, Trash2, Copy, ChevronRight, Volume2, VolumeX,
} from "lucide-react";
import type { Lang } from "@/lib/types";
import { t } from "@/lib/i18n";

export function ImageCard({ img, onVariant, lang: lg }: { img: ImageResult; onVariant?: (img: ImageResult) => void; lang: Lang }) {
  return (
    <div className="img-card my-2 max-w-md">
      <img
        src={img.url}
        alt={img.prompt.slice(0, 120)}
        loading="lazy"
        className="w-full"
        onError={e => {
          const el = e.currentTarget;
          const fallback = el.parentElement?.querySelector("[data-img-fallback]") as HTMLElement | null;
          if (fallback) fallback.style.display = "block";
          el.style.display = "none";
        }}
      />
      <div data-img-fallback className="hidden bg-panel border border-border rounded-[14px] p-3 text-xs text-muted-foreground">
        {t(lg, "imgFailed")}
      </div>
      <div className="bg-panel rounded-b-[14px] px-3 py-2 -mt-1 border-x border-b border-border">
        <div className="text-[11px] font-mono text-muted-foreground">
          {img.width}×{img.height} · {img.model} · seed {img.seed}
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {onVariant && (
            <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px]" onClick={() => onVariant(img)}>
              🎲 {t(lg, "variant")}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px]" onClick={() => downloadImageUrl(img.url, img.seed).then(() => toast(t(lg, "imgDownloaded"))).catch(() => toast(t(lg, "imgFail")))}>
            ⬇ {t(lg, "download")}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px]" onClick={() => navigator.clipboard.writeText(img.url).then(() => toast(t(lg, "urlCopied"))).catch(() => toast(t(lg, "copyFail")))}>
            🔗 {t(lg, "url")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface MessageActions {
  onEdit: (msgId: string, newText: string) => void;
  onResend: (msgId: string) => void;
  onDelete: (msgId: string) => void;
  onRegenerate: (msgId: string) => void;
  onContinue: (msgId: string) => void;
  onVariant: (img: ImageResult) => void;
}

export function MessageBubble({
  msg, lang: lg, generating, actions, live,
}: {
  msg: { id: string; role: string; content: string; thinking?: string; finished?: boolean; image?: ImageResult; imageBlock?: ImageResult; imageBlocks?: ImageResult[]; meta?: { model: string; noInfo?: boolean } };
  lang: Lang;
  generating: boolean;
  actions: MessageActions;
  live?: { content: string; thinking: string };
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const isUser = msg.role === "user";
  const content = live ? live.content : msg.content;
  const thinking = live?.thinking ?? msg.thinking;
  const canContinue = !isUser && msg.finished === false && !live;

  const doSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const ok = speak(msg.content.replace(/```[\s\S]*?```/g, " bloco de código "));
    if (!ok) toast(t(lg, "speakFail"));
    else setSpeaking(true);
  };

  return (
    <div className={`msg-in flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && (
        <Mascot size={32} className="shrink-0 mt-1 rounded-full" />
      )}
      <div className={`group max-w-[85%] min-w-0 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`text-[11px] uppercase tracking-[0.8px] text-muted-foreground mb-1 ${isUser ? "text-right" : ""}`}>
          {isUser ? t(lg, "you") : (msg.meta?.model === "OFFLINE" ? "Vessie-AI · OFFLINE" : t(lg, "vessie"))}
        </div>

        <div className={`${isUser ? "bubble-user px-4 py-2.5" : "bubble-bot px-4 py-3"} w-full`}>
          {editing ? (
            <div className="min-w-[260px]">
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="min-h-20 text-sm"
                aria-label={t(lg, "edit")}
                autoFocus
              />
              <div className="flex gap-2 mt-2 justify-end">
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-[99px]" onClick={() => setEditing(false)}>
                  {t(lg, "editCancel")}
                </Button>
                <Button size="sm" className="h-7 text-xs rounded-[99px] bg-accent text-white hover:opacity-90" onClick={() => {
                  setEditing(false);
                  actions.onEdit(msg.id, draft);
                }}>
                  {t(lg, "editSave")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {thinking && (
                <details className="think mb-2" open={!!live}>
                  <summary>💭 raciocínio</summary>
                  <div className="think-body">{thinking}</div>
                </details>
              )}
              {content ? (
                <Markdown>{content}</Markdown>
              ) : live ? (
                <span className="gen-pulse text-muted-foreground text-sm">{t(lg, "generating")}</span>
              ) : (
                <span className="text-muted-foreground text-sm italic">{msg.meta?.noInfo ? "" : t(lg, "emptyResponse")}</span>
              )}
              {live && content && (
                <span className="gen-pulse text-accent text-xs mt-1 inline-block">{t(lg, "generating")}</span>
              )}
              {msg.image && <ImageCard img={msg.image} lang={lg} />}
              {msg.imageBlock && (
                <ImageCard img={msg.imageBlock} lang={lg} onVariant={i => actions.onVariant(i)} />
              )}
              {msg.imageBlocks?.map((im, i) => (
                <ImageCard key={i} img={im} lang={lg} onVariant={i2 => actions.onVariant(i2)} />
              ))}
            </>
          )}
        </div>

        {/* ações */}
        {!editing && (
          <div className={`flex gap-1 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${isUser ? "flex-row-reverse" : ""}`}>
            {isUser ? (
              <>
                <MiniBtn ariaLabel={t(lg, "edit")} onClick={() => { setDraft(msg.content); setEditing(true); }}><Pencil className="h-3.5 w-3.5" /></MiniBtn>
                <MiniBtn ariaLabel={t(lg, "resend")} onClick={() => actions.onResend(msg.id)}><RefreshCcw className="h-3.5 w-3.5" /></MiniBtn>
                <MiniBtn ariaLabel={t(lg, "copy")} onClick={() => navigator.clipboard.writeText(msg.content).then(() => toast(t(lg, "copied"))).catch(() => toast(t(lg, "copyFail")))}><Copy className="h-3.5 w-3.5" /></MiniBtn>
                <MiniBtn ariaLabel={t(lg, "delete")} onClick={() => actions.onDelete(msg.id)}><Trash2 className="h-3.5 w-3.5" /></MiniBtn>
              </>
            ) : (
              <>
                {canContinue && (
                  <Button variant="outline" size="sm" className="h-7 text-xs rounded-[99px]" onClick={() => actions.onContinue(msg.id)} disabled={generating}>
                    ▶ {t(lg, "continueBtn")}
                  </Button>
                )}
                <MiniBtn ariaLabel={t(lg, "regenerate")} onClick={() => actions.onRegenerate(msg.id)} disabled={generating}><RefreshCcw className="h-3.5 w-3.5" /></MiniBtn>
                <MiniBtn ariaLabel={t(lg, "copy")} onClick={() => navigator.clipboard.writeText(msg.content).then(() => toast(t(lg, "copied"))).catch(() => toast(t(lg, "copyFail")))}><Copy className="h-3.5 w-3.5" /></MiniBtn>
                <MiniBtn ariaLabel={speaking ? "Parar fala" : "Falar resposta"} onClick={doSpeak}>
                  {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </MiniBtn>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-[99px]" aria-label="Mais ações">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => actions.onDelete(msg.id)} className="text-danger">
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> {t(lg, "delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniBtn({ children, onClick, ariaLabel, disabled }: { children: React.ReactNode; onClick: () => void; ariaLabel: string; disabled?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 rounded-[99px]"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

export { ChevronRight };
