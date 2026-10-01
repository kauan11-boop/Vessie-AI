const IGNORED = new Set([".git", "node_modules", "dist", "build", ".vite", ".DS_Store"]);

export function isSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function isCrossOriginEmbedded() {
  if (typeof window === "undefined" || window.self === window.top) return false;
  try {
    return window.parent.location.origin !== window.location.origin;
  } catch {
    return true;
  }
}

export async function ensurePermission(handle, mode = "read", request = false) {
  if (!handle.queryPermission) return;
  const options = { mode };
  const permission = request && handle.requestPermission
    ? await handle.requestPermission(options)
    : await handle.queryPermission(options);
  if (permission !== "granted") {
    throw new Error(mode === "readwrite"
      ? "A pasta não autorizou escrita. Tente conceder acesso novamente."
      : "A pasta não autorizou leitura. Selecione-a novamente para conceder acesso.");
  }
}

function pathSegments(path, { allowRoot = false, allowTrailingSlash = false } = {}) {
  if (typeof path !== "string") throw new Error("O caminho precisa ser texto relativo à pasta selecionada.");
  const normalized = path.replaceAll("\\", "/");
  if (allowRoot && (normalized === "" || normalized === ".")) return [];
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || normalized.includes("\0")) {
    throw new Error("Use um caminho relativo à pasta selecionada.");
  }
  const segments = normalized.split("/");
  if (allowTrailingSlash && segments.at(-1) === "") segments.pop();
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("O caminho contém uma pasta inválida. Não use segmentos . ou ...");
  }
  return segments;
}

async function walkTo(dirHandle, segments, { create = false } = {}) {
  let current = dirHandle;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
}

async function getFileLocation(rootHandle, path, options) {
  const segments = pathSegments(path, options);
  const fileName = segments.pop();
  const directory = await walkTo(rootHandle, segments, { create: options.createDirectories === true });
  return { directory, fileName };
}

async function writeContent(fileHandle, content) {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

export async function pickDirectory() {
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await ensurePermission(handle, "read");
  return handle;
}

export async function buildTree(dirHandle, path = "", depth = 0, maxDepth = 8) {
  if (depth === 0) await ensurePermission(dirHandle, "read");
  const node = { name: dirHandle.name, path, kind: "directory", children: [] };
  if (depth >= maxDepth) return node;

  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (!IGNORED.has(name)) entries.push([name, handle]);
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

export function flattenTree(node, lines = [], prefix = "") {
  for (const child of node?.children ?? []) {
    if (child.kind === "directory") {
      lines.push(`${prefix}${child.name}/`);
      flattenTree(child, lines, `${prefix}  `);
    } else {
      lines.push(`${prefix}${child.name}`);
    }
  }
  return lines;
}

export async function readFile(rootHandle, path) {
  await ensurePermission(rootHandle, "read");
  const { directory, fileName } = await getFileLocation(rootHandle, path, { allowRoot: false });
  const fileHandle = await directory.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

export async function writeFile(rootHandle, path, content) {
  await ensurePermission(rootHandle, "readwrite");
  if (typeof content !== "string") throw new Error("O conteúdo do arquivo precisa ser texto.");
  const { directory, fileName } = await getFileLocation(rootHandle, path, { allowRoot: false });
  const fileHandle = await directory.getFileHandle(fileName);
  await writeContent(fileHandle, content);
}

export async function createFile(rootHandle, path, content) {
  await ensurePermission(rootHandle, "readwrite");
  if (typeof content !== "string") throw new Error("O conteúdo do arquivo precisa ser texto.");
  const { directory, fileName } = await getFileLocation(rootHandle, path, { allowRoot: false, createDirectories: true });
  let fileHandle;
  try {
    await directory.getFileHandle(fileName);
    throw new Error(`O arquivo "${path}" já existe. Use write_file para editá-lo.`);
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
    fileHandle = await directory.getFileHandle(fileName, { create: true });
  }
  await writeContent(fileHandle, content);
}

export async function deleteFile(rootHandle, path) {
  await ensurePermission(rootHandle, "readwrite");
  const { directory, fileName } = await getFileLocation(rootHandle, path, { allowRoot: false });
  await directory.getFileHandle(fileName);
  await directory.removeEntry(fileName);
}

export async function listDir(rootHandle, path = "") {
  await ensurePermission(rootHandle, "read");
  const segments = pathSegments(path, { allowRoot: true, allowTrailingSlash: true });
  const directory = await walkTo(rootHandle, segments);
  const entries = [];
  for await (const [name, handle] of directory.entries()) {
    if (!IGNORED.has(name)) entries.push(`${handle.kind === "directory" ? "📁" : "📄"} ${name}`);
  }
  return entries.sort().join("\n") || "(pasta vazia)";
}
