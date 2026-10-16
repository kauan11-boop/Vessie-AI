# DIAGNÓSTICO — Interface Web Vessie AI Chat (scripts originais)

> Skill `lm-studio` lida antes de tudo: `docs/LM-Studio-Skill.md`
> (fetch OpenAI-compatible, `GET /v1/models`, `POST /v1/chat/completions`, SSE, `baseUrl http://localhost:1234/v1`, `localStorage`, sanitização XSS).
> Data do levantamento: 2026-10-11. Arquivos auditados: `index.html`, `js/app.js`, `state.js`, `config.js`, `storage.js`, `ui.js`, `chat.js`, `conversations.js`, `settings.js`, `streaming.js`, `markdown.js`, `router.js`, `security.js`.

## 1. Erros que QUEBRAM a interface (críticos)

| # | Arquivo:linha | Problema | Efeito |
|---|---|---|---|
| C1 | `js/app.js:2-12` | Imports com caminho errado: dentro de `js/`, importa `'./js/config.js'` (deveria ser `'./config.js'`). Nenhum módulo carrega | Tela branca / nada funciona |
| C2 | `js/app.js:17,23,26` | Chama `loadSavedState()`, `setupKeyboardShortcuts()`, `checkLMStudioConnection()` e `ui` — nenhum importado nem definido | `ReferenceError` no `DOMContentLoaded` |
| C3 | `js/markdown.js:46` | Sintaxe inválida: `.replace/\*(.+?)\*/g, ...)` (falta `(`). O arquivo inteiro não parseia | Import de `app.js` falha em cascata |
| C4 | `js/conversations.js:113` | `forEach((chat, chatIndex) {` sem `=>` — `SyntaxError` | Módulo morto |
| C5 | `js/chat.js:91` | Usa `EventSource` com `GET + query-string` no endpoint `/v1/chat/completions`, que pela skill é `POST` com JSON. `EventSource` nem aceita `signal` nem headers | Envio nunca funciona no LM Studio |
| C6 | `index.html` inline | ~180 linhas de JS duplicado no HTML (modais, drawer, toast, hash) competindo com os módulos | Comportamento duplo, `window.state` fantasma |

## 2. Erros funcionais graves (alto)

| # | Arquivo | Problema | Correção |
|---|---|---|---|
| A1 | `js/storage.js:12,50` | Usa `CONFIG.defaultSettings` e `CONFIG.STORAGE_KEYS` — `config.js` exporta `STORAGE_KEYS` separado e não tem `defaultSettings` | Centralizar chaves + defaults em `config.js` |
| A2 | `js/settings.js:2` | Importa `{ CONFIG, STATE }` — `STATE` não existe; usa `state` global sem importar | Importar `state` de `./state.js` |
| A3 | `js/settings.js:68,113-121` | Chama `checkLMStudioConnection()`, `loadModels()`, `checkAndConnect()` indefinidos; executa `checkAndConnect()` no load do módulo | Reusar `api('/models')` do módulo de conexão |
| A4 | `js/ui.js:79` | `Storage.saveSettings()` sem importar `Storage` | Importar ou remover |
| A5 | `js/chat.js:242-250` | `sanitizeMarkdown` faz `textContent→innerHTML`: escapa TUDO, mata markdown e gera HTML duplamente escapado | Usar `simpleMarkdown` + DOMPurify |
| A6 | `js/chat.js:42` | Em falha de conexão, ADICIONA outra mensagem user `_tempRemove` em vez de remover | `pop()` + aviso |
| A7 | `js/router.js:20,24,28` | Chama `renderChatInterface()`, `renderSettingsPage()`, `renderNotFound()` inexistentes | Implementar ou remover router |
| A8 | `js/streaming.js` | Só stubs vazios (`start`, `cancel` sem corpo) | Implementar leitor SSE via `fetch`+`ReadableStream` |
| A9 | `js/markdown.js:2` | `import DOMPurify from '.../purify.min.js'` — esse CDN é build UMD, não ESM | Usar global `window.DOMPurify` do `<script>` |
| A10 | `js/conversations.js:19,34,76,101` | Chama `renderChatSidebar()`/`renderChat()` globais inexistentes | Exportar `renderChatSidebar` e importar `renderChat` |
