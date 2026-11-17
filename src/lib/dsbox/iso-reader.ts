// DS-BOX — Leitor ISO 9660: valida o arquivo .iso e extrai, DO PRÓPRIO ARQUIVO,
// os componentes de boot (/boot/bzimage, /boot/initrd, /boot/boot.cfg).
//
// É o gate "SÓ .ISO EXECUTA SISTEMA OPERACIONAL": o emulador só roda um SO a
// partir de um arquivo ISO 9660 válido na prateleira — o cdrom é montado com os
// bytes da ISO e o kernel/initrd usados no boot são lidos de DENTRO dela (a ISO
// é a fonte única; nada de boot por kernel solto fora de um .iso).

const SECTOR = 2048;
const PVD_LBA = 16;

export interface IsoBootExtract {
  valid: boolean;
  volumeId: string;
  sectors: number;
  bootable: boolean;      // tem /boot/bzimage dentro
  bzimage?: Uint8Array;
  initrd?: Uint8Array;
  cmdline?: string;
  files: string[];        // caminhos encontrados na raiz (debug/relatório)
  reason?: string;        // quando inválida, o motivo honesto
}

interface IsoDirRecord {
  lba: number;
  size: number;
  isDir: boolean;
  name: string;           // sem o ";1"
}

function u32le(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24);
}

/** Valida assinatura CD001 (PVD) e devolve o record do diretório raiz. */
function rootRecord(data: Uint8Array): { lba: number; size: number; volumeId: string } | null {
  if (data.length < (PVD_LBA + 1) * SECTOR) return null;
  const base = PVD_LBA * SECTOR;
  if (data[base] !== 1) return null; // tipo 1 = Primary Volume Descriptor
  if (String.fromCharCode(data[base + 1], data[base + 2], data[base + 3], data[base + 4], data[base + 5]) !== "CD001") return null;
  // root directory record em 156 (34 bytes)
  const rr = base + 156;
  if (data[rr] === 0) return null;
  const lba = u32le(data, rr + 2);
  const size = u32le(data, rr + 10);
  let volumeId = "";
  for (let i = 0; i < 32; i++) {
    const c = data[base + 40 + i];
    if (c === 32 && volumeId.length === 0) continue;
    volumeId += String.fromCharCode(c);
  }
  return { lba, size, volumeId: volumeId.trim() || "DSBOXISO" };
}

/** Lê os records de um extent de diretório (a extensão pode ter vários setores). */
function readDirExtent(data: Uint8Array, lba: number, size: number): IsoDirRecord[] {
  const out: IsoDirRecord[] = [];
  const end = Math.min(lba * SECTOR + size, data.length);
  let p = lba * SECTOR;
  while (p < end - 33) {
    const len = data[p];
    if (len === 0) { p = (Math.floor(p / SECTOR) + 1) * SECTOR; continue; } // padding → próximo setor
    const nameLen = data[p + 32];
    const flags = data[p + 25];
    const recLba = u32le(data, p + 2);
    const recSize = u32le(data, p + 10);
    let name = "";
    for (let i = 0; i < nameLen; i++) name += String.fromCharCode(data[p + 33 + i]);
    // "." e ".." vêm como um único byte 0x00/0x01 (não são nomes reais)
    if (nameLen === 1 && (name === "\x00" || name === "\x01")) { p += len; continue; }
    name = name.replace(/;\d+$/, ""); // remove versão ISO ("ARQUIVO.TXT;1")
    out.push({ lba: recLba, size: recSize, isDir: (flags & 0x02) !== 0, name });
    p += len;
  }
  return out;
}

/** Busca um caminho ("boot/bzimage") dentro da ISO. Retorna o record ou null. */
function findIsoPath(data: Uint8Array, root: { lba: number; size: number }, path: string): IsoDirRecord | null {
  const parts = path.split("/").filter(Boolean).map(s => s.toUpperCase());
  let dir = root;
  let records = readDirExtent(data, dir.lba, dir.size);
  for (let i = 0; i < parts.length; i++) {
    const want = parts[i];
    const hit = records.find(r => r.name.toUpperCase() === want);
    if (!hit) return null;
    if (i === parts.length - 1) return hit;
    if (!hit.isDir) return null;
    dir = { lba: hit.lba, size: hit.size };
    records = readDirExtent(data, dir.lba, dir.size);
  }
  return null;
}

function sliceExtent(data: Uint8Array, rec: IsoDirRecord): Uint8Array {
  const start = rec.lba * SECTOR;
  return data.slice(start, start + rec.size);
}

function parseCmdlineFromBootCfg(cfg: string): string | undefined {
  const m = /^\s*cmdline\s*:\s*(.+)\s*$/mi.exec(cfg);
  const v = m?.[1]?.trim();
  return v && v !== "(none)" ? v : undefined;
}

/**
 * Valida a ISO e extrai o boot de dentro dela.
 * Não lança — sempre devolve {valid, reason?} para relatório honesto.
 */
export function readIsoBootFiles(data: Uint8Array): IsoBootExtract {
  const empty: IsoBootExtract = { valid: false, volumeId: "", sectors: Math.ceil(data.length / SECTOR), bootable: false, files: [] };
  const root = rootRecord(data);
  if (!root) {
    return { ...empty, reason: "assinatura ISO 9660 (CD001) ausente — o arquivo não é um .iso válido" };
  }
  const files: string[] = [];
  const rootRecords = readDirExtent(data, root.lba, root.size);
  for (const r of rootRecords) {
    if (r.name && r.name !== "." && r.name !== "..") files.push(r.isDir ? `${r.name}/` : r.name);
  }

  const bzRec = findIsoPath(data, root, "boot/bzimage");
  const initrdRec = findIsoPath(data, root, "boot/initrd");
  const cfgRec = findIsoPath(data, root, "boot/boot.cfg");

  const bzimage = bzRec ? sliceExtent(data, bzRec) : undefined;
  const initrd = initrdRec ? sliceExtent(data, initrdRec) : undefined;
  const cmdline = cfgRec ? parseCmdlineFromBootCfg(new TextDecoder().decode(sliceExtent(data, cfgRec))) : undefined;

  return {
    valid: true,
    volumeId: root.volumeId,
    sectors: Math.ceil(data.length / SECTOR),
    bootable: !!bzimage,
    bzimage,
    initrd,
    cmdline,
    files,
  };
}

/** Relatório terminal do conteúdo extraído da ISO (para feed/terminal). */
export function isoExtractReport(name: string, ex: IsoBootExtract): string[] {
  const lines = [
    `$ iso-info ${name}.iso`,
    `  9660: ${ex.valid ? "válida (CD001)" : `INVÁLIDA — ${ex.reason}`}`,
    `  volume: ${ex.volumeId || "—"} · setores: ${ex.sectors} · ${(ex.sectors * SECTOR / 1024 / 1024).toFixed(1)} MB`,
    ex.valid ? `  raiz: ${ex.files.join("  ") || "(vazia)"}` : "",
    ex.bootable
      ? `  boot: /boot/bzimage ${(ex.bzimage!.length / 1024 / 1024).toFixed(1)} MB${ex.initrd ? ` · /boot/initrd ${(ex.initrd.length / 1024 / 1024).toFixed(1)} MB` : ""}${ex.cmdline ? `\n  cmdline: ${ex.cmdline}` : ""}`
      : ex.valid ? "  boot: sem kernel dentro da ISO (ISO de dados)" : "",
  ];
  return lines.filter(l => l !== "");
}
