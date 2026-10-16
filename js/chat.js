// chat.js — Prompt: reescrever envio/render com POST+SSE (corrige C5/A5/A6).
// Ordem: 1.elements 2.send 3.generate 4.cancel 5.render 6.shortcuts
// Ex: sendMessage() → POST /v1/chat/completions → stream por tokens.
import { state } from './state.js?v=7';
import { Storage } from './storage.js?v=7';
import { ui } from './ui.js?v=7';
import { renderMarkdownSafe, escapeHtml } from './markdown.js?v=7';
import { checkConnection, chatCompletions } from './api.js?v=7';
import { renderChatSidebar } from './conversations.js?v=7';
import { autoCorrect } from './spelling.js?v=7';
import { handleImageBlock, handleMemoryOps, executeMemoryOps } from './sandbox.js?v=7';
import { Simulite } from './simulite/SimuliteMessage.js?v=1';
import { buildImageUrl, preloadImage, extractImagePrompt, generateImage, newSeed, downloadImage, IMAGE_SIZES, IMAGE_MODELS } from './image.js?v=7';

// ===== SISTEMA DE THINK — aprimora o prompt antes de responder =====
// Quando a pergunta é complexa, enriquece com contexto, exemplos e estrutura
// para obter respostas mais ricas e completas.
function shouldThink(text) {
  const t = String(text || '').toLowerCase();
  // Sinais de complexidade: perguntas longas, pedidos de explicação detalhada,
  // código, comparações, ou palavras-chave de dificuldade
  const complexSignals = ['explique', 'detalhadamente', 'como funciona', 'por que', 'porque',
    'compare', 'diferença', 'vantagens', 'desvantagens', 'exemplo', 'exemplos',
    'código', 'script', 'programa', 'aplicativo', 'jogo', 'site', 'sistema',
    'passo a passo', 'tutorial', 'guia', 'completo', 'completa', 'tudo sobre',
    'o que é', 'para que serve', 'quais são', 'melhor', 'pior', 'vs', 'versus'];
  const hasSignal = complexSignals.some(s => t.includes(s));
  const isLong = text.length > 120;
  return hasSignal || isLong;
}

function enrichPrompt(text) {
  const t = String(text || '').trim();
  if (!shouldThink(t)) return t;

  // Extrai tópicos para buscar contexto no Memory
  const words = t.toLowerCase().replace(/[^a-záàâãéèêíïóôõöúçñ\s]/gi, ' ')
    .split(/\s+/).filter(w => w.length > 3);
  const topics = words.slice(0, 6);

  // Busca arquivos relevantes no Memory
  let contextFiles = [];
  try {
    if (window.Memory) {
      const files = window.Memory.listFiles();
      contextFiles = files
        .filter(f => topics.some(t => f.path.toLowerCase().includes(t)))
        .slice(0, 3)
        .map(f => ({ path: f.path, content: window.Memory.getFile(f.path)?.content?.slice(0, 500) }));
    }
  } catch (e) {}

  // Busca skills ativas
  let activeSkill = null;
  try {
    if (window.Memory) {
      const skills = window.Memory.listSkills();
      activeSkill = skills.find(s => s.enabled);
    }
  } catch (e) {}

  let enriched = t;

  // Adiciona contexto do Memory se houver arquivos relevantes
  if (contextFiles.length) {
    enriched += '\n\n[Contexto do Memory Manager - arquivos relacionados:]';
    contextFiles.forEach(f => {
      enriched += `\n- ${f.path}: ${f.content?.slice(0, 200)}...`;
    });
  }

  // Adiciona skill ativa como referência
  if (activeSkill) {
    enriched += `\n\n[Skill ativa: ${activeSkill.name} - ${activeSkill.description}]`;
  }

  // Adiciona instrução de estrutura rica
  enriched += '\n\n[Instrução de resposta ricamente detalhada:]';
  enriched += '\n- Comece com uma introdução clara e direta.';
  enriched += '\n- Use exemplos concretos quando possível.';
  enriched += '\n- Estruture em seções com cabeçalhos markdown (##, ###).';
  enriched += '\n- Inclua código ou passo a passo se relevante.';
  enriched += '\n- Termine com um resumo ou próximos passos.';
  enriched += '\n- Responda em português brasileiro, com markdown bem formatado.';

  return enriched;
}

// Elementos do DOM (serão referenciados após o DOM carregar)
let messageInput = null;
let sendBtn = null;
let chatArea = null;
let connectionStatus = null;
let abortController = null;

// Inicializar referências após DOM carregar
export function initElements() {
  messageInput = document.getElementById('messageInput');
  sendBtn = document.getElementById('sendBtn');
  chatArea = document.getElementById('chatArea');
  connectionStatus = document.querySelector('.connection-badge');
}

// ===== ENVIO DE MENSAGENS =====

// Modo OFFLINE (Simulite-Message): a rede neural local (rede neural + Deep RL)
// responde quando não há LM Studio ativo. A recompensa RL fica pendente e é
// aplicada quando o usuário continua a conversa.
function offlineReply(userText) {
  const chat = state.conversations.find(c => c.id === state.activeChatId);
  Simulite.learnFromChat(state.conversations);
  const reply = Simulite.reply(userText, chat);
  if (reply) {
    Storage.addMessage(state.activeChatId, { role: 'assistant', content: reply, meta: { model: 'OFFLINE' } });
    Simulite.noteOfflineReply(userText, reply);
  } else {
    // Sem informação real aprendida → o modo OFFLINE não inventa resposta.
    Storage.addMessage(state.activeChatId, {
      role: 'assistant',
      content: '🤖 **Modo OFFLINE sem informações reais.** Ainda não aprendi nada sobre isso — ligue o LM Studio (ou converse com ele ligado para eu aprender) e tente de novo.',
      meta: { model: 'OFFLINE', noInfo: true }
    });
  }
  renderChat();
}

