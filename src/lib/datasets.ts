// Vessie AI — datasets locais embutidos (sem quantização, sem GGUF, 100% JS)
// Base de conhecimento estruturada usada pelo motor local (Simulite/Vessie Local)
// como estágio de recuperação antes da rede neural. Roda em qualquer mobile —
// são apenas dados + casamento de palavras-chave, sem download de modelos.

export interface DatasetEntry {
  id: string;
  keys: string[];        // gatilhos (tokens normalizados)
  topic: string;
  answer: string;        // resposta canônica (PT-BR)
  answerEn?: string;     // variante EN opcional
}

export const DATASETS: DatasetEntry[] = [
  {
    id: "vessie-what",
    keys: ["vessie", "quem", "voce", "você", "sobre", "projeto", "who", "about"],
    topic: "Sobre a Vessie-AI",
    answer:
      "Eu sou a Vessie-AI, assistente do projeto Vessie-AI Chat: um chat 100% no navegador que conversa com qualquer servidor compatível OpenAI (LM Studio, Ollama, OpenRouter…). Tenho Memory persistente, DS-BOX (sandbox com VFS, Build-Iso ISO 9660, emulador x86 v86 e Bash-86X), Web-Search/Fetch, Sub-Agents com mascote variável, vozes naturais e modo local próprio. Tudo roda no seu dispositivo — nada vai para a nuvem sem você pedir.",
  },
  {
    id: "ds-tools",
    keys: ["ds:", "ferramentas", "tools", "dsbox", "ds-box", "como", "usar"],
    topic: "Ferramentas ds:*",
    answer:
      "As ferramentas ds:* são blocos cercados que eu escrevo e o site executa localmente: ds:write (criar/editar arquivo), ds:edit (buscar e substituir), ds:read, ds:tree, ds:zip, ds:iso (compilar ISO 9660 bootável), ds:boot (iniciar no emulador v86), ds:term (comando no sandbox), ds:send (comando no SO emulado), ds:script (rodar JavaScript ou Python), ds:image (gerar imagem no chat), ds:search/ds:fetch (web), ds:agent (criar sub-agente) e ds:discord (controlar Discord). O resultado volta como mensagem do sistema e eu continuo o trabalho automaticamente.",
  },
  {
    id: "build-iso",
    keys: ["iso", "build", "build-iso", "compilar", "montar", "boot", "kernel", "eltorito", "el", "torito", "9660"],
    topic: "Build-Iso",
    answer:
      "O Build-Iso monta uma ISO 9660 real com El Torito: eu escrevo os arquivos do sistema com ds:write (init, etc/motd, boot/boot.cfg), depois compilo com ds:iso:nomedosistema (ex.: ds:iso:minios) informando um kernel (ex.: \"kernel\":\"buildroot\") e já inicio com ds:boot. Para MODIFICAR uma ISO existente eu leio/edito os arquivos no VFS e rodo ds:iso de novo com o MESMO nome — a versão anterior é substituída. Toda compilação gera um relatório em formato terminal no painel (estrutura, setores, boot catalog).",
  },
  {
    id: "emulator",
    keys: ["emulador", "emulator", "v86", "x86", "wasm", "maquina", "máquina", "virtual", "vm"],
    topic: "Emulador v86",
    answer:
      "O emulador roda x86 real em WebAssembly (v86 — Pentium 4 ~ SSE3) direto no navegador, com tela + console serial. Tem duas variantes de uso: a SUA (aba Emulador do painel, com tela e teclado) e a MINHA (canal ds:send/ds:term, em que eu envio comandos e leio a saída serial automaticamente para testar, interagir e corrigir o sistema). Se o CDN do v86 estiver inacessível, o Bash-86X virtual continua funcionando offline.",
  },
  {
    id: "scripts",
    keys: ["javascript", "python", "script", "js", "py", "pyodide", "executar", "run"],
    topic: "Scripts JS + Python",
    answer:
      "Eu executo JavaScript (sandbox em Web Worker, sem rede) e Python (Pyodide/WASM) pelo bloco ds:script, ou crio arquivos no VFS e rodo com ds:run:caminho. Exemplos: ```ds:script:js``` com o código no corpo, ou ds:script:py. O resultado volta para o chat e eu corrijo automaticamente se der erro.",
  },
  {
    id: "memory",
    keys: ["memory", "memoria", "memória", "mem", "salvar", "lembret"],
    topic: "Memory",
    answer:
      "O Memory é a pasta virtual persistente (localStorage, formato vessie-memory-v2). Salvo arquivos com ```memory:put:caminho <conteúdo>```, executo JS com ```memory:run```, crio triggers com ```memory:trigger:nome|padrão|script``` e aplico gramática .mem completa com ```mem```. O inventário entra no contexto automaticamente a cada conversa.",
  },
  {
    id: "offline",
    keys: ["offline", "local", "simulite", "sem", "internet", "mobile", "gguf", "quantização", "quantizacao"],
    topic: "Vessie Local (OFFLINE)",
    answer:
      "O modo Vessie Local (OFFLINE · Simulite) funciona sem servidor e sem download de modelo: rede neural MLP em JS puro (20k parâmetros, backprop manual) + datasets embutidos de conhecimento. Sem GGUF, sem quantização, sem download — por isso roda em qualquer celular. Ela aprende com as suas conversas (REINFORCE + treino em idle) e nunca inventa dados: sem informação, ela diz.",
  },
  {
    id: "subagents",
    keys: ["sub-agent", "subagent", "sub", "agente", "agent", "agentes", "mascote", "persona"],
    topic: "Sub-Agents",
    answer:
      "Sub-Agents são variantes da minha personalidade especializadas por tipo de conteúdo: Builder (ISO/SO), Coder (scripts), Researcher (web), Fixer (diagnóstico/terminal), Discord e Voice. O mascote muda de cor e badge antes de cada mensagem conforme o que estou fazendo. Você cria agentes próprios com o comando /agent <descrição> — sem formulário manual: eu mesmo monto a persona, salvo e ativo. Agentes também podem ser criados por mim de forma autônoma com ds:agent.",
  },
  {
    id: "discord",
    keys: ["discord", "servidor", "canal", "bot"],
    topic: "Discord",
    answer:
      "Conecto DIRETO na sua conta Discord (sem bot): você cola o token da conta + ID do canal nas configurações e eu leio o canal, aprendo o SEU jeito de falar (memória adaptativa: frases, emojis, gírias) e respondo como se fosse você (ds:discord:send / ds:discord:reply). O modo automático monitora e responde sozinho — com bloqueio de spam para nunca repetir a mesma resposta. Prefere a API oficial? O modo Bot também existe.",
  },
  {
    id: "voice",
    keys: ["voz", "voice", "falar", "speak", "tts", "microfone", "micro", "stt", "ditado", "idioma"],
    topic: "Vozes e microfone",
    answer:
      "Tenho vozes naturais integradas: uso as vozes mais naturais do sistema (Natural/Neural/Google quando existirem), escolho o idioma da fala automaticamente conforme a resposta, e cada mensagem tem botão de áudio. No microfone, o ditado detecta automaticamente o idioma que você está falando (PT/EN) — sem escrever errado por estar travado em inglês. Configurações → Voice para escolher a voz.",
  },
  {
    id: "images",
    keys: ["imagem", "image", "img", "desenh", "gerar", "picture", "foto"],
    topic: "Imagens no chat",
    answer:
      "Gero imagens dentro do próprio chat — sem aba separada. Peça normalmente (\"gere uma imagem de...\") ou eu uso ds:image {\"prompt\":\"...\"} quando quiser ilustrar algo durante uma tarefa. O resultado aparece inline na conversa, com variações (🎲) e download.",
  },
  {
    id: "problem",
    keys: ["problema", "erro", "bug", "corrig", "fix", "diagnostic", "debug"],
    topic: "Correção de problemas",
    answer:
      "Quando algo falha no DS-BOX (boot, compilação, script), o terminal é capturado e enviado automaticamente para mim junto com o contexto (saída serial, log de build, árvore do VFS) — ou você clica no botão Problema no painel. Eu procuro o erro nos comandos/saída, corrijo os arquivos com ds:edit/ds:write e recompilo, sem você precisar refazer nada.",
  },
  {
    id: "pack",
    keys: ["zip", "pack", "pacote", "download", "exportar"],
    topic: "ZIP / empacotamento",
    answer:
      "Empacoto qualquer coisa: ```pack:nome``` zipeia a conversa inteira, ds:zip:projeto zipeia o projeto do VFS (com include opcional), e o botão 📦 no cabeçalho faz o pacote do chat atual. Arquivos vêm como blocos ```html:index.html``` etc. e são montados automaticamente.",
  },
  {
    id: "greet",
    keys: ["oi", "ola", "olá", "bom", "boa", "hi", "hello", "hey"],
    topic: "Saudação",
    answer:
      "Olá! Sou a Vessie-AI. Posso conversar, programar (JS/Python), montar e bootar sistemas operacionais (Build-Iso + emulador), pesquisar na web, gerar imagens no chat, controlar seu Discord e muito mais — tudo dentro do navegador. O que vamos fazer?",
  },
  {
    id: "thanks",
    keys: ["obrigad", "valeu", "thanks", "thank", "legal", "otimo", "ótimo"],
    topic: "Agradecimento",
    answer:
      "Por nada! Estou aqui — pode pedir outra tarefa quando quiser (ISO, scripts, pesquisa, imagem, Discord…).",
  },
  {
    id: "linux",
    keys: ["linux", "busybox", "buildroot", "shell", "bash", "terminal", "comando"],
    topic: "Linux no DS-BOX",
    answer:
      "No sandbox Linux eu consigo: rodar comandos via Bash-86X (ls, cat, echo >, zip, sh) e, com o kernel buildroot bootado no v86, interagir com o console real (ds:send \"ls /\", instalar applets busybox disponíveis, montar /proc etc.). A saída serial volta para mim automaticamente — é assim que testo e corrijo o sistema operacional. Também instalo um rootfs Linux REAL no VFS com ds:install (etc/, bin/, usr/, var/, home/ + pacotes busybox, python, git, nginx, vim, curl) — arquivos de verdade que eu mesmo edito.",
  },
  {
    id: "lm-studio",
    keys: ["lm", "studio", "lmstudio", "servidor", "server", "localhost", "1234", "openai", "endpoint", "api", "gguf", "mlx"],
    topic: "LM Studio (pesquisa web)",
    answer:
      "LM Studio é o servidor local que expõe API compatível com OpenAI em http://localhost:1234/v1 — endpoints /v1/models, /v1/chat/completions, /v1/completions, /v1/embeddings e /v1/responses, tanto streaming (SSE) quanto não-streaming. Suporta modelos em GGUF (llama.cpp) e MLX (Apple Silicon), com download dentro do app e seleção de contexto/GPU. A Vessie-AI conecta nele de forma nativa: provider LM Studio, baseUrl http://localhost:1234/v1, e o modelo carregado aparece no seletor. Em redes diferentes use o IP do host (ex.: http://192.168.0.10:1234/v1) com CORS liberado no servidor.",
  },
  {
    id: "models",
    keys: ["modelo", "modelos", "model", "qwen", "llama", "phi", "gemma", "mistral", "deepseek", "devstral", "escolher", "qual"],
    topic: "Modelos locais recomendados (pesquisa web)",
    answer:
      "Para rodar em LM Studio (2025–2026): Qwen3 é o melhor geral (raciocínio, código, multilíngue, Apache 2.0); gpt-oss-20b/120b são os melhores open-weight de raciocínio; Gemma 3 12B/27B é a escolha para laptop (multimodal, 128K de contexto); Phi-4-mini (3.8B, MIT, 128K) roda em máquinas modestas e no celular; Devstral é forte para agentes de código; Llama 4 Scout cobre contexto gigante; DeepSeek-V4 e Mistral Small 3.1 cobrem o topo e a empresa. Regra prática: 7B–8B para máquinas simples, 12B–27B com 16 GB+, MoE grande só com GPU dedicada. A Vessie-AI funciona com QUALQUER modelo atrás do endpoint OpenAI-compatible.",
  },
  {
    id: "vfs-linux",
    keys: ["vfs", "rootfs", "install", "instalar", "arquivos", "files", "sistema de arquivos"],
    topic: "VFS + Linux web",
    answer:
      "O VFS é o sistema de arquivos virtual do DS-BOX (localStorage) integrado ao Linux web: o Bash-86X opera nele (ls, cat, pipes, redireção), o emulador v86 boota os kernels montados a partir dele e o ds:install planta um rootfs Linux REAL (etc/os-release, bin/, usr/, var/log, home/, boot/ + pacotes busybox/python/git/nginx/vim/curl). Todos os arquivos são editáveis pela IA (ds:write/ds:edit — acesso total) e por você no painel Files. É Linux de verdade rodando no navegador, sem download de imagens de GB.",
  },
];

