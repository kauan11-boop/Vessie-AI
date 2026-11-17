// DS-BOX — Sistema de Arquivos Virtual (VFS)
// Create-File / Read-Files / Edit-Files / tree automático / ZIP de projetos.
// Persiste em localStorage (dsbox-vfs-v1); reage via useSyncExternalStore (contador de versão).
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

export interface VfsFile {
  path: string;
  content: string;
  mtime: number;
}

export type VfsGenre =
  | "web" | "style" | "script" | "markdown" | "json" | "shell"
  | "python" | "config" | "image" | "iso" | "text";

const KEY = "dsbox-vfs-v1";
const MAX_FILE = 512 * 1024; // 512 KB por arquivo (mesmo limite do Memory)
const MAX_TOTAL = 8 * 1024 * 1024; // 8 MB totais

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { parts.pop(); continue; }
    parts.push(seg.replace(/[\u0000-\u001f]/g, ""));
  }
  return parts.join("/");
}

function extOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function genreOf(path: string): VfsGenre {
  const e = extOf(path);
  if (["html", "htm", "xhtml"].includes(e)) return "web";
  if (["css"].includes(e)) return "style";
  if (["js", "mjs", "cjs", "ts", "tsx", "jsx", "lua", "rb", "php", "java", "c", "h", "cpp", "rs", "go"].includes(e)) return "script";
  if (["md", "mdx", "markdown"].includes(e)) return "markdown";
  if (["json", "yml", "yaml", "toml", "ini", "cfg"].includes(e)) return "config";
  if (["sh", "bash", "zsh"].includes(e)) return "shell";
  if (["py"].includes(e)) return "python";
  if (["svg", "png", "jpg", "jpeg", "gif", "webp", "ico"].includes(e)) return "image";
  if (["iso", "img"].includes(e)) return "iso";
  return "text";
}

type Listener = () => void;

class VirtualFileSystem {
  private files = new Map<string, string>();
  private mtime = new Map<string, number>();
  private ver = 0;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;
  // snapshot cacheado (contrato do useSyncExternalStore: mesma referência até mudar)
  private cachedList: VfsFile[] | null = null;