export async function sendMessage() {
  if (!messageInput) initElements();
  if (!messageInput) return;
  // Corretor ortográfico autônomo e escondido (antes de qualquer envio).
  const text = autoCorrect(messageInput.value.trim());
  if (!text || !state.activeChatId) return;

  Storage.addMessage(state.activeChatId, { role: 'user', content: text });

  messageInput.value = '';
  autoResize(messageInput);
  renderChat();

  // Pedido de imagem ("crie uma imagem de…"): gera direto, sem LM Studio.
  if (await handleImageRequest(text)) return;

  // Memory local primeiro (pasta virtual, sem rede).
  // Ex: ```memory:put:guia/x.txt ...``` salva; ```memory:run ...``` executa JS.
  if (handleMemoryBlocks(text)) return;

  // Deep RL: se a última resposta veio do modo OFFLINE, o usuário continuar
  // conversando vira recompensa positiva na rede neural do Simulite.
  try {
    const _chat = state.conversations.find(c => c.id === state.activeChatId);
    const _last = _chat && _chat.messages[_chat.messages.length - 1];
    if (_last && _last.role === 'assistant' && _last.meta && _last.meta.model === 'OFFLINE') {
      Simulite.rewardContinue();
    }
  } catch (e) { /* ignora */ }

  // ===== Modo OFFLINE (Simulite-Message) =====
  // Modelo OFFLINE selecionado → a rede neural local assume direto.
  if (state.settings.model === 'OFFLINE') {
    offlineReply(text);
    return;
  }

  // Verificar conexão se não houver modelo selecionado
  if (!state.settings.model) {
    const ok = await checkLMStudioConnection();
    if (!ok) {
      ui.showToast('LM Studio indisponível — modo OFFLINE (Simulite) assumiu');
      offlineReply(text);
      return;
    }
  }

  // Enviar para LM Studio com streaming
  await generateResponse();
}

// ===== IMAGENS (via js/image.js — API completa) =====
// Imports already declared at top: buildImageUrl, preloadImage from './image.js?v=5'

export function isImageRequest(text) {
  return extractImagePrompt(text) !== null;
}

// Detecção inteligente: qualquer frase que mencione criar/gerar imagem,
// foto, ilustração, desenho, etc. (não apenas comandos específicos).
export function isImageIntent(text) {
  const t = String(text || '').toLowerCase();
  return /\b(imagem|foto|fotografia|ilustra[cç][aã]o|desenho|picture|image|drawing|illustration)\b/.test(t) &&
    /\b(cri[ae]|gera[rs]?|faz[ae]?|desenha[rs]?|produce|create|generate|make|draw|paint)\b/.test(t);
}

// Detecta pedido de imagem, gera (com validação) e responde no chat.
export async function handleImageRequest(text) {
  // Primeiro tenta detecção por comandos explícitos (extractImagePrompt)
  let prompt = extractImagePrompt(text);
  if (prompt !== null) {
    if (!prompt) {
      ui.showToast('Descreva a imagem. Ex: crie uma imagem de um gato astronauta');
      return true;
    }
    return await generateAndSendImage(prompt);
  }
  
  // Fallback: detecção por intenção mais flexível (isImageIntent)
  if (isImageIntent(text)) {
    // Extrai o prompt removendo palavras de comando
    prompt = extractPromptFromIntent(text);
    if (prompt) {
      return await generateAndSendImage(prompt);
    }
  }
  
  return false;
}

// Aprimora o prompt da imagem usando a IA (LM Studio ou OFFLINE)
async function enhanceImagePrompt(prompt) {
  try {
    // Se não há modelo configurado ou é OFFLINE, usa aprimoramento local simples
    if (!state.settings.model || state.settings.model === 'OFFLINE') {
      return enhancePromptLocally(prompt);
    }
    
    ui.showToast('✨ Aprimorando prompt…');
    
    const systemPrompt = 'Você é um especialista em engenharia de prompt para geração de imagens (Midjourney, DALL-E, Flux, Stable Diffusion).\nSua tarefa: receber uma descrição simples em português e transformar em um prompt rico, detalhado e otimizado em INGLÊS para gerar imagens de alta qualidade.\n\nRegras:\n- Responda APENAS com o prompt aprimorado em inglês, sem explicações\n- Adicione: estilo artístico, iluminação, composição, cores, detalhes técnicos, qualidade\n- Use termos como: "masterpiece, best quality, ultra detailed, 8k, cinematic lighting, sharp focus"\n- Mantenha o assunto principal da descrição original\n- Máximo 500 caracteres';
    
    const payload = {
      model: state.settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      top_p: 1,
      stream: false,
      max_tokens: 300
    };
    
    const enhanced = await chatCompletions(payload, {});
    if (enhanced && enhanced.trim()) {
      return enhanced.trim();
    }
    return enhancePromptLocally(prompt);
  } catch (e) {
    console.warn('Falha ao aprimorar prompt com IA:', e);
    return enhancePromptLocally(prompt);
  }
}

