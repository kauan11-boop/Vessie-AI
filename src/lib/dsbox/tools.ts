// DS-BOX — DS-Tools: protocolo de ferramentas avançadas usadas pelos modelos de IA.
// A IA emite blocos cercados ```ds:<ferramenta>:<alvo>``` e o runtime intercepta,
// executa localmente e devolve o resultado ao chat (loop agêntico quando DCS ativo).
//
//   ds:write:<caminho>   corpo = conteúdo cru do arquivo      (Create-File / Edit-Files)
//   ds:edit:<caminho>    corpo = JSON {find, replace, all?} ou {edits:[{find,replace}]}
//   ds:read:<caminho>    corpo = (vazio)                      (Read-Files)
//   ds:rm:<caminho>      corpo = (vazio)
//   ds:mv:<de>:<para>    corpo = (vazio)
//   ds:tree              corpo = (vazio) → árvore do projeto  (auto-arquitetura)
//   ds:zip:<nome>        corpo = JSON {include?: caminhos[]} opcional
//   ds:template:<id>     corpo = (vazio) → semeia projeto modelo
//   ds:iso:<nome>        corpo = JSON {volume?, include?, kernel?|{url,cmdline}, boot?}
//   ds:boot:<nome|latest> corpo = (vazio) → boota na aba Emulador (v86)
//   ds:run:<caminho>     corpo = JSON {input?} → executa por extensão (js/sh/html/py)
//   ds:preview:<caminho> corpo = (vazio) → abre no Script Lab
//   ds:search            corpo = JSON {query, max?}           (Web-Search)
//   ds:fetch             corpo = JSON {url}                   (Web-Fetch)
//   ds:prompt            corpo = (vazio) → repete o contexto/tree do projeto

import { vfs, normalizePath, seedTemplate, TEMPLATES } from "./vfs";
import { strToU8 } from "fflate";
import { buildIso9660, KERNEL_PRESETS, type KernelPreset, type IsoFile } from "./iso";
import { webSearch, webFetch, formatSearchResults, formatFetchResult } from "./web";
import { runJs, runShell, bundleWeb, detectGenre } from "./preview";
import { bootMachine } from "./emulator";
import { dsboxActions, useDsbox, type IsoShelfItem } from "./store";

export interface ToolCall {
  kind: string;
  target?: string;   // caminho/nome após "ds:kind:"
  body: string;      // corpo cru do bloco
}

