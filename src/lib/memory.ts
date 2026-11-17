// Vessie AI — sistema Memory (pasta virtual) — contrato vessie-memory-v2 (B.6)
// 8 coleções + logs; safePath bloqueia traversal; ZIP via fflate (DEFLATE, compatível com STORE);
// triggers, scripts, contents, skills, plugins, MCPs, APIs; handleAiText intercepta blocos especiais.
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type {
  MemoryData, MemFile, MemReport, BlockResult, MemTrigger,
} from "./types";
import { parseMem, executeParsed } from "./mem-parser";
import { createSandbox, type SandboxHandle } from "./sandbox";

export const MEMORY_KEY = "vessie-memory-v2";
const LOG_MAX = 300;
const AUTO_DIR = "auto";

function emptyMemory(): MemoryData {
  return { files: {}, triggers: {}, scripts: {}, contents: {}, skills: {}, plugins: {}, mcps: {}, apis: {}, logs: [] };
}

function safePath(p: string): string {
  const norm = String(p).replace(/\\/g, "/").replace(/^\/+/, "");
  if (norm.includes("..") || norm.length === 0) throw new Error(`caminho inseguro: "${p}"`);
  return norm;
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---------- listeners para React ----------
type Listener = () => void;
const listeners = new Set<Listener>();
let memVersion = 0;
export function onMemoryChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getMemoryVersion(): number {
  return memVersion;
}
function notify() { memVersion++; listeners.forEach(l => l()); }

// ---------- estado ----------
let S: MemoryData = emptyMemory();

export function loadMemory(): MemoryData {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MemoryData>;
      S = { ...emptyMemory(), ...parsed, logs: parsed.logs ?? [] };
    }
  } catch { S = emptyMemory(); }
  ensureSystemAPIs();
  notify();
  return S;
}

function persist(): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(S));
  } catch { /* quota */ }
  notify();
}

function log(msg: string, type = "info"): void {
  S.logs.push({ msg, type, t: Date.now() });
  if (S.logs.length > LOG_MAX) S.logs = S.logs.slice(-LOG_MAX);
}

/** Garante as APIs seed (contrato original). */
function ensureSystemAPIs(): void {
  if (!S.apis["pollinations-image"]) {
    S.apis["pollinations-image"] = { url: "https://image.pollinations.ai/prompt/", description: "Geração de imagens gratuita (usada pela Vessie-AI)", enabled: true, updated: Date.now() };
  }
  if (!S.apis["vessie-system"]) {
    S.apis["vessie-system"] = { url: "local://system-api", description: "API local do sistema (localStorage)", enabled: true, updated: Date.now() };
  }
}

// ---------- arquivos ----------
export function putFile(path: string, content: string, meta?: Partial<MemFile>): MemFile {
  const p = safePath(path);
  const rec: MemFile = {
    content,
    type: meta?.type ?? "text",
    author: meta?.author ?? "user",
    updated: Date.now(),
  };
  S.files[p] = rec;
  log(`arquivo salvo: ${p}`);
  persist();
  return rec;
}

export function getFile(path: string): MemFile | null {
  return S.files[safePath(path)] ?? null;
}

export function deleteFile(path: string): boolean {
  const p = safePath(path);
  if (!(p in S.files)) return false;
  delete S.files[p];
  log(`arquivo removido: ${p}`, "warn");
  persist();
  return true;
}

