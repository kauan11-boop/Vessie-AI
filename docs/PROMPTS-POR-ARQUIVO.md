# PROMPT DE EDIÇÃO POR ARQUIVO — Reconstrução Vessie v2 (com Memory)

> Ordem obrigatória. Cada item tem: o que fazer + exemplo + ordem interna.

## 1. `js/config.js` — base de constantes
**Fazer:** unificar `CONFIG` + `STORAGE_KEYS` + `defaultSettings` (hoje `storage.js` lê `CONFIG.defaultSettings` que não existe).
**Exemplo:**
```js
export const CONFIG = { defaultBaseUrl:'http://localhost:1234/v1', defaultSettings:{ baseUrl:'http://localhost:1234/v1', model:'', temperature:0.7, topP:1, maxTokens:'', stream:true, systemPrompt:'...' } };
export const STORAGE_KEYS = { settings:'vessie-ai-settings', conversations:'vessie-ai-chats' };
```
**Ordem:** 1.constantes 2.chaves 3.defaults.

## 2. `js/state.js` — estado único
**Fazer:** manter `state` atual (já bom) + `resetState()`.
**Ordem:** 1.state 2.reset.

## 3. `js/storage.js` — persistência
**Fazer:** trocar `parsed` por `parsed` mesclado com defaults (bug atual espalha `...saved` string).
**Ordem:** 1.load 2.save 3.conversas 4.mensagens.

## 4. `js/security.js` — manter (já correto). Só expor `escapeHtml`.

## 5. `js/markdown.js` — corrigir parse
**Fazer:** remover `import DOMPurify from CDN` (UMD≠ESM), usar `window.DOMPurify`; corrigir linha 46 `.replace(`; escapar `<`/`>` nos blocos de código (hoje inverte).
**Ordem:** 1.simpleMarkdown 2.renderMarkdownSafe.

## 6. `js/api.js` NOVO — camada LM Studio (extraída do chat.js + settings.js)
**Fazer:** `api(path,opts)` + `checkConnection()` + `loadModels()` + `chatCompletions(payload, {onToken, signal})` com `fetch POST` + `ReadableStream` SSE (skill §3).
**Ordem:** 1.api 2.models 3.chat 4.sse.

## 7. `js/chat.js` — reescrever envio/render
**Fazer:** remover `EventSource GET` (C5); POST+SSE; corrigir `_tempRemove` (A6); importar `renderChatSidebar`; escapar via `renderMarkdownSafe`.
**Ordem:** 1.elements 2.send 3.generate 4.render 5.shortcuts.

## 8. `js/conversations.js` — corrigir sintaxe + imports
**Fazer:** `forEach((c,i) => {`; importar `renderChat` do chat; exportar `renderChatSidebar`.
**Ordem:** 1.crud 2.busca 3.sidebar.

## 9. `js/settings.js` — religar
**Fazer:** importar `state`; trocar `checkLMStudioConnection/loadModels` por `api.js`; remover auto-exec no import.
**Ordem:** 1.load 2.save 3.test 4.models.

## 10. `js/ui.js` — importar Storage; toast em fila + CSS.
## 11. `js/router.js` — implementar as 3 funções ou virar `showPage(name)`.
## 12. `js/streaming.js` — implementar `readSSE(response,onToken,signal)`.
## 13. `js/app.js` — imports `./config.js` (sem `js/`), importar tudo que usa, boot único + Memory.
## 14. `index.html` — enxugar inline, adicionar botão/painel Memory + scripts `memory/*.js` + `memory.css`.
## 15. `memory/memory.css` NOVO — estilos do painel (extraídos do `styles.css` quebrado).

## 16. `index.html` — Prompt completo virou agente com System API (#/api)
**Data:** 2026-10-11 · **Onde:** Settings → aba Chat → `<pre id="apiGuidePrompt">` (linhas ~174–217)
**Fazer:** substituir o prompt "Você é a Vessie, engenheira de software sênior…" por um prompt portátil de agente, pronto para copiar e colar como system prompt em outra IA, que libera a System API do app (`/#/api`) para executar ações no ambiente do usuário.
**O que mudou:**
- Título/descrição da guia agora explicam o acesso à System API (`/#/api`, aba Documentação).
- Identidade: "Vessie Agent" com poder de AGIR via blocos, não só conversar.
- Novo catálogo de capacidades e blocos executáveis — todos fiéis ao interceptado em `memory/memory-core.js` (`handleAiText`) e `js/sandbox.js`: `memory:put/run/trigger/api/skill/plugin/mcp`, `memory:create|write|edit|rename|delete|read`, `sys:write/sys:read`, `image:`, rotas `api.files|list|kv|generateImage`.
- Regras de operação: as 7 originais mantidas + 3 novas (8.emitir bloco para agir, 9.confirmar antes de destruir/ler antes de editar, 10.corrigir formato em caso de falha) e nota de limites honestos (sandbox local, sem terminal/disco real/rede).
**Ordem interna do prompt:** 1.identidade+API base 2.papel de agente 3.capacidades 4.blocos 5.regras 6.limites.

