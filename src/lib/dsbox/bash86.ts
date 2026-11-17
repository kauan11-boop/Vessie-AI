// DS-BOX — Bash-86X: shell virtual (x86-ish) ligado ao VFS.
// Implementa comandos de arquivo, pipes simples (|), redireção (> >>), encadeamento (&&).
// Roda sempre — sem rede, sem CDN — e é o modo de execução de scripts .sh da IA.

import { vfs, normalizePath } from "./vfs";

export interface ShellEnv {
  cwd: string;
  user: string;
  host: string;
}

export interface ShellResult {
  output: string;
  code: number;
  cwd: string;
}

const BANNER = [
  "DS-BOX · Bash-86X (virtual shell)",
  "VFS ligado · comandos de arquivo · pipes e redireção básicos",
  "Digite 'help' para listar os comandos.",
].join("\n");

export function shellBanner(): string {
  return BANNER;
}

function resolve(env: ShellEnv, p: string): string {
  if (!p || p === ".") return env.cwd || "/";
  if (p.startsWith("/")) return normalizePath(p) || "/";
  const base = env.cwd && env.cwd !== "/" ? env.cwd + "/" : "";
  const joined = base + p;
  return normalizePath(joined) || "/";
}

function isDir(path: string): boolean {
  if (path === "/" || path === "") return true; // raiz do VFS sempre é diretório
  return vfs.paths().some(p => p.startsWith(path + "/"));
}

function splitPipes(line: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "|") { parts.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts.filter(Boolean);
}

function splitArgs(cmd: string): string[] {
  const args: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null; else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === " ") { if (cur) { args.push(cur); cur = ""; } continue; }
    cur += ch;
  }
  if (cur) args.push(cur);
  return args;
}

function extractRedirect(args: string[]): { args: string[]; redirect: { file: string; append: boolean } | null } {
  const out: string[] = [];
  let redirect: { file: string; append: boolean } | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === ">" || args[i] === ">>") {
      const file = args[i + 1];
      if (!file) break;
      redirect = { file, append: args[i] === ">>" };
      i++;
      continue;
    }
    out.push(args[i]);
  }
  return { args: out, redirect };
}

function fileWithLines(path: string): string[] {
  const content = vfs.read(path);
  return content === null ? [] : content.split("\n");
}

function treeLines(max = 60): string[] {
  const tree = vfs.tree(max);
  return tree.split("\n").slice(1);
}

function numArg(args: string[], flag: string, fallback: number): number {
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1] && /^\d+$/.test(args[idx + 1])) return parseInt(args[idx + 1], 10);
  return fallback;
}

/** Executa um comando do Bash-86X. Nunca lança — retorna código de saída. */
export async function runBash86(line: string, env: ShellEnv): Promise<ShellResult> {
  const trimmed = line.trim();
  if (!trimmed) return { output: "", code: 0, cwd: env.cwd };
  const segments = trimmed.split("&&").map(s => s.trim()).filter(Boolean);
  const outLines: string[] = [];
  let code = 0;
  let cwd = env.cwd;
  let pipedInput: string | null = null;

  for (const segment of segments) {
    if (code !== 0) break; // && encadeia apenas em sucesso
    const cmds = splitPipes(segment);
    let first = true;
    for (let ci = 0; ci < cmds.length; ci++) {
      const isLast = ci === cmds.length - 1;
      const raw = cmds[ci];
      const { args: args0, redirect } = extractRedirect(splitArgs(raw));
      const cmd = args0[0] ?? "";
      const args = args0.slice(1);
      const r = await execCommand(cmd, args, { env: { ...env, cwd }, pipedInput, cwdUpdate: c => { cwd = c; } });
      pipedInput = null;
      if (r.input) pipedInput = r.input;
      code = r.code;
      if (isLast || r.input === undefined) {
        let text = r.output;
        if (redirect) {
          const existing = redirect.append ? vfs.read(resolve(env, redirect.file)) ?? "" : "";
          const err = vfs.write(resolve(env, redirect.file), existing + text + (text.endsWith("\n") ? "" : "\n"));
          text = err ? `bash: ${redirect.file}: ${err}` : "";
        }
        if (text) outLines.push(text);
        else if (!isLast && r.input !== undefined) { /* dados seguem no pipe */ }
      }
      first = false;
      void first;
      if (code !== 0) break;
    }
  }
  return { output: outLines.filter(l => l !== "").join("\n"), code, cwd };
}

interface ExecArgs {
  env: ShellEnv;
  pipedInput: string | null;
  cwdUpdate: (c: string) => void;
}