// Aprimoramento local simples (fallback quando não há IA)
function enhancePromptLocally(prompt) {
  const t = String(prompt || '').trim();
  // Adiciona termos de qualidade padrão
  const qualityTerms = 'masterpiece, best quality, ultra detailed, 8k, cinematic lighting, sharp focus, highly detailed';
  const styleTerms = 'professional photography, artistic composition, vibrant colors';
  
  // Se já está em inglês e tem termos de qualidade, retorna como está
  if (/masterpiece|best quality|ultra detailed|8k/i.test(t)) {
    return t;
  }
  
  // Traduz termos básicos para inglês se estiver em português
  let enhanced = t;
  const translations = {
    'gato': 'cat', 'cachorro': 'dog', 'cão': 'dog', 'pássaro': 'bird', 'carro': 'car',
    'casa': 'house', 'árvore': 'tree', 'flor': 'flower', 'montanha': 'mountain',
    'mar': 'sea', 'oceano': 'ocean', 'céu': 'sky', 'sol': 'sun', 'lua': 'moon',
    'espaço': 'space', 'astronauta': 'astronaut', 'robô': 'robot', 'futurista': 'futuristic',
    'fantasia': 'fantasy', 'mágico': 'magical', 'encantado': 'enchanted', 'bonito': 'beautiful',
    'detalhado': 'detailed', 'realista': 'realistic', 'desenho': 'drawing', 'ilustração': 'illustration',
    'pintura': 'painting', 'estilo anime': 'anime style', 'estilo cartoon': 'cartoon style',
    'retrato': 'portrait', 'paisagem': 'landscape', 'noturno': 'night', 'diurno': 'daytime'
  };
  
  // Substitui palavras-chave portuguesas por inglesas
  for (const [pt, en] of Object.entries(translations)) {
    const regex = new RegExp('\\b' + pt + '\\b', 'gi');
    enhanced = enhanced.replace(regex, en);
  }
  
  return enhanced + ', ' + qualityTerms + ', ' + styleTerms;
}

async function generateAndSendImage(prompt) {
  const chat = state.conversations.find(c => c.id === state.activeChatId);
  ui.showToast('✨ Aprimorando prompt…');
  
  // Aprimora o prompt antes de gerar
  const enhancedPrompt = await enhanceImagePrompt(prompt);
  
  ui.showToast('🖼️ Gerando imagem…');
  try {
    const img = await generateImage(enhancedPrompt);
    Storage.addMessage(state.activeChatId, {
      role: 'assistant',
      content: `🖼️ Imagem gerada para: "${prompt}"\n\n*Prompt aprimorado: ${enhancedPrompt}*`,
      image: img
    });
    if (chat && (!chat.title || chat.title === 'Nova conversa')) {
      const t = prompt.replace(/\s+/g, ' ').trim();
      Storage.renameConversation(chat.id, '🖼️ ' + t.substring(0, 36) + (t.length > 36 ? '…' : ''));
      renderChatSidebar();
    }
  } catch (e) {
    Storage.addMessage(state.activeChatId, { role: 'assistant', content: '❌ Não consegui gerar a imagem: ' + e.message });
  }
  renderChat();
  return true;
}

function extractPromptFromIntent(text) {
  // Remove palavras de comando comuns e extrai o que vem depois
  const t = String(text || '').trim();
  // Padrões: "crie uma imagem de X", "gere uma imagem de X", "faça uma imagem de X", "quero uma imagem de X", etc.
  const patterns = [
    /(?:crie|gere|faça|desenhe|produza|create|generate|make|draw|paint)\s+(?:uma?\s+)?(?:imagem|foto|fotografia|ilustra[cç][aã]o|desenho|picture|image|drawing|illustration)\s+(?:de|do|da|sobre|com)\s+(.+)$/i,
    /(?:quero|gostaria de|preciso de)\s+(?:uma?\s+)?(?:imagem|foto|fotografia|ilustra[cç][aã]o|desenho)\s+(?:de|do|da|sobre|com)\s+(.+)$/i,
    /(?:imagem|foto|fotografia|ilustra[cç][aã]o|desenho)\s+(?:de|do|da|sobre|com)\s+(.+)$/i
  ];
  
  for (const re of patterns) {
    const match = t.match(re);
    if (match && match[1]) {
      return match[1].trim().replace(/[.!?]+$/, '');
    }
  }
  
  // Se não achou padrão específico, usa o texto todo (pode ser apenas uma descrição)
  // mas apenas se for curto o suficiente para ser um prompt
  if (t.length <= 200 && /\b(imagem|foto|ilustra[cç][aã]o|desenho)\b/i.test(t)) {
    return t;
  }
  
  return null;
}

// Nova variação da mesma imagem (novo seed, atualiza no lugar).
export function regenerateImage(chatId, msgIndex) {
  try {
    const chat = state.conversations.find(c => c.id === chatId);
    const msg = chat && chat.messages[msgIndex];
    if (!msg || !msg.image) return;
    const prev = msg.image;
    const next = buildImageUrl(prev.prompt, { width: prev.width, height: prev.height, model: prev.model });
    msg.image = { ...prev, seed: next.seed, url: next.url };
    chat.lastModified = Date.now();
    Storage.saveConversations();
    renderChat();
    ui.showToast('🎲 Nova variação gerada');
  } catch (e) { console.warn('Variação falhou:', e); }
}

// Nova variação para imagens geradas via bloco image: da IA (imageBlock / imageBlocks)
export function regenerateImageFromBlock(chatId, msgIndex, blockIndex) {
  try {
    const chat = state.conversations.find(c => c.id === chatId);
    const msg = chat && chat.messages[msgIndex];
    if (!msg) return;
    const images = [msg.imageBlock, ...(msg.imageBlocks || [])].filter(Boolean);
    const img = images[blockIndex];
    if (!img) return;
    const next = buildImageUrl(img.prompt, { width: img.width, height: img.height, model: img.model });
    const updated = { ...img, seed: next.seed, url: next.url };
    if (blockIndex === 0) {
      msg.imageBlock = updated;
    } else {
      msg.imageBlocks[blockIndex - 1] = updated;
    }
    chat.lastModified = Date.now();
    Storage.saveConversations();
    renderChat();
    ui.showToast('🎲 Nova variação gerada');
  } catch (e) { console.warn('Variação falhou:', e); }
}

