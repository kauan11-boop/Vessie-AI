// DS-BOX — ISO DE FÁBRICA.
// Projeto de sistema operacional COMPLETO e COMPILÁVEL semeado no VFS:
// bootloader x86 real (0xAA55), kernel freestanding C (VGA 0xB8000 + serial 0x3F8),
// Makefile/linker, build.sh, init do convidado e documentação do pipeline.
//
// A IA (ou o botão do painel) chama buildFactoryIso(): semeia o projeto (sem
// sobrescrever edições do usuário), COMPILA a ISO 9660 + El Torito pelo mesmo
// núcleo da ferramenta ds:iso (buildIsoCore), SALVA na prateleira (IndexedDB)
// e ENTREGA o arquivo .iso (download direto). A execução do sistema é sempre
// pelo arquivo .iso no emulador — nunca por kernel solto.

import { vfs } from "./vfs";
import { buildIsoCore, sanitizeIsoName } from "./tools";
import { dsboxActions } from "./store";

export interface FactoryFile { path: string; content: string }

/** Bootloader 512 bytes real (NASM) — assinatura 0xAA55 válida. */
const BOOT_ASM = `; DS-BOX Factory OS — bootloader 512 bytes (x86 Real Mode, NASM)
; Compila: nasm -f bin boot.asm -o boot.bin   |   Boota via ISO El Torito / floppy
[org 0x7c00]
[BITS 16]

start:
    cli
    xor ax, ax
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov sp, 0x7c00
    sti

    cld
    mov si, msg_boot            ; DS:SI -> mensagem
.print:
    lodsb
    or al, al
    jz .done
    mov ah, 0x0e                ; int 10h teletype (BIOS video)
    int 0x10
    jmp .print
.done:
    mov si, msg_serial
    call serial_print
.halt:
    hlt
    jmp .halt

; --- log de depuração pela porta serial COM1 (0x3F8) — leitura automatizada ---
serial_print:
    lodsb
    or al, al
    jz .ret
    mov dx, 0x3f8               ; data port COM1
    out dx, al
    jmp serial_print
.ret:
    ret

msg_boot:   db "DS-BOX FACTORY OS - bootloader OK (0xAA55)", 13, 10, 0
msg_serial: db "[serial] factory boot sector executed", 13, 10, 0

times 510-($-$$) db 0           ; padding ate 510
dw 0xAA55                       ; assinatura magica de boot
`;

/** Kernel freestanding C — VGA text + log serial (regra OSDev do DS-BOX). */
const KERNEL_C = `/* DS-BOX Factory OS — kernel freestanding (sem libc).
 * Saída: VGA text 0xB8000 + log de depuração pela serial COM1 (0x3F8).
 * Compilação de referência: i686-elf-gcc -ffreestanding -nostdlib (ver Makefile). */

#include <stdint.h>

#define VGA_BASE 0xB8000
#define SERIAL_DATA 0x3F8

static volatile uint16_t *const vga = (volatile uint16_t *)VGA_BASE;
static int vga_row = 0;
static int vga_col = 0;

static void serial_init(void) {
    /* 115200 8N1 — valores de referência da UART 16550 */
    __asm__ volatile ("outb %%al, $0x01" : : "a"(0x00)); /* desativa interrupção da porta */
}

static void serial_putc(char c) {
    __asm__ volatile ("outb %%al, %%dx" : : "a"(c), "d"(SERIAL_DATA));
    if (c == '\\n') serial_putc('\\r');
}

static void serial_puts(const char *s) {
    while (*s) serial_putc(*s++);
}

static void vga_putc(char c) {
    const uint16_t attr = 0x0A00; /* verde sobre preto */
    if (c == '\\n') { vga_row++; vga_col = 0; return; }
    if (vga_row >= 25) { vga_row = 0; vga_col = 0; }
    vga[vga_row * 80 + vga_col] = attr | (uint8_t)c;
    vga_col++;
    if (vga_col >= 80) { vga_row++; vga_col = 0; }
}

static void vga_puts(const char *s) { while (*s) vga_putc(*s++); }

void kmain(void) {
    serial_init();
    serial_puts("[serial] factory kernel booted\\n");
    vga_puts("DS-BOX FACTORY OS\\n");
    vga_puts("kernel C em execucao (freestanding)\\n");
    vga_puts("pronto para tarefas.\\n");
    for (;;) { __asm__ volatile ("hlt"); }
}
`;

/** Entry assembly — header multiboot + stack + call kmain. */
const ENTRY_ASM = `; DS-BOX Factory OS — entrada do kernel (multiboot v1)
[BITS 32]
section .multiboot
align 4
    dd 0x1BADB002                 ; magic
    dd 0x00000003                 ; flags: modules + meminfo
    dd -(0x1BADB002 + 0x00000003) ; checksum

section .bss
align 16
stack_bottom:
    resb 16384
stack_top:

section .text
global _start
extern kmain
_start:
    mov esp, stack_top
    cli
    call kmain
.hang:
    hlt
    jmp .hang
`;

