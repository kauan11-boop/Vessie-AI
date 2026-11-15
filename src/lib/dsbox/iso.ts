// DS-BOX — Build-Iso: gerador de ISO 9660 com El Torito (boot no-emulation)
// Espec implementada: ECMA-119 level 1 (8.3) + El Torito (SFF-8090 appendix).
// Layout: [system area 0-15] [PVD 16] [BRVD 17 (se boot)] [VDST] [boot catalog]
//         [L path table] [M path table] [diretórios BFS] [arquivos] [boot image].
// A ISO gerada é um arquivo 9660 real (abre no Explorer/mount/7-Zip) e pode ser
// gravada; bootabilidade depende do boot image (kernel) fornecido.

const SECTOR = 2048;

export interface IsoFile {
  path: string;          // "pasta/arquivo.txt"
  data: Uint8Array;
}

export interface IsoBuildOptions {
  volumeId: string;      // id do volume (32 a-chars)
  files: IsoFile[];
  boot?: {
    image: Uint8Array;   // boot image p/ El Torito no-emulation (ex.: bzImage)
    loadSegment?: number;// 0x0000 → 0x7C00 (padrão)
  };
}

export interface IsoBuildResult {
  data: Uint8Array;
  sectors: number;
  bootable: boolean;
  files: number;
  dirs: number;
}

// ---------- helpers ----------
function aChars(s: string, len: number): string {
  const up = s.toUpperCase().replace(/[^A-Z0-9_\-+. ]/g, "_");
  return (up + " ".repeat(len)).slice(0, len);
}

function dChars(s: string, len: number): string {
  return aChars(s, len);
}

function isoDate(d: Date): Uint8Array {
  const out = new Uint8Array(7);
  out[0] = Math.max(0, d.getUTCFullYear() - 1900);
  out[1] = d.getUTCMonth() + 1;
  out[2] = d.getUTCDate();
  out[3] = d.getUTCHours();
  out[4] = d.getUTCMinutes();
  out[5] = d.getUTCSeconds();
  out[6] = 0; // GMT offset em 15-min (0 = UTC)
  return out;
}

function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c < 128 ? c : 0x5f; // não-ascii → "_"
  }
  return out;
}

function both32(buf: Uint8Array, off: number, value: number): void {
  // grava LE e BE (padrão ISO9660 para campos duplos)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  dv.setUint32(off, value, true);
  dv.setUint32(off + 4, value, false);
}

function both16(buf: Uint8Array, off: number, value: number): void {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  dv.setUint16(off, value, true);
  dv.setUint16(off + 2, value, false);
}

// nomes 8.3 (d-chars)
function mangleFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  let base = dot > 0 ? name.slice(0, dot) : name;
  let ext = dot > 0 ? name.slice(dot + 1) : "";
  base = base.toUpperCase().replace(/[^A-Z0-9_-]/g, "_") || "FILE";
  ext = ext.toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  return `${base.slice(0, 8)}${ext ? "." + ext.slice(0, 3) : ""};1`;
}

function mangleDirName(name: string): string {
  const up = name.toUpperCase().replace(/[^A-Z0-9_-]/g, "_") || "DIR";
  return up.slice(0, 8);
}

interface DirNode {
  name: string;            // nome original
  isoName: string;         // nome mangulado 8.3
  children: Map<string, DirNode>;
  files: { isoName: string; file: IsoFile }[];
  parent: DirNode | null;
  dirNum: number;          // nº no path table (root = 1)
  lba: number;             // atribuído no pass 2
  recordSectors: number;   // nº de setores do bloco de records
}

function rootRecordSize(children: DirNode): number {
  // "." + ".." (34 bytes cada) + filhos (dir + files) com padding par
  let size = 34 + 34;
  const dirs = [...children.children.values()];
  for (const d of dirs) {
    const nameLen = d.isoName.length;
    let recLen = 33 + nameLen;
    if (recLen % 2 === 1) recLen++;
    size += recLen;
  }
  for (const f of children.files) {
    const nameLen = f.isoName.length;
    let recLen = 33 + nameLen;
    if (recLen % 2 === 1) recLen++;
    size += recLen;
  }
  return Math.max(1, Math.ceil(size / SECTOR)); // nº de setores
}

function pathTableBytes(nodes: { isoName: string; lba: number; parentNum: number }[]): number {
  let total = 0;
  for (const n of nodes) {
    const recLen = 8 + n.isoName.length + (n.isoName.length % 2 === 1 ? 1 : 0);
    total += recLen;
  }
  return total;
}

