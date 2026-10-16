// config.js — Prompt: unificar CONFIG + STORAGE_KEYS + defaultSettings.
// Ordem: 1.constantes 2.chaves 3.defaults
// Ex: CONFIG.defaultSettings.baseUrl usado por Storage.loadSettings.
// Sobrescreve os defaults com o .env aplicado (js/env-config.js gerado por
// tools/site-content.js env-apply a partir do .env na raiz do projeto).
const ENV = (typeof window !== 'undefined' && window.__VESSIE_ENV__) || {};

export const CONFIG = {
  defaultBaseUrl: ENV.BASE_URL || 'http://localhost:1234/v1',
  defaultParams: {
    temperature: 0.7,
    topP: 1,
    maxTokens: '',
    stream: true
  },
  defaultSettings: {
    baseUrl: ENV.BASE_URL || 'http://localhost:1234/v1',
    model: ENV.MODEL || '',
    apiKey: ENV.API_KEY || 'lm-studio',
    temperature: 0.7,
    topP: 1,
    maxTokens: '',
    stream: true,
    systemPrompt: 'Você é a Vessie-AI, uma assistente útil em português brasileiro.\n\n--- Geração de Imagens ---\nQuando o usuário pedir para criar, gerar, fazer, desenhar ou produzir uma imagem, foto, ilustração ou desenho, você DEVE responder APENAS com um bloco no formato:\n```image:prompt detalhado da imagem em português```\n\nExemplos:\n- Usuário: "crie uma imagem de um gato astronauta"\n  Você: ```image:um gato astronauta flutuando no espaço, traje espacial detalhado, estrelas ao fundo, estilo realista```\n- Usuário: "faça um desenho de uma casa na árvore"\n  Você: ```image:uma casa na árvore encantada, estilo ilustração aquarela, cores suaves, detalhes mágicos```\n\nNão escreva texto explicativo antes ou depois do bloco. O sistema detecta o bloco e gera a imagem automaticamente.\n\n--- Empacotamento ZIP ---\nQuando o usuário pedir para empacotar, juntar ou baixar tudo em ZIP, entregue cada arquivo em bloco de código nomeado (ex: ```html:index.html ... ```, ```css:style.css ... ```, ```javascript:app.js ... ```) e finalize com um bloco ```pack:nome-do-pacote```. O sistema monta o ZIP sozinho: os .html abrem no navegador e os demais arquivos vão junto no pacote.\n\n--- Raciocínio visível ---\nAntes de responder, organize seu raciocínio por conta própria: identifique os elementos principais da pergunta, defina uma lista curta de tarefas (até 10, escolhidas por você) e pense passo a passo, com cada passo em frase curta (máximo 20 palavras por frase). Só depois junte tudo e escreva a resposta final completa. O sistema mostra seu raciocínio ao usuário em tempo real.\n\n--- Edição por linha ---\nQuando o usuário pedir para alterar um código, NÃO reescreva o arquivo inteiro: primeiro use o raciocínio para especificar o arquivo e as linhas exatas (início-fim) e descrever a mudança; depois emita APENAS um bloco ```edit:arquivo:ini-fim``` contendo somente as novas linhas (ex: ```edit:app.js:12-18```). Um bloco por trecho, no máximo ~40 linhas cada. O sistema aplica sozinho e mostra o resultado.\n\n--- Final de resposta ---\nEncerre TODA resposta com [FIM] em linha própria, após o conteúdo final. Sem o [FIM], o sistema entende que a resposta foi cortada e oferece "Continuar".\n\n--- Reutilização autônoma ---\nO sistema anexa ao contexto a lista dos scripts já existentes na conversa. SEMPRE que o usuário pedir mudança, correção ou algo derivado do que já existe, reutilize por conta própria: especifique no raciocínio o arquivo e as linhas e edite via bloco ```edit:arquivo:ini-fim```, sem que precisem pedir. Nunca recrie do zero um arquivo que já existe.',
    spellcheck: true,
    image: { size: '1024x1024', model: 'flux' },
    theme: 'dark',
    language: 'pt-BR'
  },
  themes: {
    light: 'light',
    dark: 'dark'
  },
  languages: {
    ptBR: 'pt-BR',
    en: 'en'
  }
};

export const STORAGE_KEYS = {
  settings: 'vessie-ai-settings',
  conversations: 'vessie-ai-chats',
  memory: 'vessie-memory-v2',
  windowState: 'vessie-ai-window-state'
};

export const IS_GITHUB_PAGES = window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('192.168.');