const TOOL_RE = /```ds:([a-z]+)(?::([^\n`]*))?\n?([\s\S]*?)```/g;

/** Extrai todas as chamadas ds:* de um texto de resposta da IA. */
export function parseToolBlocks(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  TOOL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOOL_RE.exec(text)) !== null) {
    let target = m[2]?.trim() || undefined;
    let body = m[3].trim();
    // JSON inline no target (formato documentado: ```ds:iso:nome {"volume":"X"}```)
    // → separa o objeto JSON e o move para o corpo.
    if (target) {
      const brace = target.indexOf("{");
      if (brace >= 0 && target.endsWith("}")) {
        const jsonPart = target.slice(brace);
        try {
          const parsed = JSON.parse(jsonPart) as unknown;
          if (parsed && typeof parsed === "object") {
            body = body ? `${jsonPart}\n${body}` : jsonPart;
            target = target.slice(0, brace).trim() || undefined;
          }
        } catch { /* não é JSON → mantém como target */ }
      }
    }
    calls.push({ kind: m[1], target, body });
  }
  return calls;
}

export interface ToolResult {
  ok: boolean;
  label: string;     // curto, para toast/feed
  detail?: string;   // texto para o modelo e para a mensagem do chat
}

function parseJsonBody(body: string): Record<string, unknown> {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function asString(v: unknown): string { return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v); }

function truncate(s: string, max = 3200): string {
  return s.length > max ? s.slice(0, max) + `\n…(cortado, ${s.length} caracteres totais)` : s;
}

// ---------- executores individuais ----------
async function toolWrite(call: ToolCall): Promise<ToolResult> {
  if (!call.target) return { ok: false, label: "ds:write sem caminho", detail: "Uso: ```ds:write:caminho/arquivo.txt <conteúdo>```" };
  const existing = vfs.exists(call.target);
  const err = vfs.write(call.target, call.body);
  if (err) return { ok: false, label: `Falha: ${call.target}`, detail: err };
  return {
    ok: true,
    label: `📄 ${existing ? "Atualizado" : "Criado"} ${call.target}`,
    detail: `Arquivo "${call.target}" gravado no VFS (${call.body.length} bytes). A árvore do projeto já reflete a mudança.`,
  };
}

function toolEdit(call: ToolCall): ToolResult {
  if (!call.target) return { ok: false, label: "ds:edit sem caminho", detail: "Uso: ```ds:edit:caminho {\"find\":\"…\",\"replace\":\"…\"}```" };
  const content = vfs.read(call.target);
  if (content === null) return { ok: false, label: `Arquivo ausente: ${call.target}`, detail: `ds:edit: "${call.target}" não existe no VFS.` };
  const body = parseJsonBody(call.body);
  interface Edit { find: string; replace: string; all?: boolean }
  const edits: Edit[] = Array.isArray(body.edits)
    ? (body.edits as Edit[]).map(e => ({ find: asString(e.find), replace: asString(e.replace), all: !!e.all }))
    : [{ find: asString(body.find), replace: asString(body.replace), all: body.all !== false }];
  if (edits.some(e => !e.find)) return { ok: false, label: "ds:edit inválido", detail: "Cada edição precisa de \"find\" (e \"replace\", opcional)." };
  let result = content;
  const applied: string[] = [];
  for (const e of edits) {
    const count = result.split(e.find).length - 1;
    if (count === 0) { applied.push(`padrão não encontrado: "${e.find.slice(0, 60)}"`); continue; }
    result = e.all === false ? result.replace(e.find, e.replace) : result.split(e.find).join(e.replace);
    applied.push(`"${e.find.slice(0, 40)}" × ${count}`);
  }
  const err = vfs.write(call.target, result);
  if (err) return { ok: false, label: `Falha ao salvar: ${call.target}`, detail: err };
  const found = applied.some(a => a.includes("×"));
  return {
    ok: found,
    label: found ? `✏️ Editado ${call.target}` : `Padrões ausentes em ${call.target}`,
    detail: found ? `Edit-Files aplicado em "${call.target}": ${applied.filter(a => a.includes("×")).join("; ")}.` : `Nenhum padrão encontrado em "${call.target}". Use ds:read para ver o conteúdo atual.`,
  };
}

function toolRead(call: ToolCall): ToolResult {
  if (!call.target) {
    const files = vfs.list();
    return { ok: files.length > 0, label: `Read-Files: ${files.length} arquivo(s)`, detail: truncate(files.map(f => `${f.path} (${f.content.length}B)`).join("\n") || "VFS vazio") };
  }
  const content = vfs.read(call.target);
  if (content === null) return { ok: false, label: `Arquivo ausente: ${call.target}`, detail: `"${call.target}" não existe. Use ds:tree para listar.` };
  return { ok: true, label: `📖 Lido ${call.target}`, detail: truncate(content) };
}

function toolRm(call: ToolCall): ToolResult {
  if (!call.target) return { ok: false, label: "ds:rm sem caminho", detail: "Uso: ```ds:rm:caminho```" };
  const removed = vfs.rm(call.target);
  return removed
    ? { ok: true, label: `🗑️ Removido ${call.target}`, detail: `"${call.target}" removido do VFS.` }
    : { ok: false, label: `Não existe: ${call.target}`, detail: "Nada foi removido." };
}

