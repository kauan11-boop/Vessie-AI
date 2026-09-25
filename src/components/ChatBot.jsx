import React, { useRef, useState } from "react";
import Message from "./Message.jsx";
import { streamChat } from "../lib/aiClient.js";
import { buildChatbotSystemPrompt } from "../lib/systemPrompts.js";

export default function ChatBot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");

    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setBusy(true);
    scrollToBottom();

    const controller = new AbortController();
    abortRef.current = controller;

    const payload = [
      { role: "system", content: buildChatbotSystemPrompt() },
      ...nextMessages,
    ];

    try {
      let acc = "";
      await streamChat(
        payload,
        (chunk) => {
          acc += chunk;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: acc };
            return copy;
          });
          scrollToBottom();
        },
        controller.signal
      );
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `⚠️ Erro ao falar com a IA: ${err.message}`,
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-col">
      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-hint">
            Manda uma mensagem para começar a conversar com a IA. Configure o
            backend (LM Studio por padrão) no botão de Configurações.
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} role={m.role} content={m.content} />
        ))}
      </div>
      <div className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem... (Enter envia, Shift+Enter quebra linha)"
        />
        <button className="send-btn" onClick={handleSend} disabled={busy || !input.trim()}>
          {busy ? "..." : "Enviar"}
        </button>
      </div>
    </div>
  );
}