// Baixa a imagem (via blob; se falhar, abre em nova aba).
export async function downloadImageUrl(el, filename) {
  const url = (el && el.dataset && el.dataset.url) || (typeof el === 'string' ? el : '');
  const fname = (el && el.dataset && el.dataset.fname) || filename || 'imagem-vessie.png';
  if (!url) return;
  try {
    await downloadImage(url, fname);
    ui.showToast('⬇ Imagem baixada');
  } catch (e) {
    window.open(url, '_blank');
  }
}

export function copyImageUrl(el) {
  const url = (el && el.dataset && el.dataset.url) || (typeof el === 'string' ? el : '');
  if (!url) return;
  try {
    navigator.clipboard.writeText(url).then(() => ui.showToast('URL da imagem copiada'));
  } catch (e) { ui.showToast('Não foi possível copiar'); }
}

// Fallback quando a imagem falha ao carregar.
export function __imgErr(el) {
  try {
    const card = el && el.closest('.img-card');
    if (card && !card.querySelector('.img-err')) {
      const d = document.createElement('div');
      d.className = 'img-err';
      d.textContent = '❌ A imagem falhou ao carregar. Tente gerar uma variação.';
      card.appendChild(d);
    }
    if (el) el.style.display = 'none';
  } catch (e) {}
}

// Executa ```memory:put/run/trigger e ```mem localmente e responde no chat.
export function handleMemoryBlocks(text) {
  try {
    if (typeof window === 'undefined' || !window.Memory) return false;
    const out = window.Memory.handleAiText(String(text));
    if (!out || !out.length) return false;
    const lines = out.map(o => {
      if (o.type === 'put') return '💾 Salvo em Memory: ' + o.path;
      if (o.type === 'run') return o.error ? '❌ Console: ' + o.error : '▶ Console: ' + o.result;
      if (o.type === 'trigger') return '⚡ Trigger criado: ' + o.name;
      if (o.type === 'mem') {
        const r = o.report || {};
        return '📦 .mem aplicado: ' + (r.files || []).length + ' arquivos, ' + (r.triggers || []).length + ' triggers, ' + (r.scripts || []).length + ' scripts';
      }
      return JSON.stringify(o);
    });
    Storage.addMessage(state.activeChatId, { role: 'assistant', content: lines.join('\n') });
    renderChat();
    return true;
  } catch (e) {
    console.warn('Memory local falhou:', e);
    return false;
  }
}

// ===== GERAR RESPOSTA COM STREAMING (POST + ReadableStream) =====

async function generateResponse() {
  const chat = state.conversations.find(c => c.id === state.activeChatId);
  if (!chat || !chatArea) return;

  if (abortController) {
    try { abortController.abort(); } catch (e) {}
    abortController = null;
  }
  abortController = new AbortController();

  const payload = {
    model: state.settings.model || '',
    messages: [
      { role: 'system', content: state.settings.systemPrompt || 'Você é a Vessie-AI, uma assistente útil em português brasileiro.' },
      ...chat.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
    ],
    temperature: state.settings.temperature,
    top_p: state.settings.topP,
    stream: true
  };
  // Sistema de think: enriquece o prompt antes de enviar
  const lastUserMsg = chat.messages.filter(m => m.role === 'user').pop();
  if (lastUserMsg && shouldThink(lastUserMsg.content)) {
    const enriched = enrichPrompt(lastUserMsg.content);
    const idx = payload.messages.findIndex(m => m.role === 'user' && m.content === lastUserMsg.content);
    if (idx >= 0) payload.messages[idx].content = enriched;
  }
  if (state.settings.maxTokens !== '' && state.settings.maxTokens != null) {
    payload.max_tokens = Number(state.settings.maxTokens);
  }

  // Bolha viva da resposta
  const responseDiv = document.createElement('div');
  responseDiv.className = 'message bot';
  responseDiv.innerHTML = '<div class="avatar bot"><svg viewBox="0 0 120 120" aria-hidden="true"><use href="#vessieMascot"/></svg></div><div class="msg-body"><div class="msg-role">Vessie-AI</div><div class="msg-content"></div></div>';

  chatArea.appendChild(responseDiv);
  const contentDiv = responseDiv.querySelector('.msg-content');
  let fullResponse = '';

  try {
    fullResponse = await chatCompletions(payload, {
      signal: abortController.signal,
      onToken: (delta, full) => {
        fullResponse = full;
        contentDiv.innerHTML = renderMarkdownSafe(full);
        chatArea.scrollTop = chatArea.scrollHeight;
      }
    });
    if (!fullResponse) {
      contentDiv.innerHTML = renderMarkdownSafe('(resposta vazia do modelo)');
    }
    // Se a IA emitiu bloco image:, gera a imagem e salva como message.imageBlock
    const imgBlocks = handleImageBlock(fullResponse || '');
    if (imgBlocks.length) {
      const last = chat.messages[chat.messages.length - 1];
      if (last && last.role === 'assistant') {
        // Aprimora os prompts antes de gerar
        const enhancedBlocks = await Promise.all(imgBlocks.map(async b => {
          const enhancedPrompt = await enhanceImagePrompt(b.prompt);
          return { ...b, prompt: enhancedPrompt };
        }));
        // Gera URL para cada bloco de imagem
        const generated = await Promise.all(enhancedBlocks.map(async b => {
          const built = buildImageUrl(b.prompt);
          await preloadImage(built.url); // pré-carrega para validar
          return { ...b, ...built };
        }));
        last.imageBlock = generated[0];
        // Se houver múltiplas imagens, salva as extras em imageBlocks
        if (generated.length > 1) {
          last.imageBlocks = generated.slice(1);
        }
        chat.lastModified = Date.now();
      }
    }
    Storage.addMessage(state.activeChatId, { role: 'assistant', content: fullResponse });
    interceptMemoryFromAI(fullResponse);
    // LM Studio ativo → treina a rede neural local com a conversa nova.
    try { Simulite.learnFromChat(state.conversations); Simulite.trainBurst(3); } catch (e) {}
    await maybeAutoTitle(chat);
  } catch (error) {
    if (error && error.name === 'AbortError') {
      if (fullResponse) {
        Storage.addMessage(state.activeChatId, { role: 'assistant', content: fullResponse + '\n\n*(geração interrompida)*' });
      } else if (responseDiv && responseDiv.parentNode) {
        responseDiv.remove();
      }
    } else {
      console.error('Erro ao gerar resposta:', error);
      // Queda no meio da geração → rede neural local assume (modo OFFLINE).
      const lastUser = chat.messages.filter(m => m.role === 'user').pop();
      const fallbackText = lastUser ? lastUser.content : '';
      const fallback = fallbackText ? Simulite.reply(fallbackText, chat) : '';
      if (fallback) {
        Storage.addMessage(state.activeChatId, { role: 'assistant', content: fallback, meta: { model: 'OFFLINE' } });
        Simulite.noteOfflineReply(fallbackText, fallback);
        ui.showToast('LM Studio caiu — modo OFFLINE (Simulite) respondeu');
      } else {
        ui.showToast('Erro ao comunicar com LM Studio');
      }
      if (responseDiv && responseDiv.parentNode) responseDiv.remove();
    }
  } finally {
    abortController = null;
    renderChat();
  }
}

