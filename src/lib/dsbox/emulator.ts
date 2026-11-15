// DS-BOX — Emulador v86 (x86 em WebAssembly) carregado sob demanda via CDN.
// Fontes (verificadas em jsdelivr, 2026-11):
//   lib: https://cdn.jsdelivr.net/npm/v86@0.5.473/build/libv86.js   (200 OK)
//   wasm: https://cdn.jsdelivr.net/npm/v86@0.5.473/build/v86.wasm   (200 OK)
//   bios: https://cdn.jsdelivr.net/gh/copy/v86@master/bios/*.bin    (200 OK)
// Modos de boot: ISO (cdrom), kernel (bzimage+initrd+cmdline), multiboot.
// Se o CDN estiver inacessível, o Bash-86X (virtual) continua disponível.

export type EmulatorStatus = "idle" | "loading" | "booting" | "running" | "error";

export interface BootRequest {
  mode: "iso" | "kernel" | "multiboot";
  isoBuffer?: ArrayBuffer;
  bzimage?: ArrayBuffer;
  initrd?: ArrayBuffer;
  cmdline?: string;
  memoryMB?: number;       // default 128
  label?: string;
}

export interface BootLogLine { at: number; text: string }

const CDN_BASE = "https://cdn.jsdelivr.net/npm/v86@0.5.473";
const GH_BASE = "https://cdn.jsdelivr.net/gh/copy/v86@master";

export const EMULATOR_ASSETS = {
  lib: `${CDN_BASE}/build/libv86.js`,
  wasm: `${CDN_BASE}/build/v86.wasm`,
  seabios: `${GH_BASE}/bios/seabios.bin`,
  vgabios: `${GH_BASE}/bios/vgabios.bin`,
};

interface V86Instance {
  run: () => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  restart: () => void;
  add_listener: (event: string, listener: (arg?: unknown) => void) => void;
  keyboard_send_text: (text: string) => void;
  serial_send?: (text: string) => void;
  screen_go_fullscreen?: () => void;
  is_running: () => boolean;
}

type Listener = (status: EmulatorStatus, msg: string, log?: BootLogLine) => void;

let scriptLoaded = false;
let scriptPromise: Promise<void> | null = null;
let instance: V86Instance | null = null;
let listeners = new Set<Listener>();
let status: EmulatorStatus = "idle";
let statusMsg = "";
let serialBuffer: string[] = [];

function notify(next: EmulatorStatus, msg: string, log?: BootLogLine): void {
  status = next;
  statusMsg = msg;
  listeners.forEach(fn => fn(next, msg, log));
}

export function getEmulatorStatus(): EmulatorStatus { return status; }
export function getEmulatorMsg(): string { return statusMsg; }
export function isEmulatorRunning(): boolean { return instance !== null && instance.is_running(); }

export function onEmulatorChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function serialLines(): string[] { return serialBuffer; }