async function execCommand(cmd: string, args: string[], ctx: ExecArgs): Promise<{ output: string; code: number; input?: string }> {
  const { env, pipedInput, cwdUpdate } = ctx;
  const stdin = pipedInput ?? "";
  const writeOut = (text: string): { output: string; code: number; input?: string } => ({ output: text, code: 0 });

  switch (cmd) {
    case "help":
      return writeOut([
        "Comandos Bash-86X:",
        "  ls [-l] [dir]      cat <arq>       echo <txt> [> arq]   pwd",
        "  cd <dir>           mkdir <dir>     touch <arq>          rm [-r] <alvo>",
        "  cp <a> <b>         mv <a> <b>      tree                 find <txt>",
        "  grep [-i] <txt> [arq]              head/tail [-n N] [arq]",
        "  wc [-l] [arq]      sort [arq]      uniq                 du",
        "  date               whoami          uname [-a]           hostname",
        "  ps                 df              history              clear",
        "  zip <nome>         template <id>   about",
        "Pipes: ls | grep iso   ·   Redireção: echo hi > nota.txt   ·   Encadeamento: cd x && ls",
      ].join("\n"));

    case "pwd":
      return writeOut(env.cwd || "/");

    case "ls": {
      const long = args.includes("-l");
      const target = resolve(env, args.find(a => !a.startsWith("-")) ?? "");
      if (!vfs.exists(target) && !isDir(target)) return { output: `ls: ${target}: não encontrado`, code: 1 };
      if (vfs.exists(target)) {
        const size = (vfs.read(target) ?? "").length;
        return writeOut(long ? `${size} ${target}` : target.split("/").pop() ?? target);
      }
      const prefix = target === "/" ? "" : target + "/";
      const kids = new Set<string>();
      for (const p of vfs.paths()) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const top = rest.split("/")[0];
        if (!top) continue;
        const isDirectory = rest.includes("/");
        kids.add(isDirectory ? top + "/" : top);
      }
      const list = [...kids].sort();
      return writeOut(long ? list.map(k => {
        const full = prefix + k.replace(/\/$/, "");
        const size = vfs.exists(full) ? (vfs.read(full) ?? "").length : 4096;
        return `${String(size).padStart(8)}  ${k}`;
      }).join("\n") : list.join("  ") || "(vazio)");
    }

    case "cd": {
      const target = resolve(env, args[0] ?? "/");
      if (target === "/" || isDir(target) || target === "") { cwdUpdate(target || "/"); return writeOut(""); }
      return { output: `cd: ${args[0] ?? "/"}: diretório não existe no VFS`, code: 1 };
    }

    case "cat": {
      const path = resolve(env, args[0] ?? "");
      const content = vfs.read(path);
      if (content === null) return { output: `cat: ${args[0] ?? ""}: arquivo não existe`, code: 1 };
      if (stdin && args.length === 0) return writeOut(stdin);
      return writeOut(content);
    }

    case "echo": {
      const text = args.join(" ");
      return writeOut(text.length > 0 ? text : "");
    }

    case "touch": {
      if (!args[0]) return { output: "touch: informe o arquivo", code: 1 };
      const err = vfs.write(resolve(env, args[0]), vfs.read(resolve(env, args[0])) ?? "");
      return err ? { output: `touch: ${err}`, code: 1 } : writeOut("");
    }

    case "mkdir": {
      if (!args[0]) return { output: "mkdir: informe o diretório", code: 1 };
      const path = resolve(env, args[0].replace(/\/$/, ""));
      if (path === "/" || isDir(path)) return writeOut("");
      const err = vfs.write(path + "/.keep", "");
      return err ? { output: `mkdir: ${err}`, code: 1 } : writeOut("");
    }

    case "rm": {
      const target = args.find(a => !a.startsWith("-"));
      if (!target) return { output: "rm: informe o alvo", code: 1 };
      const path = resolve(env, target);
      const recursive = args.includes("-r") || args.includes("-rf");
      if (isDir(path) && !recursive) return { output: `rm: ${path} é diretório (use -r)`, code: 1 };
      return vfs.rm(path) ? writeOut("") : { output: `rm: ${target}: não encontrado`, code: 1 };
    }

    case "cp": {
      if (args.length < 2) return { output: "cp: uso: cp <origem> <destino>", code: 1 };
      const src = resolve(env, args[0]);
      const content = vfs.read(src);
      if (content === null) return { output: `cp: ${args[0]}: não encontrado`, code: 1 };
      let dest = resolve(env, args[1]);
      if (isDir(dest)) dest = dest + "/" + (src.split("/").pop() ?? "copiado");
      const err = vfs.write(dest, content);
      return err ? { output: `cp: ${err}`, code: 1 } : writeOut("");
    }

    case "mv": {
      if (args.length < 2) return { output: "mv: uso: mv <origem> <destino>", code: 1 };
      const err = vfs.mv(resolve(env, args[0]), resolve(env, args[1]));
      return err ? { output: `mv: ${err}`, code: 1 } : writeOut("");
    }

    case "tree":
      return writeOut(vfs.tree(60).split("\n").slice(1).join("\n") || "(vazio)");

    case "find": {
      const needle = (args[0] ?? "").toLowerCase();
      const hits = vfs.paths().filter(p => p.toLowerCase().includes(needle));
      return writeOut(hits.join("\n") || "nenhum resultado");
    }

    case "grep": {
      const caseInsensitive = args.includes("-i");
      const pattern = args.find(a => !a.startsWith("-"));
      if (!pattern) return { output: "grep: informe o padrão", code: 1 };
      const target = args.find(a => !a.startsWith("-") && a !== pattern);
      const lines = target ? fileWithLines(resolve(env, target)) : stdin.split("\n");
      const needle = caseInsensitive ? pattern.toLowerCase() : pattern;
      const hits = lines.filter(l => (caseInsensitive ? l.toLowerCase() : l).includes(needle));
      return writeOut(hits.join("\n"));
    }

    case "head":
    case "tail": {
      const n = numArg(args, "-n", 10);
      const target = args.find(a => !a.startsWith("-") && a !== String(n));
      const lines = target ? fileWithLines(resolve(env, target)) : stdin.split("\n");
      const sel = cmd === "head" ? lines.slice(0, n) : lines.slice(-n);
      return writeOut(sel.join("\n"));
    }

    case "wc": {
      const linesOnly = args.includes("-l");
      const target = args.find(a => !a.startsWith("-"));
      const text = target ? vfs.read(resolve(env, target)) ?? "" : stdin;
      if (linesOnly) return writeOut(String(text.split("\n").filter((_, i, a) => i < a.length - 1 || a[a.length - 1] !== "").length));
      return writeOut(`${text.split("\n").length} linhas · ${text.length} bytes`);
    }

    case "sort": {
      const target = args.find(a => !a.startsWith("-"));
      const lines = (target ? fileWithLines(resolve(env, target)) : stdin.split("\n")).filter(Boolean);
      return writeOut(lines.sort((a, b) => a.localeCompare(b)).join("\n"));
    }

    case "uniq": {
      const lines = stdin.split("\n").filter(Boolean);
      const out: string[] = [];
      for (const l of lines) if (out[out.length - 1] !== l) out.push(l);
      return writeOut(out.join("\n"));
    }

    case "du": {
      const st = vfs.stats();
      return writeOut(`${st.files} arquivo(s) · ${st.bytes} bytes · ${st.dirs} diretório(s)`);
    }

    case "date":
      return writeOut(new Date().toString());

    case "whoami":
      return writeOut(env.user);

    case "hostname":
      return writeOut(env.host);

    case "uname":
      return writeOut(args.includes("-a")
        ? "DS-BoxOS 86x dsbox:1.0 virtual wasm:jit x86/32bit"
        : "DS-BoxOS");

    case "ps":
      return writeOut("  PID TTY      CMD\n    1 ttyS0    /sbin/init\n    7 ttyS0    bash-86x");

    case "df":
      return writeOut("Filesystem      Size  Used  Use%  Mounted on\nvfs-local        8M    -     -    /");

    case "history":
      return writeOut("(histórico do terminal está na interface)");

    case "clear":
      return writeOut("\u0000CLEAR");

    case "zip": {
      const name = args[0] ?? "dsbox-projeto";
      const n = await vfs.downloadZip(name);
      return writeOut(`📦 ${name}.zip gerado com ${n} arquivo(s)`);
    }

    case "template": {
      const { seedTemplate, TEMPLATES } = await import("./vfs");
      const id = args[0] as never;
      const valid = TEMPLATES.find(t => t.id === id);
      if (!valid) return { output: `template: use um de ${TEMPLATES.map(t => t.id).join(", ")}`, code: 1 };
      const written = seedTemplate(id, args[1]);
      return writeOut(`📄 criados: ${written.join(", ")}`);
    }

    case "about":
      return writeOut("DS-BOX · Sandbox Linux virtual da Vessie-AI\nBash-86X = shell virtual no navegador, ligado ao VFS local.\nPara x86 REAL, use a aba Emulador (v86) com uma ISO.");

    case "python":
    case "python3":
    case "node":
      return { output: `${cmd} não existe no Bash-86X — use o Script Lab (aba Scripts) para rodar isso.`, code: 1 };

    default:
      if (stdin) return { output: "", code: 127 }; // pipe para comando desconhecido
      return { output: `bash-86x: comando não encontrado: ${cmd} (help lista todos)`, code: 127 };
  }
}

export function defaultShellEnv(): ShellEnv {
  return { cwd: "/", user: "vessie", host: "dsbox" };
}
