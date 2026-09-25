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

const BLOCK_RE = /```agent\s*([\s\S]*?)```/g;

const READ_ONLY = new Set(["list_dir", "read_file"]);
const WRITE_TYPES = new Set(["write_file", "create_file", "delete_file"]);
const ALL_TYPES = new Set([...READ_ONLY, ...WRITE_TYPES]);

export function extractActions(text) {
  const actions = [];
  let match;
  while ((match = BLOCK_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const list = Array.isArray(parsed.actions) ? parsed.actions : [];
      for (const a of list) {
        if (a && ALL_TYPES.has(a.type) && typeof a.path === "string") {
          actions.push(a);
        }
      }
    } catch {
      // bloco mal formado: ignora silenciosamente, a IA tentará de novo
    }
  }
  return actions;
}

export function isReadOnly(action) {
  return READ_ONLY.has(action.type);
}

export function isWriteAction(action) {
  return WRITE_TYPES.has(action.type);
}

/** Remove os blocos ```agent do texto, deixando só a mensagem legível para o usuário. */
export function stripActionBlocks(text) {
  return text.replace(BLOCK_RE, "").trim();
}
