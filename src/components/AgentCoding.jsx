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
  const [pending, setPending] = useState([]); // { id, type, path, content }
  const scrollRef = useRef(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  async function handlePickFolder() {
    try {
      const handle = await pickDirectory();
      setRootHandle(handle);
      const t = await buildTree(handle);
      setTree(t);
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
      if (activePath === item.path) await handleSelectFile(item.path);
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

    try {
      for (let round = 0; round < MAX_AUTO_ROUNDS; round++) {
        const reply = await chatOnce(conversation);
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
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `⚠️ Erro ao falar com a IA: ${err.message}` },
      ]);
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
          <button className="pick-folder-btn" onClick={handlePickFolder}>
            {rootHandle ? `📂 ${rootHandle.name}` : "Selecionar pasta do projeto"}
          </button>
          {rootHandle && (
            <button className="ghost-btn" onClick={refreshTree}>
              🔄 Atualizar árvore
            </button>
          )}
        </div>
        <FileTree tree={tree} activePath={activePath} onSelectFile={handleSelectFile} />
        {activePath && (
          <div style={{ borderTop: "1px solid var(--border)", padding: 10, maxHeight: 200, overflow: "auto" }}>
            <div className="hint-small" style={{ marginBottom: 6 }}>{activePath}</div>
            <pre style={{ fontSize: 11, margin: 0, whiteSpace: "pre-wrap" }}>{activeContent}</pre>
          </div>
        )}
      </div>

      <div className="chat-col">
        <div className="messages" ref={scrollRef}>
          {!rootHandle && (
            <div className="empty-hint">
              Selecione uma pasta do seu computador para a IA poder ler e
              editar os arquivos dela.
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
          <button className="send-btn" onClick={handleSend} disabled={busy || !input.trim() || !rootHandle}>
            {busy ? "..." : "Enviar"}
          </button>
        </div>
      </div>

      <div className="pending-col">
        <div className="pending-header">
          <span>Mudanças pendentes</span>
          <span>{pending.length}</span>
        </div>
        <div className="pending-list">
          {pending.length === 0 && (
            <div className="empty-hint">
              Quando a IA propor criar, editar ou apagar um arquivo, a
              mudança aparece aqui para você aprovar.
            </div>
          )}
          {pending.map((item) => (
            <div key={item.id} className="pending-item">
              <span className={`action-tag ${item.type}`}>{item.type}</span>
              <div className="path">{item.path}</div>
              {item.type !== "delete_file" && (
                <pre>{item.content}</pre>
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
