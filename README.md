# Vessie Agent — Chat & Agent Coding

App React + Vite, pensado para publicar no GitHub Pages, com dois modos que
alternam pela barra lateral:

- **💬 Chatbot** — conversa normal com a IA.
- **🛠️ Agent Coding** — você seleciona uma pasta real do seu computador e a
  IA lê e edita os arquivos dela através de um protocolo de comandos, com
  uma fila de "pendentes" para você aprovar cada escrita/exclusão antes de
  ela acontecer no disco.

A IA já vem com uma referência compacta da **VessieLang** no prompt de
sistema, então por padrão ela tende a sugerir scripts/UIs em `.vessie`
quando você não pedir uma linguagem específica.

## Rodando localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

Por padrão o app tenta falar com o **LM Studio** rodando em
`http://localhost:1234/v1` (API compatível com a da OpenAI). Ligue o
servidor local do LM Studio (aba "Local Server") antes de usar, ou troque a
URL/modelo/chave no botão **⚙️ Configurações** do app para apontar para
outro backend compatível (OpenAI, um proxy próprio, etc.).

> Se o seu backend roda em outra máquina/porta e o navegador bloquear por
> CORS, habilite CORS nesse servidor (o LM Studio já libera por padrão).

## Modo Agent Coding — como funciona

1. Clique em "Selecionar pasta do projeto" — o Chrome/Edge pede permissão
   de leitura **e escrita** só para aquela pasta (via File System Access
   API; funciona em navegadores baseados em Chromium).
2. Peça algo no chat ("cria um componente X", "corrige o bug em Y"...).
3. A IA pode pedir para ler arquivos/pastas primeiro — isso é feito sozinho
   e o resultado volta pra ela automaticamente (até 3 rodadas por mensagem
   sua, pra evitar loop infinito).
4. Quando ela propõe criar, editar ou apagar um arquivo, a mudança cai na
   coluna **"Mudanças pendentes"** à direita — nada é escrito no disco até
   você clicar em **Aplicar**.

A seleção da pasta não é salva entre recarregamentos da página (limite da
própria API do navegador) — você seleciona de novo a cada sessão.

## Publicando no GitHub Pages

Já vem com um workflow (`.github/workflows/deploy.yml`) que builda e publica
sozinho a cada push na branch `main`. Só precisa:

1. Criar um repositório no GitHub e subir este projeto pra ele.
2. Em **Settings → Pages**, em "Build and deployment", escolher a origem
   **GitHub Actions**.
3. Fazer o push — o Actions builda e publica automaticamente.

O `vite.config.js` já usa `base: "./"` (caminho relativo), então funciona
direto em `usuario.github.io/nome-do-repo/` sem precisar editar nada.

### Deploy manual (alternativa, sem Actions)

```bash
npm run build
npm run deploy   # usa o pacote gh-pages, publica a pasta dist/ na branch gh-pages
```

## Estrutura

```
src/
  App.jsx                  # layout raiz e alternância de modo
  components/
    Sidebar.jsx             # menu lateral (modo + configurações)
    ChatBot.jsx              # modo chatbot
    AgentCoding.jsx          # modo agent-coding (pasta + chat + pendentes)
    FileTree.jsx             # árvore de arquivos recursiva
    Message.jsx              # renderização de mensagem (com blocos de código)
    SettingsModal.jsx        # configuração do backend de IA
  lib/
    aiClient.js               # chamadas à API estilo OpenAI (streaming e simples)
    fsAccess.js                # wrapper da File System Access API
    agentProtocol.js           # parsing do protocolo de comandos ```agent
    systemPrompts.js           # prompts de sistema + referência da VessieLang
```

## Limitações conhecidas

- A File System Access API é só Chromium (Chrome/Edge/Opera/Brave); no
  Firefox/Safari o modo Agent Coding mostra um aviso e não funciona.
- O runtime completo da VessieLang (`VessieLang.js`) depende de módulos do
  Node (`fs`, `child_process`, `http`...) e não roda dentro do navegador —
  por isso este app não compila/executa `.vessie` sozinho. A IA continua
  sabendo escrever a linguagem (pela referência no prompt); para
  compilar/rodar de fato, use a CLI `vessie`/`VessieLang.js` normalmente
  fora do navegador.
- Sem histórico persistente de conversa entre sessões (fica só em memória).
