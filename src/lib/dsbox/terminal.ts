// DS-BOX — Terminal unificado: relatório das ISOs em formato terminal, captura de
// contexto de problemas e envio automático para a IA (botão Problema + auto-fix).
// O terminal do DS-BOX tem 2 variantes de uso:
//   · variante do USUÁRIO   → painel (aba Emulador), espelho serial + relatórios;
//   · variante da VESSIE-AI → ds:term (Bash-86X headless) e ds:send (SO emulado).
import { vfs } from "./vfs";
import { getEmulatorStatus, serialLines, bootLog } from "./emulator";
import { useDsbox } from "./store";

/** Linhas do terminal unificado (sessão, fora do store para não serializar). */
let termLines: string[] = [];
const termListeners = new Set<() => void>();

export function terminalLines(): string[] { return termLines; }
export function onTerminalChange(fn: () => void): () => void {
  termListeners.add(fn);
  return () => { termListeners.delete(fn); };
}
export function termPush(...lines: string[]): void {
  termLines = [...termLines, ...lines].slice(-400);
  termListeners.forEach(fn => fn());
}
export function termClear(): void {
  termLines = [];
  termListeners.forEach(fn => fn());
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

/**
 * Relatório em formato terminal do conteúdo de uma ISO (VFS + shelf).
 * Enviado automaticamente após cada ds:iso e exibido no painel — é o
 * "formato terminal dos conteúdos da ISO" pedido no Build-Iso.
 */
export function isoTerminalReport(name: string): string[] {
  const files = vfs.list();
  const shelf = useDsbox.getState().isoShelf.find(i => i.name === name);
  const out: string[] = [];
  out.push(`$ iso-ls ${name}.iso`);
  if (files.length === 0) {
    out.push("iso-ls: VFS vazio — nada para empacotar");
    termPush(...out);
    return out;
  }
  for (const f of files) {
    out.push(`-rw-------  ${fmtBytes(f.content.length).padStart(8)}  /${f.path}`);
  }
  out.push("");
  out.push(`$ iso-info ${name}.iso`);
  if (shelf) {
    out.push(`volume      : ${(name || "dsboxos").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32)}`);
    out.push(`tamanho     : ${fmtBytes(shelf.size)}`);
    out.push(`bootavel    : ${shelf.bootable ? "sim (El Torito)" : "nao (sem kernel)"}`);
    out.push(`criada      : ${new Date(shelf.created).toLocaleTimeString()}`);
    out.push(`arquivos    : ${files.length}`);
  } else {
    out.push("(iso ainda não compilada nesta sessão — rode ds:iso)");
  }
  termPush(...out);
  return out;
}

export interface ProblemContext {
  status: string;
  running: boolean;
  serial: string;
  build: string;
  tree: string;
  shelf: string;
}

/** Captura o contexto completo de um problema (saída serial, build log, VFS, ISOs). */
export function collectProblemContext(): ProblemContext {
  const ds = useDsbox.getState();
  const st = vfs.stats();
  return {
    status: getEmulatorStatus(),
    running: getEmulatorStatus() === "running",
    serial: serialLines().slice(-30).join("\n"),
    build: ds.buildLog.slice(-20).join("\n"),
    tree: st.files > 0 ? vfs.tree() : "(VFS vazio)",
    shelf: ds.isoShelf.length
      ? ds.isoShelf.map(i => `${i.name} (${(i.size / 1024).toFixed(1)}KB, bootable=${i.bootable})`).join(", ")
      : "(nenhuma ISO)",
  };
}

/** Bloco ```terminal``` pronto para enviar ao modelo. */
export function formatProblemReport(ctx: ProblemContext, headline: string): string {
  const parts = [
    `🛠 **${headline}** — diagnostique pelos comandos e pela saída abaixo, encontre a causa e corrija diretamente (ds:edit / ds:write / ds:script), depois recompile com ds:iso e reboote.`,
    "",
    "```terminal",
    `[emulador] status=${ctx.status} running=${ctx.running}`,
    `[isos] ${ctx.shelf}`,
    "",
    "-- build log (últimas linhas) --",
    ctx.build || "(vazio)",
    "",
    "-- console serial (últimas linhas) --",
    ctx.serial || "(sem saída serial)",
    "",
    "-- boot log --",
    bootLog().slice(-8).map(l => l.text).join("\n") || "(vazio)",
    "",
    "-- árvore do projeto --",
    ctx.tree,
    "```",
  ];
  return parts.join("\n");
}

/** Texto enviado ao chat ao detectar/acusar um problema. */
export function problemMessage(source: "manual" | "auto", extra?: string): string {
  const ctx = collectProblemContext();
  const headline = source === "manual"
    ? "Problema relatado no DS-BOX (botão Problema)"
    : `Problema detectado automaticamente${extra ? `: ${extra}` : ""}`;
  return formatProblemReport(ctx, headline);
}