const LINKER_LD = `/* DS-BOX Factory OS — mapa de memória: kernel em 1 MiB (layout clássico x86) */
ENTRY(_start)
SECTIONS
{
    . = 1M;
    .text BLOCK(4K) : ALIGN(4K) { *(.multiboot) *(.text) }
    .rodata BLOCK(4K) : ALIGN(4K) { *(.rodata) }
    .data BLOCK(4K)   : ALIGN(4K) { *(.data) }
    .bss  BLOCK(4K)   : ALIGN(4K) { *(COMMON) *(.bss) }
    kernel_end = .;
}
`;

const MAKEFILE = `# DS-BOX Factory OS — build de referência (máquina real com toolchain nativa)
# No NAVEGADOR o equivalente é o Build-Iso do DS-BOX: os mesmos arquivos são
# empacotados em ISO 9660 + El Torito (ds:iso / botão ISO de fábrica) e bootam
# no emulador v86 — zero dependência nativa.

ASM      := nasm
CC       := i686-elf-gcc
LD       := i686-elf-ld
ISO      := genisoimage

CFLAGS   := -ffreestanding -nostdlib -m32 -Wall -Wextra -O2
LDFLAGS  := -T linker.ld -nostdlib

BUILD    := build

all: $(BUILD)/os.iso

$(BUILD)/boot.bin: boot/boot.asm
	mkdir -p $(BUILD)
	$(ASM) -f bin $< -o $@

$(BUILD)/entry.o: kernel/entry.asm
	mkdir -p $(BUILD)
	$(ASM) -f elf $< -o $@

$(BUILD)/kernel.o: kernel/main.c
	mkdir -p $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/kernel.elf: $(BUILD)/entry.o $(BUILD)/kernel.o linker.ld
	$(LD) $(LDFLAGS) -o $@ $(BUILD)/entry.o $(BUILD)/kernel.o

$(BUILD)/os.iso: $(BUILD)/boot.bin $(BUILD)/kernel.elf
	mkdir -p $(BUILD)/isotree/boot
	cp $(BUILD)/boot.bin $(BUILD)/isotree/boot/
	cp $(BUILD)/kernel.elf $(BUILD)/isotree/boot/
	$(ISO) -R -b boot/boot.bin -no-emul-boot -boot-load-size 4 -o $@ $(BUILD)/isotree

run: $(BUILD)/os.iso
	qemu-system-i386 -cdrom $(BUILD)/os.iso -serial stdio

clean:
	rm -rf $(BUILD)

.PHONY: all run clean
`;

const BUILD_SH = `#!/bin/sh
# DS-BOX Factory OS — build de referência em shell
# ./build.sh            -> compila bootloader + kernel + ISO (requer toolchain nativa)
# ./build.sh --iso-only -> apenas empacota o que já existe em isotree/
set -e
cd "$(dirname "$0")"
if [ "$1" = "--iso-only" ]; then
  genisoimage -R -b boot/boot.bin -no-emul-boot -boot-load-size 4 -o build/os.iso build/isotree
  exit 0
fi
make all
echo "ISO em build/os.iso — teste com: qemu-system-i386 -cdrom build/os.iso -serial stdio"
`;

/** init do convidado (roda dentro do SO emulado — executa tarefas e conteúdos). */
const GUEST_INIT = `#!/bin/sh
# init do sistema emulado (busybox/sh compatível)
echo "DS-BOX Factory OS - modo convidado"
echo "tarefas: ds:send roda comandos aqui e le a serial"
cat /etc/motd 2>/dev/null || true
export PS1='factory-os> '
exec /bin/sh
`;

const MOTD = `#############################################
#  DS-BOX FACTORY OS — distribuição de fábrica
#  Compilada pelo Build-Iso (ISO 9660 + El Torito)
#  Executada pelo emulador v86 a partir do arquivo .iso
#  Ferramentas do convidado: busybox (sh, ls, cat, mount…)
#############################################`;

