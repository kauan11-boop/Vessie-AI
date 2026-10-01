// A IA se comunica com o sistema de arquivos através de um bloco de código
// cercado por ```agent contendo um JSON no formato:
// { "actions": [ { "type": "read_file", "path": "src/App.jsx" }, ... ] }
//
// Tipos de ação suportados:
//  - list_dir     { path? }                 (somente leitura, executa sozinho)
//  - read_file     { path }                  (somente leitura, executa sozinho)
//  - write_file    { path, content }         (precisa de aprovação)
//  - create_file   { path, content }         (precisa de aprovação)
//  - delete_file   { path }                  (precisa de aprovação)

const ACTION_FENCE = String.fromCharCode(96, 96, 96) + "agent";
const READ_ONLY = new Set(["list_dir", "read_file"]);
const WRITE_TYPES = new Set(["write_file", "create_file", "delete_file"]);
const ALL_TYPES = new Set([...READ_ONLY, ...WRITE_TYPES]);

function findObjectEnd(text, start) {
  if (text[start] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (inString) {
      if (escaped) escaped = false;
      else if (code === 92) escaped = true;
      else if (code === 34) inString = false;
      continue;
    }
    if (code === 34) inString = true;
    else if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function findActionBlocks(text) {
  const blocks = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const start = text.indexOf(ACTION_FENCE, searchFrom);
    if (start < 0) break;
    const jsonStart = text.indexOf("{", start + ACTION_FENCE.length);
    if (jsonStart < 0) break;
    const jsonEnd = findObjectEnd(text, jsonStart);
    if (jsonEnd < 0) {
      searchFrom = start + ACTION_FENCE.length;
      continue;
    }
    let closingStart = jsonEnd;
    while ([9, 10, 13, 32].includes(text.charCodeAt(closingStart))) closingStart += 1;
    if (text.slice(closingStart, closingStart + 3) !== String.fromCharCode(96, 96, 96)) {
      searchFrom = start + ACTION_FENCE.length;
      continue;
    }
    const end = closingStart + 3;
    blocks.push({ start, end, json: text.slice(jsonStart, jsonEnd) });
    searchFrom = end;
  }
  return blocks;
}

export function extractActions(text) {
  const actions = [];
  for (const block of findActionBlocks(text)) {
    try {
      const parsed = JSON.parse(block.json);
      if (!Array.isArray(parsed.actions)) continue;
      for (const action of parsed.actions) {
        if (!action || !ALL_TYPES.has(action.type)) continue;
        const normalized = action.type === "list_dir" && action.path == null
          ? { ...action, path: "" }
          : action;
        if (typeof normalized.path !== "string") continue;
        if ((normalized.type === "write_file" || normalized.type === "create_file") && typeof normalized.content !== "string") continue;
        actions.push(normalized);
      }
    } catch {
      continue;
    }
  }
  return actions;
}

export function hasActionBlock(text) {
  return text.includes(ACTION_FENCE);
}

export function isReadOnly(action) {
  return READ_ONLY.has(action.type);
}

export function isWriteAction(action) {
  return WRITE_TYPES.has(action.type);
}

export function stripActionBlocks(text) {
  return findActionBlocks(text)
    .reduceRight((visible, block) => visible.slice(0, block.start) + visible.slice(block.end), text)
    .trim();
}
