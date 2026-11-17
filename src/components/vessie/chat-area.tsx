"use client";
// Vessie AI — área de chat (welcome + mensagens + bolha viva do stream)
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MessageBubble, type MessageActions } from "./message-bubble";
import { Mascot } from "./mascot";
import { useChat, useStream, chatActions } from "@/lib/store";
import { sendMessage, continueResponse, editAndResend, resendMessage, regenerateFrom, deleteMsg } from "@/lib/chat-flow";
import { buildImageUrl, toImageResult, newSeed } from "@/lib/image";
import { useSettings } from "@/lib/store";
import { pickSuggestions, t } from "@/lib/i18n";
import type { ImageResult, Lang } from "@/lib/types";

export function ChatArea({ lang: lg }: { lang: Lang }) {
  const convId = useChat(s => s.activeChatId);
  const conversations = useChat(s => s.conversations);
  const live = useStream(s => s.live);
  const settings = useSettings(s => s.settings);
  const conv = conversations.find(c => c.id === convId);
  const endRef = useRef<HTMLDivElement>(null);
  const suggestions = useRef<string[]>([]);

  useEffect(() => {
    suggestions.current = pickSuggestions(2);
  }, [convId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conv?.messages.length, live?.content]);

  if (!conv || conv.messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <Mascot size={76} float />
        <h2 className="mt-4 text-xl font-bold">{t(lg, "welcomeTitle")}</h2>
        <p className="mt-2 max-w-[560px] text-sm text-text2 leading-relaxed">{t(lg, "welcomeBody")}</p>
        <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-[560px]">
          {suggestions.current.map(s => (
            <Button
              key={s}
              variant="outline"
              className="rounded-[99px] text-xs h-8 hover:-translate-y-px hover:border-accent transition-all"
              onClick={() => void sendMessage(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const actions: MessageActions = {
    onEdit: (id, text) => void editAndResend(conv.id, id, text),
    onResend: id => void resendMessage(conv.id, id),
    onDelete: id => void deleteMsg(conv.id, id),
    onRegenerate: id => void regenerateFrom(conv.id, id),
    onContinue: id => void continueResponse(conv.id, id),
    onVariant: (img: ImageResult) => {
      const seed = newSeed();
      const url = buildImageUrl(img.prompt, settings.image.size, settings.image.model, seed);
      chatActions.addMessage(conv.id, {
        id: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        content: `🎲 **${img.prompt}**`,
        image: toImageResult(img.prompt, url, settings.image.size, settings.image.model, seed),
        createdAt: Date.now(),
        finished: true,
      });
    },
  };

  return (
    <div className="flex-1 overflow-y-auto" aria-live="polite">
      <div className="mx-auto max-w-[800px] flex flex-col gap-4 px-4 py-6">
        {conv.messages.map(m => (
          <MessageBubble
            key={m.id}
            msg={m}
            lang={lg}
            generating={live?.msgId === m.id}
            live={live && live.msgId === m.id ? { content: live.content, thinking: live.thinking } : undefined}
            actions={actions}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
