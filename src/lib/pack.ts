// Vessie AI — empacotador ZIP do chat (📦) — extrai blocos ```lang:arquivo``` do chat + Memory
import { zipSync, strToU8 } from "fflate";
import { toast } from "sonner";
import { useChat, chatActions } from "./store";
import { raw as memoryRaw } from "./memory";
import { t } from "./i18n";

function achatName(name: string, used: Set<string>): string {
  let out = name.replace(/^\/+|\/+$/g, "").replace(/\.\./g, "_") || "arquivo";
  let i = 2;
  while (used.has(out)) {
    const dot = out.lastIndexOf(".");
    out = dot > 0 ? `${out.slice(0, dot)}(${i})${out.slice(dot)}` : `${out}(${i})`;
    i++;
  }
  used.add(out);
  return out;
}

/** Extrai blocos nomeados de toda a conversa + arquivos do Memory e gera ZIP real. */
export async function packChatZip(convId: string, packName: string): Promise<void> {
  const conv = useChat.getState().conversations.find(c => c.id === convId);
  if (!conv) return;

  const files: Record<string, string> = {};
  const used = new Set<string>();

  // blocos ```lang:arquivo``` do chat
  const re = /```([a-zA-Z0-9_\- ]+):([^\n]+)\n([\s\S]*?)```/g;
  for (const m of conv.messages) {
    let match: RegExpExecArray | null;
    const r = new RegExp(re.source, "g");
    while ((match = r.exec(m.content))) {
      const name = match[2].trim();
      const code = match[3];
      if (!name || code.trim().length === 0) continue;
      if (/^(memory|mem|sys|image|pack|edit)/.test(match[1].trim())) continue;
      files[achatName(name, used)] = code.replace(/\n$/, "");
    }
  }

  // arquivos do Memory (exclui auto/ e simulite/)
  for (const [p, f] of Object.entries(memoryRaw().files)) {
    if (p.startsWith("auto/") || p.startsWith("simulite/")) continue;
    files[achatName(p, used)] = f.content;
  }

  if (Object.keys(files).length === 0) {
    toast(t("en", "packEmpty"));
    return;
  }

  // index.html de menu
  const list = Object.keys(files).map(n => `<li><a href="${n}">${n}</a></li>`).join("\n");
  files["index.html"] = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${packName}</title>
<h1>${packName}</h1><p>Pacote gerado pela Vessie-AI. Arquivos inclusos:</p><ul>${list}</ul>`;
  files["README.txt"] = `${packName} — pacote gerado pela Vessie-AI

Como abrir: extraia o ZIP e dê duplo clique no index.html.`;

  const packed = zipSync(
    Object.fromEntries(Object.entries(files).map(([n, c]) => [n, strToU8(c)])),
    { level: 6 }
  );
  const blob = new Blob([packed as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${packName}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  toast(t("en", "packDone", packName, String(Object.keys(files).length)));
  chatActions.addMessage(convId, {
    id: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    content: `📦 **${packName}.zip** gerado com ${Object.keys(files).length} arquivo(s).`,
    createdAt: Date.now(),
    finished: true,
  });
}