  private ensure(): void {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        for (const [p, c] of Object.entries(parsed)) {
          if (typeof c === "string") { this.files.set(p, c); this.mtime.set(p, Date.now()); }
        }
      }
    } catch { /* estado corrompido → começa vazio */ }
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const out: Record<string, string> = {};
        for (const [p, c] of this.files) out[p] = c;
        localStorage.setItem(KEY, JSON.stringify(out));
      } catch { /* cota cheia — mantém só em memória */ }
    }, 300);
  }

  private bump(): void {
    this.ver++;
    this.cachedList = null;
    this.listeners.forEach(fn => fn());
  }

  subscribe = (fn: Listener): (() => void) => {
    this.ensure();
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => {
    this.ensure();
    return this.ver;
  };

  list = (): VfsFile[] => {
    this.ensure();
    if (this.cachedList) return this.cachedList;
    this.cachedList = [...this.files.keys()].sort().map(path => ({
      path, content: this.files.get(path) ?? "", mtime: this.mtime.get(path) ?? 0,
    }));
    return this.cachedList;
  };

  paths = (): string[] => this.list().map(f => f.path);

  exists(path: string): boolean {
    this.ensure();
    return this.files.has(normalizePath(path));
  }

  read(path: string): string | null {
    this.ensure();
    return this.files.get(normalizePath(path)) ?? null;
  }

  /** Create-File / Write-File. Retorna erro (string) ou null quando ok. */
  write(path: string, content: string): string | null {
    this.ensure();
    const p = normalizePath(path);
    if (!p) return "caminho vazio";
    if (content.length > MAX_FILE) return `arquivo excede ${MAX_FILE / 1024} KB`;
    const replacing = this.files.has(p);
    if (!replacing) {
      const total = [...this.files.values()].reduce((a, c) => a + c.length, 0);
      if (total + content.length > MAX_TOTAL) return "espaço do DS-BOX cheio (8 MB) — remova arquivos";
    }
    this.files.set(p, content);
    this.mtime.set(p, Date.now());
    this.bump(); this.persist();
    return null;
  }

  rm(path: string): boolean {
    this.ensure();
    const p = normalizePath(path);
    let removed = false;
    if (this.files.has(p)) { this.files.delete(p); this.mtime.delete(p); removed = true; }
    // se for "diretório", remove tudo abaixo
    const prefix = p + "/";
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) { this.files.delete(key); this.mtime.delete(key); removed = true; }
    }
    if (removed) { this.bump(); this.persist(); }
    return removed;
  }

  mv(from: string, to: string): string | null {
    const content = this.read(from);
    if (content === null) return `não existe: ${from}`;
    const err = this.write(to, content);
    if (err) return err;
    this.rm(from);
    return null;
  }

  /** Diretórios únicos presentes no VFS (por prefixo). */
  dirs(): string[] {
    const set = new Set<string>();
    for (const p of this.paths()) {
      const parts = p.split("/");
      for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/"));
    }
    return [...set].sort();
  }

  /** Árvore ASCII (auto-enviada ao modelo quando o DCS está ativo). */
  tree(maxEntries = 200): string {
    this.ensure();
    const paths = this.paths();
    if (paths.length === 0) return "(vazio)";
    interface Node { children: Map<string, Node>; file?: string }
    const root: Node = { children: new Map() };
    for (const p of paths.slice(0, maxEntries)) {
      let node = root;
      const parts = p.split("/");
      parts.forEach((seg, i) => {
        if (!node.children.has(seg)) node.children.set(seg, { children: new Map() });
        node = node.children.get(seg)!;
        if (i === parts.length - 1) node.file = seg;
      });
    }
    const lines: string[] = [];
    const walk = (node: Node, prefix: string) => {
      const kids = [...node.children.entries()];
      kids.forEach(([name, child], idx) => {
        const last = idx === kids.length - 1;
        lines.push(`${prefix}${last ? "└─ " : "├─ "}${name}${child.file !== undefined ? "" : "/"}`);
        walk(child, prefix + (last ? "   " : "│  "));
      });
    };
    lines.push("/");
    walk(root, "");
    if (paths.length > maxEntries) lines.push(`… (${paths.length - maxEntries} arquivos não exibidos)`);
    return lines.join("\n");
  }

  stats(): { files: number; bytes: number; dirs: number } {
    this.ensure();
    const files = this.files.size;
    const bytes = [...this.files.values()].reduce((a, c) => a + c.length, 0);
    return { files, bytes, dirs: this.dirs().length };
  }

  clear(): void {
    this.ensure();
    this.files.clear(); this.mtime.clear();
    this.bump(); this.persist();
  }

  /** ZIP do projeto inteiro (ou de um subconjunto de caminhos). */
  async zipBytes(paths?: string[]): Promise<Uint8Array> {
    this.ensure();
    const entries: Record<string, Uint8Array> = {};
    const wanted = paths && paths.length > 0 ? new Set(paths.map(normalizePath)) : null;
    for (const f of this.list()) {
      if (wanted && !wanted.has(f.path)) continue;
      entries[f.path] = strToU8(f.content);
    }
    return zipSync(entries, { level: 6 });
  }

  /** Importa um ZIP (Create-Files em lote). Retorna nº de arquivos ou mensagem de erro. */
  importZip(data: ArrayBuffer | Uint8Array): number | string {
    try {
      const un = unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data));
      let n = 0;
      for (const [p, bytes] of Object.entries(un)) {
        if (p.endsWith("/") || p.includes("__MACOSX")) continue;
        const err = this.write(p, strFromU8(bytes));
        if (err) return err;
        n++;
      }
      return n;
    } catch (e) {
      return `ZIP inválido: ${(e as Error).message}`;
    }
  }

  downloadZip(name = "dsbox-projeto", paths?: string[]): Promise<number> {
    return this.zipBytes(paths).then(bytes => {
      const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name.endsWith(".zip") ? name : `${name}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      const wanted = paths && paths.length > 0 ? new Set(paths.map(normalizePath)) : null;
      return wanted ? this.list().filter(f => wanted.has(f.path)).length : this.files.size;
    });
  }
}

export const vfs = new VirtualFileSystem();
export { normalizePath, extOf };

// ---------- templates de projeto (gêneros de script para o Script Lab) ----------
export type TemplateId = "web-app" | "node-cli" | "python-cli" | "linux-iso" | "lua-game" | "md-doc" | "terminal-app" | "discord-bot" | "data-report";

export const TEMPLATES: { id: TemplateId; label: string; desc: string }[] = [
  { id: "web-app", label: "Web App (HTML/CSS/JS)", desc: "site estático multi-arquivo com preview iframe" },
  { id: "node-cli", label: "Node CLI (JS)", desc: "ferramenta de linha de comando executável no sandbox" },
  { id: "python-cli", label: "Python CLI", desc: "script .py com entrypoint para o Script Lab" },
  { id: "linux-iso", label: "Linux ISO (Build-Iso)", desc: "esqueleto de distribuição: init, motd, config de kernel" },
  { id: "lua-game", label: "Lua mini-game", desc: "jogo em Lua com loop simples" },
  { id: "md-doc", label: "Documento Markdown", desc: "README técnico renderizado" },
  { id: "terminal-app", label: "Terminal App (.sh)", desc: "app de terminal para o Bash-86X com menu e comandos" },
  { id: "discord-bot", label: "Discord Bot (JS)", desc: "esqueleto de agente Discord com perfil de estilo" },
  { id: "data-report", label: "Relatório de Dados (PY+MD)", desc: "dataset + análise em Python + relatório markdown" },
];

const WEB_INDEX = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DS-BOX Web App</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <main>
    <h1>DS-BOX · Web App</h1>
    <p>Editado pelo sistema de arquivos virtual. Contador: <strong id="count">0</strong></p>
    <button id="btn">Clique</button>
  </main>
  <script src="./app.js"></script>
</body>
</html>
`;
const WEB_CSS = `:root { --accent: #C15F3C; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center;
  font-family: system-ui, sans-serif; background: #14100e; color: #f1ece7; }
main { text-align: center; padding: 2rem; border: 1px solid #2b2420; border-radius: 12px; }
h1 { color: var(--accent); }
button { padding: .6rem 1.4rem; border: 1px solid var(--accent); background: transparent;
  color: var(--accent); border-radius: 8px; cursor: pointer; font-size: 1rem; }
button:hover { background: var(--accent); color: #14100e; }
`;
const WEB_JS = `const btn = document.getElementById("btn");
const count = document.getElementById("count");
let n = 0;
btn.addEventListener("click", () => {
  n += 1;
  count.textContent = String(n);
});
`;
const NODE_CLI = `// DS-BOX Node CLI — executável no sandbox (ds:run / Script Lab)
const input = typeof input !== "undefined" ? input : {};
function banner(text) {
  return text.split("").reverse().join("");
}
const out = {
  banner: banner("DS-BOX"),
  input,
  timestamp: Date.now(),
};
console.log(JSON.stringify(out, null, 2));
return "cli ok";
`;
const PY_CLI = `# DS-BOX Python CLI — preview/edição no Script Lab
import sys


def main(argv):
    print("DS-BOX python cli")
    for i, arg in enumerate(argv):
        print(f"  arg[{i}] = {arg}")
    total = sum(int(a) for a in argv if a.lstrip("-").isdigit())
    print(f"soma numerica: {total}")
    return total


if __name__ == "__main__":
    main(sys.argv[1:])
`;
const LINUX_ISO = `#!/bin/sh
# DS-BOX Linux ISO — script init do skeleton de distribuição
mount -t proc proc /proc 2>/dev/null
echo "[init] DS-BOXOS iniciando"
cat /etc/motd
exec /bin/sh
`;
const LINUX_MOTD = `+--------------------------------------+
|   DS-BOXOS · Live ISO montada por IA |
|   kernel: bzImage (preset)           |
+--------------------------------------+
Bem-vindo ao sistema operacional livre do DS-BOX.
`;
const LINUX_CFG = `# Configuração de boot gerada pelo Build-Iso
# kernel: bzImage
# cmdline: console=ttyS0 quiet
# initrd: (opcional)
`;
const LUA_GAME = `-- DS-BOX Lua mini-game
local x, y = 8, 4
local score = 0
local function draw()
  print("+" .. string.rep("-", 16) .. "+")
  for row = 1, 8 do
    local line = "|"
    for col = 1, 16 do
      line = line .. (col == x and row == y and "@" or " ")
    end
    print(line .. "|")
  end
  print("+" .. string.rep("-", 16) .. "+")
  print("score: " .. score)
end
draw()
return "lua ok"
`;
const MD_DOC = `# Projeto DS-BOX

Gerado pelo **Dynamic Creation System** da Vessie-AI.

## Comandos DS-BOX

- \`ds:tree\` — árvore do projeto
- \`ds:zip\` — empacotar em ZIP
- \`ds:iso\` — montar ISO 9660
`;
const TERMINAL_APP = `#!/bin/sh
# DS-BOX Terminal App — roda no Bash-86X (ds:term ou aba virtual)
MENU=
while [ "\$MENU" != "0" ]; do
  echo "=== DS-BOX App ==="
  echo "1) hora        2) arquivos     0) sair"
  read MENU
  case "\$MENU" in
    1) date ;;
    2) ls -la ;;
  esac
done
echo "tchau!"
`;
const DISCORD_BOT = `// DS-BOX Discord Agent — esqueleto (a integração real vive nas Configurações → Discord)
// A Vessie-AI usa o perfil de estilo do dono para responder como ele.
export const config = {
  channel: "SEU_ID_DE_CANAL",
  style: {
    emojiRate: 0.8,
    fraseCurta: true,
    idioma: "pt-BR",
  },
};
export function draftReply(incoming, profile) {
  // na prática: composeStyledReply() da lib/discord.ts faz o chamado com o modelo
  return profile.fraseCurta ? incoming.slice(0, 80) : incoming;
}
console.log("discord agent pronto — use /discord no chat para controlar");
`;
const DATA_REPORT = `# Relatório de Dados (DS-BOX)

Dataset de exemplo + análise python (ds:script:py).

| métrica | valor |
|---------|-------|
| registros | 12 |
| fonte | VFS local |
`;
const DATA_PY = `# DS-BOX data report — roda com ds:script:py ou ds:run
data = [12, 7, 33, 5, 21, 8, 42, 17, 9, 30, 3, 26]
n = len(data)
media = sum(data) / n
ordenado = sorted(data)
mediana = (ordenado[n//2 - 1] + ordenado[n//2]) / 2
variancia = sum((x - media) ** 2 for x in data) / n
print(f"n={n} media={media:.1f} mediana={mediana} desvio={variancia ** 0.5:.1f}")
print("top-3:", ordenado[-3:])
`;

export function seedTemplate(id: TemplateId, prefix = ""): string[] {
  const dir = prefix ? normalizePath(prefix) + "/" : "";
  const written: string[] = [];
  const put = (path: string, content: string) => {
    const err = vfs.write(dir + path, content);
    if (!err) written.push(dir + path);
  };
  switch (id) {
    case "web-app":
      put("index.html", WEB_INDEX); put("styles.css", WEB_CSS); put("app.js", WEB_JS);
      break;
    case "node-cli":
      put("cli.js", NODE_CLI); put("package.json", `{\n  "name": "dsbox-cli",\n  "version": "1.0.0",\n  "bin": { "dsbox": "./cli.js" }\n}\n`);
      break;
    case "python-cli":
      put("main.py", PY_CLI); put("requirements.txt", "# sem dependências externas\n");
      break;
    case "linux-iso":
      put("init.sh", LINUX_ISO); put("etc/motd", LINUX_MOTD); put("boot/boot.cfg", LINUX_CFG);
      put("README.md", "# DS-BOXOS skeleton\n\nBase para o Build-Iso montar uma ISO bootável.\n");
      break;
    case "lua-game":
      put("game.lua", LUA_GAME);
      break;
    case "md-doc":
      put("README.md", MD_DOC); put("notes.md", "# Notas\n\n- ");
      break;
    case "terminal-app":
      put("app.sh", TERMINAL_APP); put("README.md", "# Terminal App\n\nRode com ds:term `sh app.sh` no chat.\n");
      break;
    case "discord-bot":
      put("agent.js", DISCORD_BOT); put("perfil-estilo.md", "# Perfil de estilo\n\nGerado automaticamente pelas conversas (lib/discord.ts).\n");
      break;
    case "data-report":
      put("report.md", DATA_REPORT); put("analyze.py", DATA_PY);
      break;
  }
  return written;
}

// ---------- rootfs Linux real (ds:install — instalação de conteúdo de SO) ----------

/** Packages "instaláveis" no rootfs virtual: cada um planta arquivos reais no VFS. */
export const ROOTFS_PACKAGES: Record<string, Array<{ path: string; content: string }>> = {
  busybox: [
    { path: "bin/busybox", content: "#!/bin/sh\necho 'busybox 1.36 (virtual) — applets: sh ls cat echo mount ps'\n" },
    { path: "bin/sh", content: "#!/bin/sh\nexec /bin/busybox sh\n" },
  ],
  python: [
    { path: "usr/bin/python3", content: "#!/bin/sh\necho 'Python 3.12 (virtual rootfs) — rode scripts reais com ds:script:py'\n" },
    { path: "usr/lib/python3/version.txt", content: "3.12.7\n" },
  ],
  git: [
    { path: "usr/bin/git", content: "#!/bin/sh\necho 'git 2.44 (virtual rootfs)'\n" },
    { path: "etc/gitconfig", content: "[init]\n\tdefaultBranch = main\n" },
  ],
  nginx: [
    { path: "usr/sbin/nginx", content: "#!/bin/sh\necho 'nginx (virtual rootfs) — html em /var/www/html'\n" },
    { path: "var/www/html/index.html", content: "<!DOCTYPE html>\n<html><head><title>Servindo pelo rootfs</title></head><body><h1>DS-BOX nginx</h1></body></html>\n" },
    { path: "etc/nginx/nginx.conf", content: "server {\n  listen 80;\n  root /var/www/html;\n}\n" },
  ],
  vim: [{ path: "usr/bin/vim", content: "#!/bin/sh\necho 'vim 9 (virtual rootfs)'\n" }],
  curl: [{ path: "usr/bin/curl", content: "#!/bin/sh\necho 'curl 8 (virtual rootfs) — rede real: ds:fetch'\n" }],
};

/**
 * Instala um rootfs Linux REAL no VFS (arquivos de verdade, navegáveis no Files,
 * editáveis pela IA e visíveis pelo Bash-86X). `distro` nomeia o sistema;
 * `packages` planta binários/configs extras. Retorna os caminhos criados.
 */
export function installRootfs(distro = "dsboxlinux", packages: string[] = ["busybox"], prefix = ""): string[] {
  const dir = prefix ? normalizePath(prefix).replace(/\/+$/, "") + "/" : "";
  const written: string[] = [];
  const put = (path: string, content: string) => {
    const err = vfs.write(dir + path, content);
    if (!err) written.push(dir + path);
  };
  const hostname = distro.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20) || "dsboxlinux";
  // base FHS
  put("etc/os-release",
    `NAME="${distro}"\nID=${hostname}\nVERSION_ID="1.0"\nPRETTY_NAME="${distro} 1.0 (web)"\nHOME_URL="https://vessie.ai"\nDSBOX=1\n`);
  put("etc/hostname", `${hostname}\n`);
  put("etc/hosts", `127.0.0.1  localhost  ${hostname}\n`);
  put("etc/passwd",
    "root:x:0:0:root:/root:/bin/sh\nuser:x:1000:1000:user:/home/user:/bin/sh\n");
  put("etc/motd",
    `Bem-vindo ao ${distro} 1.0 — rootfs real no VFS do DS-BOX.\nDigite 'help' no Bash-86X para os comandos.\n`);
  put("etc/fstab", "# sistema de arquivos virtual do DS-BOX\n");
  put("bin/ls", "#!/bin/sh\n# ls real do VFS é fornecido pelo Bash-86X\n");
  put("boot/vmlinuz.cfg", "kernel=/boot/vmlinuz\nconsole=ttyS0\n");
  put("root/.profile", "# perfil do root\nexport PS1='root@" + hostname + ":\\w# '\n");
  put("home/user/README.md", `# ${distro}\n\nInstalado pela Vessie-AI via ds:install. Edite qualquer arquivo (ds:write/ds:edit) — acesso total.\n`);
  put("var/log/boot.log", `[    0.000000] ${distro} rootfs instalado no VFS\n`);
  put("var/log/dpkg.log", "");
  put("usr/share/doc/LICENSE", "MIT — DS-BOX rootfs virtual.\n");
  put("tmp/.keep", "");
  // pacotes
  for (const p of packages) {
    const files = ROOTFS_PACKAGES[p.toLowerCase()];
    if (!files) continue;
    for (const f of files) put(f.path, f.content);
    put(`var/lib/dsbox/installed/${p.toLowerCase()}.txt`, `package: ${p}\ninstalled: ${new Date().toISOString()}\nby: vessie-ai ds:install\n`);
  }
  return written;
}
