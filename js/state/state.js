// state.js - Gerenciamento de estado global
// Estrutura padronizada: todas as camadas usam o mesmo formato

export const state = {
  // ===== CONFIGURAÇÕES =====
  settings: {
    baseUrl: '',
    model: '',
    temperature: 0.7,
    topP: 1,
    maxTokens: '',
    stream: true,
    apiKey: 'lm-studio',
    system: 'Você é a Vessie-AI, uma assistente útil em português brasileiro.\n\n--- Geração de Imagens ---\nQuando o usuário pedir para criar, gerar, fazer, desenhar ou produzir uma imagem, foto, ilustração ou desenho, você DEVE responder APENAS com um bloco no formato:\n```image:prompt detalhado da imagem em português```\n\nExemplos:\n- Usuário: "crie uma imagem de um gato astronauta"\n  Você: ```image:um gato astronauta flutuando no espaço, traje espacial detalhado, estrelas ao fundo, estilo realista```\n- Usuário: "faça um desenho de uma casa na árvore"\n  Você: ```image:uma casa na árvore encantada, estilo ilustração aquarela, cores suaves, detalhes mágicos```\n\nNão escreva texto explicativo antes ou depois do bloco. O sistema detecta o bloco e gera a imagem automaticamente.',
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
    }
  } catch (e) { }
}