// A IA pode salvar/executar via blocos ```memory:* — intercepta a resposta.
// Além disso, todo bloco de código genérico (```python, ```js, ...) é salvo
// automaticamente no Memory ao ser detectado.
// Blocos image: geram imagens via Pollinations (exibidas em iframe).
// Blocos memory:* manipulam o Memory Manager (criar/editar/renomear/excluir).
function interceptMemoryFromAI(fullResponse) {
  try {
    if (typeof window === 'undefined' || !window.Memory) return;
    const out = window.Memory.handleAiText(String(fullResponse || ''));

    // Blocos image: gera imagens e marca para exibição em iframe
    const imgBlocks = handleImageBlock(String(fullResponse || ''));
    imgBlocks.forEach(b => {
      const img = buildImageUrl(b.prompt);
      out.push({ type: 'image-block', prompt: b.prompt, url: img.url, seed: img.seed, width: img.width, height: img.height });
    });

    // Blocos memory:* executa operações no Memory Manager
    const memOps = handleMemoryOps(String(fullResponse || ''));
    if (memOps.length) {
      const results = executeMemoryOps(memOps);
      results.forEach(r => out.push({ type: 'memory-op', ...r }));
    }
    if (out && out.length) {
      const lines = out.map(o => {
        if (o.type === 'put') return '💾 Memory salvou: ' + o.path;
        if (o.type === 'run') return o.error ? '❌ Memory console: ' + o.error : '▶ Memory console: ' + o.result;
        if (o.type === 'trigger') return '⚡ Trigger Memory: ' + o.name;
        if (o.type === 'skill') return '🧠 Skill criada: ' + o.name;
        if (o.type === 'plugin') return '🔌 Plugin registrado: ' + o.name;
        if (o.type === 'mcp') return '🔗 MCP registrado: ' + o.name;
        if (o.type === 'api') return o.error ? '⚠️ API "' + o.name + '": ' + o.error : '🌐 API integrada: ' + o.name;
        if (o.type === 'mem') return '📦 Bloco .mem aplicado.';
        return '';
      }).filter(Boolean);
      if (lines.length) ui.showToast(lines.join(' | ').slice(0, 160));
    }
    const saved = autoSaveCodeBlocks(String(fullResponse || ''));
    const skill = autoCreateSkill(String(fullResponse || ''));
    const apis = autoRegisterAPIs(String(fullResponse || ''));
    if (saved.length || skill || apis.length) {
      const parts = [];
      if (saved.length) parts.push(`💾 ${saved.length} script(s)`);
      if (skill) parts.push(`🧠 skill "${skill}"`);
      if (apis.length) parts.push(`🌐 ${apis.length} api(s)`);
      ui.showToast(parts.join(' + ') + ' salvo(s) no Memory');
      if (document.body.classList.contains('view-memory') && typeof window.renderMemoryManager === 'function') {
        window.renderMemoryManager();
      }
    }
  } catch (e) {
    console.warn('Memory intercept falhou:', e);
  }
}

const LANG_EXT = {
  python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh', shell: 'sh',
  sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', cs: 'cs',
  go: 'go', rust: 'rs', rs: 'rs', ruby: 'rb', rb: 'rb', php: 'php',
  yaml: 'yml', yml: 'yml', xml: 'xml', markdown: 'md', md: 'md',
  text: 'txt', plaintext: 'txt'
};

// Cria automaticamente uma skill a partir de cada resposta substancial da IA:
// o tópico vem da última mensagem do usuário e o prompt é a resposta ampliada.
// Retorna o nome da skill criada ou null. A skill nasce DESATIVADA — o usuário ativa.
export function autoCreateSkill(text) {  try {
    if (!text || text.trim().length < 200 || typeof window === 'undefined' || !window.Memory) return null;
    const chat = state.conversations.find(c => c.id === state.activeChatId);
    const msgs = (chat && chat.messages) || [];
    let topic = 'geral';
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user' && msgs[i].content) {
        topic = String(msgs[i].content).replace(/\s+/g, ' ').trim().slice(0, 40);
        break;
      }
    }
    const slug = topic.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'geral';
    const content = text.trim();
    let name = 'auto-' + slug;
    let n = 2;
    while (true) {
      let existing = null;
      try { existing = (window.Memory.__raw().skills || {})[name]; } catch (e) {}
      if (!existing) break;
      if (existing.prompt === content) return null; // já salva: não duplica
      name = 'auto-' + slug + '-' + (n++);
    }
    window.Memory.addSkill(name, {
      description: 'Auto-criada a partir de: ' + topic,
      prompt: content,
      enabled: false
    });
    return name;
  } catch (e) {
    console.warn('auto-skill falhou:', e);
    return null;
  }
}

