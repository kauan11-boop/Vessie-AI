// Vessie AI — conexão com o servidor (badge, modelos, auto-seleção) — B.3.8
import { toast } from "sonner";
import { create } from "zustand";
import { useSettings, useUi } from "./store";
import { listModels } from "./ai";
import { t } from "./i18n";

interface ConnState {
  models: string[];
  check: (silent?: boolean) => Promise<boolean>;
  refresh: () => Promise<void>;
  selectModel: (m: string) => void;
}

export const useConn = create<ConnState>(set => ({
  models: [],
  async check(silent = false) {
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
    } catch {
      set({ models: [] });
      useUi.getState().setConnection("fail");
      if (!silent) toast(t(useSettings.getState().settings.language, "connFail"));
      return false;
    }
  },
  async refresh() {
    const { settings } = useSettings.getState();
    try {
      const models = await listModels(settings, 8);
      set({ models });
    } catch {
      set({ models: [] });
      toast(t(useSettings.getState().settings.language, "modelsFail"));
    }
  },
  selectModel: m => useSettings.getState().setSettings({ model: m }),
}));
