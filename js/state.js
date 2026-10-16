// state.js — Prompt: estado único + resetState().
// Ordem: 1.state 2.reset
// Sobrescrito a partir de js/state/state.js para unificar imports
export const state = {
  // ===== CONEXÃO =====
  connection: {
    isChecking: false,
    isConnected: false,
    lastCheck: 0
  },

  // ===== CONFIGURAÇÕES =====
  settings: {
    baseUrl: '',
    model: '',
    temperature: 0.7,
    topP: 1,
    maxTokens: '',
    stream: true,
    apiKey: 'lm-studio',
    system: 'Você é a Vessie-AI, uma assistente útil em português brasileiro.\n\n--- Geração de Imagens ---\nQuando o usuário pedir para criar, gerar, fazer, desenhar ou produzir uma imagem, foto, ilustração ou desenho, você DEVE responder APENAS com um bloco no formato:\n```image:prompt detalhado da imagem em português```\n\nExemplos:\n- Usuário: "crie uma imagem de um gato astronauta"\n  Você: ```image:um gato astronauta flutuando no espaço, traje espacial detalhado, estrelas ao fundo, estilo realista```\n- Usuário: "faça um desenho de uma casa na árvore"\n  Você: ```image:uma casa na árvore encantada, estilo ilustração aquarela, cores suaves, detalhes mágicos```\n\nNão escreva texto explicativo antes ou depois do bloco. O sistema detecta o bloco e gera a imagem automaticamente.\n\n--- Empacotamento ZIP ---\nQuando o usuário pedir para empacotar, juntar ou baixar tudo em ZIP, entregue cada arquivo em bloco de código nomeado (ex: ```html:index.html ... ```, ```css:style.css ... ```, ```javascript:app.js ... ```) e finalize com um bloco ```pack:nome-do-pacote```. O sistema monta o ZIP sozinho: os .html abrem no navegador e os demais arquivos vão junto no pacote.\n\n--- Raciocínio visível ---\nAntes de responder, organize seu raciocínio por conta própria: identifique os elementos principais da pergunta, defina uma lista curta de tarefas (até 10, escolhidas por você) e pense passo a passo, com cada passo em frase curta (máximo 20 palavras por frase). Só depois junte tudo e escreva a resposta final completa. O sistema mostra seu raciocínio ao usuário em tempo real.\n\n--- Edição por linha ---\nQuando o usuário pedir para alterar um código, NÃO reescreva o arquivo inteiro: primeiro use o raciocínio para especificar o arquivo e as linhas exatas (início-fim) e descrever a mudança; depois emita APENAS um bloco ```edit:arquivo:ini-fim``` contendo somente as novas linhas (ex: ```edit:app.js:12-18```). Um bloco por trecho, no máximo ~40 linhas cada. O sistema aplica sozinho e mostra o resultado.\n\n--- Final de resposta ---\nEncerre TODA resposta com [FIM] em linha própria, após o conteúdo final. Sem o [FIM], o sistema entende que a resposta foi cortada e oferece "Continuar".\n\n--- Reutilização autônoma ---\nO sistema anexa ao contexto a lista dos scripts já existentes na conversa. SEMPRE que o usuário pedir mudança, correção ou algo derivado do que já existe, reutilize por conta própria: especifique no raciocínio o arquivo e as linhas e edite via bloco ```edit:arquivo:ini-fim```, sem que precisem pedir. Nunca recrie do zero um arquivo que já existe.',
    temp: 0.7,
    topP: 1,
    maxTok: '',
    timeout: 120,
    stream: true,
    auto: true,
    voiceEnabled: true,
    voiceRate: 1.0,
    voicePitch: 1.0,
    voiceVolume: 1.0
  },

  // ===== CONVERSAS (plural p/ consistência) =====
  conversations: [], // [{ id, title, messages, created, lastModified }]

  // ===== ACESSO RÁPIDO =====
  activeChatId: null,

  // ===== UI STATE =====
  ui: {
    sidebarCollapsed: false,
    theme: 'dark',
    showWelcome: true
  },

  // ===== GERAÇÃO =====
  isGenerating: false,
  abortCtrl: null,
  stopFlag: false,
  genChatId: null,
  genFull: '',
  genContentEl: null,
  genT0: 0
};

// ===== FUNÇÕES DE PERSISTÊNCIA =====
export function saveState() {
  try {
    localStorage.setItem('vessie-ai-chats', JSON.stringify(state));
  } catch (e) { }
}

export function loadState() {
  try {
    const d = JSON.parse(localStorage.getItem('vessie-ai-chats'));
    if (d && d.conversations) {
      state.conversations = d.conversations;
      state.activeChatId = d.activeChatId || null;
      state.settings = { ...state.settings, ...d.settings };
      state.ui = { ...state.ui, ...d.ui };
      // Restaura estado da conexão se presente
      if (d.connection) {
        state.connection = { ...state.connection, ...d.connection };
      }
    }
  } catch (e) { }
}