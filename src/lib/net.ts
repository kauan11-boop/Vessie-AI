// Vessie AI — guarda de rede: detecta chamadas de página PÚBLICA → servidor LOCAL.
// Contexto: o site estático (GitHub Pages, HTTPS) roda no origin do visitante.
// Quando o navegador vê uma origem pública chamando um endereço de loopback/LAN,
// o Chrome aplica Private Network Access: o preflight exige
// "Access-Control-Allow-Private-Network: true" — cabeçalho que LM Studio/Ollama
// NÃO enviam (issue aberta lmstudio-bug-tracker#392). "Enable CORS" sozinho não
// basta no Chromium: a chamada falha de forma DETERMINÍSTICA (não é falha de rede
// transitória). Emitir o fetch só polui o console com erros que o usuário não consegue
// corrigir pela UI — então nem tentamos, e mostramos a saída real (túnel HTTPS / rodar
// localmente / Vessie Local OFFLINE).
// Dev local (página em localhost chamando localhost:1234) NÃO passa por PNA
// (mesma address space) — segue o fluxo normal de CORS.
export class LocalNetworkBlockedError extends Error {
  constructor(message = "Blocked: public page → local/private-network server (Private Network Access)") {
    super(message);
    this.name = "LocalNetworkBlockedError";
  }
}

export function parseUrl(u: string): URL | null {
  try { return new URL(u); } catch { return null; }
}

/** loopback, .local, 10/8, 172.16–31/12, 192.168/16, link-local, IPv6 loopback/ULA. */
export function isLocalAddress(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return false;
  if (h === "localhost" || h === "::1" || h === "::" || h === "0.0.0.0") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (m172) { const n = Number(m172[1]); if (n >= 16 && n <= 31) return true; }
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true; // IPv6 ULA / link-local
  return false;
}

export function isLocalNetworkBlocked(e: unknown): boolean {
  return (
    (e instanceof LocalNetworkBlockedError) ||
    (typeof e === "object" && e !== null && (e as { name?: string }).name === "LocalNetworkBlockedError")
  );
}

/**
 * true quando a página hospedada FORA da máquina/LAN local chamaria um endereço local.
 * Nesses navegadores (Chromium com PNA) a chamada falha sempre — não vale tentar.
 * `force` (settings.forceLocalServer): o usuário desligou a flag de rede privada do
 * navegador (ou usa um proxy local) e quer tentar mesmo assim.
 * SSR/SSG: retorna false (sem window não dá para saber; o fetch no servidor simplesmente roda).
 */
export function isPrivateNetworkCall(baseUrl: string, force = false): boolean {
  if (force) return false;
  if (typeof window === "undefined") return false;
  const target = parseUrl(baseUrl);
  if (!target) return false;
  if (isLocalAddress(window.location.hostname)) return false;
  return isLocalAddress(target.hostname);
}
