import React, { useEffect, useRef, useState } from "react";
import Message from "./Message.jsx";
import { formatAIError, streamChat } from "../lib/aiClient.js";
import { enhanceTaskPrompt } from "../lib/promptEnhancer.js";
import { buildChatbotSystemPrompt } from "../lib/systemPrompts.js";

const STORAGE_KEY = "vessie-agent-conversations";
const SUGGESTIONS = [
  "Me ajude a criar uma ideia de produto",
  "Explique um conceito de programação",
  "Revise este código comigo",
];

function createConversation() {
  return {
    id: crypto.randomUUID(),
    title: "Nova conversa",
    updatedAt: Date.now(),
    messages: [],
  };
}

function loadWorkspace() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(stored?.conversations) && stored.conversations.length) {
      const conversations = stored.conversations.filter(
        (conversation) => conversation && typeof conversation.id === "string" && Array.isArray(conversation.messages)
      );
      if (conversations.length) {
        return {
          conversations,
          activeId: conversations.some((conversation) => conversation.id === stored.activeId)
            ? stored.activeId
            : conversations[0].id,
        };
      }
    }
  } catch {
    const conversation = createConversation();
    return { conversations: [conversation], activeId: conversation.id };
  }
  const conversation = createConversation();
  return { conversations: [conversation], activeId: conversation.id };
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(timestamp);
}

