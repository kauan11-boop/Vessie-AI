import React, { useRef, useState } from "react";
import Message from "./Message.jsx";
import FileTree from "./FileTree.jsx";
import { chatOnce } from "../lib/aiClient.js";
import { buildAgentSystemPrompt } from "../lib/systemPrompts.js";
import {
  isSupported,
  pickDirectory,
  buildTree,
  flattenTree,
  readFile,
  writeFile,
  deleteFile,
  listDir,
} from "../lib/fsAccess.js";
import { extractActions, isReadOnly, stripActionBlocks } from "../lib/agentProtocol.js";

const MAX_AUTO_ROUNDS = 3;

export default function AgentCoding() {
  const [rootHandle, setRootHandle] = useState(null);
  const [tree, setTree] = useState(null);
  const [activePath, setActivePath] = useState(null);
  const [activeContent, setActiveContent] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  async function handlePickFolder() {
    if (pending.length && !window.confirm("Trocar de pasta descartará as mudanças pendentes. Deseja continuar?")) return;
    try {
      const handle = await pickDirectory();
      const t = await buildTree(handle);
      setRootHandle(handle);
      setTree(t);
      setActivePath(null);
      setActiveContent("");
      setPending([]);
      setMessages([
        {
          role: "system",
          content: `📂 Pasta "${handle.name}" selecionada. A IA já pode listar e editar os arquivos dela.`,
        },
      ]);
    } catch (err) {
      if (err?.name !== "AbortError") {
        alert(`Não foi possível abrir a pasta: ${err.message}`);
      }
    }
  }

  async function handleSelectFile(path) {
    setActivePath(path);
    try {
      const content = await readFile(rootHandle, path);
      setActiveContent(content);
    } catch (err) {
      setActiveContent(`Não foi possível ler o arquivo: ${err.message}`);
    }
  }

  async function refreshTree() {
    if (!rootHandle) return;
    const t = await buildTree(rootHandle);
    setTree(t);
  }

  function pushPending(action) {
    setPending((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: action.type, path: action.path, content: action.content ?? "" },
    ]);
  }

  async function applyPending(item) {
    try {
      if (item.type === "write_file" || item.type === "create_file") {
        await writeFile(rootHandle, item.path, item.content);
      } else if (item.type === "delete_file") {
        await deleteFile(rootHandle, item.path);
      }
      setPending((prev) => prev.filter((p) => p.id !== item.id));
      await refreshTree();
      if (activePath === item.path && item.type === "delete_file") {
        setActivePath(null);
        setActiveContent("");
      } else if (activePath === item.path) {
        await handleSelectFile(item.path);
      }
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `✅ Aplicado: ${item.type} → ${item.path}` },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `⚠️ Falha ao aplicar ${item.path}: ${err.message}` },
      ]);
    }
  }

  function rejectPending(item) {
    setPending((prev) => prev.filter((p) => p.id !== item.id));
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
    if (!text || busy || !rootHandle) return;
    setInput("");
    setBusy(true);

    const treeLines = flattenTree(tree).join("\n");
    const history = [...messages, { role: "user", content: text }];
    setMessages(history);
    scrollToBottom();

    let conversation = [
      { role: "system", content: buildAgentSystemPrompt(treeLines) },
      ...history.filter((m) => m.role !== "system"),
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for (let round = 0; round < MAX_AUTO_ROUNDS; round++) {
        const reply = await chatOnce(conversation, controller.signal);
        const actions = extractActions(reply);
        const visibleText = stripActionBlocks(reply) || "(sem texto, apenas ações)";

        setMessages((prev) => [...prev, { role: "assistant", content: visibleText }]);
        conversation.push({ role: "assistant", content: reply });
        scrollToBottom();

        const readOnly = actions.filter(isReadOnly);
        const writes = actions.filter((a) => !isReadOnly(a));

        writes.forEach(pushPending);

        if (readOnly.length === 0) break; // nada mais para a IA investigar agora

        const results = [];
        for (const action of readOnly) {
          results.push(await runReadOnlyAction(action));
        }
        const toolText = `Resultado das ações solicitadas:\n\n${results.join("\n\n")}`;
        setMessages((prev) => [...prev, { role: "system", content: toolText }]);
        conversation.push({ role: "user", content: toolText });
        scrollToBottom();
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
          <button className="pick-folder-btn" onClick={handlePickFolder} disabled={busy}>
            <span aria-hidden="true">＋</span> {rootHandle ? rootHandle.name : "Selecionar pasta"}
          </button>
          {rootHandle && (
            <button className="refresh-tree-btn" onClick={refreshTree}>
              <span aria-hidden="true">↻</span> Atualizar arquivos
            </button>
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
              <button className="pick-folder-btn welcome-folder-btn" onClick={handlePickFolder}>＋ Selecionar pasta do projeto</button>
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
            disabled={!rootHandle}
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
              <strong>Tudo em dia</strong>
              <span>As alterações propostas pela IA aparecerão aqui para revisão antes de serem aplicadas.</span>
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
                <button className="apply" onClick={() => applyPending(item)}>
                  Aplicar
                </button>
                <button className="reject" onClick={() => rejectPending(item)}>
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