## 17. Sistema Simulite-Message — rede neural offline + Deep RL
**Data:** 2026-10-11
**Fazer:** sistema oculto que, ao detectar AFK (>4 min), treina em silêncio uma rede neural local (rede neural + Deep RL/REINFORCE) com os pares pergunta→resposta das conversas; quando o LM Studio está sem modelo ativo, passa a responder como modelo **OFFLINE**.
**Arquivos (ordem de criação):**
1. `js/simulite/SimuliteCore.js` — núcleo neural puro (embedding+MLP, backprop manual, REINFORCE, serialize) · validado com `node --check` + smoke test (160 rounds, loss calculada, JSON ~70KB, reload OK).
2. `js/simulite/SimuliteMessage.js` — orquestrador oculto (AFK, fatias de treino, resposta OFFLINE, recompensa RL, persistência `simulite/model.json` + `simulite/corpus.json` no Memory Manager).
3. `js/chat.js` — `offlineReply()` no envio (corrige bug que descartava a mensagem), fallback na queda do `generateResponse`, hook `rewardContinue()`, welcome modernizado.
4. `js/settings.js` — `updateModelLabel()` mostra `OFFLINE · Simulite` sem modelo/conectado.
5. `index.html` — frase do logo nova + linha OFFLINE sempre no dropdown de modelos.
6. `js/app.js` — `Simulite.init()` no boot + `window.Simulite`.
**Limites declarados:** GGUF continua sendo papel do LM Studio (runtime nativo); pesos do Simulite são portáveis como JSON via Memory Manager.

## 18. `index.html` — prompt virou gerador de scripts Node.js + sistema de tags
**Data:** 2026-10-12 · **Onde:** Settings → aba Guia API → `<pre id="apiGuidePrompt">` (marcadores `tag:api-guide-prompt`)
**Fazer:** remover o bloco "System API" (capacidades + blocos memory:/sys: + regras 8–10) e reescrever o prompt: a IA agora gera **scripts Node.js completos que modificam o site existente**.
**O que mudou:**
- Identidade: "não cria sistemas novos do zero — modifica o site via scripts Node.js".
- Nova seção "Sistema de tags do site" (tag:nome / /tag:nome, atributo data-tag) — sem literais de comentário HTML dentro do `<pre>` (engoliriam o texto).
- Nova seção "Detecção de URL": --url → SITE_URL → tools/site.config.json → git remote (GitHub Pages) → fallback localhost:8080; ambiente localhost|github-pages|custom.
- Regra 8: todo script localiza o alvo pelas tags e detecta a URL antes de gravar; regra 9: get antes de sobrescrever; regra 10: validar tags e informar URL de preview.
- Campo envolvido por marcadores reais `tag:api-guide-prompt` (demonstração do sistema); rótulo e descrição da guia atualizados.
**Validação:** `node tools/site-content.js detect/list/get` — detectou localhost (aviso de Pages), listou `api-guide-prompt` (2859 chars) e leu o conteúdo novo. Falso positivo `data-tag="nome"` no prompt corrigido na redação.
**Ordem interna do prompt:** 1.identidade 2.sistema de tags 3.detecção de URL 4.script padrão 5.regras 6.limites.

## 19. Kit .env + Modo OFFLINE estrito (prompt + sistema)
**Data:** 2026-10-12
**Fazer:** prompt ganhou "Kit completo de comandos" (env-init/show/set/apply), seção ".env do projeto" (conexão com a API do Vessie-AI) e seção "Modo OFFLINE (Simulite)" com as 3 regras: erro→rede neural; LM Studio ativo→treino automático; sem informação real→NÃO responde.
**Arquivos:**
1. `tools/site-content.js` — kit `.env`: parseEnv/envInit/envShow/envSet/envApply (gera `js/env-config.js` com `window.__VESSIE_ENV__`) + cases + ajuda.
2. `.env` (raiz, gitignored) — BASE_URL/API_KEY/MODEL/SITE_URL, criado via `env-init`.
3. `js/env-config.js` — gerado por `env-apply`, carregado no `index.html` antes de tudo.
4. `js/config.js` — defaults sobrescritos por `ENV` (BASE_URL, MODEL, apiKey).
5. `js/simulite/SimuliteMessage.js` — `reply()` estrito: cobertura de vocabulário ≥60% para gerar, senão `null` (sem "tips" inventadas); novo `trainBurst(n)`.
6. `js/chat.js` — `offlineReply` avisa "sem informações reais" (meta noInfo) quando `null`; após resposta do LM Studio: `learnFromChat + trainBurst(3)` (treino automático com LM Studio ativo).
**Validação:** env-init/env-apply/env-show executados; node --check em todos; smoke test `Simulite.reply` sem corpus → `null`.