// Registra automaticamente URLs citadas pela IA como APIs integráveis.
// Retorna os nomes criados. Deduplica por URL, máx. 5 por resposta.
export function autoRegisterAPIs(text) {
  const found = [];
  if (!text || typeof window === 'undefined' || !window.Memory) return found;
  const re = /https?:\/\/[^\s`)\]"']+/gi;
  const seen = new Set();
  let m, count = 0;
  let existing = [];
  try { existing = window.Memory.listAPIs() || []; } catch (e) {}
  const knownUrls = new Set(existing.map(a => a.url));
  while ((m = re.exec(text))) {
    if (count >= 5) break;
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (url.length > 300 || seen.has(url) || knownUrls.has(url)) continue;
    seen.add(url);
    let host = 'api';
    try { host = new URL(url).hostname.replace(/^www\./, '') || 'api'; } catch (e) {}
    const slug = host.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'api';
    let name = 'api-' + slug, n = 2;
    try {
      const raw = window.Memory.__raw().apis || {};
      while (raw[name]) name = 'api-' + slug + '-' + (n++);
      window.Memory.addAPI(name, { url, description: 'Auto-detectada em resposta da IA', enabled: true });
      found.push(name);
      count++;
    } catch (e) { /* URL inválida: ignora */ }
  }
  return found;
}

// Título da conversa definido pelo próprio modelo (após a 1ª resposta).
// Se o modelo estiver fora do ar, usa título local como fallback.
export async function maybeAutoTitle(chat) {  try {
    if (!chat || !state.settings.model) { fallbackTitle(chat); return; }
    if (chat.title && chat.title !== 'Nova conversa') return;
    const firstUser = (chat.messages || []).find(m => m.role === 'user');
    if (!firstUser) return;
    const title = await chatCompletions({
      model: state.settings.model,
      messages: [
        { role: 'system', content: 'Dê um título curtíssimo (máximo 6 palavras, sem aspas, em português) para esta conversa. Responda SOMENTE o título.' },
        { role: 'user', content: String(firstUser.content).slice(0, 500) }
      ],
      temperature: 0.3,
      stream: false
    }, {});
    const clean = String(title || '').replace(/["'«»]/g, '').trim().split('\n')[0].slice(0, 60);
    if (clean) {
      Storage.renameConversation(chat.id, clean);
    } else {
      fallbackTitle(chat);
    }
  } catch (e) {
    fallbackTitle(chat);
  }
  try { renderChatSidebar(); } catch (e) {}
}

function fallbackTitle(chat) {
  try {
    if (!chat || (chat.title && chat.title !== 'Nova conversa')) return;
    const firstUser = (chat.messages || []).find(m => m.role === 'user');
    if (!firstUser) return;
    const t = String(firstUser.content).replace(/\s+/g, ' ').trim();
    if (t) Storage.renameConversation(chat.id, t.substring(0, 40) + (t.length > 40 ? '…' : ''));
  } catch (e) {}
}
// Salva automaticamente todo bloco ```linguagem detectado na resposta da IA.
// Convenção ```linguagem:nome-do-arquivo.ext usa o nome dado; senão gera em auto/.
// Blocos memory:*/mem são ignorados aqui (já tratados pelo handleAiText).
export function autoSaveCodeBlocks(text) {
  const saved = [];
  if (!text || typeof window === 'undefined' || !window.Memory) return saved;
  const re = /```([^\s`\n]*)\n?([\s\S]*?)```/g;
  let m, idx = 0;
  const stamp = Date.now();
  while ((m = re.exec(text))) {
    const info = (m[1] || '').trim();
    const code = (m[2] || '').replace(/\n$/, '');
    if (info.startsWith('memory:') || info === 'mem') continue;
    if (code.trim().length < 20) continue;

    let path;
    const named = info.match(/^([a-zA-Z0-9_+-]+):(.+)$/);
    if (named && !named[2].includes(' ')) {
      path = named[2].trim();
    } else {
      const lang = info.toLowerCase() || 'txt';
      const ext = LANG_EXT[lang] || 'txt';
      path = `auto/${stamp}-${idx}.${ext}`;
    }

    try {
      // Evita duplicar conteúdo idêntico já salvo
      const existing = window.Memory.getFile(path);
      if (existing && existing.content === code) continue;
      window.Memory.putFile(path, code, { author: 'IA-auto' });
      saved.push(path);
      idx++;
    } catch (e) { /* caminho inválido: ignora o bloco */ }
  }
  return saved;
}

// ===== CANCELAR Geração =====

export function cancelGeneration() {
  if (abortController) {
    try { abortController.abort(); } catch (e) {}
    abortController = null;
  }
  ui.showToast('Geração cancelada');
}

// ===== VERIFICAR CONEXÃO =====

export async function checkLMStudioConnection() {
  const res = await checkConnection();
  ui.updateConnectionBadge(!!res.ok);
  if (!res.ok) {
    ui.showToast('Não foi possível conectar ao LM Studio. Verifique se o servidor está ligado.');
    return false;
  }
  if (res.models && res.models.length && !state.settings.model) {
    state.settings.model = res.models[0];
  }
  return true;
}

// ===== RENDERIZAÇÃO =====

export function renderChat() {
  if (!chatArea) initElements();
  if (!chatArea) return;
  const chat = state.conversations.find(c => c.id === state.activeChatId);
  if (!chat) {
    chatArea.innerHTML = '<div class="chat-empty">Nenhuma conversa selecionada.</div>';
    return;
  }
  if (!chat.messages.length) {
    renderWelcome(chat);
    return;
  }
  
  chatArea.innerHTML = '';
  
  chat.messages.forEach((msg, idx) => {
    const isUser = msg.role === 'user';
    const msgClass = isUser ? 'message user-msg' : 'message';
    const avatarClass = isUser ? 'user' : 'bot';
    const roleText = isUser ? 'Você' : 'Vessie-AI';
    
    let contentHtml = '';
    if (msg.content) {
      contentHtml = `<div class="msg-content">${renderMarkdownSafe(msg.content)}</div>`;
    }
    if (msg.image && msg.image.url) {
      const img = msg.image;
      const safePrompt = escapeHtml(img.prompt || '');
      const safeUrl = escapeHtml(img.url);
      const fname = 'vessie-' + (img.seed || Date.now()) + '.png';
      contentHtml += `<div class="img-card">
        <div class="img-body"><img src="${safeUrl}" alt="${safePrompt}" loading="lazy" onerror="__imgErr(this)"></div>
        <div class="img-meta">${img.width}×${img.height} · ${escapeHtml(img.model || 'flux')} · seed ${img.seed}</div>
        <div class="img-foot">
          <button class="mini-btn" onclick="regenerateImage('${chat.id}', ${idx})" title="Gerar variação">🎲 Variação</button>
          <button class="mini-btn" data-url="${safeUrl}" data-fname="${fname}" onclick="downloadImageUrl(this)" title="Baixar imagem">⬇ Baixar</button>
          <button class="mini-btn" data-url="${safeUrl}" onclick="copyImageUrl(this)" title="Copiar URL">🔗 URL</button>
        </div>
      </div>`;
    } else if (msg.imageBlock && msg.imageBlock.url) {
      // Imagem(ns) gerada(s) via bloco image: da IA
      const images = [msg.imageBlock, ...(msg.imageBlocks || [])].filter(Boolean);
      images.forEach((img, i) => {
        const safeUrl = escapeHtml(img.url);
        const safePrompt = escapeHtml(img.prompt || '');
        const fname = 'vessie-' + (img.seed || Date.now()) + '.png';
        contentHtml += `<div class="img-card">
          <div class="img-body"><img src="${safeUrl}" alt="${safePrompt}" loading="lazy" onerror="__imgErr(this)"></div>
          <div class="img-meta">${img.width}×${img.height} · ${escapeHtml(img.model || 'flux')} · seed ${img.seed}</div>
          <div class="img-foot">
            <button class="mini-btn" onclick="regenerateImageFromBlock('${chat.id}', ${idx}, ${i})" title="Gerar variação">🎲 Variação</button>
            <button class="mini-btn" data-url="${safeUrl}" data-fname="${fname}" onclick="downloadImageUrl(this)" title="Baixar imagem">⬇ Baixar</button>
            <button class="mini-btn" data-url="${safeUrl}" onclick="copyImageUrl(this)" title="Copiar URL">🔗 URL</button>
          </div>
        </div>`;
      });
    }
    
    const actionsHtml = isUser
      ? `<div class="msg-actions">
          <button class="mini-btn" onclick="editMessage('${chat.id}', ${idx})" title="Editar mensagem">✏️ Editar</button>
          <button class="mini-btn" onclick="resendMessage('${chat.id}', ${idx})" title="Reenviar a partir daqui">↩️ Reenviar</button>
          <button class="mini-btn" onclick="deleteMessage('${chat.id}', ${idx})" title="Excluir mensagem">🗑️ Excluir</button>
        </div>`
      : `<div class="msg-actions">
          <button class="mini-btn" onclick="regenerateFrom('${chat.id}', ${idx})" title="Recriar resposta">🔄 Recriar</button>
          <button class="mini-btn" onclick="copyMessage('${chat.id}', ${idx})" title="Copiar mensagem">📋 Copiar</button>
        </div>`;

    const metaHtml = msg.role ? `<div class="msg-meta">${msg.role}</div>` : '';

    const div = document.createElement('div');
    div.className = msgClass;
    div.dataset.chat = chat.id;
    div.dataset.idx = idx;
    div.innerHTML = `
      <div class="avatar ${avatarClass}">${isUser ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7v1H4v-1z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 120 120" aria-hidden="true"><use href="#vessieMascot"/></svg>'}</div>
      <div class="msg-body">
        <div class="msg-role">${roleText}</div>
        ${contentHtml}
        ${actionsHtml}
      </div>
      ${metaHtml}
    `;
    
    chatArea.appendChild(div);
  });
  
  // Rolagem para baixo
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Boas-vindas + menu completo da conversa nova (renderizado, não salvo).
function renderWelcome(chat) {
  chatArea.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'welcome';
  div.innerHTML = `
    <div class="welcome-mascot"><svg viewBox="0 0 120 120" aria-hidden="true"><use href="#vessieMascot"/></svg></div>
    <h2>Olá! Sou a Vessie-AI 👋</h2>
    <p>Sua assistente local e privada: usa o <b>LM Studio</b> quando ele está ligado e, quando não, a rede neural <b>OFFLINE (Simulite)</b> segue a conversa e continua aprendendo. Escolha por onde começar:</p>
    <div class="welcome-chips"></div>
    <div class="welcome-links">
      <button class="mini-btn" data-welcome="guide">🚀 Guia de conexão</button>
      <button class="mini-btn" data-welcome="memory">🧠 Memory Manager</button>
      <button class="mini-btn" data-welcome="settings">⚙️ Configurações</button>
    </div>
  `;
  const chipsBox = div.querySelector('.welcome-chips');
  [
    'O que você pode fazer?',
    'Crie um script Python de exemplo',
    'Explique como funciona o Memory Manager',
    'Me ajude a escrever um texto'
  ].forEach(text => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = text;
    b.onclick = () => askSuggestion(text);
    chipsBox.appendChild(b);
  });
  div.querySelector('[data-welcome="guide"]').onclick = () => openModal('helpModal');
  div.querySelector('[data-welcome="memory"]').onclick = () => { location.hash = '#/memory'; };
  div.querySelector('[data-welcome="settings"]').onclick = () => { if (window.Settings) window.Settings.load(); };
  chatArea.appendChild(div);
}

// Envia uma sugestão do menu de boas-vindas.
export function askSuggestion(text) {
  if (!messageInput) initElements();
  if (!messageInput || !state.activeChatId) return;
  messageInput.value = text;
  autoResize(messageInput);
  sendMessage();
}

// Garante que as ações atuem na conversa ativa.
function ensureChatActive(chatId) {
  if (state.activeChatId !== chatId) {
    state.activeChatId = chatId;
    Storage.setActiveChat(chatId);
    try { window.renderChatSidebar && window.renderChatSidebar(); } catch (e) {}
  }
}

// ===== AÇÕES NAS MENSAGENS DO USUÁRIO =====

// Entra em modo de edição inline da mensagem.
export function editMessage(chatId, idx) {
  const chat = state.conversations.find(c => c.id === chatId);
  const msg = chat && chat.messages[idx];
  if (!msg || msg.role !== 'user') return;
  const box = chatArea && chatArea.querySelector(`div.message[data-chat="${chatId}"][data-idx="${idx}"] .msg-content`);
  if (!box) return;
  box.innerHTML = '';
  const ta = document.createElement('textarea');
  ta.className = 'msg-edit';
  ta.value = msg.content;
  const bar = document.createElement('div');
  bar.className = 'msg-edit-bar';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'mini-btn';
  saveBtn.textContent = 'Salvar e reenviar';
  saveBtn.onclick = () => saveEdit(chatId, idx);
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'mini-btn';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.onclick = () => renderChat();
  bar.appendChild(saveBtn);
  bar.appendChild(cancelBtn);
  box.appendChild(ta);
  box.appendChild(bar);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

// Salva a edição: atualiza, apaga o que veio depois e gera de novo.
export function saveEdit(chatId, idx) {
  const chat = state.conversations.find(c => c.id === chatId);
  if (!chat) return;
  const box = chatArea && chatArea.querySelector(`div.message[data-chat="${chatId}"][data-idx="${idx}"] .msg-edit`);
  if (!box) return;
  const text = box.value.trim();
  if (!text) return;
  chat.messages[idx].content = text;
  chat.messages = chat.messages.slice(0, idx + 1);
  chat.lastModified = Date.now();
  Storage.saveConversations();
  ensureChatActive(chatId);
  renderChat();
  generateResponse();
}

// Exclui só a mensagem.
export function deleteMessage(chatId, idx) {
  const chat = state.conversations.find(c => c.id === chatId);
  if (!chat || !chat.messages[idx]) return;
  chat.messages.splice(idx, 1);
  chat.lastModified = Date.now();
  Storage.saveConversations();
  ensureChatActive(chatId);
  renderChat();
  ui.showToast('Mensagem excluída');
}

// Reenvia a partir da mensagem (apaga o que veio depois e gera de novo).
export function resendMessage(chatId, idx) {
  const chat = state.conversations.find(c => c.id === chatId);
  if (!chat || !chat.messages[idx]) return;
  chat.messages = chat.messages.slice(0, idx + 1);
  chat.lastModified = Date.now();
  Storage.saveConversations();
  ensureChatActive(chatId);
  renderChat();
  generateResponse();
}

// ===== AÇÕES NAS MENSAGENS DA IA =====

// Recria a resposta (apaga ela e o que veio depois, gera de novo).
export function regenerateFrom(chatId, idx) {
  const chat = state.conversations.find(c => c.id === chatId);
  if (!chat || !chat.messages[idx]) return;
  chat.messages = chat.messages.slice(0, idx);
  chat.lastModified = Date.now();
  Storage.saveConversations();
  ensureChatActive(chatId);
  renderChat();
  generateResponse();
}

// Copia o texto bruto da mensagem.
export function copyMessage(chatId, idx) {
  const chat = state.conversations.find(c => c.id === chatId);
  const msg = chat && chat.messages[idx];
  if (!msg || !msg.content) return;
  try {
    navigator.clipboard.writeText(msg.content).then(() => ui.showToast('Mensagem copiada'));
  } catch (e) { ui.showToast('Não foi possível copiar'); }
}

function sanitizeMarkdown(md) {
  // Sanitização básica - remover scripts e estilos perigosos
  if (!md) return '';
  
  // Evitar execução de HTML/JS
  const div = document.createElement('div');
  div.textContent = md;
  return div.innerHTML;
}

// Helper: auto-resize textarea
export function autoResize(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

// ===== ATALHOS DE TECLADO =====

export function setupKeyboardShortcuts() {
  const input = document.getElementById('messageInput');
  if (input && !input.dataset.shortcutBound) {
    input.dataset.shortcutBound = '1';
    input.addEventListener('input', () => autoResize(input));
    // Enter para enviar, Shift+Enter para nova linha
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    // Escape para cancelar geração ativa
    if (e.key === 'Escape') {
      cancelGeneration();
    }
  });
}