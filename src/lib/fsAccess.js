// Camada fina sobre a File System Access API do navegador. Só funciona em
// navegadores baseados em Chromium (Chrome, Edge, Opera, Brave). O handle da
// pasta não é persistido entre sessões — o usuário seleciona a pasta de novo
// a cada recarga da página (limite da própria API do navegador).

export function isSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

const IGNORED = new Set([".git", "node_modules", "dist", "build", ".vite", ".DS_Store"]);

export async function pickDirectory() {
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  return handle;
}

/** Monta uma árvore { name, path, kind, children } a partir do handle raiz. */
export async function buildTree(dirHandle, path = "", depth = 0, maxDepth = 8) {
  const node = { name: dirHandle.name, path, kind: "directory", children: [] };
  if (depth >= maxDepth) return node;

  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (IGNORED.has(name)) continue;
    entries.push([name, handle]);
  }
  entries.sort((a, b) => {
    if (a[1].kind !== b[1].kind) return a[1].kind === "directory" ? -1 : 1;
    return a[0].localeCompare(b[0]);
  });

  for (const [name, handle] of entries) {
    const childPath = path ? `${path}/${name}` : name;
    if (handle.kind === "directory") {
      node.children.push(await buildTree(handle, childPath, depth + 1, maxDepth));
    } else {
      node.children.push({ name, path: childPath, kind: "file" });
    }
  }
  return node;
}

/** Retorna uma listagem plana "curta" (para dar contexto rápido à IA). */
export function flattenTree(node, lines = [], prefix = "") {
  for (const child of node.children ?? []) {
    if (child.kind === "directory") {
      lines.push(`${prefix}${child.name}/`);
      flattenTree(child, lines, prefix + "  ");
    } else {
      lines.push(`${prefix}${child.name}`);
    }
  }
  return lines;
}

async function walkTo(dirHandle, segments, { create = false } = {}) {
  let current = dirHandle;
  for (const seg of segments) {
    current = await current.getDirectoryHandle(seg, { create });
  }
  return current;
}

export async function readFile(rootHandle, path) {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  const dirHandle = await walkTo(rootHandle, parts);
  const fileHandle = await dirHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return await file.text();
}

export async function writeFile(rootHandle, path, content) {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  const dirHandle = await walkTo(rootHandle, parts, { create: true });
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content ?? "");
  await writable.close();
}

export async function deleteFile(rootHandle, path) {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  const dirHandle = await walkTo(rootHandle, parts);
  await dirHandle.removeEntry(fileName);
}

/** Lista o conteúdo de uma pasta em um nível só (usado pela ação list_dir da IA). */
export async function listDir(rootHandle, path) {
  const parts = (path || "").split("/").filter(Boolean);
  const dirHandle = await walkTo(rootHandle, parts);
  const out = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (IGNORED.has(name)) continue;
    out.push(`${handle.kind === "directory" ? "📁" : "📄"} ${name}`);
  }
  return out.sort().join("\n") || "(pasta vazia)";
}

export async function fileExists(rootHandle, path) {
  try {
    await readFile(rootHandle, path);
    return true;
  } catch {
    return false;
  }
}
