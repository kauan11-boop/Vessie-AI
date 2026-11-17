// DS-BOX — Script Lab: detecção de gênero de script e execução/preview.
// Gêneros: web (iframe), js (sandbox worker), sh (Bash-86X), py (Pyodide via CDN),
// markdown (render), json (pretty), svg/imagem (inline), texto (com números de linha).

import { vfs, genreOf, normalizePath, type VfsFile } from "./vfs";
import { runBash86, defaultShellEnv } from "./bash86";
import { createSandbox, type SandboxHandle } from "../sandbox";

export type RunMode = "iframe" | "worker" | "bash86" | "pyodide" | "render" | "pretty" | "inline" | "raw";

export interface GenreInfo {
  genre: ReturnType<typeof genreOf>;
  mode: RunMode;
  label: string;
  runnable: boolean;
  note?: string;
}

export function detectGenre(path: string): GenreInfo {
  const genre = genreOf(path);
  switch (genre) {
    case "web": return { genre, mode: "iframe", label: "HTML · preview iframe", runnable: true };
    case "style": return { genre, mode: "iframe", label: "CSS · preview iframe", runnable: true, note: "CSS é aplicado num esqueleto HTML" };
    case "script": return { genre, mode: "worker", label: "JS · sandbox worker", runnable: true, note: "globals anulados, timeout 10s" };
    case "shell": return { genre, mode: "bash86", label: "Shell · Bash-86X", runnable: true };
    case "python": return { genre, mode: "pyodide", label: "Python · Pyodide (CDN)", runnable: true, note: "baixa ~10 MB do CDN na primeira execução" };
    case "markdown": return { genre, mode: "render", label: "Markdown · renderizado", runnable: false };
    case "config": return { genre, mode: "pretty", label: "JSON/Config · formatado", runnable: false };
    case "image": return { genre, mode: "inline", label: "Imagem · inline", runnable: false };
    default: return { genre, mode: "raw", label: "Texto · cru", runnable: false };
  }
}

