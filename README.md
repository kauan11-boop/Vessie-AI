# Vessie AI Chat · DS-BOX Edition

Chat de IA 100% estático e local-first para **GitHub Pages**: converse com o LM Studio / Ollama / OpenRouter rodando no seu PC — nada sai da sua máquina. Com o **DS-BOX** (sempre ativo) os modelos ganham um sandbox completo: sistema de arquivos virtual, **Build-Iso** (ISO 9660 real), emulador **x86 (v86)**, shell **Bash-86X**, terminal próprio da IA, scripts **JS + Python**, **Web-Search/Web-Fetch**, **Sub-Agents** com mascote variável, imagens no chat, vozes naturais e controle de **Discord** no seu estilo.

> **English summary:** A static, local-first AI chat for GitHub Pages (LM Studio, Ollama, OpenRouter). The DS-BOX Dynamic Creation System is always on: virtual file system, real ISO 9660 builder (Build-Iso), x86 WebAssembly emulator (v86), virtual shell (Bash-86X), an AI-only terminal channel, JS+Python execution, Sub-Agents with variable mascot, in-chat images, natural voices and Discord control in your own style — all client-side.

---

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [DS-BOX · Dynamic Creation System (sempre ativo)](#ds-box--dynamic-creation-system-sempre-ativo)
3. [Sub-Agents · /agent · /discord](#sub-agents--agent--discord)
4. [Vessie Local (IA local sem GGUF)](#vessie-local-ia-local-sem-gguf)
5. [Conexão de provedores](#conexão-de-provedores)
6. [Rodar localmente](#rodar-localmente)
7. [Publicar no GitHub Pages](#publicar-no-github-pages)
8. [Protocolo de ferramentas ds:* (para modelos)](#protocolo-de-ferramentas-ds-para-modelos)
9. [System API — prompt de instruções](#system-api--prompt-de-instruções)
10. [Arquitetura](#arquitetura)
11. [Segurança e honestidade](#segurança-e-honestidade)

---

## Funcionalidades

| Área | O que faz |
| --- | --- |
| Chat multi-provider | LM Studio, Ollama, OpenRouter e endpoint custom — streaming SSE, key e timeout reais |
| **Vessie Local** | IA local completa sem servidor: rede neural Simulite + datasets embutidos — **sem GGUF, sem quantização, sem download** (roda em mobile) |
| Memory (VessieLang) | `memory:put`, `memory:run`, triggers e skills em localStorage; export/import `.zip`/`.mem` |
| **Sub-Agents** | Mascote variável antes de cada mensagem (Builder/Coder/Research/Fixer/Discord/Voice); loop agêntico; **auto-continue** quando o modelo para antes da hora |
| **Agentes por comando** | `/agent <descrição>` — a própria IA cria, salva e ativa a persona (sem formulário manual) |
| Imagens no chat | Sem aba própria: `ds:image` e blocos `` ```image:prompt `` renderizam na conversa |
| Vozes naturais | TTS com ranking de vozes Natural/Neural/Google, idioma detectado por resposta |
| Ditado automático | Microfone detecta o idioma (pt/en) e reinicia no idioma certo |
| **Discord** | **Conta direta (sem bot)**: cola o token da sua conta e a IA age como você — lê o canal, coleta memória adaptativa e responde no seu estilo com anti-spam; modo Bot oficial também existe |
| Segurança | Sandbox Web Worker; scripts .py via Pyodide; links com whitelist; sem `eval` na página |

## DS-BOX · Dynamic Creation System (sempre ativo)

O DCS **não tem mais switch**: faz parte permanente do Vessie-AI. O painel lateral mostra apenas **2 abas manuais** ao usuário — todo o resto é **gerenciado pela IA** via ferramentas `ds:*`.

### Abas manuais do painel

| Aba | Conteúdo |
| --- | --- |
| **Emulador** | Tela v86 + serial ttyS0 clicável, boot de ISO da prateleira ou kernel preset, memória 64–512 MB, envio de teclado, **terminal unificado** (relatórios da ISO + comandos da IA + espelho serial) e botão **Problema** |
| **Files** | Navegador do VFS: criar, importar ZIP, baixar ZIP, copiar árvore |

Views ocultas (Bash-86X, Script Lab, Build-Iso) só abrem quando a IA navega até elas (`ds:term`, `ds:preview`, `ds:iso`…), com selo "gerenciado pela IA".

### Terminal do DS-BOX — 2 variantes de uso

- **Variante do USUÁRIO**: a aba Emulador — tela + serial clicável para você digitar no sistema emulado.
- **Variante da VESSIE-AI**: `ds:term` (Bash-86X, funciona até offline) e `ds:send` (envia comandos ao SO emulado no v86 e lê a saída serial) — é assim que a IA abre programas, testa e corrige o sistema sozinha.

### Build-Iso controlado pela IA

Peça no chat: *"monte e boote uma ISO chamada minios"*. A IA planeja, escreve os arquivos (`ds:write`), compila (`ds:iso:minios {"kernel":"buildroot","boot":true}`), recebe o **relatório terminal automático** (`iso-ls` + `iso-info`), boota no v86 e interage via `ds:send`.

**Modificar uma ISO**: `ds:read`/`ds:edit` nos arquivos → `ds:iso` de novo com o **MESMO nome** → substituição automática (nada de duplicatas). Nomes placeholders (`nome`, `name`…) enviados por modelos são sanitizados para um nome válido — nunca mais "ISO com nome nome".

### Correção de problemas (Problema)

- **Automático**: erro no emulador → o terminal é capturado (serial + build log + árvore) e enviado à IA para diagnosticar e corrigir.
- **Manual**: botão **🛠 Problema** na aba Emulador faz o mesmo na hora.
- A IA lê a saída em formato terminal, corrige os arquivos (`ds:edit`/`ds:write`), recompila com o mesmo nome e reboota.

## Sub-Agents · /agent · /discord

- **Mascote variável**: cada tipo de conteúdo gera uma variante (cor + badge) antes da mensagem — Builder 💿, Coder ⚡, Research 🔎, Fixer 🛠, Discord 🎧, Voice 🎙.
- **`/agent <descrição>`**: a IA projeta a persona (nome, emoji, temperatura, instruções), cria e ativa — agentes também são sub-agents. `/agents` lista.
- **`ds:agent`**: a IA pode criar/ativar agentes por conta própria quando a tarefa pede persona persistente.
- **`/discord`**: `read` (lê o canal), `send <texto>`, `auto on|off` (monitora e responde sozinho). Em **Configurações → Discord** escolha **Conta direta** (token da sua conta — sem bot) ou **Bot oficial**. A memória adaptativa aprende suas mensagens (do chat E do Discord), o system prompt se adapta e as respostas saem naturais/humanas — com bloqueio de spam para nunca repetir a mesma resposta.

## Memória adaptativa · Voz natural · Persona

- **`/persona`**: mostra os fatos/tópicos que a IA aprendeu de você; `/persona reset` zera. A memória é coletada automaticamente das conversas (e do Discord) e **fica ligada ao system prompt**, que se adapta com o tempo para as respostas saírem naturais e humanas.
- **Fala natural**: em vez de ritmo robótico, cada frase ganha prosódia própria (pergunta sobe a entonação, exclamação acelera, vírgula respira). **Voz por amostra**: suba um `.mp3`/`.wav` em Configurações → Voice e a IA extrai pitch/ritmo/timbre do áudio e troca a fala para recrear esse sotaque no dispositivo.
- **Respostas humanas curtas**: conversa normal responde com ≤ 20 letras; quando a IA usa ferramentas `ds:*` ela fica em silêncio até o resultado voltar.
- **`ds:install`**: instala um rootfs Linux REAL no VFS (etc/, bin/, usr/, var/, home/ + pacotes busybox/python/git/nginx/vim/curl) — arquivos de verdade que todos podem editar (IA e você, botão Editar no Files).
- **Base de silêncio**: a IA não fala de DS-BOX/ferramentas/internals sem instrução — no dia a dia ela é só uma pessoa conversando.

## Vessie Local (IA local sem GGUF)

Selecione **Vessie Local** no seletor de modelo: rede neural Simulite (MLP em JS puro, aprende com suas conversas) + **datasets embutidos** de conhecimento sobre o projeto, Build-Iso, ds:*, Discord, voz etc. Nada de GGUF, quantização ou download de modelo — é por isso que funciona em qualquer celular. Honestidade: sem informação real, ela diz que não sabe (não inventa).

## Conexão de provedores

Aponte para um servidor compatível OpenAI em **Configurações → API**: LM Studio (`http://localhost:1234/v1`), Ollama (`http://localhost:11434/v1`), OpenRouter (com key) ou custom. Sem servidor? O Vessie Local assume automaticamente. (Sem tutorial de LM Studio aqui — o propósito do projeto é esse; o dono já sabe ligar o servidor.)

## Rodar localmente

```bash
bun install
bun run dev        # http://localhost:3000
```

## Publicar no GitHub Pages

O repositório já inclui o workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (build estático + deploy automático):

1. Envie este projeto para um repositório GitHub (branch `main`);
2. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**;
3. A cada push, o site é publicado em `https://seu-usuario.github.io/nome-do-repo/`.

O workflow define `NEXT_OUTPUT=export` e `NEXT_PUBLIC_BASE_PATH=/<nome-do-repo>` automaticamente. O arquivo `public/.nojekyll` garante que a pasta `_next/` seja servida.

> O app é 100% client-side: a API do seu servidor é chamada **do navegador do visitante**. No Pages, cada visitante conversa com o servidor de IA que estiver exposto na máquina dele (túnel HTTPS) — ou usa o Vessie Local.

## Protocolo de ferramentas ds:* (para modelos)

Os modelos usam blocos cercados `` ```ds:<ferramenta>[:<alvo>] `` e o site executa localmente e devolve o resultado ao chat (loop agêntico de até 3 rodadas):

````markdown
```ds:write:src/app.js
console.log("olá DS-BOX");
```

```ds:edit:src/app.js
{"find":"olá","replace":"alô","all":true}
```

```ds:iso:minios
{"volume":"MINIOS","kernel":"buildroot","boot":true}
```

```ds:term
ls -la
```

```ds:send
ls /
```

```ds:script:py
print("olá python")
```

```ds:image
{"prompt":"aurora over a datacenter, terracotta palette"}
```

```ds:agent
{"name":"IsoSmith","emoji":"🔨","temp":0.6,"instructions":"…","activate":true}
```

```ds:search
{"query":"buildroot linux"}
```
````

Ferramentas: `write` `edit` `read` `rm` `mv` `tree` `zip` `template` `install` `voice` `iso` `factory` `os` `boot` `run` `script` `term` `send` `problem` `image` `agent` `discord` `preview` `search` `fetch` `prompt`. Usuários também podem digitar blocos `ds:*` direto no chat para executá-los manualmente.

### Modo do assistente (sistema único de prompt)

Uma única chave decide o comportamento do modelo — `src/lib/prompt-mode.ts`:

- **💬 Chatbot** — apenas 1 chatbot de conversa: sem ferramentas, sem VFS, sem internals no prompt.
- **📦 DS-BOX · OS** — criação de sistemas operacionais: protocolo `ds:*` completo + OS Studio (`ds:os:<nome> {"action":"full"}` monta spec natural (`os-spec.md`), árvore de arquivos, apps do convidado, ISO 9660 bootável, boot no v86 e relatório).

Troque pela barra do chat (💬/📦), por `/modo` no chat ou em Configurações → DS-BOX → Modo do assistente.

### GitHub Pages

Deploy estático: workflow `.github/workflows/deploy.yml` (push em `main`) → `NEXT_OUTPUT=export NEXT_PUBLIC_BASE_PATH=/<repo> next build` → pasta `out/` com `.nojekyll`. Testado: build de exportação compila, `basePath` é aplicado a todos os assets e `404.html` é gerado. Local: `npm run build:pages`.

## System API — prompt de instruções

A página **System API** (ícone terminal no cabeçalho) agora é um **conjunto de instruções em formato de prompt**: copia (botão *Copy prompt*), cola em qualquer IA e ela passa a interagir com os sistemas do Vessie-AI — Memory, DS-BOX, Build-Iso, imagens, agentes e Discord. O prompt inclui o estado atual (modelo, VFS, ISOs) e pode ser regenerado com *Refresh*.

## Arquitetura

```
src/
├── app/                    # App Router (página única + layout)
├── components/
│   ├── vessie/             # chat, sidebar, memory, settings, mascote variável, system-api (prompt)
│   └── dsbox/              # painel DS-BOX: emulador + terminal, files, bash86, script lab, build-iso
└── lib/
    ├── providers/sse/ai    # camada de IA multi-provider
    ├── memory/mem-parser   # VessieLang + Memory (contrato vessie-memory-v2)
    ├── simulite            # rede neural local (MLP, backprop manual)
    ├── datasets.ts         # datasets locais embutidos (sem GGUF — roda em mobile)
    ├── subagents.ts        # variantes do mascote + detecção de sub-agent
    ├── discord.ts          # API de bots + perfil de estilo + poller
    ├── sandbox             # Web Worker com globals anulados
    └── dsbox/
        ├── vfs.ts          # sistema de arquivos virtual + ZIP + 9 templates
        ├── iso.ts          # gerador ISO 9660 + El Torito (espec ECMA-119)
        ├── emulator.ts     # v86 via CDN (libv86.js + v86.wasm + SeaBIOS)
        ├── bash86.ts       # shell virtual ligado ao VFS
        ├── terminal.ts     # terminal unificado: relatório ISO + captura de problemas
        ├── web.ts          # Web-Search + Web-Fetch (cadeia de proxies)
        ├── preview.ts      # Script Lab + Pyodide (stdout {batched})
        ├── tools.ts        # protocolo ds:* + núcleo Build-Iso
        └── store.ts        # estado DCS (sempre ativo)/prateleira/feed (Zustand)
```

## Segurança e honestidade

- **Sandbox**: código JS da IA roda em Web Worker com `fetch`, `eval`, `Function`, `localStorage` e DOM anulados; timeout de 10 s;
- **Python**: Pyodide/WASM em CDN — mesma instância, stdout capturado com `{batched}`;
- **ISOs**: o rótulo "bootável" só aparece quando um kernel real foi embutido; ISO de dados é rotulada como dados;
- **Discord**: apenas API oficial de bots — sem self-bot/token de usuário (contra o ToS do Discord);
- **Emulador**: binários v86 e kernels vêm de CDNs públicos; sem rede, o DS-BOX ainda roda Bash-86X e os previews locais;
- **Privacidade**: conversas, VFS e Memory ficam no `localStorage`; o token do Discord também — nenhum telemetry.

---

Licença: mesma do projeto original Vessie-AI (MIT). Créditos: [copy/v86](https://github.com/copy/v86) para o emulador, [pyodide](https://pyodide.org) para Python no navegador, [fflate](https://github.com/101arrowz/fflate) para ZIP.