/** Carrega libv86.js uma única vez. */
export async function loadV86(): Promise<void> {
  if (scriptLoaded && (window as unknown as Record<string, unknown>).V86) return;
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    notify("loading", "baixando emulador (libv86.js ~360 KB)…");
    const script = document.createElement("script");
    script.src = EMULATOR_ASSETS.lib;
    script.onload = () => {
      if ((window as unknown as Record<string, unknown>).V86) {
        scriptLoaded = true;
        notify("idle", "emulador carregado");
        resolve();
      } else {
        reject(new Error("libv86 carregado mas window.V86 ausente"));
      }
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("CDN do v86 inacessível (verifique a conexão) — use o Bash-86X virtual"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Boota a máquina. screenContainer: div com <div> + <canvas> dentro (estrutura v86). serialEl: textarea. */
export async function bootMachine(
  req: BootRequest,
  ui: { screenContainer: HTMLDivElement; serialEl: HTMLTextAreaElement | null }
): Promise<void> {
  await loadV86();
  if (instance) await powerOff();

  notify("booting", `inicializando ${req.label ?? req.mode}…`);

  const V86 = (window as unknown as Record<string, unknown>).V86 as
    new (options: Record<string, unknown>) => V86Instance;

  const options: Record<string, unknown> = {
    wasm_path: EMULATOR_ASSETS.wasm,
    memory_size: (req.memoryMB ?? 128) * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
    screen_container: ui.screenContainer,
    autostart: true,
    disable_speaker: true,
    fastboot: true,
    // console serial (texto) — nova e legada, a que existir é usada
    serial: { type: "textarea", container: ui.serialEl },
    serial_adapter: true,
    serial_container: ui.serialEl,
    log_level: 0,
  };

  if (req.mode === "iso" && req.isoBuffer) {
    options.bios = { buffer: await fetchBuffer(EMULATOR_ASSETS.seabios) };
    options.vga_bios = { buffer: await fetchBuffer(EMULATOR_ASSETS.vgabios) };
    options.cdrom = { buffer: req.isoBuffer };
  } else if (req.mode === "kernel" && req.bzimage) {
    options.bzimage = { buffer: req.bzimage };
    if (req.initrd) options.initrd = { buffer: req.initrd };
    if (req.cmdline) options.cmdline = req.cmdline;
  } else if (req.mode === "multiboot") {
    options.bios = { buffer: await fetchBuffer(EMULATOR_ASSETS.seabios) };
    options.vga_bios = { buffer: await fetchBuffer(EMULATOR_ASSETS.vgabios) };
  } else {
    throw new Error("fonte de boot ausente (ISO ou kernel)");
  }

  serialBuffer = [];
  instance = new V86(options);

  instance.add_listener("emulator-started", () => {
    notify("running", "emulador rodando");
    log(`▶ boot iniciado (${req.label ?? req.mode})`);
  });
  instance.add_listener("emulator-ready", () => notify("running", "pronto"));
  (instance.add_listener as (e: string, l: (d: unknown) => void) => void)("download-error", (d: unknown) => {
    notify("error", `download falhou: ${JSON.stringify(d)}`);
    log(`✖ download-error: ${JSON.stringify(d)}`);
  });

  // espelho do serial no buffer interno
  const mirror = () => {
    if (!ui.serialEl) return;
    const text = ui.serialEl.value;
    if (text && text.length > serialBuffer.join("").length) {
      serialBuffer = text.split("\n").slice(-500);
    }
  };
  setIntervalSafe(mirror);
}

let mirrorTimer: ReturnType<typeof setInterval> | null = null;
function setIntervalSafe(fn: () => void): void {
  if (mirrorTimer) clearInterval(mirrorTimer);
  mirrorTimer = setInterval(fn, 1000);
  // auto-limpa quando a máquina desliga
  void (async () => {
    while (instance) await new Promise(r => setTimeout(r, 1000));
    if (mirrorTimer) { clearInterval(mirrorTimer); mirrorTimer = null; }
  })();
}

const logLines: BootLogLine[] = [];
function log(text: string): void {
  logLines.push({ at: Date.now(), text });
  if (logLines.length > 300) logLines.shift();
}
export function bootLog(): BootLogLine[] { return [...logLines]; }

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  // timeout honesto: kernels/BIOS grandes podem demorar, mas falha deve aparecer (não travar)
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
    return await res.arrayBuffer();
  } finally {
    clearTimeout(to);
  }
}

/** Envia texto como teclado para o convidado (autologin, comandos). */
export function sendKeyboardText(text: string): void {
  instance?.keyboard_send_text(text + "\n");
}

export async function resetMachine(): Promise<void> {
  instance?.restart();
}

export async function powerOff(): Promise<void> {
  const inst = instance;
  instance = null;
  if (mirrorTimer) { clearInterval(mirrorTimer); mirrorTimer = null; }
  if (inst) {
    try { await inst.destroy(); } catch { try { await inst.stop(); } catch { /* já parado */ } }
  }
  notify("idle", "emulador desligado");
}

/** Boot direto por preset de kernel (Buildroot etc.) com progresso. */
export async function bootKernelFromUrl(
  cfg: { bzimage: string; initrd?: string; cmdline?: string; label?: string; memoryMB?: number },
  ui: { screenContainer: HTMLDivElement; serialEl: HTMLTextAreaElement | null },
  onProgress?: (msg: string) => void
): Promise<void> {
  onProgress?.(`baixando kernel: ${cfg.bzimage}`);
  const bzimage = await fetchBuffer(cfg.bzimage);
  let initrd: ArrayBuffer | undefined;
  if (cfg.initrd) {
    onProgress?.(`baixando initrd: ${cfg.initrd}`);
    initrd = await fetchBuffer(cfg.initrd);
  }
  await bootMachine({
    mode: "kernel",
    bzimage,
    initrd,
    cmdline: cfg.cmdline,
    memoryMB: cfg.memoryMB,
    label: cfg.label ?? "kernel",
  }, ui);
}