function toolMv(call: ToolCall): ToolResult {
  // target formato "de:para" (o bloco é ```ds:mv:caminho/velho:caminho/novo```)
  const idx = call.target?.indexOf(":");
  if (!call.target || idx === undefined || idx < 0) return { ok: false, label: "ds:mv inválido", detail: "Uso: ```ds:mv:caminho/de:caminho/para```" };
  const from = call.target.slice(0, idx);
  const to = call.target.slice(idx + 1);
  const err = vfs.mv(from, to);
  return err ? { ok: false, label: "Falha no mv", detail: err } : { ok: true, label: `🔁 Movido → ${to}`, detail: `"${from}" → "${to}".` };
}

function toolTree(): ToolResult {
  const tree = vfs.tree();
  const st = vfs.stats();
  return { ok: true, label: `🌳 Árvore: ${st.files} arquivo(s)`, detail: truncate(tree) };
}

async function toolZip(call: ToolCall): Promise<ToolResult> {
  const body = parseJsonBody(call.body);
  const include = Array.isArray(body.include) ? (body.include as unknown[]).map(asString) : undefined;
  const name = normalizePath(call.target ?? "dsbox-projeto") || "dsbox-projeto";
  const count = await vfs.downloadZip(name, include);
  return { ok: true, label: `📦 ${name}.zip (${count} arq.)`, detail: `ZIP "${name}.zip" gerado com ${count} arquivo(s) e o download iniciou no navegador.` };
}

function toolTemplate(call: ToolCall): ToolResult {
  const id = call.target as never;
  if (!TEMPLATES.some(t => t.id === id)) {
    return { ok: false, label: "template inválido", detail: `IDs válidos: ${TEMPLATES.map(t => t.id).join(", ")}` };
  }
  const written = seedTemplate(id, parseJsonBody(call.body).prefix ? asString(parseJsonBody(call.body).prefix) : undefined);
  return { ok: true, label: `🧩 Template ${call.target}`, detail: `Arquivos criados: ${written.join(", ")}` };
}

