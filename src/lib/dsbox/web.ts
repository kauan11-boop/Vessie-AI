// DS-BOX — Web-Search + Web-Fetch para os modelos de IA
// Cadeia de transporte (CORS-friendly): direto → r.jina.ai → allorigins → codetabs → corsproxy.
// Busca: Wikipedia (CORS nativo, sem chave) + DuckDuckGo Lite via proxies.
// Todas as respostas são rotuladas com a fonte que funcionou — honestidade de informação.

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface WebSearchResponse {
  query: string;
  via: string;
  results: WebSearchResult[];
  error?: string;
}

export interface WebFetchResponse {
  url: string;
  finalUrl: string;
  via: string;
  content: string;
  bytes: number;
  error?: string;
}

const TIMEOUT = 15_000;
const MAX_CONTENT = 240_000;

type Fetcher = (url: string) => Promise<string>;

function withTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(to));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Cadeia de proxies para ler HTML/JSON de terceiros. */
export const PROXIES: { name: string; wrap: Fetcher }[] = [
  { name: "direto", wrap: async u => u },
  { name: "r.jina.ai", wrap: async u => `https://r.jina.ai/${u}` },
  { name: "allorigins", wrap: async u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: "codetabs", wrap: async u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
  { name: "corsproxy", wrap: async u => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
];

async function fetchVia(url: string, label: string): Promise<string> {
  const res = await withTimeout(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`${label}: resposta vazia`);
  return text;
}

/** Web-Fetch: baixa uma página e devolve texto/markdown limpo. */
export async function webFetch(url: string): Promise<WebFetchResponse> {
  const errors: string[] = [];
  for (const proxy of PROXIES) {
    try {
      let raw = await fetchVia(await proxy.wrap(url), proxy.name);
      let via = proxy.name;
      // jina já devolve markdown; os demais devolvem HTML cru
      if (proxy.name !== "r.jina.ai" && /<\/?(html|body|div|p)\b/i.test(raw)) {
        raw = stripHtml(raw);
      }
      const content = raw.length > MAX_CONTENT ? raw.slice(0, MAX_CONTENT) + "\n…(cortado)" : raw;
      return { url, finalUrl: url, via, content, bytes: content.length };
    } catch (e) {
      errors.push(`${proxy.name}: ${(e as Error).message}`);
    }
  }
  return { url, finalUrl: url, via: "nenhum", content: "", bytes: 0, error: `todas as rotas falharam → ${errors.join(" | ")}` };
}

// ---------- Web-Search ----------
interface SearchBackend { name: string; run: (q: string) => Promise<WebSearchResult[]> }

async function searchWikipedia(q: string): Promise<WebSearchResult[]> {
  const api = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=5&origin=*`;
  const res = await withTimeout(api);
  if (!res.ok) throw new Error(`wikipedia HTTP ${res.status}`);
  const data = (await res.json()) as { query?: { search?: { title: string; snippet: string }[] } };
  const items = data.query?.search ?? [];
  return items.map(it => ({
    title: it.title,
    url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/ /g, "_"))}`,
    snippet: stripHtml(it.snippet),
    source: "wikipedia",
  }));
}

function parseDdgLite(html: string): WebSearchResult[] {
  const out: WebSearchResult[] = [];
  // DuckDuckGo Lite: <a rel="nofollow" href="URL" class='result-link'>TITLE</a>
  const linkRe = /<a[^>]+class=['"]result-link['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
  // alternativa: href antes da class
  const linkRe2 = /<a[^>]+href=['"]([^'"]+)['"][^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
  // snippets
  const snippets: string[] = [];
  const snipRe = /class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = snipRe.exec(html)) !== null) snippets.push(stripHtml(m[1]));
  let links: { url: string; title: string }[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(html)) !== null) links.push({ url: lm[1], title: stripHtml(lm[2]) });
  if (links.length === 0) {
    while ((lm = linkRe2.exec(html)) !== null) links.push({ url: lm[1], title: stripHtml(lm[2]) });
  }
  // ddg pode devolver redirect /l/?uddg=
  links = links.map(l => {
    const uddg = /[?&]uddg=([^&]+)/.exec(l.url);
    if (uddg) return { ...l, url: decodeURIComponent(uddg[1]) };
    return l;
  });
  links.forEach((l, i) => {
    if (/duckduckgo\.com|ddg\.gg/.test(l.url)) return;
    out.push({ title: l.title || l.url, url: l.url, snippet: snippets[i] ?? "", source: "duckduckgo" });
  });
  return out.slice(0, 8);
}

async function searchDdg(q: string): Promise<WebSearchResult[]> {
  const target = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`;
  let html = "";
  for (const proxy of PROXIES) {
    try {
      html = await fetchVia(await proxy.wrap(target), proxy.name);
      if (html.includes("result-link") || html.includes("result-snippet")) break;
    } catch { /* próxima rota */ }
  }
  if (!html) throw new Error("ddg: nenhuma rota funcionou");
  return parseDdgLite(html);
}

const BACKENDS: SearchBackend[] = [
  { name: "wikipedia", run: searchWikipedia },
  { name: "duckduckgo", run: searchDdg },
];

/** Web-Search: consulta múltiplos backends, dedup, rotula a fonte. */
export async function webSearch(query: string, max = 8): Promise<WebSearchResponse> {
  const errors: string[] = [];
  const all: WebSearchResult[] = [];
  for (const backend of BACKENDS) {
    try {
      const results = await backend.run(query);
      all.push(...results);
      if (results.length > 0 && all.length >= max) break;
    } catch (e) {
      errors.push(`${backend.name}: ${(e as Error).message}`);
    }
  }
  // dedup por URL
  const seen = new Set<string>();
  const results = all.filter(r => {
    const key = r.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, max);
  if (results.length === 0) {
    return { query, via: "nenhum", results, error: `sem resultados → ${errors.join(" | ") || "backends indisponíveis"}` };
  }
  return { query, via: [...new Set(results.map(r => r.source))].join("+"), results };
}

/** Formata resultados para o feed de ferramentas / modelo. */
export function formatSearchResults(resp: WebSearchResponse): string {
  if (resp.results.length === 0) return `Sem resultados. ${resp.error ?? ""}`.trim();
  const lines = resp.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet.slice(0, 200)}`);
  return `[Web-Search "${resp.query}" via ${resp.via}]\n${lines.join("\n")}`;
}

export function formatFetchResult(resp: WebFetchResponse, maxChars = 4000): string {
  if (resp.error) return `Falha no Web-Fetch de ${resp.url}: ${resp.error}`;
  const body = resp.content.slice(0, maxChars);
  return `[Web-Fetch ${resp.url} via ${resp.via} — ${resp.bytes} bytes]\n${body}${resp.content.length > maxChars ? "\n…(cortado)" : ""}`;
}
