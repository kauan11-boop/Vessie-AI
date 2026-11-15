// Vessie AI — parser VessieLang .mem (B.8: gramática completa, 100% da spec)
// @memory nome versão | @file path … @end | @trigger nome when "padrão" do ação
// @script nome lang js|mem … @end | @content cat … @end | @run js|mem … @end
import type { MemReport } from "./types";

export const MEM_MAX_SIZE = 500 * 1024; // spec: limite de 500 KB

export interface ParsedMem {
  header?: { name: string; version: string };
  files: Array<{ path: string; body: string }>;
  triggers: Array<{ name: string; pattern: string; action: string }>;
  scripts: Array<{ name: string; lang: string; code: string }>;
  contents: Array<{ category: string; text: string }>;
  runs: Array<{ lang: string; code: string }>;
  errors: string[];
}

/** Valida cabeçalho conforme spec (versão obrigatória). */
function parseHeaderLine(line: string): { name: string; version: string } | null {
  const m = /^@memory\s+(\S+)\s+(\S+)\s*$/.exec(line.trim());
  if (!m) return null;
  if (!/^\d+(\.\d+)*$/.test(m[2])) return null; // versão numérica
  return { name: m[1], version: m[2] };
}

/** Parser completo — @run é coletado e executado por último (spec). */
export function parseMem(src: string): ParsedMem {
  const out: ParsedMem = { files: [], triggers: [], scripts: [], contents: [], runs: [], errors: [] };
  if (src.length > MEM_MAX_SIZE) {
    out.errors.push(`arquivo .mem excede 500 KB (${src.length} bytes)`);
    return out;
  }
  const lines = src.split(/\r?\n/);
  let i = 0;
  let headerOk = false;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    // ignora comentários fora de blocos (// e #)
    if (!line || line.startsWith("//") || line.startsWith("#")) { i++; continue; }

    if (line.startsWith("@memory")) {
      const h = parseHeaderLine(line);
      if (!h) out.errors.push(`cabeçalho inválido na linha ${i + 1}: "${line}" (use: @memory nome versão)`);
      else { out.header = h; headerOk = true; }
      i++;
      continue;
    }

    if (line.startsWith("@file")) {
      const path = line.slice(5).trim();
      if (!path || path.includes("..") || path.startsWith("/")) {
        out.errors.push(`@file com caminho inseguro: "${path}"`);
        i++;
        continue;
      }
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "@end") { body.push(lines[i]); i++; }
      if (i >= lines.length) out.errors.push(`@file "${path}" sem @end`);
      else i++;
      out.files.push({ path, body: body.join("\n") });
      continue;
    }

    if (line.startsWith("@trigger")) {
      const m = /^@trigger\s+(\S+)\s+when\s+"([^"]*)"\s+do\s+(\S+)\s*$/.exec(line);
      if (!m) out.errors.push(`@trigger inválido na linha ${i + 1}: "${line}"`);
      else out.triggers.push({ name: m[1], pattern: m[2], action: m[3] });
      i++;
      continue;
    }

    if (line.startsWith("@script")) {
      const m = /^@script\s+(\S+)\s+lang\s+(\S+)\s*$/.exec(line);
      if (!m) { out.errors.push(`@script inválido na linha ${i + 1}`); i++; continue; }
      const code: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "@end") { code.push(lines[i]); i++; }
      if (i >= lines.length) out.errors.push(`@script "${m[1]}" sem @end`);
      else i++;
      out.scripts.push({ name: m[1], lang: m[2], code: code.join("\n") });
      continue;
    }

    if (line.startsWith("@content")) {
      const cat = line.slice(8).trim() || "geral";
      const text: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "@end") { text.push(lines[i]); i++; }
      if (i >= lines.length) out.errors.push(`@content "${cat}" sem @end`);
      else i++;
      out.contents.push({ category: cat, text: text.join("\n") });
      continue;
    }

    if (line.startsWith("@run")) {
      const m = /^@run\s+(js|mem)\s*$/.exec(line);
      if (!m) { out.errors.push(`@run inválido na linha ${i + 1} (use js ou mem)`); i++; continue; }
      const code: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "@end") { code.push(lines[i]); i++; }
      if (i >= lines.length) out.errors.push(`@run sem @end`);
      else i++;
      out.runs.push({ lang: m[1], code: code.join("\n") });
      continue;
    }

    out.errors.push(`diretiva desconhecida na linha ${i + 1}: "${line.slice(0, 40)}"`);
    i++;
  }

  if (!headerOk) out.errors.push("cabeçalho @memory ausente ou inválido");
  return out;
}

/** Executa um .mem parseado contra o Memory. runExec recebe (lang, code) e devolve saída. */
export async function executeParsed(
  parsed: ParsedMem,
  api: {
    putFile: (path: string, content: string, author?: string) => unknown;
    addTrigger: (name: string, cfg: { pattern: string; action: string; category?: string; description?: string }) => unknown;
    addScript: (name: string, code: string, opts?: { lang?: string; desc?: string }) => unknown;
    addContent: (cat: string, text: string) => unknown;
    runExec: (lang: string, code: string) => Promise<string> | string;
  }
): Promise<MemReport> {
  const report: MemReport = { files: [], triggers: [], scripts: [], contents: [], runs: [] };
  for (const f of parsed.files) { api.putFile(f.path, f.body, "mem"); report.files.push(f.path); }
  for (const t of parsed.triggers) {
    api.addTrigger(t.name, { pattern: t.pattern, action: t.action, category: "geral", description: `via .mem ${parsed.header?.name ?? ""}` });
    report.triggers.push(t.name);
  }
  for (const s of parsed.scripts) {
    api.addScript(s.name, s.code, { lang: s.lang, desc: `via .mem ${parsed.header?.name ?? ""}` });
    report.scripts.push(s.name);
  }
  for (const c of parsed.contents) { api.addContent(c.category, c.text); report.contents.push(c.category); }
  // spec: @run executa por último, após todos os saves
  for (const r of parsed.runs) {
    try {
      const res = await api.runExec(r.lang, r.code);
      report.runs.push(String(res));
    } catch (e) {
      report.runs.push(`erro: ${(e as Error).message}`);
    }
  }
  return report;
}
