// Vessie AI — conexão com o servidor (badge, modelos, auto-seleção) — B.3.8
import { toast } from "sonner";
import { create } from "zustand";
import { useSettings, useUi } from "./store";
import { listModels } from "./ai";
import { isLocalNetworkBlocked } from "./net";
import { showLocalNetworkBlockedHint } from "./local-network-hint";
import { t } from "./i18n";

interface ConnState {
  models: string[];
  check: (silent?: boolean) => Promise<boolean>;
  refresh: () => Promise<void>;
  selectModel: (m: string) => void;
}

let inflight: Promise<boolean> | null = null;

export const useConn = create<ConnState>(set => ({
  models: [],
  check(silent = false) {
    // single-flight: cliques rápidos / montagens do modal não disparam N chamadas
    if (inflight) return inflight;
    inflight = (async () => {
      const { settings } = useSettings.getState();
      useUi.getState().setConnection("connecting");
      try {
        const models = await listModels(settings, 8);
        set({ models });
        useUi.getState().setConnection("ok");
        const { settings: s2, setSettings } = useSettings.getState();
        if (models.length > 0 && !models.includes(s2.model)) {
          setSettings({ model: models[0] });
        }
        if (!silent) toast(t(s2.language, "connOk"));
        return true;
      } catch (e) {
        set({ models: [] });
        useUi.getState().setConnection("fail");
        if (isLocalNetworkBlocked(e)) {
          // bloqueio determinístico do navegador: orientação acionável, uma vez por sessão
          showLocalNetworkBlockedHint(useSettings.getState().settings.language);
        } else if (!silent) {
          toast(t(useSettings.getState().settings.language, "connFail"));
        }
        return false;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  async refresh() {
    const { settings } = useSettings.getState();
    try {
      const models = await listModels(settings, 8);
      set({ models });
    } catch (e) {
      set({ models: [] });
      if (isLocalNetworkBlocked(e)) {
        showLocalNetworkBlockedHint(useSettings.getState().settings.language);
      } else {
        toast(t(useSettings.getState().settings.language, "modelsFail"));
      }
    }
  },
  selectModel: m => useSettings.getState().setSettings({ model: m }),
}));
