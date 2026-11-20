// Vessie AI — toast ÚNICO e acionável para "página pública HTTPS → servidor local".
// O navegador bloqueia deterministicamente (Private Network Access); insistir só
// enxurra o console. Mostra a orientação uma vez por sessão e deduplica via sonner id.
import { toast } from "sonner";
import { t } from "./i18n";
import type { Lang } from "./types";

let shown = false;

export function showLocalNetworkBlockedHint(lang: Lang): void {
  if (shown) return;
  shown = true;
  toast(t(lang, "netLocalBlockedTitle"), {
    id: "vessie-local-net-blocked",
    duration: 12000,
    description: t(lang, "netLocalBlockedBody"),
  });
}
