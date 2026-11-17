// DS-BOX — store Zustand (Sistema de Criação Dinâmica SEMPRE ativo, painel lateral,
// prateleira de ISOs, feed de ferramentas). O DCS não tem mais ligar/desligar:
// ele é parte permanente do Vessie-AI. Presets persistidos; ISOs salvas em IndexedDB
// (sobrevivem a recargas); feed de ferramentas é de sessão.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StateCreator } from "zustand";
import { KERNEL_PRESETS, type KernelPreset } from "./iso";
import { isoDbSave, isoDbDelete, isoDbClear, isoDbList } from "./iso-store";

export interface IsoShelfItem {
  id: string;
  name: string;
  size: number;
  bootable: boolean;
  created: number;
  bytes: Uint8Array;
  kernelBytes?: ArrayBuffer;   // bytes reais do kernel (boot direto no v86)
  initrdBytes?: ArrayBuffer;
  cmdline?: string;
}

export interface ToolFeedItem {
  id?: string;
  kind: string;
  target?: string;
  ok: boolean;
  label: string;
  at: number;
}

// Abas manuais: apenas Emulador e Files. As demais ("bash86" | "scripts" | "build")
// continuam existindo como VIEWS — só a IA navega até elas via ferramentas.
export type DsboxTab = "emulator" | "files" | "bash86" | "scripts" | "build";

// bytes de ISO ficam num mapa fora do store (evita serializar megabytes)
const isoBytes = new Map<string, Uint8Array>();
const isoKernel = new Map<string, { kernelBytes?: ArrayBuffer; initrdBytes?: ArrayBuffer; cmdline?: string }>();

interface DsboxState {
  dcs: boolean;                 // legado: sempre true (mantido para compat de código antigo)
  autoLoop: boolean;            // devolve resultados ao modelo automaticamente
  buildMode: boolean;           // persona Build-Iso no system prompt
  panelOpen: boolean;
  tab: DsboxTab;
  kernelPresets: KernelPreset[]; // presets adicionais editáveis
  // sessão
  isoShelf: Omit<IsoShelfItem, "bytes" | "kernelBytes" | "initrdBytes">[];
  shelfHydrated: boolean;      // prateleira já restaurada do IndexedDB nesta sessão?
  toolFeed: ToolFeedItem[];
  buildLog: string[];
  scriptPreview: { path: string; html: string } | null;
  // ações
  setAutoLoop: (v: boolean) => void;
  setBuildMode: (v: boolean) => void;
  setPanelOpen: (v: boolean) => void;
  setTab: (t: DsboxTab) => void;
  setKernelPresets: (list: KernelPreset[]) => void;
  addIso: (item: IsoShelfItem) => void;
  removeIso: (id: string) => void;
  clearIsoShelf: () => void;
  getIsoBytes: (id: string) => Uint8Array | null;
  getIsoKernel: (id: string) => { kernelBytes?: ArrayBuffer; initrdBytes?: ArrayBuffer; cmdline?: string } | null;
  pushToolFeed: (item: ToolFeedItem) => void;
  updateToolFeed: (id: string, patch: Partial<ToolFeedItem>) => void;
  clearToolFeed: () => void;
  pushBuildLog: (line: string) => void;
  clearBuildLog: () => void;
  setScriptPreview: (p: { path: string; html: string } | null) => void;
}

interface PersistedSlice {
  autoLoop: boolean;
  kernelPresets: KernelPreset[];
}

/**
 * Restaura a prateleira de ISOs do IndexedDB (chamado 1× no boot do app).
 * Devolve os nomes restaurados — para o toast "ISOs salvas restauradas".
 */
export async function hydrateIsoShelf(): Promise<string[]> {
  try {
    const rows = await isoDbList();
    const restored: string[] = [];
    for (const r of rows) {
      isoBytes.set(r.id, r.bytes);
      if (r.kernelBytes !== undefined || r.initrdBytes !== undefined || r.cmdline !== undefined) {
        isoKernel.set(r.id, { kernelBytes: r.kernelBytes, initrdBytes: r.initrdBytes, cmdline: r.cmdline });
      }
      restored.push(r.name);
    }
    if (restored.length > 0) {
      useDsbox.setState(s => ({
        // metadados do IDB sem sobrescrever ISOs da sessão atual com mesmo nome
        isoShelf: [
          ...s.isoShelf,
          ...rows
            .filter(r => !s.isoShelf.some(i => i.name === r.name))
            .map(r => ({ id: r.id, name: r.name, size: r.size, bootable: r.bootable, created: r.created })),
        ].sort((a, b) => b.created - a.created).slice(0, 12),
        shelfHydrated: true,
      }));
    } else {
      useDsbox.setState({ shelfHydrated: true });
    }
    return restored;
  } catch {
    useDsbox.setState({ shelfHydrated: true });
    return [];
  }
}

