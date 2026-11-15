// DS-BOX — store Zustand (Dynamic Creation System, painel lateral, prateleira de ISOs, feed de ferramentas)
// DCS/presets persistidos; bytes de ISO e feed são de sessão (não persistidos).
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StateCreator } from "zustand";
import { KERNEL_PRESETS, type KernelPreset } from "./iso";

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

export type DsboxTab = "emulator" | "bash86" | "scripts" | "files" | "build";

// bytes de ISO ficam num mapa fora do store (evita serializar megabytes)
const isoBytes = new Map<string, Uint8Array>();
const isoKernel = new Map<string, { kernelBytes?: ArrayBuffer; initrdBytes?: ArrayBuffer; cmdline?: string }>();

interface DsboxState {
  dcs: boolean;                 // Dynamic Creation System
  autoLoop: boolean;            // devolve resultados ao modelo automaticamente
  buildMode: boolean;           // sessão Build-Iso (persona engenheiro Linux)
  panelOpen: boolean;
  tab: DsboxTab;
  kernelPresets: KernelPreset[]; // presets adicionais editáveis
  // sessão
  isoShelf: Omit<IsoShelfItem, "bytes" | "kernelBytes" | "initrdBytes">[];
  toolFeed: ToolFeedItem[];
  buildLog: string[];
  scriptPreview: { path: string; html: string } | null;
  // ações
  setDcs: (v: boolean) => void;
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
  clearToolFeed: () => void;
  pushBuildLog: (line: string) => void;
  clearBuildLog: () => void;
  setScriptPreview: (p: { path: string; html: string } | null) => void;
}

interface PersistedSlice {
  dcs: boolean;
  autoLoop: boolean;
  kernelPresets: KernelPreset[];
}

const creator: StateCreator<DsboxState> = (set, get) => ({
  dcs: false,
  autoLoop: true,
  buildMode: false,
  panelOpen: false,
  tab: "build",
  kernelPresets: [],
  isoShelf: [],
  toolFeed: [],
  buildLog: [],
  scriptPreview: null,

  setDcs: v => set({ dcs: v, ...(v ? { buildMode: true } : { buildMode: false }) }),
  setAutoLoop: v => set({ autoLoop: v }),
  setBuildMode: v => set({ buildMode: v, ...(v ? { dcs: true } : {}) }),
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
        ...s.isoShelf,
      ].slice(0, 12),
    }));
  },
  removeIso: id => {
    isoBytes.delete(id); isoKernel.delete(id);
    set(s => ({ isoShelf: s.isoShelf.filter(i => i.id !== id) }));
  },
  clearIsoShelf: () => {
    isoBytes.clear(); isoKernel.clear();
    set({ isoShelf: [] });
  },
  getIsoBytes: id => isoBytes.get(id) ?? null,
  getIsoKernel: id => isoKernel.get(id) ?? null,

  pushToolFeed: item => set(s => ({
    toolFeed: [{ ...item, id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}` }, ...s.toolFeed].slice(0, 30),
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
    partialize: (s): PersistedSlice => ({ dcs: s.dcs, autoLoop: s.autoLoop, kernelPresets: s.kernelPresets }),
    merge: (persisted, current) => {
      const p = (persisted as Partial<PersistedSlice>) ?? {};
      return {
        ...current,
        dcs: p.dcs ?? current.dcs,
        // DCS ligado implica Build-Iso ativo (inclusive ao recarregar a página)
        buildMode: (p.dcs ?? current.dcs) ? true : current.buildMode,
        autoLoop: p.autoLoop ?? current.autoLoop,
        kernelPresets: Array.isArray(p.kernelPresets) ? p.kernelPresets : current.kernelPresets,
      };
    },
  }) as unknown as StateCreator<DsboxState>
);

/** Proxy de ações (uso fora do React). */
export const dsboxActions = {
  setDcs: (v: boolean) => useDsbox.getState().setDcs(v),
  setBuildMode: (v: boolean) => useDsbox.getState().setBuildMode(v),
  setPanelOpen: (v: boolean) => useDsbox.getState().setPanelOpen(v),
  setTab: (t: DsboxTab) => useDsbox.getState().setTab(t),
  addIso: (item: IsoShelfItem) => useDsbox.getState().addIso(item),
  removeIso: (id: string) => useDsbox.getState().removeIso(id),
  pushToolFeed: (item: ToolFeedItem) => useDsbox.getState().pushToolFeed(item),
  pushBuildLog: (line: string) => useDsbox.getState().pushBuildLog(line),
  setScriptPreview: (p: { path: string; html: string } | null) => useDsbox.getState().setScriptPreview(p),
};

export { KERNEL_PRESETS };