// ---------- bundling de projetos web multi-arquivo ----------
/** Resolve <link>, <script src> e url() do VFS e devolve um HTML único para iframe srcdoc. */
export function bundleWeb(entryPath: string, cssCandidates?: string[]): string {
  const entry = entryPath.endsWith(".html")
    ? entryPath
    : (vfs.exists(entryPath + "/index.html") ? entryPath + "/index.html" : null);
  let html = entry ? vfs.read(entry) ?? "" : null;
  if (html === null) {
    // CSS puro → esqueleto demo
    const css = cssCandidates?.map(p => vfs.read(p) ?? "").filter(Boolean).join("\n") ?? "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div class="dsbox-css-demo"><h1>DS-BOX · CSS Demo</h1><p>Arquivo: ${entryPath}</p>
<button>Botão</button> <a href="#">Link</a><ul><li>item 1</li><li>item 2</li></ul></div></body></html>`;
  }
  const baseDir = entry!.includes("/") ? entry!.slice(0, entry!.lastIndexOf("/")) : "";
  const resolveRef = (ref: string): string | null => {
    if (/^(https?:)?\/\//i.test(ref) || ref.startsWith("data:")) return null;
    const clean = ref.replace(/^\.\//, "").replace(/^\//, "");
    const candidates = [
      normalizePath(baseDir ? baseDir + "/" + clean : clean),
      normalizePath(clean),
    ];
    for (const c of candidates) if (vfs.exists(c)) return c;
    return null;
  };
  // <link rel=stylesheet href=...>
  html = html.replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, (m, href: string) => {
    if (!/stylesheet/i.test(m)) return m;
    const p = resolveRef(href);
    if (!p) return m;
    return `<style data-src="${p}">\n${vfs.read(p)}\n</style>`;
  });
  // <script src=...>
  html = html.replace(/<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (m, src: string) => {
    const p = resolveRef(src);
    if (!p) return m;
    return `<script data-src="${p}">\n${vfs.read(p)}\n<\/script>`;
  });
  // <img src=...> → só embute se o conteúdo for svg (texto)
  html = html.replace(/<img[^>]+src=["']([^"']+\.svg)["'][^>]*>/gi, (m, src: string) => {
    const p = resolveRef(src);
    if (!p) return m;
    const svg = vfs.read(p) ?? "";
    const dataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    return m.replace(src, dataUri);
  });
  return html;
}

// ---------- executores ----------
let jsSandbox: SandboxHandle | null = null;
const sysKv = new Map<string, string>();

export async function runJs(path: string, input?: Record<string, unknown>): Promise<string> {
  const code = vfs.read(path);
  if (code === null) throw new Error(`arquivo ausente: ${path}`);
  if (!jsSandbox) {
    jsSandbox = createSandbox(async (op, args) => {
      // ponte RPC: o sandbox enxerga o VFS do DS-BOX e um KV próprio
      switch (op) {
        case "mem.putFile": return vfs.write(String(args?.[0]), String(args?.[1] ?? "")) === null;
        case "mem.getFile": return vfs.read(String(args?.[0]));
        case "mem.listFiles": return vfs.paths();
        case "mem.deleteFile": return vfs.rm(String(args?.[0]));
        case "sys.get": return sysKv.get(String(args?.[0])) ?? null;
        case "sys.set": sysKv.set(String(args?.[0]), String(args?.[1] ?? "")); return true;
        default: return null;
      }
    });
  }
  return jsSandbox.run(code, input);
}

export function disposeJsSandbox(): void {
  jsSandbox?.dispose();
  jsSandbox = null;
}

export async function runShell(path: string): Promise<string> {
  const content = vfs.read(path);
  if (content === null) throw new Error(`arquivo ausente: ${path}`);
  const env = defaultShellEnv();
  const lines = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const out: string[] = [];
  for (const line of lines) {
    const r = await runBash86(line, env);
    if (r.output && r.output !== "\u0000CLEAR") out.push(`$ ${line}\n${r.output}`);
    if (r.code !== 0) out.push(`exit ${r.code}`);
    env.cwd = r.cwd;
  }
  return out.join("\n") || "(sem saída)";
}

// Pyodide (carregamento lazy via CDN)
interface PyodideApi { runPythonAsync: (code: string) => Promise<unknown>; setStdout: (cb: (s: string) => void) => void; setStderr: (cb: (s: string) => void) => void }
let pyodidePromise: Promise<PyodideApi> | null = null;

export function pyodideStatus(): "not-loaded" | "loading" | "ready" {
  if (pyodidePromise === null) return "not-loaded";
  return "loading";
}

export async function loadPyodide(): Promise<PyodideApi> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js";
      s.onload = () => resolve();
      s.onerror = () => { pyodidePromise = null; reject(new Error("CDN do Pyodide inacessível")); };
      document.head.appendChild(s);
    });
    const factory = (window as unknown as Record<string, unknown>).loadPyodide as (o: Record<string, unknown>) => Promise<PyodideApi>;
    if (!factory) throw new Error("Pyodide não disponível");
    return factory({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/" });
  })();
  return pyodidePromise;
}

export async function runPython(path: string, onProgress?: (msg: string) => void): Promise<string> {
  const code = vfs.read(path);
  if (code === null) throw new Error(`arquivo ausente: ${path}`);
  onProgress?.("carregando Pyodide (CDN, ~10 MB na 1ª vez)…");
  const py = await loadPyodide();
  const out: string[] = [];
  // Pyodide ≥0.25 exige o formato objeto {batched} — a forma função não captura
  py.setStdout({ batched: (s: string) => out.push(s) } as never);
  py.setStderr({ batched: (s: string) => out.push(`[stderr] ${s}`) } as never);
  onProgress?.("executando python…");
  await py.runPythonAsync(code);
  return out.join("\n") || "(sem saída)";
}

// ---------- markdown / json / imagem ----------
export function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content; // não-JSON → mostra cru
  }
}

export function imageSrc(path: string, content: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "svg") {
    if (/<svg[\s>]/i.test(content)) return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(content)))}`;
    return null;
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "ico"].includes(ext ?? "") && /^data:image\//i.test(content)) {
    return content;
  }
  return null;
}

/** Encontra o melhor entrypoint de preview de um conjunto de arquivos. */
export function pickEntry(files: VfsFile[]): string | null {
  const web = files.find(f => genreOf(f.path) === "web");
  if (web) return web.path;
  const md = files.find(f => f.path.toLowerCase().endsWith("readme.md"));
  if (md) return md.path;
  return files[0]?.path ?? null;
}