// ---------- Build-Iso ----------
async function fetchKernelBytes(url: string, log: (msg: string) => void): Promise<Uint8Array | null> {
  try {
    log(`[build] baixando kernel: ${url}`);
    const res = await fetch(url);
    if (!res.ok) { log(`[build] kernel HTTP ${res.status} — ISO será de dados`); return null; }
    const buf = new Uint8Array(await res.arrayBuffer());
    log(`[build] kernel recebido: ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
    return buf;
  } catch (e) {
    log(`[build] kernel inacessível (${(e as Error).message}) — ISO será de dados`);
    return null;
  }
}

export interface BuildIsoRequest {
  name: string;
  volume?: string;
  include?: string[];
  kernel?: string | { url?: string; initrd?: string; cmdline?: string };
}

/**
 * Sanitiza o nome da ISO. Modelos às vezes copiam placeholders do protocolo
 * ("nome", "name", "os"…) ou colam JSON no alvo — tudo isso viraria um nome
 * inválido na prateleira. Aqui o nome volta a algo válido e previsível.
 */
export function sanitizeIsoName(raw: string | undefined): string {
  let n = (raw ?? "").trim();
  n = n.replace(/\{[\s\S]*\}/g, "").replace(/\s+/g, "-"); // JSON colado / espaços
  n = normalizePath(n).replace(/\.iso$/i, "");
  const placeholders = new Set(["nome", "name", "os", "iso", "arquivo", "file", "nomedarquiço", "nomedaarquiço"]);
  if (!n || placeholders.has(n.toLowerCase())) n = "dsboxos";
  return n.slice(0, 48);
}

/** Núcleo do Build-Iso — usado pela ferramenta ds:iso e pelo wizard de UI. */
export async function buildIsoCore(req: BuildIsoRequest): Promise<{ shelf: IsoShelfItem; summary: string; bootable: boolean; replaced: boolean; name: string }> {
  const log = dsboxActions.pushBuildLog;
  const name = sanitizeIsoName(req.name);
  const volume = (req.volume || name).toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32) || "DSBOXOS";

  const selected = vfs.list().filter(f => !req.include || req.include.some(p => f.path === normalizePath(p) || f.path.startsWith(normalizePath(p) + "/")));
  if (selected.length === 0) throw new Error("sem arquivos no VFS para incluir na ISO");

  // resolve kernel (preset id ou objeto custom)
  let kernelCfg: KernelPreset | null = null;
  if (typeof req.kernel === "string" && req.kernel && req.kernel !== "none") {
    kernelCfg = [...KERNEL_PRESETS, ...useDsbox.getState().kernelPresets].find(p => p.id === req.kernel) ?? null;
    if (!kernelCfg) throw new Error(`kernel desconhecido: ${req.kernel}`);
  } else if (req.kernel && typeof req.kernel === "object") {
    const o = req.kernel as Record<string, unknown>;
    if (asString(o.url)) kernelCfg = { id: "custom", label: "custom", bzimage: asString(o.url), initrd: asString(o.initrd) || undefined, cmdline: asString(o.cmdline) };
  }

  let kernelBytes: Uint8Array | null = null;
  let initrdBytes: Uint8Array | null = null;
  if (kernelCfg) {
    kernelBytes = await fetchKernelBytes(kernelCfg.bzimage, log);
    if (kernelBytes && kernelCfg.initrd) initrdBytes = await fetchKernelBytes(kernelCfg.initrd, log);
  }

  const files: IsoFile[] = selected.map(f => ({ path: f.path, data: strToU8(f.content) }));
  if (kernelBytes) {
    files.push({ path: "boot/bzimage", data: kernelBytes });
    files.push({ path: "boot/boot.cfg", data: strToU8(`# DS-BOXOS boot config (Build-Iso)\nkernel: ${kernelCfg?.bzimage}\ncmdline: ${kernelCfg?.cmdline ?? "console=ttyS0"}\ninitrd: ${kernelCfg?.initrd ?? "(none)"}\n`) });
    if (initrdBytes) files.push({ path: "boot/initrd", data: initrdBytes });
  }

  log(`[build] volume=${volume} arquivos=${files.length} kernel=${kernelBytes ? "embutido" : "nenhum"}`);
  const result = buildIso9660({
    volumeId: volume,
    files,
    boot: kernelBytes ? { image: kernelBytes } : undefined,
  });
  log(`[build] iso ${result.sectors} setores · ${(result.data.length / 1024 / 1024).toFixed(1)} MB · bootable=${result.bootable}`);

  const shelf: IsoShelfItem = {
    id: `iso-${Date.now()}`,
    name,
    size: result.data.length,
    bootable: result.bootable,
    created: Date.now(),
    bytes: result.data,
    kernelBytes: kernelBytes ? kernelBytes.slice().buffer as ArrayBuffer : undefined,
    initrdBytes: initrdBytes ? initrdBytes.slice().buffer as ArrayBuffer : undefined,
    cmdline: kernelCfg?.cmdline,
  };
  // ISO homônima na prateleira → substitui (evita acumular duplicatas quando a IA
  // recompila a mesma distribuição depois de editar os arquivos)
  const previous = useDsbox.getState().isoShelf.find(i => i.name === name);
  if (previous) dsboxActions.removeIso(previous.id);
  dsboxActions.addIso(shelf);

  const summary = result.bootable
    ? `ISO "${volume}" bootável: ${result.files} arquivo(s), ${(result.data.length / 1024 / 1024).toFixed(1)} MB, kernel em /boot/bzimage + El Torito.`
    : `ISO de dados "${volume}": ${result.files} arquivo(s), ${(result.data.length / 1024 / 1024).toFixed(1)} MB (kernel indisponível).`;
  return { shelf, summary, bootable: result.bootable, replaced: !!previous, name };
}

async function toolIso(call: ToolCall): Promise<ToolResult> {
  const body = parseJsonBody(call.body);
  const rawName = asString(call.target) || asString(body.name) || "dsboxos";
  const name = sanitizeIsoName(rawName);
  try {
    const { shelf, summary, bootable, replaced } = await buildIsoCore({
      name,
      volume: asString(body.volume) || undefined,
      include: Array.isArray(body.include) ? (body.include as unknown[]).map(asString) : undefined,
      kernel: (typeof body.kernel === "string" || (body.kernel && typeof body.kernel === "object"))
        ? body.kernel as string | Record<string, unknown>
        : undefined,
    });

    const bootNow = body.boot === true;
    if (bootNow) {
      dsboxActions.setPanelOpen(true);
      dsboxActions.setTab("emulator");
      try {
        await bootViaShelf(shelf);
        dsboxActions.pushBuildLog("[boot] inicializado");
      } catch (e) {
        dsboxActions.pushBuildLog(`[boot] erro: ${(e as Error).message}`);
      }
    }

    return {
      ok: true,
      label: `💿 ${name}.iso (${(shelf.size / 1024 / 1024).toFixed(1)} MB)`,
      detail: [
        summary,
        replaced
          ? `ISO "${name}" já existia na prateleira — foi SUBSTITUÍDA pela nova versão (para modificar uma ISO, edite os arquivos no VFS e rode ds:iso com o mesmo nome).`
          : "ISO adicionada à prateleira do DS-BOX.",
        bootable ? "Pronta para o emulador v86." : "Estrutura 9660 válida, mas sem kernel: para torná-la bootável, rode ds:iso com \"kernel\":\"buildroot\".",
        bootNow ? "Boot iniciado na aba Emulador." : "Use ds:boot:minhaos para iniciar no emulador v86.",
      ].join("\n"),
    };
  } catch (e) {
    return { ok: false, label: `Falha no Build-Iso: ${name}`, detail: (e as Error).message };
  }
}

async function bootViaShelf(item: { id: string; name: string }): Promise<void> {
  const ds = useDsbox.getState();
  const bytes = ds.getIsoBytes(item.id);
  const kernel = ds.getIsoKernel(item.id);
  if (kernel?.kernelBytes) {
    await bootMachine({
      mode: "kernel",
      bzimage: kernel.kernelBytes,
      initrd: kernel.initrdBytes,
      cmdline: kernel.cmdline,
      label: item.name,
    }, uiRefs());
  } else if (bytes) {
    await bootMachine({ mode: "iso", isoBuffer: bytes.slice().buffer as ArrayBuffer, label: item.name }, uiRefs());
  } else {
    throw new Error("ISO sem bytes nesta sessão — reconstrua com ds:iso");
  }
}

/** Referências de UI do emulador registradas pelo componente EmulatorView. */
let ui: (() => { screenContainer: HTMLDivElement; serialEl: HTMLTextAreaElement | null } | null) | null = null;
export function registerEmulatorUi(fn: typeof ui): void { ui = fn; }
function uiRefs(): { screenContainer: HTMLDivElement; serialEl: HTMLTextAreaElement | null } {
  const refs = ui?.();
  if (!refs) throw new Error("emulador não está montado — abra a aba Emulador do DS-BOX");
  return refs;
}
/** Refs do emulador se a aba estiver montada (para uso nos componentes). */
export function tryGetEmulatorUi(): { screenContainer: HTMLDivElement; serialEl: HTMLTextAreaElement | null } | null {
  return ui?.() ?? null;
}

async function toolBoot(call: ToolCall): Promise<ToolResult> {
  const shelf = useDsbox.getState().isoShelf;
  if (shelf.length === 0) {
    return { ok: false, label: "Prateleira de ISOs vazia", detail: "Nenhuma ISO montada ainda. Use ds:iso (com kernel) antes de ds:boot." };
  }
  const target = !call.target || call.target === "latest" ? shelf[shelf.length - 1] : shelf.find(i => i.name === call.target || i.id === call.target);
  if (!target) return { ok: false, label: `ISO não encontrada: ${call.target}`, detail: `Disponíveis: ${shelf.map(i => i.name).join(", ")}` };
  dsboxActions.setPanelOpen(true);
  dsboxActions.setTab("emulator");
  try {
    await bootViaShelf(target);
    dsboxActions.pushBuildLog(`[boot] ${target.name} inicializado`);
    return { ok: true, label: `🖥️ Boot: ${target.name}`, detail: `A ISO "${target.name}" está inicializando no emulador v86 (aba Emulador do DS-BOX). Console serial espelhado abaixo da tela.` };
  } catch (e) {
    const msg = (e as Error).message;
    dsboxActions.pushBuildLog(`[boot] erro: ${msg}`);
    return { ok: false, label: `Falha no boot: ${target.name}`, detail: `${msg} — alternativa honesta: Bash-86X roda sempre (sem rede).` };
  }
}

// ---------- execução de scripts ----------
async function toolRun(call: ToolCall): Promise<ToolResult> {
  const path = call.target;
  if (!path) return { ok: false, label: "ds:run sem caminho", detail: "Uso: ```ds:run:scripts/app.js```" };
  const info = detectGenre(path);
  const body = parseJsonBody(call.body);
  const input = body.input && typeof body.input === "object" ? body.input as Record<string, unknown> : undefined;
  try {
    switch (info.mode) {
      case "worker": {
        const out = await runJs(path, input);
        dsboxActions.setPanelOpen(true); dsboxActions.setTab("scripts");
        return { ok: true, label: `⚡ JS executado: ${path}`, detail: truncate(out) };
      }
      case "bash86": {
        const out = await runShell(path);
        dsboxActions.setPanelOpen(true); dsboxActions.setTab("bash86");
        return { ok: true, label: `🐚 Shell executado: ${path}`, detail: truncate(out) };
      }
      case "iframe": {
        const html = bundleWeb(path);
        dsboxActions.setScriptPreview({ path, html });
        dsboxActions.setPanelOpen(true); dsboxActions.setTab("scripts");
        return { ok: true, label: `🌐 Preview aberto: ${path}`, detail: `Preview de "${path}" aberto no Script Lab (iframe sandbox, arquivos do VFS embutidos).` };
      }
      case "pyodide": {
        const { runPython } = await import("./preview");
        const out = await runPython(path, msg => dsboxActions.pushBuildLog(`[py] ${msg}`));
        return { ok: true, label: `🐍 Python executado: ${path}`, detail: truncate(out) };
      }
      default:
        return { ok: false, label: `Gênero não executável: ${path}`, detail: `"${path}" é ${info.label}. Executáveis: .js (sandbox), .sh (Bash-86X), .html/.css (preview), .py (Pyodide).` };
    }
  } catch (e) {
    return { ok: false, label: `Erro ao executar ${path}`, detail: (e as Error).message };
  }
}

async function toolPreview(call: ToolCall): Promise<ToolResult> {
  const path = call.target;
  if (!path) return { ok: false, label: "ds:preview sem caminho", detail: "Uso: ```ds:preview:index.html```" };
  const content = vfs.read(path);
  if (content === null) return { ok: false, label: `Arquivo ausente: ${path}`, detail: "Use ds:tree para listar." };
  const info = detectGenre(path);
  const html = info.mode === "iframe" ? bundleWeb(path) : `<pre style="font: 13px ui-monospace; white-space: pre-wrap; padding: 16px">${content.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</pre>`;
  dsboxActions.setScriptPreview({ path, html });
  dsboxActions.setPanelOpen(true); dsboxActions.setTab("scripts");
  return { ok: true, label: `👁️ Preview: ${path}`, detail: `Preview de "${path}" (${info.label}) aberto no Script Lab.` };
}

// ---------- Web ----------
async function toolSearch(call: ToolCall): Promise<ToolResult> {
  const body = parseJsonBody(call.body);
  const query = asString(body.query) || call.target || "";
  if (!query) return { ok: false, label: "ds:search sem query", detail: "Uso: ```ds:search\n{\"query\":\"alpine linux minimal\"}\n```" };
  const max = typeof body.max === "number" ? body.max : 6;
  const resp = await webSearch(query, max);
  dsboxActions.pushBuildLog(`[search] "${query}" via ${resp.via}: ${resp.results.length} resultado(s)`);
  const formatted = formatSearchResults(resp);
  return { ok: resp.results.length > 0, label: `🔎 Busca: ${resp.results.length} resultado(s)`, detail: truncate(formatted) };
}

async function toolFetch(call: ToolCall): Promise<ToolResult> {
  const body = parseJsonBody(call.body);
  const url = asString(body.url) || call.target || "";
  if (!url || !/^https?:\/\//i.test(url)) return { ok: false, label: "ds:fetch sem URL", detail: "Uso: ```ds:fetch\n{\"url\":\"https://example.com\"}\n```" };
  const resp = await webFetch(url);
  dsboxActions.pushBuildLog(`[fetch] ${url} via ${resp.via} ${resp.error ? "FALHOU" : "ok"}`);
  const formatted = formatFetchResult(resp, 3600);
  return { ok: !resp.error, label: resp.error ? "Fetch falhou" : `🌐 Fetch ok (${resp.bytes}B)`, detail: truncate(formatted) };
}

function toolPrompt(): ToolResult {
  const tree = vfs.tree();
  const st = vfs.stats();
  const shelf = useDsbox.getState().isoShelf;
  return {
    ok: true,
    label: "📥 Contexto DS-BOX re-enviado",
    detail: truncate([
      `VFS: ${st.files} arquivo(s), ${st.bytes} bytes, ${st.dirs} diretório(s).`,
      `Árvore:\n${tree}`,
      shelf.length ? `ISOs na prateleira: ${shelf.map(i => `${i.name} (${(i.size / 1024).toFixed(1)}KB, bootable=${i.bootable})`).join(", ")}` : "Nenhuma ISO montada ainda.",
    ].join("\n")),
  };
}

// ---------- dispatcher ----------
export async function execTool(call: ToolCall, convId: string | null): Promise<ToolResult> {
  void convId;
  dsboxActions.pushToolFeed({ kind: call.kind, target: call.target, ok: false, label: "executando…", at: Date.now() });
  try {
    let result: ToolResult;
    switch (call.kind) {
      case "write": result = await toolWrite(call); break;
      case "edit": result = toolEdit(call); break;
      case "read": result = toolRead(call); break;
      case "rm": result = toolRm(call); break;
      case "mv": result = toolMv(call); break;
      case "tree": result = toolTree(); break;
      case "zip": result = await toolZip(call); break;
      case "template": result = toolTemplate(call); break;
      case "iso": result = await toolIso(call); break;
      case "boot": result = await toolBoot(call); break;
      case "run": result = await toolRun(call); break;
      case "preview": result = await toolPreview(call); break;
      case "search": result = await toolSearch(call); break;
      case "fetch": result = await toolFetch(call); break;
      case "prompt": result = toolPrompt(); break;
      default:
        result = { ok: false, label: `ds:${call.kind} desconhecida`, detail: "Ferramentas: write edit read rm mv tree zip template iso boot run preview search fetch prompt" };
    }
    dsboxActions.pushToolFeed({ kind: call.kind, target: call.target, ok: result.ok, label: result.label, at: Date.now() });
    return result;
  } catch (e) {
    const detail = (e as Error).message;
    dsboxActions.pushToolFeed({ kind: call.kind, target: call.target, ok: false, label: `Erro: ${detail}`, at: Date.now() });
    return { ok: false, label: `Erro em ds:${call.kind}`, detail };
  }
}

/** Documentação do protocolo para o system prompt (o modelo lê isso). */
export function toolsSystemDoc(): string {
  return [
    "### DS-BOX · Dynamic Creation System (ferramentas locais)",
    "Você opera dentro do DS-BOX, um sandbox com sistema de arquivos virtual (VFS), Build-Iso (ISO 9660 real), emulador x86 (v86), Bash-86X e acesso web. Use blocos cercados — o site executa e devolve o resultado como próxima mensagem:",
    "",
    "IMPORTANTE sobre nomes: os caminhos/nomes abaixo são EXEMPLOS concretos — substitua por nomes REAIS do projeto (nunca escreva \"nome\", \"caminho\" ou \"arquivo\" literalmente). Ex.: ds:iso:minhaos, ds:write:init.sh.",
    "",
    '```ds:write:init.sh``` + conteúdo cru na linha seguinte do mesmo bloco → cria/atualiza arquivo (Create-File).',
    '```ds:edit:init.sh {"find":"texto antigo","replace":"novo texto","all":true}``` → Edit-Files (ou {"edits":[{find,replace}]}).',
    "```ds:read:init.sh``` → lê um arquivo. ```ds:read``` (sem alvo) → lista todos. ```ds:tree``` → árvore do projeto. ```ds:rm:caminho``` remove. ```ds:mv:de:para``` move.",
    '```ds:zip:meu-projeto {"include":["init.sh","etc/"]}``` → ZIP do projeto (download).',
    "```ds:template:web-app|node-cli|python-cli|linux-iso|lua-game|md-doc``` → semeia um projeto modelo.",
    '```ds:iso:minhaos {"volume":"MINHAOS","kernel":"buildroot","boot":true}``` → Build-Iso: monta ISO 9660 com El Torito e (se kernel informado) boota no emulador v86. O alvo é o nome REAL da ISO (ex.: minhaos). Rodar ds:iso de novo com o MESMO nome SUBSTITUI a ISO anterior — é assim que se MODIFICA um sistema: ds:read/ds:edit nos arquivos → ds:iso:minhaos de novo.',
    "```ds:boot:minhaos``` → boota ISO da prateleira. Presets de kernel: buildroot (Linux livre ~5 MB).",
    "```ds:run:scripts/app.js``` → executa por extensão: .js (sandbox worker), .sh (Bash-86X), .html (preview iframe), .py (Pyodide).",
    "```ds:preview:index.html``` → abre no Script Lab.",
    '```ds:search {"query":"buildroot linux"}``` → Web-Search. ```ds:fetch {"url":"https://example.com"}``` → Web-Fetch (texto limpo).',
    "```ds:prompt``` → recebe de volta árvore + estado do DS-BOX.",
    "",
    "REGRAS: um bloco ds: por chamada; conteúdo de ds:write é CRU (sem escapar); nunca invente resultado — aguarde a mensagem de resultado do sistema; para montar um SO: escreva os arquivos (init, motd, boot.cfg), depois ds:iso com kernel, depois ds:boot.",
  ].join("\n");
}

/** Prompt de sessão Build-Iso (persona engenheiro Linux). */
export function buildIsoSessionPrompt(): string {
  return [
    "### Sessão Build-Iso ativa",
    "O Dynamic Creation System está ligado com o Build-Iso ativo. Quando o usuário pedir para criar, montar, modificar ou rodar uma ISO/sistema operacional, siga este fluxo com o DS-BOX:",
    "1. Planeje em 3–6 passos curtos.",
    "2. Escreva os arquivos do sistema com ds:write (init, etc/motd, boot/boot.cfg, scripts, README).",
    '3. Monte a ISO com ```ds:iso:minhaos {"kernel":"buildroot","boot":true}``` (minhaos = nome REAL do sistema, ex.: auroraos). O emulador v86 abre na lateral e o Linux livre boota.',
    "4. Para MODIFICAR uma ISO existente: leia/edite os arquivos no VFS (ds:read / ds:edit) e rode ds:iso de novo com O MESMO nome — a versão anterior é substituída automaticamente.",
    "5. Se um passo falhar, ajuste e refaça (os resultados das ferramentas chegam como mensagens do sistema).",
    "Se o usuário NÃO estiver falando de ISO/sistema operacional, responda normalmente — as demais ferramentas ds:* continuam disponíveis.",
  ].join("\n");
}