## 20. System Memory — 7 categorias × 25 itens + edição por linhas
**Data:** 2026-10-12
**Fazer:** prompt ganhou a seção "System Memory" (o modelo cria pastas/arquivos e **prefere edit-lines sobre recriar**) + regra 11. Novo `tools/system-memory.js`.
**`tools/system-memory.js` (Node puro):** pasta `system-memory/` com 7 categorias em arquivos separados — `scripts/` (25 utilitários reais), `triggers/` (.mem), `apis/`+`mcps/`+`plugins/` (JSON), `skills/` (.md), `files/` (guias) = **175 arquivos**.
**Comandos:** `init [--force]` · `list [cat]` · `get` · `put` (cria pastas) · **`edit-lines --lines a-b`** (edita SÓ o intervalo) · `new-folder` · **`check`** (node --check, aceita caminho da raiz ou do SM) · **`bundle`** (`system-memory/bundle.mem` no formato `.mem` com `@script/@trigger/@content/@file`, importável no Memory Manager) · `stats` · log por comando em `tools/logs/`.
**Robustez:** `safeRel` aceita caminho com/sem prefixo `system-memory/`; `check` resolve da raiz ou do SM.
**Validação (real):** init → 25/25/25/25/25/25/25 (175); `01-listar-arquivos` e `25-resumo-geral` executam (299 arquivos/35 pastas/498KB); `check` OK em seed e em `SimuliteCore.js`; `edit-lines` troca só a linha pedida; bundle 478 linhas / 175 diretivas.


## 21. Ponte Vessie-AI ↔ PC (`tools/vessie-bridge.js` + `js/bridge.js`)
**Data:** 2026-10-12
**Fazer:** o site roda no navegador (sandbox) e **não toca o PC**. O `#apiGuidePrompt` foi reescrito para ser **colado no ChatGPT/Claude** (não na IA local): ensina a IA externa a GERAR scripts Node.js que conectam o Vessie-AI ao PC. Implementei e validei a ponte de referência.
**`tools/vessie-bridge.js` (Node puro, zero deps):** servidor HTTP LOCAL. Ordem interna: 1.config/token · 2.helpers HTTP · 3.sandbox de caminhos (`safePath`) · 4.fs (`fsList/fsRead/fsWrite`) · 5.sysinfo/lm · 6.run (whitelist) · 7.SSE · 8.router.
**Segurança (não negociável):** ouve só em `127.0.0.1`; token `BRIDGE_TOKEN` exigido em TODAS as rotas (comparação `timingSafeEqual`); sandbox de caminhos bloqueia path traversal; `/run` NÃO executa shell arbitrário — só ações whitelisted (`git-status`, `git-log`, `node-check`, `site-content`, `system-memory`); SSE (`/events`) só envia status.
**Rotas:** `/health` · `/sysinfo` · `/lm/status` · `/fs/list` · `/fs/read` · `/fs/write` · `/run` · `/events` (SSE a cada 5s).
**`js/bridge.js` (cliente do site):** `Bridge.init()` detecta a ponte (`/health`), pinta o badge `#bridgeBadge` ("PC conectado"/"PC offline"), assina o SSE e degrada em silêncio se o navegador bloquear 127.0.0.1. Expõe `Bridge.status()/ls()/read()/write()/run()/onUpdate()`.
**Integração:** `index.html` (badge + `<script src="js/bridge.js">` antes do app.js); `js/app.js` chama `Bridge.init()` no boot; `.env` ganhou `BRIDGE_PORT=8787` + `BRIDGE_TOKEN`; `tools/site-content.js` expõe essas chaves em `env-init`/`env-apply` (regados no `js/env-config.js`).
**Validação (real, ponte no ar):** list 200 (arquivos reais) · read .env 200 · **traversal → 400 bloqueado** · write 200 · run `site-content detect` 200 · **run `rm -rf /` → bloqueado** · **sem token → 401** · sysinfo traz hostname/CPUs/RAM reais. Corrigido na validação: funções `fsList/fsRead/fsWrite` ausentes (eram chamadas mas não definidas) e token do `.env` que estava vazio.
**Limite honesto:** o navegador pode bloquear fetch a `127.0.0.1` (CORS/rede) — nesse caso o site segue em "PC offline" sem quebrar.