export function listFiles(): Array<{ path: string; size: number; author: string }> {
  return Object.entries(S.files)
    .map(([path, f]) => ({ path, size: f.content.length, author: f.author }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// ---------- triggers ----------
export function addTrigger(name: string, cfg: Partial<MemTrigger> & { pattern: string; action: string }): MemTrigger {
  const t: MemTrigger = {
    pattern: cfg.pattern,
    action: cfg.action,
    script: cfg.script ?? "",
    category: cfg.category ?? "geral",
    description: cfg.description ?? "",
    api: cfg.api ?? "",
    enabled: cfg.enabled ?? true,
    updated: Date.now(),
  };
  S.triggers[name] = t;
  log(`trigger "${name}" criado (quando contém "${t.pattern}" → ${t.action})`);
  persist();
  return t;
}

export function removeTrigger(name: string): boolean {
  if (!(name in S.triggers)) return false;
  delete S.triggers[name];
  persist();
  return true;
}

export function setTriggerEnabled(name: string, enabled: boolean): boolean {
  if (!(name in S.triggers)) return false;
  S.triggers[name].enabled = enabled;
  S.triggers[name].updated = Date.now();
  persist();
  return true;
}

/** Executa a ação de um trigger. Ações válidas: save, save-code, notify, run:script, append:arquivo. */
async function runAction(action: string, text: string): Promise<string> {
  const ts = Date.now();
  if (action === "save-code") {
    const re = /```([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(text))) {
      if (m[1].trim()) {
        putFile(`${AUTO_DIR}/code-${ts}-${++n}.txt`, m[1].trim(), { author: "trigger" });
      }
    }
    return `${n} bloco(s) de código salvos`;
  }
  if (action === "save") {
    putFile(`${AUTO_DIR}/msg-${ts}.txt`, text, { author: "trigger" });
    return "mensagem salva";
  }
  if (action.startsWith("run:")) {
    const name = action.slice(4);
    return `script "${name}": ${await runScript(name, { text })}`;
  }
  if (action.startsWith("append:")) {
    const file = action.slice(7);
    const existing = S.files[file]?.content ?? "";
    putFile(file, `${existing}\n${text}`.trim(), { author: "trigger" });
    return `anexado a ${file}`;
  }
  // notify (default)
  return `trigger notificou: ${text.slice(0, 80)}`;
}

/** Dispara todos os triggers habilitados cujo padrão aparece no texto. */
export async function fireTriggers(text: string): Promise<string[]> {
  const results: string[] = [];
  for (const [name, t] of Object.entries(S.triggers)) {
    if (!t.enabled) continue;
    if (t.category === "api") {
      // categoria api: fetch da URL e salva resposta truncada (20 KB)
      if (t.api && /^https?:\/\//i.test(t.api)) {
        fetch(t.api)
          .then(r => r.text())
          .then(body => putFile(`${AUTO_DIR}/trigger-${name}-${Date.now()}.txt`, body.slice(0, 20000), { author: "trigger-api" }))
          .catch(() => log(`trigger api "${name}" falhou`, "warn"));
        results.push(`${name}: consulta api agendada`);
      }
      continue;
    }
    if (text.includes(t.pattern)) {
      try {
        const r = await runAction(t.action, text);
        results.push(`${name}: ${r}`);
      } catch (e) {
        results.push(`${name}: erro — ${(e as Error).message}`);
      }
    }
  }
  return results;
}

// ---------- scripts / contents ----------
export function addScript(name: string, code: string, opts?: { lang?: string; desc?: string; enabled?: boolean }): void {
  S.scripts[name] = { code, lang: opts?.lang ?? "js", desc: opts?.desc ?? "", enabled: opts?.enabled ?? true, updated: Date.now() };
  persist();
}
export function removeScript(name: string): boolean {
  if (!(name in S.scripts)) return false;
  delete S.scripts[name];
  persist();
  return true;
}
export function setScriptEnabled(name: string, enabled: boolean): boolean {
  if (!(name in S.scripts)) return false;
  S.scripts[name].enabled = enabled;
  S.scripts[name].updated = Date.now();
  persist();
  return true;
}

export function runScript(name: string, input?: Record<string, unknown>): Promise<string> {
  const s = S.scripts[name];
  if (!s) return Promise.reject(new Error(`script "${name}" não existe`));
  if (!s.enabled) return Promise.reject(new Error(`script "${name}" está desativado`));
  if (s.lang === "mem") {
    return applyMem(s.code).then(rep => `.mem: ${rep.files.length} arquivos, ${rep.triggers.length} triggers, ${rep.scripts.length} scripts`);
  }
  return runJSAsync(s.code, input);
}

export function addContent(cat: string, text: string): void {
  const c = cat || "geral";
  if (!S.contents[c]) S.contents[c] = [];
  S.contents[c].push({ text, t: Date.now() });
  persist();
}
export function getContent(cat: string): MemContentList {
  return S.contents[cat] ?? [];
}
type MemContentList = Array<{ text: string; t: number }>;

// ---------- skills / plugins / MCPs / APIs ----------
export function addSkill(name: string, description: string, prompt: string, enabled = true): void {
  S.skills[name] = { description, prompt, enabled, updated: Date.now() };
  persist();
}
export function removeSkill(name: string): boolean { return dictRemove(S.skills, name); }
export function setSkillEnabled(name: string, enabled: boolean): boolean { return dictEnable(S.skills, name, enabled); }

export function addPlugin(name: string, version: string, description: string, code: string, enabled = true): void {
  S.plugins[name] = { version, description, code, enabled, updated: Date.now() };
  persist();
}
export function removePlugin(name: string): boolean { return dictRemove(S.plugins, name); }
export function setPluginEnabled(name: string, enabled: boolean): boolean { return dictEnable(S.plugins, name, enabled); }

export function addMcp(name: string, command: string, description: string, enabled = true): void {
  S.mcps[name] = { command, description, enabled, updated: Date.now() };
  persist();
}
export function removeMcp(name: string): boolean { return dictRemove(S.mcps, name); }
export function setMcpEnabled(name: string, enabled: boolean): boolean { return dictEnable(S.mcps, name, enabled); }

export function addApi(name: string, url: string, description: string, enabled = true): void {
  if (!/^https?:\/\//i.test(url)) throw new Error("URL inválida (use http/https)");
  S.apis[name] = { url, description, enabled, updated: Date.now() };
  persist();
}
export function removeApi(name: string): boolean { return dictRemove(S.apis, name); }
export function setApiEnabled(name: string, enabled: boolean): boolean { return dictEnable(S.apis, name, enabled); }

function dictRemove<T extends { enabled: boolean; updated: number }>(d: Record<string, T>, name: string): boolean {
  if (!(name in d)) return false;
  delete d[name];
  persist();
  return true;
}
function dictEnable<T extends { enabled: boolean; updated: number }>(d: Record<string, T>, name: string, enabled: boolean): boolean {
  if (!(name in d)) return false;
  d[name] = { ...d[name], enabled, updated: Date.now() };
  persist();
  return true;
}

// ---------- console JS (sandbox Worker) ----------
let _sb: SandboxHandle | null = null;
function sharedSandbox(): SandboxHandle {
  if (!_sb) _sb = createSandbox((op, args) => sandboxRpc(op, args));
  return _sb;
}

export async function runJSAsync(code: string, input?: Record<string, unknown>): Promise<string> {
  return sharedSandbox().run(code, input);
}

/** RPC do sandbox → executa operações Memory no thread principal. */
export async function sandboxRpc(op: string, args: unknown[]): Promise<unknown> {
  switch (op) {
    case "mem.putFile": return putFile(String(args[0]), String(args[1] ?? ""), { author: "sandbox" });
    case "mem.getFile": return getFile(String(args[0]));
    case "mem.listFiles": return listFiles();
    case "mem.deleteFile": return deleteFile(String(args[0]));
    case "mem.addTrigger": return addTrigger(String(args[0]), (args[1] ?? {}) as never);
    case "mem.addScript": return addScript(String(args[0]), String(args[1] ?? ""), (args[2] ?? {}) as never);
    case "mem.addContent": return addContent(String(args[0]), String(args[1] ?? ""));
    case "mem.stats": return stats();
    case "mem.log": log(String(args[0] ?? ""), "sandbox"); return null;
    case "sys.get": return localStorage.getItem(`vessie-sys:${args[0]}`);
    case "sys.set": localStorage.setItem(`vessie-sys:${args[0]}`, String(args[1] ?? "")); return null;
    default: throw new Error(`operação não permitida no sandbox: ${op}`);
  }
}

// ---------- parser .mem ----------
export async function applyMem(src: string): Promise<MemReport & { errors: string[] }> {
  const parsed = parseMem(src);
  const api = {
    putFile: (path: string, content: string, author?: string) => putFile(path, content, { author: author ?? "mem" }),
    addTrigger: (name: string, cfg: { pattern: string; action: string; category?: string; description?: string }) => addTrigger(name, cfg),
    addScript: (name: string, code: string, opts?: { lang?: string; desc?: string }) => addScript(name, code, opts),
    addContent: (cat: string, text: string) => addContent(cat, text),
    runExec: async (lang: string, code: string) => {
      if (lang === "mem") {
        const sub = await applyMem(code);
        return `mem: ${sub.files.length} arquivos, ${sub.triggers.length} triggers`;
      }
      return runJSAsync(code);
    },
  };
  const report = await executeParsed(parsed, api);
  log(`.mem aplicado: ${report.files.length} arquivos, ${report.triggers.length} triggers`);
  return { ...report, errors: parsed.errors };
}

// ---------- ZIP (fflate, DEFLATE — melhoria sobre STORE puro-JS; leitura aceita STORE legado) ----------
export function exportZip(): { name: string; bytes: number; count: number } {
  const manifest = {
    app: "vessie-memory", v: 4,
    exported: new Date().toISOString(),
    triggers: S.triggers, scripts: S.scripts, contents: S.contents,
    skills: S.skills, plugins: S.plugins, mcps: S.mcps, apis: S.apis,
  };
  const files: Record<string, Uint8Array> = {};
  for (const [p, f] of Object.entries(S.files)) files[p] = strToU8(f.content);
  files["memory-manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  const packed = zipSync(files, { level: 6 });
  const blob = new Blob([packed as BlobPart], { type: "application/zip" });
  const name = `memory-${Date.now()}.zip`;
  downloadBlob(blob, name);
  log(`memory exportado: ${name} (${packed.length} bytes, ${Object.keys(S.files).length + 1} arquivos)`);
  return { name, bytes: packed.length, count: Object.keys(S.files).length + 1 };
}

export function importZip(data: Uint8Array): { imported: number } {
  const entries = unzipSync(data);
  let imported = 0;
  let restored = 0;
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith("/")) continue;
    const text = strFromU8(bytes);
    if (name === "memory-manifest.json") {
      try {
        const m = JSON.parse(text) as Partial<MemoryData>;
        if (m.triggers) S.triggers = { ...S.triggers, ...m.triggers };
        if (m.scripts) S.scripts = { ...S.scripts, ...m.scripts };
        if (m.contents) S.contents = { ...S.contents, ...m.contents };
        if (m.skills) S.skills = { ...S.skills, ...m.skills };
        if (m.plugins) S.plugins = { ...S.plugins, ...m.plugins };
        if (m.mcps) S.mcps = { ...S.mcps, ...m.mcps };
        if (m.apis) S.apis = { ...S.apis, ...m.apis };
        restored++;
      } catch { log("manifest inválido no zip", "warn"); }
      continue;
    }
    const p = safePath(name);
    S.files[p] = { content: text, type: "text", author: "zip", updated: Date.now() };
    imported++;
  }
  log(`zip importado: ${imported} arquivos, ${restored} manifest(s)`);
  persist();
  return { imported };
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 600);
}

// ---------- rotas da System API (corrige D3) ----------
export function runRoute(name: string, args: Record<string, unknown> = {}): unknown {
  switch (name) {
    case "api.list": return Object.keys(S.apis);
    case "api.files": return listFiles();
    case "api.kv": {
      const out: Record<string, string | null> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("vessie-sys:")) out[k.slice(11)] = localStorage.getItem(k);
      }
      return out;
    }
    case "api.generateImage": {
      const prompt = String(args.prompt ?? "");
      const w = Number(args.width ?? 1024), h = Number(args.height ?? 1024);
      const seed = Math.floor(Math.random() * 999999);
      return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`;
    }
    case "telemetry.report": return getTelemetry();
    case "telemetry.errors": return getTelemetry().errors;
    case "telemetry.clear":
      localStorage.removeItem("vessie-telemetry");
      return "telemetria limpa";
    default:
      throw new Error(`rota desconhecida: ${name} (disponíveis: api.list, api.files, api.kv, api.generateImage, telemetry.*)`);
  }
}

function getTelemetry(): { errors: string[] } {
  try { return JSON.parse(localStorage.getItem("vessie-telemetry") ?? '{"errors":[]}'); } catch { return { errors: [] }; }
}

// ---------- stats ----------
export function stats(): Record<string, number> {
  return {
    files: Object.keys(S.files).length,
    triggers: Object.keys(S.triggers).length,
    scripts: Object.keys(S.scripts).length,
    contents: Object.keys(S.contents).length,
    skills: Object.keys(S.skills).length,
    plugins: Object.keys(S.plugins).length,
    mcps: Object.keys(S.mcps).length,
    apis: Object.keys(S.apis).length,
    logs: S.logs.length,
  };
}

export function raw(): MemoryData { return S; }

// ---------- inventário de reuso (B.7.3 — corrige D4) ----------
export function contextInventory(maxChars = 8000): string {
  const parts: string[] = [];
  // scripts do chat (janela de conversa) são passados pelo chamador; aqui: Memory
  for (const [name, s] of Object.entries(S.scripts)) {
    if (!s.enabled) continue;
    let code = s.code;
    if (code.length > 1200) code = `${code.slice(0, 1200)}\n(cortado)`;
    parts.push(`\`\`\`${s.lang}:${name}\n${code}\n\`\`\``);
  }
  for (const [p, f] of Object.entries(S.files)) {
    if (f.author === "trigger-api") continue;
    let code = f.content;
    if (code.length > 1200) code = `${code.slice(0, 1200)}\n(cortado)`;
    parts.push(`\`\`\`text:${p}\n${code}\n\`\`\``);
  }
  if (parts.length === 0) return "";
  const header = "--- Scripts e arquivos existentes no Memory (REUTILIZE: altere via edit:arquivo:ini-fim, nunca recrie do zero o que já existe) ---\n";
  let out = header + parts.join("\n");
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n(cortado)`;
  return out;
}

// ---------- blocos especiais da IA / usuário (B.3.3) ----------
export interface AiTextResult {
  results: BlockResult[];
  handled: boolean;
}

function codeBlocksOf(src: string, prefix: string): Array<{ header: string; body: string }> {
  // (?![\w:-]) evita que "mem" case com "memory:run" (fronteira de palavra)
  const re = new RegExp("```" + prefix + "(?![\\w:-])[^\\n]*\\n([\\s\\S]*?)```", "g");
  const out: Array<{ header: string; body: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ header: m[0].slice(3, m[0].indexOf("\n")), body: m[1] });
  return out;
}

function genericBlocks(src: string, label: string): Array<{ header: string; body: string }> {
  const re = /```([^\n]*)\n([\s\S]*?)```/g;
  const out: Array<{ header: string; body: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const h = m[1].trim();
    if (h.startsWith(label)) out.push({ header: h, body: m[2] });
  }
  return out;
}

/** Intercepta e executa blocos especiais. Assíncrono (console roda em Worker). */
export async function handleAiText(text: string): Promise<AiTextResult> {
  const results: BlockResult[] = [];
  ensureSystemAPIs();

  // memory:put:caminho
  for (const b of genericBlocks(text, "memory:put:")) {
    const path = b.header.slice("memory:put:".length).trim();
    if (!path) continue;
    try {
      putFile(path, b.body, { author: "IA" });
      results.push({ kind: "put", ok: true, label: `💾 Salvo em Memory: ${path}` });
    } catch (e) {
      results.push({ kind: "put", ok: false, label: `falha ao salvar ${path}: ${(e as Error).message}` });
    }
  }

  // memory:run
  for (const b of codeBlocksOf(text, "memory:run")) {
    try {
      const r = await runJSAsync(b.body);
      results.push({ kind: "run", ok: true, label: `▶ Console: ${r || "(sem retorno)"}` });
    } catch (e) {
      results.push({ kind: "run", ok: false, label: `▶ Console (erro): ${(e as Error).message}` });
    }
  }

  // memory:trigger:nome|padrão|ação[|categoria|descrição|api]
  for (const b of genericBlocks(text, "memory:trigger:")) {
    const parts = b.header.split("|").map(s => s.trim());
    const name = parts[0]?.slice("memory:trigger:".length).trim();
    if (name && parts[1] && parts[2]) {
      addTrigger(name, {
        pattern: parts[1], action: parts[2],
        category: parts[3] || "geral", description: parts[4] || "", api: parts[5] || "",
      });
      results.push({ kind: "trigger", ok: true, label: `⚡ Trigger criado: ${name}` });
    }
  }

  // memory:api / skill / plugin / mcp
  for (const b of genericBlocks(text, "memory:api:")) {
    const parts = b.header.split("|").map(s => s.trim());
    const name = parts[0]?.slice("memory:api:".length).trim();
    if (name && parts[1]) {
      try {
        addApi(name, parts[1], b.body.trim().slice(0, 200));
        results.push({ kind: "api", ok: true, label: `🌐 API registrada: ${name}` });
      } catch (e) {
        results.push({ kind: "api", ok: false, label: (e as Error).message });
      }
    }
  }
  for (const b of genericBlocks(text, "memory:skill:")) {
    const parts = b.header.split("|").map(s => s.trim());
    const name = parts[0]?.slice("memory:skill:".length).trim();
    if (name) {
      addSkill(name, parts[1] ?? "", b.body.trim());
      results.push({ kind: "skill", ok: true, label: `🧠 Skill criada: ${name} (desativada — ative no Memory Manager)` });
      setSkillEnabled(name, false);
    }
  }
  for (const b of genericBlocks(text, "memory:plugin:")) {
    const parts = b.header.split("|").map(s => s.trim());
    const name = parts[0]?.slice("memory:plugin:".length).trim();
    if (name) {
      addPlugin(name, parts[1] ?? "1.0.0", b.body.trim().slice(0, 200), "");
      results.push({ kind: "plugin", ok: true, label: `🔌 Plugin criado: ${name}` });
    }
  }
  for (const b of genericBlocks(text, "memory:mcp:")) {
    const parts = b.header.split("|").map(s => s.trim());
    const name = parts[0]?.slice("memory:mcp:".length).trim();
    if (name && parts[1]) {
      addMcp(name, parts[1], b.body.trim().slice(0, 200));
      results.push({ kind: "mcp", ok: true, label: `📡 MCP registrado: ${name}` });
    }
  }

  // mem (VessieLang completo)
  for (const b of codeBlocksOf(text, "mem")) {
    const rep = await applyMem(b.body);
    results.push({
      kind: "mem", ok: rep.errors.length === 0,
      label: `📦 .mem aplicado: ${rep.files.length} arquivos, ${rep.triggers.length} triggers, ${rep.scripts.length} scripts${rep.errors.length ? ` — erros: ${rep.errors.join("; ")}` : ""}`,
    });
  }

  // sys:write / sys:read
  for (const b of genericBlocks(text, "sys:write:")) {
    const path = b.header.slice("sys:write:".length).trim();
    if (path) {
      putFile(path, b.body, { author: "IA-sys" });
      results.push({ kind: "sys", ok: true, label: `💾 sys:write ok: ${path}` });
    }
  }
  for (const b of genericBlocks(text, "sys:read:")) {
    const path = b.header.slice("sys:read:".length).trim();
    const f = path ? getFile(path) : null;
    results.push({
      kind: "sys", ok: !!f,
      label: f ? `📖 sys:read ${path}: ${f.content.slice(0, 300)}` : `sys:read: arquivo não encontrado: ${path}`,
    });
  }

  // fire triggers sobre o texto
  const fired = await fireTriggers(text);
  for (const f of fired) results.push({ kind: "trigger", ok: true, label: `⚡ ${f}` });

  return { results, handled: results.length > 0 };
}

// ---------- auto-registros pós-resposta ----------
export function autoSaveCodeBlocks(text: string): number {
  const re = /```([a-zA-Z0-9_\- ]+):([^\n]+)\n([\s\S]*?)```/g;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lang = m[1].trim();
    const name = m[2].trim();
    const code = m[3];
    if (!name || code.trim().length < 20) continue;
    if (/^(memory|mem|sys|image|pack|edit)/.test(lang)) continue;
    const path = name.includes("/") ? name : `${AUTO_DIR}/${name}`;
    putFile(path, code.replace(/\n$/, ""), { author: "IA", type: lang });
    n++;
  }
  if (n) log(`auto-save: ${n} bloco(s) de código`);
  return n;
}

export function autoCreateSkill(text: string): string | null {
  if (text.length < 200) return null;
  const slug = text.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  const name = `auto-${slug || uid()}`;
  if (S.skills[name]) return null;
  addSkill(name, "Auto-criada a partir de uma resposta da IA", text.slice(0, 4000), false);
  return name;
}

export function autoRegisterAPIs(text: string, max = 5): number {
  const urls = text.match(/https?:\/\/[^\s)"'<>]+/g) ?? [];
  let n = 0;
  for (const u of urls) {
    if (n >= max) break;
    try {
      const host = new URL(u).host;
      const name = `api-${host.replace(/[^a-z0-9.\-]/gi, "")}`;
      if (!S.apis[name]) {
        addApi(name, u.slice(0, 200), "Auto-registrada da resposta da IA", true);
        n++;
      }
    } catch { /* url inválida */ }
  }
  return n;
}

// init seguro para SSR (só roda no cliente)
if (typeof window !== "undefined") {
  loadMemory();
}