const README_MD = `# DS-BOX Factory OS — ISO de fábrica

Projeto de sistema operacional **completo e compilável** que vem de fábrica no
Vessie-AI. Ele é a base compatível com o pipeline de compilação de sistemas:

| Etapa | Onde roda | Ferramenta |
|---|---|---|
| 1. Código-fonte | VFS (esta pasta \`factory-os/\`) | \`ds:write\` / \`ds:edit\` |
| 2. Compilação da ISO | navegador | \`ds:iso:factory-os {"kernel":"buildroot"}\` (ISO 9660 + El Torito, \`buildIsoCore\`) |
| 3. Salvar | IndexedDB + prateleira | automático no build |
| 4. Entregar | download | botão ⬇ ou \`ds:factory\` |
| 5. Executar | emulador v86 | **sempre pelo arquivo .iso** (\`ds:boot\`) |
| 6. Usar / tarefas | SO emulado | \`ds:send\` (comandos → serial), \`ds:term\` (Bash-86X) |

## Conteúdo

- \`boot/boot.asm\` — bootloader 512 bytes real (\`times 510-($-$$) db 0\` + \`dw 0xAA55\`).
- \`kernel/entry.asm\` — header multiboot + stack + \`call kmain\`.
- \`kernel/main.c\` — kernel freestanding C: VGA 0xB8000 + log serial COM1 (0x3F8).
- \`linker.ld\` — kernel em 1 MiB.
- \`Makefile\` / \`build.sh\` — build de referência nativa (NASM + i686-elf-gcc + genisoimage).
- \`init\` — init do convidado dentro do SO emulado.

## Regra de execução

**Somente arquivos .ISO executam sistema operacional.** O emulador monta a ISO
como cdrom e o kernel/initrd usados no boot são extraídos de DENTRO do arquivo
(\`boot/bzimage\`, \`boot/initrd\`, \`boot/boot.cfg\`). Kernel solto fora de .iso
não é executável como SO no DS-BOX.

## Agentes internos (protocolo OSDev)

1. **ARQUITETO** — layout de memória, IVT/IDT, estrutura de diretórios, hardware alvo.
2. **DESENVOLVEDOR** — assembly NASM e C freestanding (registradores, segmentação, alinhamento).
3. **BUILD & VFS** — grava no VFS, compila a ISO, garante 0xAA55 e El Torito.
4. **QA & EMULAÇÃO** — injeta a ISO no drive virtual, controla power/reset, lê a
   serial (COM1) e a VGA (0xB8000), diagnostica triple faults e loops infinitos.
`;

export const FACTORY_FILES: FactoryFile[] = [
  { path: "factory-os/boot/boot.asm", content: BOOT_ASM },
  { path: "factory-os/kernel/entry.asm", content: ENTRY_ASM },
  { path: "factory-os/kernel/main.c", content: KERNEL_C },
  { path: "factory-os/linker.ld", content: LINKER_LD },
  { path: "factory-os/Makefile", content: MAKEFILE },
  { path: "factory-os/build.sh", content: BUILD_SH },
  { path: "factory-os/init", content: GUEST_INIT },
  { path: "factory-os/etc/motd", content: MOTD },
  { path: "factory-os/README.md", content: README_MD },
];

/** Semeia o projeto de fábrica. reset=true sobrescreve edições; default preserva. */
export function seedFactoryProject(reset = false): string[] {
  const written: string[] = [];
  for (const f of FACTORY_FILES) {
    if (!reset && vfs.exists(f.path)) continue; // preserva edições do usuário
    const err = vfs.write(f.path, f.content);
    if (!err) written.push(f.path);
  }
  return written;
}

export interface FactoryBuildResult {
  name: string;
  seeded: string[];
  preserved: number;
  summary: string;
  bootable: boolean;
  sizeMB: number;
  downloaded: boolean;
}

/** Dispara o download do .iso (entrega do arquivo compilado). */
export function downloadIsoBytes(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.iso`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Pipeline completo da ISO de fábrica:
 * semear → compilar (ISO 9660 bootável, kernel embutido) → salvar → entregar.
 */
export async function buildFactoryIso(opts?: { name?: string; kernel?: string; reset?: boolean }): Promise<FactoryBuildResult> {
  const name = sanitizeIsoName(opts?.name ?? "factory-os");
  const seeded = seedFactoryProject(opts?.reset ?? false);
  const preserved = FACTORY_FILES.length - seeded.length;

  const { shelf, summary, bootable } = await buildIsoCore({
    name,
    volume: "DSBOXFACTORY",
    kernel: opts?.kernel ?? "buildroot", // kernel livre real → ISO bootável de fábrica
  });

  // entrega: download do arquivo .iso compilado
  let downloaded = false;
  try {
    downloadIsoBytes(name, shelf.bytes);
    downloaded = true;
  } catch { /* bloqueio de downloads não impede o resto */ }

  dsboxActions.pushBuildLog(`[factory] ${name}.iso compilada (${(shelf.size / 1024 / 1024).toFixed(1)} MB), salva na prateleira + IndexedDB${downloaded ? ", download entregue" : ""}`);
  dsboxActions.pushToolFeed({ kind: "factory", target: name, ok: true, label: `💿 fábrica: ${name}.iso`, at: Date.now() });

  return {
    name,
    seeded,
    preserved,
    summary,
    bootable,
    sizeMB: shelf.size / 1024 / 1024,
    downloaded,
  };
}