const STOP = new Set(["a", "o", "de", "da", "do", "e", "que", "para", "com", "no", "na", "the", "is", "to", "of"]);

function tokenize(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9:]+/).filter(t => t && !STOP.has(t));
}

/** Melhor entrada do dataset para o texto (sobreposição de tokens + bônus de gatilho). */
export function datasetLookup(text: string, threshold = 0.22): { entry: DatasetEntry; score: number } | null {
  const tokens = new Set(tokenize(text));
  if (tokens.size === 0) return null;
  let best: DatasetEntry | null = null;
  let bestScore = 0;
  for (const e of DATASETS) {
    let hit = 0;
    for (const k of e.keys) {
      const nk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (tokens.has(nk) || [...tokens].some(t => t.length > 3 && t.includes(nk))) hit++;
    }
    const score = hit / Math.max(1, Math.min(e.keys.length, 4));
    if (score > bestScore) { bestScore = score; best = e; }
  }
  if (best && bestScore >= threshold) return { entry: best, score: bestScore };
  return null;
}

/** Resposta do dataset no idioma detectado do usuário. */
export function datasetAnswer(text: string): string | null {
  const hit = datasetLookup(text);
  if (!hit) return null;
  const wantsEn = /\b(the|and|you|how|what|can|please|help)\b/i.test(text) && !/[ãáâàéêíóôõúç]/i.test(text);
  return wantsEn && hit.entry.answerEn ? hit.entry.answerEn : hit.entry.answer;
}

/** Dados para o painel de status do modelo local. */
export function datasetStats(): { entries: number; topics: string[] } {
  return { entries: DATASETS.length, topics: [...new Set(DATASETS.map(d => d.topic))] };
}
