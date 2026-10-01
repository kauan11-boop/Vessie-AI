import React, { useEffect, useRef, useState } from "react";
import Message from "./Message.jsx";
import FileTree from "./FileTree.jsx";
import { chatOnce } from "../lib/aiClient.js";
import { buildAgentSystemPrompt } from "../lib/systemPrompts.js";
import {
  isSupported,
  pickDirectory,
  ensurePermission,
  buildTree,
  flattenTree,
  readFile,
  writeFile,
  createFile,
  deleteFile,
  listDir,
} from "../lib/fsAccess.js";
import { extractActions, hasActionBlock, isReadOnly, stripActionBlocks } from "../lib/agentProtocol.js";

const MAX_AUTO_ROUNDS = 3;

export default function AgentCoding() {
  const [rootHandle, setRootHandle] = useState(null);
  const [tree, setTree] = useState(null);
  const [activePath, setActivePath] = useState(null);
  const [activeContent, setActiveContent] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pending, setPending] = useState([]);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const activeReadRef = useRef(0);
  const syncRef = useRef(0);
  const syncingRef = useRef(false);
  const applyingRef = useRef(false);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  async function handlePickFolder() {
    if (busy || syncing || applying) return;
    if (pending.length && !window.confirm("Trocar de pasta descartará as mudanças pendentes. Deseja continuar?")) return;
    try {
      const handle = await pickDirectory();
      const nextTree = await buildTree(handle);
      activeReadRef.current += 1;
      syncRef.current += 1;
      setRootHandle(handle);
      setTree(nextTree);
      setActivePath(null);
      setActiveContent("");
      setPending([]);
      setMessages([
        {
          role: "system",
          content: `Pasta "${handle.name}" conectada com acesso de leitura e escrita.`,
        },
      ]);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setMessages((current) => [
          ...current,
          { role: "system", content: `Não foi possível selecionar a pasta: ${error.message}` },
        ]);
      }
    }
  }

  async function handleSelectFile(path) {
    const requestId = ++activeReadRef.current;
    setActivePath(path);
    setActiveContent("Carregando arquivo…");
    try {
      const content = await readFile(rootHandle, path);
      if (requestId === activeReadRef.current) setActiveContent(content);
    } catch (error) {
      if (requestId === activeReadRef.current) {
        setActiveContent(`${error.message}. Sincronize a pasta ou selecione-a novamente para restaurar o acesso.`);
      }
    }
  }

  async function refreshTree({ selectedPath = activePath, silent = false, force = false } = {}) {
    if (!rootHandle || syncingRef.current || ((busy || applyingRef.current) && !force)) return;
    syncingRef.current = true;
    const requestId = ++syncRef.current;
    const readId = ++activeReadRef.current;
    const path = selectedPath;
    setSyncing(true);
    try {
      const nextTree = await buildTree(rootHandle);
      let nextContent = null;
      if (path) {
        try {
          nextContent = await readFile(rootHandle, path);
        } catch (error) {
          nextContent = error.name === "NotFoundError"
            ? null
            : `Não foi possível ler o arquivo: ${error.message}`;
        }
      }
      if (requestId !== syncRef.current) return;
      setTree(nextTree);
      if (path && readId === activeReadRef.current) {
        if (nextContent === null) {
          setActivePath(null);
          setActiveContent("");
        } else {
          setActiveContent(nextContent);
        }
      }
      if (!silent) {
        setMessages((current) => [...current, { role: "system", content: "Arquivos e prévia sincronizados com a pasta selecionada." }]);
      }
    } catch (error) {
      if (requestId === syncRef.current) {
        setMessages((current) => [...current, { role: "system", content: `Falha ao sincronizar a pasta: ${error.message}` }]);
      }
    } finally {
      if (requestId === syncRef.current) {
        syncingRef.current = false;
        setSyncing(false);
      }
    }
  }

  useEffect(() => {
    if (!rootHandle) return undefined;
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") refreshTree({ silent: true });
    };
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [rootHandle, activePath, busy]);

  function pushPending(action) {
    const item = { id: crypto.randomUUID(), type: action.type, path: action.path, content: action.content ?? "" };
    setPending((current) => [...current.filter((pendingItem) => pendingItem.path !== item.path), item]);
  }

  async function applyPending(item) {
    if (applyingRef.current || syncingRef.current || !rootHandle) return;
    applyingRef.current = true;
    setApplying(true);
    try {
      await ensurePermission(rootHandle, "readwrite", true);
      if (item.type === "write_file") {
        await writeFile(rootHandle, item.path, item.content);
      } else if (item.type === "create_file") {
        await createFile(rootHandle, item.path, item.content);
      } else if (item.type === "delete_file") {
        await deleteFile(rootHandle, item.path);
      }
      setPending((current) => current.filter((pendingItem) => pendingItem.id !== item.id));
      const deletedSelection = activePath === item.path && item.type === "delete_file";
      if (deletedSelection) {
        activeReadRef.current += 1;
        setActivePath(null);
        setActiveContent("");
      }
      setMessages((current) => [...current, { role: "system", content: `Ação aplicada com sucesso: ${item.type} → ${item.path}`, context: "tool" }]);
      await refreshTree({ selectedPath: deletedSelection ? null : activePath, silent: true, force: true });
    } catch (error) {
      setMessages((current) => [...current, { role: "system", content: `A ação ${item.type} em ${item.path} falhou e não foi aplicada: ${error.message}`, context: "tool" }]);
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }

  function rejectPending(item) {
    setPending((prev) => prev.filter((pendingItem) => pendingItem.id !== item.id));
    setMessages((current) => [
      ...current,
      { role: "system", content: `A ação ${item.type} em ${item.path} foi rejeitada e não foi aplicada.`, context: "tool" },
    ]);
  }

  async function runReadOnlyAction(action) {
    try {
      if (action.type === "list_dir") {
        const listing = await listDir(rootHandle, action.path || "");
        return `list_dir("${action.path || "."}"):\n${listing}`;
      }
      if (action.type === "read_file") {
        const content = await readFile(rootHandle, action.path);
        return `read_file("${action.path}"):\n\`\`\`\n${content}\n\`\`\``;
      }
    } catch (err) {
      return `Erro ao executar ${action.type}("${action.path}"): ${err.message}`;
    }
    return "";
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy || syncing || applying || !rootHandle) return;
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const selectedPath = activePath;
    const selectedReadId = activeReadRef.current;
    let currentTree;
    syncingRef.current = true;
    setSyncing(true);
    try {
      currentTree = await buildTree(rootHandle);
      setTree(currentTree);
      if (selectedPath && selectedReadId === activeReadRef.current) {
        try {
          const content = await readFile(rootHandle, selectedPath);
          if (selectedReadId === activeReadRef.current) setActiveContent(content);
        } catch (error) {
          if (selectedReadId === activeReadRef.current && error.name === "NotFoundError") {
            setActivePath(null);
            setActiveContent("");
          }
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        setInput(text);
        setMessages((current) => [...current, { role: "system", content: `Não foi possível sincronizar a pasta antes do pedido: ${error.message}` }]);
      }
      abortRef.current = null;
      setBusy(false);
      return;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
    if (controller.signal.aborted) {
      abortRef.current = null;
      setBusy(false);
      return;
    }

    const treeLines = flattenTree(currentTree).join("\n");
    const pendingSummary = pending.map((item) => `- ${item.type}: ${item.path}`).join("\n");
    const history = [...messages, { role: "user", content: text }];
    setMessages(history);
    scrollToBottom();

    let conversation = [
      { role: "system", content: buildAgentSystemPrompt(treeLines, pendingSummary) },
      ...history
        .filter((message) => message.role !== "system" || message.context === "tool")
        .map((message) => ({
          role: message.context === "tool" ? "user" : message.role,
          content: message.protocolContent ?? message.content,
        })),
    ];

    try {
      let awaitingFinalAnswer = false;
      for (let round = 0; round < MAX_AUTO_ROUNDS; round++) {
        if (controller.signal.aborted) break;
        const reply = await chatOnce(conversation, controller.signal);
        const actions = extractActions(reply);
        const actionBlockFound = hasActionBlock(reply);
        const strippedReply = stripActionBlocks(reply);
        const visibleText = actionBlockFound && actions.length === 0 && strippedReply === reply
          ? "Não consegui interpretar as ações desta resposta. Tente novamente pedindo uma ação por vez."
          : strippedReply || "(sem texto, apenas ações)";

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: visibleText, protocolContent: reply },
          ...(actionBlockFound && actions.length === 0
            ? [{ role: "system", content: "O formato do bloco de ação estava inválido; nenhuma ação foi executada." }]
            : []),
        ]);
        conversation.push({ role: "assistant", content: reply });
        scrollToBottom();

        const readOnly = actions.filter(isReadOnly);
        const writes = actions.filter((a) => !isReadOnly(a));

        writes.forEach(pushPending);

        if (readOnly.length === 0) {
          awaitingFinalAnswer = false;
          break;
        }

        awaitingFinalAnswer = round === MAX_AUTO_ROUNDS - 1;
        const results = [];
        for (const action of readOnly) {
          if (controller.signal.aborted) break;
          results.push(await runReadOnlyAction(action));
        }
        if (controller.signal.aborted) break;
        const toolText = `Resultado das ações solicitadas:\n\n${results.join("\n\n")}`;
        setMessages((prev) => [...prev, { role: "system", content: toolText, context: "tool" }]);
        conversation.push({ role: "user", content: toolText });
        scrollToBottom();
      }
      if (awaitingFinalAnswer) {
        conversation.push({ role: "user", content: "Você atingiu o limite de leituras automáticas. Use apenas os resultados recebidos e apresente uma conclusão; não solicite mais ações." });
        const finalReply = await chatOnce(conversation, controller.signal);
        const finalActions = extractActions(finalReply);
        finalActions.filter((action) => !isReadOnly(action)).forEach(pushPending);
        const finalStripped = stripActionBlocks(finalReply);
        const hasMoreReads = finalActions.some(isReadOnly);
        const invalidAction = hasActionBlock(finalReply) && finalActions.length === 0;
        const finalText = invalidAction && finalStripped === finalReply
          ? "A resposta final continha uma ação inválida, que não foi executada. Veja os resultados acima."
          : finalStripped || (hasMoreReads
            ? "A investigação atingiu o limite de leituras automáticas. Peça uma nova etapa para continuar."
            : "Concluí as leituras disponíveis. Veja os resultados acima.");
        setMessages((current) => [
          ...current,
          { role: "assistant", content: finalText, protocolContent: finalReply },
          ...(invalidAction
            ? [{ role: "system", content: "O formato do bloco de ação estava inválido; nenhuma ação foi executada." }]
            : []),
        ]);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Erro ao falar com a IA: ${err.message}` },
        ]);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!isSupported()) {
    return (
      <div className="empty-hint" style={{ margin: "auto" }}>
        Seu navegador não suporta a File System Access API. Use Chrome, Edge,
        Opera ou Brave para o modo Agent Coding.
      </div>
    );
  }

  return (
    <div className="split">
      <div className="files-col">
        <div className="files-header">
          <div className="column-heading">
            <span className="section-kicker">WORKSPACE</span>
            <h2>Arquivos do projeto</h2>
          </div>
          <button className="pick-folder-btn" onClick={handlePickFolder} disabled={busy || syncing || applying}>
            <span aria-hidden="true">＋</span> {rootHandle ? rootHandle.name : "Selecionar pasta"}
          </button>
          {rootHandle && (
            <div className={`folder-sync-status ${syncing ? "syncing" : ""}`}>
              <span className="folder-sync-dot" />
              <span>{syncing ? "Lendo alterações da pasta…" : "Pasta conectada"}</span>
              <button className="refresh-tree-btn" onClick={refreshTree} disabled={syncing || applying || busy} title="Sincronizar arquivos e prévia">
                ↻
              </button>
            </div>
          )}
        </div>
        <FileTree tree={tree} activePath={activePath} onSelectFile={handleSelectFile} />
        {activePath && (
          <div className="file-preview">
            <div className="file-preview-heading">
              <span className="file-preview-name" title={activePath}>{activePath}</span>
              <span>{activeContent.split("\n").length} linhas</span>
            </div>
            <pre>{activeContent}</pre>
          </div>
        )}
      </div>

      <div className="chat-col">
        <div className="messages" ref={scrollRef}>
          {!rootHandle && (
            <div className="agent-welcome">
              <div className="welcome-orb" aria-hidden="true"><span>⌘</span></div>
              <span className="section-kicker">AGENTE DE DESENVOLVIMENTO</span>
              <h2>Seu próximo projeto,<br />em boas mãos.</h2>
              <p>Escolha uma pasta para começar. A IA analisa seus arquivos e propõe alterações para sua aprovação.</p>
              <button className="pick-folder-btn welcome-folder-btn" onClick={handlePickFolder} disabled={busy || syncing || applying}>＋ Selecionar pasta do projeto</button>
              <span className="agent-privacy-note">Seus arquivos permanecem no dispositivo.</span>
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
            placeholder={
              rootHandle
                ? "Peça uma alteração no projeto..."
                : "Selecione uma pasta primeiro"
            }
            disabled={!rootHandle || busy || syncing || applying}
          />
          {busy ? (
            <button className="stop-btn" onClick={() => abortRef.current?.abort()} aria-label="Interromper execução">
              <span className="stop-square" /> Parar
            </button>
          ) : (
            <button className="send-btn" onClick={handleSend} disabled={!input.trim() || !rootHandle}>
              <span>Enviar</span><span className="send-arrow">↑</span>
            </button>
          )}
        </div>
      </div>

      <div className="pending-col">
        <div className="pending-header">
          <div><span className="section-kicker">REVISÃO</span><h2>Mudanças</h2></div>
          <span className="pending-count">{pending.length}</span>
        </div>
        <div className="pending-list">
          {pending.length === 0 && (
            <div className="pending-empty">
              <span className="pending-empty-icon" aria-hidden="true">✓</span>
              <strong>{rootHandle ? "Nenhuma revisão pendente" : "Tudo em dia"}</strong>
              <span>{rootHandle ? "As mudanças propostas ficam aqui até você aplicar ou rejeitar." : "As alterações propostas pela IA aparecerão aqui para revisão antes de serem aplicadas."}</span>
            </div>
          )}
          {pending.map((item) => (
            <div key={item.id} className="pending-item">
              <span className={`action-tag ${item.type}`}>{item.type}</span>
              <div className="path">{item.path}</div>
              {item.type !== "delete_file" && (
                <pre className="pending-preview">{item.content}</pre>
              )}
              <div className="pending-actions">
                <button className="apply" onClick={() => applyPending(item)} disabled={applying || syncing || busy}>
                  {applying ? "Aplicando…" : "Aplicar"}
                </button>
                <button className="reject" onClick={() => rejectPending(item)} disabled={applying || syncing || busy}>
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