export default function ChatBot() {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("idle");
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const activeConversation =
    workspace.conversations.find((conversation) => conversation.id === workspace.activeId) ??
    workspace.conversations[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch {
      return;
    }
  }, [workspace]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [activeConversation?.messages, workspace.activeId]);

  function updateMessages(updater) {
    const conversationId = workspace.activeId;
    setWorkspace((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const messages = typeof updater === "function" ? updater(conversation.messages) : updater;
        const firstUserMessage = messages.find((message) => message.role === "user")?.content;
        return {
          ...conversation,
          messages,
          title: firstUserMessage
            ? `${firstUserMessage.slice(0, 36)}${firstUserMessage.length > 36 ? "…" : ""}`
            : conversation.title,
          updatedAt: Date.now(),
        };
      }).sort((a, b) => b.updatedAt - a.updatedAt),
    }));
  }

  function startNewConversation() {
    stopResponse();
    const conversation = createConversation();
    setWorkspace((current) => ({
      conversations: [conversation, ...current.conversations],
      activeId: conversation.id,
    }));
    setInput("");
  }

  function selectConversation(id) {
    if (id === workspace.activeId) return;
    stopResponse();
    setWorkspace((current) => ({ ...current, activeId: id }));
    setInput("");
  }

  function deleteConversation(event, id) {
    event.stopPropagation();
    if (workspace.activeId === id) {
      abortRef.current?.abort();
      abortRef.current = null;
      setBusy(false);
    }
    setWorkspace((current) => {
      const remaining = current.conversations.filter((conversation) => conversation.id !== id);
      const next = remaining.length ? remaining : [createConversation()];
      return {
        conversations: next,
        activeId: current.activeId === id ? next[0].id : current.activeId,
      };
    });
  }

  async function handleSend(message = input) {
    const text = message.trim();
    if (!text || busy || !activeConversation) return;
    setInput("");

    const nextMessages = [...activeConversation.messages, { role: "user", content: text }];
    updateMessages([...nextMessages, { role: "assistant", content: "" }]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setPhase("enhancing");
      const enhancedPrompt = await enhanceTaskPrompt({
        request: text,
        mode: "chat",
        context: "Assistente geral; sem arquivos anexados.",
        history: nextMessages.slice(0, -1).slice(-8).map((item) => ({
          role: item.role,
          content: item.content.slice(-3000),
        })),
        signal: controller.signal,
      });
      setPhase("responding");
      const payload = [
        { role: "system", content: buildChatbotSystemPrompt() },
        ...nextMessages.slice(0, -1),
        { role: "user", content: enhancedPrompt },
      ];
      let response = "";
      await streamChat(
        payload,
        (chunk) => {
          response += chunk;
          updateMessages((messages) => {
            const updated = [...messages];
            updated[updated.length - 1] = { role: "assistant", content: response };
            return updated;
          });
        },
        controller.signal
      );
    } catch (error) {
      if (error.name !== "AbortError") {
        updateMessages((messages) => {
          const updated = [...messages];
          updated[updated.length - 1] = {
            role: "assistant",
            content: formatAIError(error),
          };
          return updated;
        });
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
        setPhase("idle");
      }
    }
  }

  function stopResponse() {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    setBusy(false);
    setPhase("idle");
    updateMessages((messages) => {
      const updated = [...messages];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant" && !last.content) {
        updated[updated.length - 1] = { ...last, content: "Geração interrompida." };
      }
      return updated;
    });
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-workspace">
      <aside className="history-col" aria-label="Histórico de conversas">
        <div className="history-header">
          <div>
            <span className="section-kicker">ESPAÇO PESSOAL</span>
            <h2>Conversas</h2>
          </div>
          <button className="icon-btn new-chat-btn" onClick={startNewConversation} aria-label="Nova conversa" title="Nova conversa">
            +
          </button>
        </div>
        <button className="new-conversation-btn" onClick={startNewConversation}>
          <span>＋</span> Nova conversa
        </button>
        <div className="conversation-list">
          {workspace.conversations.map((conversation) => (
            <div className="conversation-entry" key={conversation.id}>
              <button
                className={`conversation-item ${conversation.id === workspace.activeId ? "active" : ""}`}
                onClick={() => selectConversation(conversation.id)}
                title={conversation.title}
              >
                <span className="conversation-icon" aria-hidden="true">◌</span>
                <span className="conversation-copy">
                  <span className="conversation-title">{conversation.title}</span>
                  <span className="conversation-date">{formatDate(conversation.updatedAt)}</span>
                </span>
              </button>
              <button
                className="conversation-delete"
                aria-label={`Excluir ${conversation.title}`}
                onClick={(event) => deleteConversation(event, conversation.id)}
              >×</button>
            </div>
          ))}
        </div>
        <div className="history-note">
          <span className="storage-mark">↗</span>
          <span>Seu histórico fica salvo neste navegador.</span>
        </div>
      </aside>

      <section className="chat-col">
        <div className="chat-toolbar">
          <div className="assistant-presence"><span className={`presence-dot ${phase !== "idle" ? "working" : ""}`} /> Vessie AI <span className="toolbar-divider">/</span> {phase === "enhancing" ? "Aprimorando seu pedido…" : phase === "responding" ? "Preparando resposta…" : "Assistente"}
          </div>
          <span className="privacy-label">{phase === "enhancing" ? "Etapa 1 de 2 · Refinamento com IA" : phase === "responding" ? "Etapa 2 de 2 · Resposta do modelo" : "Privado neste dispositivo"}</span>
        </div>
        <div className="messages" ref={scrollRef}>
          {activeConversation.messages.length === 0 && (
            <div className="welcome-panel">
              <div className="welcome-orb" aria-hidden="true"><span>V</span></div>
              <span className="section-kicker">SUA IA, DO SEU JEITO</span>
              <h2>O que vamos criar<br />hoje?</h2>
              <p>Converse, explore ideias ou resolva um desafio. Sua assistente está pronta para ajudar.</p>
              <div className="suggestion-grid">
                {SUGGESTIONS.map((suggestion, index) => (
                  <button key={suggestion} className="suggestion-card" onClick={() => handleSend(suggestion)} disabled={busy}>
                    <span className="suggestion-index">0{index + 1}</span>
                    <span>{suggestion}</span>
                    <span className="suggestion-arrow">↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {activeConversation.messages.map((message, index) => (
            <Message key={`${activeConversation.id}-${index}`} role={message.role} content={message.content} />
          ))}
        </div>
        <div className="composer-wrap">
          <div className="composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte qualquer coisa..."
              aria-label="Sua mensagem"
              rows={1}
            />
            {busy ? (
              <button className="stop-btn" onClick={stopResponse} aria-label="Interromper resposta">
                <span className="stop-square" /> Parar
              </button>
            ) : (
              <button className="send-btn" onClick={() => handleSend()} disabled={!input.trim()} aria-label="Enviar mensagem">
                <span>Enviar</span><span className="send-arrow">↑</span>
              </button>
            )}
          </div>
          <div className="composer-caption"><span>Enter para enviar</span><span>Shift + Enter para nova linha</span></div>
        </div>
      </section>
    </div>
  );
}