const creator: StateCreator<DsboxState> = (set) => ({
  dcs: true,                    // SEMPRE ativo — não é mais um switch
  autoLoop: true,
  buildMode: true,              // persona Build-Iso sempre disponível
  panelOpen: false,
  tab: "emulator",
  kernelPresets: [],
  isoShelf: [],
  shelfHydrated: false,
  toolFeed: [],
  buildLog: [],
  scriptPreview: null,

  setAutoLoop: v => set({ autoLoop: v }),
  setBuildMode: v => set({ buildMode: v }),
  setPanelOpen: v => set({ panelOpen: v }),
  setTab: t => set({ tab: t, panelOpen: true }),
  setKernelPresets: list => set({ kernelPresets: list }),

  addIso: item => {
    isoBytes.set(item.id, item.bytes);
    if (item.kernelBytes !== undefined || item.initrdBytes !== undefined || item.cmdline !== undefined) {
      isoKernel.set(item.id, { kernelBytes: item.kernelBytes, initrdBytes: item.initrdBytes, cmdline: item.cmdline });
    }
    set(s => ({
      isoShelf: [
        { id: item.id, name: item.name, size: item.size, bootable: item.bootable, created: item.created },
        ...s.isoShelf.filter(i => i.name !== item.name), // mesmo nome → substitui no topo
      ].slice(0, 12),
    }));
    // SALVAR A ISO CRIADA (IndexedDB — sobrevive a recargas; bytes completos)
    void isoDbSave({ ...item }).then(ok => {
      if (!ok) console.warn("[dsbox] IndexedDB indisponível — ISO só nesta sessão");
    });
  },
  removeIso: id => {
    isoBytes.delete(id); isoKernel.delete(id);
    set(s => ({ isoShelf: s.isoShelf.filter(i => i.id !== id) }));
    void isoDbDelete(id);
  },
  clearIsoShelf: () => {
    isoBytes.clear(); isoKernel.clear();
    set({ isoShelf: [] });
    void isoDbClear();
  },
  getIsoBytes: id => isoBytes.get(id) ?? null,
  getIsoKernel: id => isoKernel.get(id) ?? null,

  pushToolFeed: item => set(s => ({
    toolFeed: [{ ...item, id: item.id ?? `t${Date.now()}${Math.random().toString(36).slice(2, 6)}` }, ...s.toolFeed].slice(0, 30),
  })),
  updateToolFeed: (id, patch) => set(s => ({
    toolFeed: s.toolFeed.map(t => (t.id === id ? { ...t, ...patch } : t)),
  })),
  clearToolFeed: () => set({ toolFeed: [] }),
  pushBuildLog: line => set(s => ({ buildLog: [...s.buildLog, `${line}`].slice(-200) })),
  clearBuildLog: () => set({ buildLog: [] }),
  setScriptPreview: p => set({ scriptPreview: p }),
});

export const useDsbox = create<DsboxState>()(
  persist(creator, {
    name: "dsbox-state",
    storage: createJSONStorage(() => localStorage),
    partialize: (s): PersistedSlice => ({ autoLoop: s.autoLoop, kernelPresets: s.kernelPresets }),
    merge: (persisted, current) => {
      const p = (persisted as Partial<PersistedSlice>) ?? {};
      return {
        ...current,
        autoLoop: p.autoLoop ?? current.autoLoop,
        kernelPresets: Array.isArray(p.kernelPresets) ? p.kernelPresets : current.kernelPresets,
      };
    },
  }) as unknown as StateCreator<DsboxState>
);

/** Proxy de ações (uso fora do React). */
export const dsboxActions = {
  /** Legado (código antigo pode chamar) — DCS é permanente, mantido como no-op. */
  setDcs: (_v: boolean) => { void _v; },
  setBuildMode: (v: boolean) => useDsbox.getState().setBuildMode(v),
  setPanelOpen: (v: boolean) => useDsbox.getState().setPanelOpen(v),
  setTab: (t: DsboxTab) => useDsbox.getState().setTab(t),
  addIso: (item: IsoShelfItem) => useDsbox.getState().addIso(item),
  removeIso: (id: string) => useDsbox.getState().removeIso(id),
  pushToolFeed: (item: ToolFeedItem) => useDsbox.getState().pushToolFeed(item),
  updateToolFeed: (id: string, patch: Partial<ToolFeedItem>) => useDsbox.getState().updateToolFeed(id, patch),
  pushBuildLog: (line: string) => useDsbox.getState().pushBuildLog(line),
  setScriptPreview: (p: { path: string; html: string } | null) => useDsbox.getState().setScriptPreview(p),
};

export { KERNEL_PRESETS };