function writePathTable(buf: Uint8Array, off: number, nodes: { isoName: string; lba: number; parentNum: number }[], bigEndian: boolean): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = off;
  for (const n of nodes) {
    buf[p] = n.isoName.length;
    buf[p + 1] = 0; // ext attr len
    if (bigEndian) {
      dv.setUint32(p + 2, n.lba, false);
      dv.setUint16(p + 6, n.parentNum, false);
    } else {
      dv.setUint32(p + 2, n.lba, true);
      dv.setUint16(p + 6, n.parentNum, true);
    }
    buf.set(asciiBytes(n.isoName), p + 8);
    p += 8 + n.isoName.length;
    if (n.isoName.length % 2 === 1) { buf[p] = 0; p++; }
  }
  return p - off;
}

/** Constrói uma ISO 9660 completa. */
export function buildIso9660(opts: IsoBuildOptions): IsoBuildResult {
  const now = new Date();
  const date = isoDate(now);

  // ---- árvore de diretórios (mangling + dedup) ----
  const root: DirNode = { name: "", isoName: "\0", children: new Map(), files: [], parent: null, dirNum: 1, lba: 0, recordSectors: 0 };
  const usedNamesPerDir = new Map<DirNode, Set<string>>();
  const nameFor = (parent: DirNode, base: string, isDir: boolean): string => {
    const set = usedNamesPerDir.get(parent) ?? new Set<string>();
    usedNamesPerDir.set(parent, set);
    let candidate = isDir ? mangleDirName(base) : mangleFileName(base);
    let n = 1;
    while (set.has(candidate)) {
      const dot = candidate.indexOf(".");
      const stem = dot > 0 ? candidate.slice(0, dot) : candidate;
      candidate = isDir
        ? `${stem.slice(0, 6)}${n}`
        : `${stem.slice(0, 6)}${n}${dot > 0 ? candidate.slice(dot) : ""}`;
      n++;
    }
    set.add(candidate);
    return candidate;
  };

  for (const f of opts.files) {
    const parts = f.path.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      let child = node.children.get(seg.toUpperCase());
      if (!child) {
        child = { name: seg, isoName: nameFor(node, seg, true), children: new Map(), files: [], parent: node, dirNum: 0, lba: 0, recordSectors: 0 };
        node.children.set(seg.toUpperCase(), child);
      }
      node = child;
    }
    node.files.push({ isoName: nameFor(node, parts[parts.length - 1], false), file: f });
  }

  // ---- BFS para ordenar diretórios (dirNum) ----
  const allDirs: DirNode[] = [];
  const queue: DirNode[] = [root];
  while (queue.length > 0) {
    const node = queue.shift()!;
    allDirs.push(node);
    const kids = [...node.children.values()].sort((a, b) => a.isoName.localeCompare(b.isoName));
    kids.forEach(k => { k.parent = node; queue.push(k); });
  }
  allDirs.forEach((node, idx) => { node.dirNum = idx + 1; });


  // ---- tamanho dos records por diretório ----
  for (const node of allDirs) node.recordSectors = rootRecordSize(node);

  // ---- pass 2: alocação de LBAs ----
  const hasBoot = !!opts.boot;
  const boot = opts.boot;
  const descEnd = hasBoot ? 19 : 18; // PVD 16, [BRVD 17], VDST (17 ou 18)
  let cursor = descEnd;
  let catalogLba = 0;
  if (hasBoot) { catalogLba = cursor; cursor += 1; }

  const ptLba = cursor;
  const ptSize = pathTableBytes(allDirs.map(d => ({ isoName: d.isoName === "\0" ? "\u0000" : d.isoName, lba: 0, parentNum: 0 })));
  const ptSectors = Math.max(1, Math.ceil(ptSize / SECTOR));
  cursor += ptSectors * 2; // tabela L + tabela M

  // diretórios em BFS
  for (const node of allDirs) { node.lba = cursor; cursor += node.recordSectors; }

  // arquivos em ordem determinística
  const filesSorted = [...opts.files].sort((a, b) => a.path.localeCompare(b.path));
  const fileLba = new Map<IsoFile, number>();
  for (const f of filesSorted) {
    fileLba.set(f, cursor);
    cursor += Math.max(1, Math.ceil(f.data.length / SECTOR));
  }

  // boot image por último
  let bootLba = 0;
  if (hasBoot && boot) {
    bootLba = cursor;
    cursor += Math.max(1, Math.ceil(boot.image.length / SECTOR));
  }
  const totalSectors = cursor;

  // ---- alocação do buffer final ----
  const out = new Uint8Array(totalSectors * SECTOR);
  const dv = new DataView(out.buffer);

  // ---- PVD (LBA 16) ----
  {
    const base = 16 * SECTOR;
    out[base] = 1;
    out.set(asciiBytes("CD001"), base + 1);
    out[base + 6] = 1;
    out.set(asciiBytes(aChars(" ", 32)), base + 8);              // system id
    out.set(asciiBytes(aChars(opts.volumeId || "DSBOXISO", 32)), base + 40); // volume id
    both32(out, base + 80, totalSectors);                          // volume space size
    both16(out, base + 120, 1);                                    // volume set size
    both16(out, base + 124, 1);                                    // sequence number
    both16(out, base + 128, SECTOR);                               // logical block size
    both32(out, base + 132, ptSize);                               // path table size
    dv.setUint32(base + 140, ptLba, true);                         // L path table
    dv.setUint32(base + 144, 0, true);                             // opt L
    dv.setUint32(base + 148, ptLba + ptSectors, false);            // M path table (BE field)
    dv.setUint32(base + 152, 0, false);                            // opt M
    // root directory record (34 bytes) em 156–189
    writeDirRecord(out, base + 156, {
      nameBytes: new Uint8Array([0]),
      lba: root.lba,
      size: root.recordSectors * SECTOR,
      date,
      isDir: true,
    });
    out.set(asciiBytes(dChars(" ", 128)), base + 190);  // volume set id
    out.set(asciiBytes(dChars("DS-BOX BUILD-ISO - VESSIE-AI", 128)), base + 318); // publisher
    out.set(asciiBytes(dChars("DS-BOX BUILD-ISO - VESSIE-AI", 128)), base + 446); // data preparer
    out.set(asciiBytes(dChars("DS-BOX ISO 9660 BUILDER", 128)), base + 574);      // application id
    out.set(asciiBytes(" ".repeat(37)), base + 702);   // copyright
    out.set(asciiBytes(" ".repeat(37)), base + 739);   // abstract
    out.set(asciiBytes(" ".repeat(37)), base + 776);   // bibliographic
    const dateStr = formatDate(now);
    out.set(asciiBytes(dateStr), base + 813);          // created
    out.set(asciiBytes(dateStr), base + 830);          // modified
    out.set(asciiBytes(" ".repeat(17)), base + 847);   // expiration
    out.set(asciiBytes(dateStr), base + 864);          // effective
    out[base + 881] = 1;                               // file structure version
  }

  // ---- BRVD (LBA 17, se boot) ----
  if (hasBoot) {
    const base = 17 * SECTOR;
    out[base] = 0;
    out.set(asciiBytes("CD001"), base + 1);
    out[base + 6] = 1;
    out.set(asciiBytes(aChars("EL TORITO SPECIFICATION", 32)), base + 8);
    // Endereço do catálogo de boot: bytes 71–78 (0-index) little+big endian (SFF-8090/ECMA-119)
    dv.setUint32(base + 71, catalogLba, true);
    dv.setUint32(base + 75, catalogLba, false);
  }

  // ---- VDST (terminator) ----
  {
    const base = (hasBoot ? 18 : 17) * SECTOR;
    out[base] = 255;
    out.set(asciiBytes("CD001"), base + 1);
    out[base + 6] = 1;
  }

  // ---- boot catalog ----
  if (hasBoot && boot) {
    const base = catalogLba * SECTOR;
    // validation entry
    out[base] = 0x01;
    out[base + 1] = 0x00; // x86
    out.set(asciiBytes(aChars("DS-BOX BUILD-ISO", 24)), base + 4);
    dv.setUint16(base + 28, 0, true); // checksum provisório
    out[base + 30] = 0x55;
    out[base + 31] = 0xAA;
    let sum = 0;
    for (let i = 0; i < 16; i++) sum = (sum + dv.getUint16(base + i * 2, true)) & 0xffff;
    dv.setUint16(base + 28, (0x10000 - sum) & 0xffff, true);

    // default entry (no-emulation)
    const e = base + 32;
    out[e] = 0x88; // bootable
    out[e + 1] = 0x00; // no emulation
    dv.setUint16(e + 2, boot.loadSegment ?? 0x0000, true);
    out[e + 4] = 0x00; // system type
    out[e + 5] = 0x00;
    dv.setUint16(e + 6, Math.min(0xffff, Math.ceil(boot.image.length / 512)), true);
    dv.setUint32(e + 8, bootLba, true);
  }

  // ---- path tables (L depois M) ----
  const lptFinal = allDirs.map(d => ({ isoName: d.isoName === "\0" ? "\u0000" : d.isoName, lba: d.lba, parentNum: d.parent ? d.parent.dirNum : 1 }));
  writePathTable(out, ptLba * SECTOR, lptFinal, false);
  writePathTable(out, (ptLba + ptSectors) * SECTOR, lptFinal, true);

  // ---- records de diretório ----
  for (const node of allDirs) {
    const base = node.lba * SECTOR;
    let p = base;
    // "."
    p += writeDirRecord(out, p, { nameBytes: new Uint8Array([0]), lba: node.lba, size: node.recordSectors * SECTOR, date, isDir: true }).bytes;
    // ".."
    const parentLba = node.parent ? node.parent.lba : node.lba;
    const parentSize = (node.parent ? node.parent.recordSectors : node.recordSectors) * SECTOR;
    p += writeDirRecord(out, p, { nameBytes: new Uint8Array([1]), lba: parentLba, size: parentSize, date, isDir: true }).bytes;
    // filhos: diretórios primeiro, depois arquivos (alfabético)
    const kids = [...node.children.values()].sort((a, b) => a.isoName.localeCompare(b.isoName));
    for (const k of kids) {
      p += writeDirRecord(out, p, { nameBytes: asciiBytes(k.isoName), lba: k.lba, size: k.recordSectors * SECTOR, date, isDir: true }).bytes;
    }
    const fkids = node.files.sort((a, b) => a.isoName.localeCompare(b.isoName));
    for (const k of fkids) {
      const lba = fileLba.get(k.file) ?? 0;
      p += writeDirRecord(out, p, { nameBytes: asciiBytes(k.isoName), lba, size: k.file.data.length, date, isDir: false }).bytes;
    }
  }

  // ---- conteúdo dos arquivos ----
  for (const f of filesSorted) {
    const lba = fileLba.get(f)!;
    out.set(f.data, lba * SECTOR);
  }

  // ---- boot image ----
  if (hasBoot && boot) out.set(boot.image, bootLba * SECTOR);

  return {
    data: out,
    sectors: totalSectors,
    bootable: hasBoot,
    files: filesSorted.length,
    dirs: allDirs.length,
  };
}

