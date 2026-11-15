# Vessie AI Chat · DS-BOX Edition

Chat de IA 100% estático e local-first para **GitHub Pages**: converse com o LM Studio / Ollama / OpenRouter rodando no seu PC — nada sai da sua máquina — e, com o **DS-BOX** + **Dynamic Creation System**, os modelos ganham um sandbox completo: sistema de arquivos virtual, **Build-Iso** (ISO 9660 real), emulador **x86 (v86)**, shell **Bash-86X**, **Web-Search/Web-Fetch** e criação de projetos/ZIPs.

> **English summary:** A static, local-first AI chat for GitHub Pages (LM Studio, Ollama, OpenRouter). The DS-BOX "Dynamic Creation System" gives models a virtual file system, a real ISO 9660 builder (Build-Iso), an x86 WebAssembly emulator (v86), a virtual shell (Bash-86X) and web search/fetch tools — all client-side.

---

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [DS-BOX · Dynamic Creation System](#ds-box--dynamic-creation-system)
3. [Como usar o LM Studio (2 min)](#como-usar-o-lm-studio-2-min)
4. [Rodar localmente](#rodar-localmente)
5. [Publicar no GitHub Pages](#publicar-no-github-pages)
6. [Protocolo de ferramentas ds:* (para modelos)](#protocolo-de-ferramentas-ds-para-modelos)
7. [Arquitetura](#arquitetura)
8. [Segurança e honestidade](#segurança-e-honestidade)

---

## Funcionalidades

| Área | O que faz |
| --- | --- |
| Chat multi-provider | LM Studio, Ollama, OpenRouter e endpoint custom — com streaming SSE, key e timeout reais |
| Modo OFFLINE honesto | Sem servidor, a Simulite responde admitindo que não há informação real |
| Memory (VessieLang) | `memory:put`, `memory:run`, triggers e skills em localStorage; export/import `.zip`/`.mem` |
| Imagens | Geração via Pollinations (sem chave) com blocos `` ```image:prompt `` |
| Voz | TTS + ditado por microfone (Web Speech API) |
| Segurança | Sandbox Web Worker com globals anulados; links com whitelist; sem `eval` no escopo da página |
| **DS-BOX** | Veja a seção abaixo — sandbox completo para os modelos |

## DS-BOX · Dynamic Creation System

Ative o **switch "Dynamic Creation System"** na barra acima do chat — ao ligar, a sessão **Build-Iso é ativada automaticamente** (sem segundo clique) e o botão 🔨 Build-Iso aparece ao lado. Ele injeta no contexto dos modelos:

- **VFS local** (`dsbox-vfs-v1`): Create-File / Read-Files / Edit-Files / Delete / Move com persistência;
- **Árvore de arquitetura auto-enviada**: todo prompt leva a árvore do projeto atual;
- **Build-Iso**: gera **ISO 9660 real** (PVD + path tables L/M + El Torito no-emulation) a partir dos arquivos do VFS, com kernel Linux livre embutido (`/boot/bzimage`) quando disponível;
- **Emulador v86**: x86 real em WebAssembly (Pentium 4 ~ SSE3) carregado sob demanda do CDN; boot por kernel direto (`bzimage`+`initrd`+`cmdline`) ou por ISO (cdrom), com tela + console serial `ttyS0`;
- **Bash-86X**: shell virtual sempre disponível (offline) ligado ao VFS — `ls`, `cd`, `cat`, `grep`, pipes e redireção;
- **Script Lab**: exibições e previews por gênero — HTML/CSS multi-arquivo (iframe sandbox), JS (worker), Shell (Bash-86X), Python (Pyodide via CDN), Markdown, JSON, SVG;
- **Web-Search + Web-Fetch**: busca (Wikipedia + DuckDuckGo) e leitura de páginas via cadeia de proxies CORS;
- **ZIP e projetos complexos**: `ds:zip` empacota o projeto; templates prontos (web app, CLI Node/Python, **Linux ISO**, Lua, Markdown);
- **Botão Build-Iso acima do chat**: ícone 🔨 sempre visível, rótulo curto; abre o wizard e ativa a persona "engenheiro Linux" — o modelo planeja, escreve os arquivos do sistema, monta a ISO e boota no emulador lateral.

### Modificar uma ISO (fluxo da IA)

A IA modifica um sistema existente assim: `ds:read` / `ds:edit` nos arquivos do VFS → `ds:iso:mesmonome` de novo. Uma ISO reconstruída com **o mesmo nome substitui automaticamente a versão anterior** na prateleira (nada de duplicatas). Nomes enviados pelos modelos são sanitizados — se o modelo mandar um placeholder (`nome`, `name`…) ou JSON colado no alvo, o nome volta a um valor válido (`dsboxos`).

### Painel lateral (5 abas)

| Aba | Conteúdo |
| --- | --- |
| **Emulador** | Tela v86 + serial ttyS0, boot de ISO da prateleira ou kernel preset, memória 64–512 MB, envio de teclado |
| **Bash-86X** | Terminal virtual + semeadura de templates |
| **Script Lab** | Galeria de arquivos por gênero + execução/preview |
| **Arquivos** | Navegador do VFS: criar, importar ZIP, baixar ZIP, copiar árvore |
| **Build-Iso** | Wizard: nome do volume, seleção de arquivos, kernel, log de build, prateleira de ISOs (baixar/bootar) |

## Como usar o LM Studio (2 min)

1. Instale o [LM Studio](https://lmstudio.ai) e baixe um modelo (ex.: Qwen 2.5 7B Instruct);
2. Abra a aba **Developer** → **Start Server** (porta 1234);
3. Em **Settings → Server**, ligue **Enable CORS**;
4. No site: **Configurações → API → Salvar & Conectar**.

Outros providers: Ollama (`http://localhost:11434/v1`) e OpenRouter (com API key).

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

O workflow define `NEXT_OUTPUT=export` e `NEXT_PUBLIC_BASE_PATH=/<nome-do-repo>` automaticamente — não é preciso configurar nada à mão. O arquivo `public/.nojekyll` garante que a pasta `_next/` seja servida.

> O app é 100% client-side: a API do seu LM Studio é chamada **do navegador do visitante**. No Pages, isso significa que cada visitante conversa com o servidor de IA que estiver exposto na máquina dele (via túnel HTTPS, ex.: ngrok/cloudflared) — ou usa o modo OFFLINE/Simulite.

## Protocolo de ferramentas ds:* (para modelos)

Com o DCS ativo, os modelos usam blocos cercados no formato `` ```ds:<ferramenta>:<alvo> `` e o site executa localmente e devolve o resultado ao chat (loop agêntico de até 3 rodadas):

````markdown
```ds:write:src/app.js
console.log("olá DS-BOX");
```

```ds:edit:src/app.js
{"find":"olá","replace":"alô","all":true}
```

```ds:run:src/app.js
```

```ds:iso:dsboxos
{"volume":"DSBOXOS","kernel":"buildroot","boot":true}
```

```ds:search
{"query":"buildroot linux"}
```

```ds:fetch
{"url":"https://example.com"}
```
````

Ferramentas: `write` `edit` `read` `rm` `mv` `tree` `zip` `template` `iso` `boot` `run` `preview` `search` `fetch` `prompt`. Usuários também podem digitar blocos `ds:*` direto no chat para executá-los manualmente.

## Arquitetura

```
src/
├── app/                    # App Router (página única + layout)
├── components/
│   ├── vessie/             # chat, sidebar, memory, settings, mascote…
│   └── dsbox/              # painel DS-BOX: emulador, bash86, script lab, arquivos, build-iso
└── lib/
    ├── providers/sse/ai    # camada de IA multi-provider
    ├── memory/mem-parser   # VessieLang + Memory (contrato vessie-memory-v2)
    ├── sandbox             # Web Worker com globals anulados
    └── dsbox/
        ├── vfs.ts          # sistema de arquivos virtual + ZIP + templates
        ├── iso.ts          # gerador ISO 9660 + El Torito (espec ECMA-119)
        ├── emulator.ts     # v86 via CDN (libv86.js + v86.wasm + SeaBIOS)
        ├── bash86.ts       # shell virtual ligado ao VFS
        ├── web.ts          # Web-Search + Web-Fetch (cadeia de proxies)
        ├── preview.ts      # Script Lab: gêneros e executores
        ├── tools.ts        # protocolo ds:* + núcleo Build-Iso
        └── store.ts        # estado DCS/prateleira/feed (Zustand)
```

## Segurança e honestidade

- **Sandbox**: código JS da IA roda em Web Worker com `fetch`, `eval`, `Function`, `localStorage` e DOM anulados; timeout de 10 s; RPC limitado;
- **ISOs**: o rótulo "bootável" só aparece quando um kernel real foi embutido; ISO de dados é rotulada como dados — nada de boot falso;
- **Emulador**: os binários do v86 e os kernels dos presets vêm de CDNs públicos (jsDelivr / copy.sh); sem rede, o DS-BOX ainda roda Bash-86X e todos os previews locais;
- **Privacidade**: conversas, VFS e Memory ficam no `localStorage`; nenhum telemetry.

---

Licença: mesma do projeto original Vessie-AI (MIT). Créditos: [copy/v86](https://github.com/copy/v86) para o emulador, [pyodide](https://pyodide.org) para Python no navegador, [fflate](https://github.com/101arrowz/fflate) para ZIP.