interface DirRecordArgs {
  nameBytes: Uint8Array;
  lba: number;
  size: number;
  date: Uint8Array;
  isDir: boolean;
}

function writeDirRecord(buf: Uint8Array, off: number, args: DirRecordArgs): { bytes: number } {
  let recLen = 33 + args.nameBytes.length;
  const padded = recLen % 2 === 1;
  const total = padded ? recLen + 1 : recLen;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  buf[off] = total;
  buf[off + 1] = 0;                       // ext attr
  dv.setUint32(off + 2, args.lba, true);
  dv.setUint32(off + 6, args.lba, false);
  dv.setUint32(off + 10, args.size, true);
  dv.setUint32(off + 14, args.size, false);
  buf.set(args.date, off + 18);
  buf[off + 25] = args.isDir ? 0x02 : 0x00; // flags
  buf[off + 26] = 0;                      // unit size
  buf[off + 27] = 0;                      // gap
  dv.setUint16(off + 28, 1, true);        // volume seq
  dv.setUint16(off + 30, 1, false);
  buf[off + 32] = args.nameBytes.length;
  buf.set(args.nameBytes, off + 33);
  if (padded) buf[off + recLen] = 0;
  return { bytes: total };
}

function formatDate(d: Date): string {
  // 17 bytes: YYYYMMDDHHMMSSmm (16 dígitos) + offset GMT em 15-min ("0")
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}${pad(Math.floor(d.getUTCMilliseconds() / 10))}0`;
}

/** Converte um caminho de arquivo ISO de volta para o formato original (8.3 → real). */
export function isoSizeOf(files: IsoFile[]): number {
  return files.reduce((a, f) => a + Math.ceil(f.data.length / SECTOR) * SECTOR, 0);
}

// ---------- utilidades de kernel (Build-Iso wizard / ds:iso) ----------
export interface KernelPreset {
  id: string;
  label: string;
  bzimage: string;
  initrd?: string;
  cmdline: string;
  sizeHint?: string;
}

/** Presets de kernel livre para o DS-BOX (URLs editáveis nas Configurações). */
export const KERNEL_PRESETS: KernelPreset[] = [
  {
    id: "buildroot",
    label: "Buildroot Linux (bzImage · livre · ~5 MB)",
    bzimage: "https://k.copy.sh/buildroot-bzimage-busybox.bin",
    cmdline: "console=ttyS0 rw",
    sizeHint: "4.9 MB",
  },
  {
    id: "buildroot-alt",
    label: "Buildroot Linux (espelho alternativo)",
    bzimage: "https://copy.sh/v86/images/buildroot-bzimage.bin",
    cmdline: "console=ttyS0 rw",
  },
  {
    id: "floppylinux",
    label: "Bootchess / minúsculo (depuração)",
    bzimage: "https://k.copy.sh/bootchess.bin",
    cmdline: "",
  },
];
