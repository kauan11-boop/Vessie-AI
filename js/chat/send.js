// chat/send.js - Chat message sending with natural prompts and voice synthesis
import { NaturalPromptOptimizer } from '../modules/NaturalPromptOptimizer.js';
import { VoiceSynthesis } from '../modules/VoiceSynthesis.js';
import { settings } from '../../config/config.js';
import { state } from '../../state/state.js';
import { api } from '../api/connection.js';
import { buildImageCard, isImageRequest } from '../../image/image-gen.js';

let voiceEnabled = true;

async function speakResponse(text) {
  if (!voiceEnabled) return;
  try {
    await VoiceSynthesis.speak(text, { rate: 1.0, pitch: 1.0, volume: 1.0 });
  } catch (e) {
    console.warn('Voice synthesis failed:', e);
  }
}

function buildOptimizedPayload(chat, imageHint) {
  const msgs = [];
  let sys = '';

  if (settings.autoOptimizePrompt !== false) {
    const conversationHistory = chat.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role,
      content: m.content
    }));
    const lastUserMessage = chat.messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    sys = NaturalPromptOptimizer.generateSystemPrompt(
      conversationHistory,
      lastUserMessage
    );
  } else {
    sys = settings.system || '';
  }

  if (sys.trim()) msgs.push({ role: 'system', content: sys });

  chat.messages.forEach(m => { if (m.role !== 'system') msgs.push({ role: m.role, content: m.content }); });

  const temp = settings.temp;
  const p = { 
    model: settings.model, 
    messages: msgs, 
    temperature: temp, 
    top_p: settings.topP, 
    stream: settings.stream 
  };
  if (settings.maxTok !== '' && !isNaN(settings.maxTok)) p.max_tokens = parseInt(settings.maxTok);
  return p;
}

/* ---------- envio ---------- */
function toggleSidebar(force) {
  const sb = document.getElementById('sidebar'), ov = document.getElementById('overlay');
  const mobile = window.innerWidth <= 768;
  if (mobile) {
    const open = force !== undefined ? force : sb.classList.contains('hidden-sidebar');
    sb.classList.toggle('hidden-sidebar', !open);
    ov.classList.toggle('active', open);
  } else {
    if (force !== undefined) sb.classList.toggle('hidden-sidebar', !force);
    else sb.classList.toggle('hidden-sidebar');
  }
}

function autoResize() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
}

function updateSendBtn() {
  if (state.isGenerating) {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    sendBtn.title = 'Parar de gerar';
    sendBtn.classList.add('is-stop');
  } else {
    sendBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
    sendBtn.title = 'Enviar';
    sendBtn.classList.remove('is-stop');
    sendBtn.disabled = !messageInput.value.trim();
  }
}

function stopGeneration() {
  stopFlag = true;
  try { if (abortCtrl) abortCtrl.abort(); } catch (e) {}
  if (window.VoiceSynthesis) VoiceSynthesis.stop();
}

function onSendBtn() {
  if (state.isGenerating) {
    stopGeneration();
    if (!abortCtrl) { 
      state.isGenerating = false; 
      genChatId = null; 
      genContentEl = null; 
      updateSendBtn(); 
    }
  } else {
    sendMessage();
  }
}

messageInput.addEventListener('input', () => { autoResize(); updateSendBtn(); });
messageInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

window.toggleVoice = function() {
  voiceEnabled = !voiceEnabled;
  console.log('Voice synthesis:', voiceEnabled ? 'enabled' : 'disabled');
};

window.stopVoice = function() {
  if (window.VoiceSynthesis) VoiceSynthesis.stop();
};

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || state.isGenerating) return;

  state.isGenerating = true;
  updateSendBtn();

  try {
    if (!state.activeChatId) newChat();
    const chat = state.activeChat;
    if (!chat) return;

    if (!settings.model) {
      const ok = await checkConnection();
      if (!ok) return;
    }

    chat.messages.push({ role: 'user', content: text });
    if (chat.messages.length === 1) chat.title = text.substring(0, 50) + (text.length > 50 ? '…' : '');

    saveState();
    renderSidebar();
    messageInput.value = '';
    autoResize();
    updateSendBtn();
    renderChat();

    await generate(chat);
  } finally { 
    state.isGenerating = false; 
    updateSendBtn(); 
  }
}

async function regenerate() {
  const chat = state.activeChat;
  if (!chat || state.isGenerating) return;

  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === 'assistant') {
      chat.messages.splice(i, 1);
      break;
    }
  }
  saveState();
  renderChat();
  await generate(chat);
}

function buildPayload(chat, imageHint) {
  const msgs = [];
  let sys = '';

  if (settings.autoOptimizePrompt !== false) {
    const conversationHistory = chat.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role,
      content: m.content
    }));
    const lastUserMessage = chat.messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    sys = NaturalPromptOptimizer.generateSystemPrompt(
      conversationHistory,
      chat.messages.filter(m => m.role === 'user').slice(-1)[0]?.content || ''
    );
  } else {
    sys = settings.system || '';
  }

  if (sys.trim()) msgs.push({ role: 'system', content: sys });

  chat.messages.forEach(m => { if (m.role !== 'system') msgs.push({ role: m.role, content: m.content }); });

  const temp = settings.temp;
  const p = { 
    model: settings.model, 
    messages: msgs, 
    temperature: temp, 
    top_p: settings.topP, 
    stream: settings.stream 
  };
  if (settings.maxTok !== '' && !isNaN(settings.maxTok)) p.max_tokens = parseInt(settings.maxTok);
  return p;
}

/* Geração em 2º plano: continua respondendo mesmo trocando de conversa */
let genChatId = null, genFull = '', genContentEl = null, genT0 = 0;

function viewingGenChat() { return !!(genChatId && state.activeChatId === genChatId); }

function attachLiveBubble() {
  const old = document.getElementById('liveGenMsg');
  if (old) { genContentEl = old.querySelector('.msg-content'); return genContentEl; }

  const box = document.getElementById('chatArea').querySelector('.messages');
  if (!box) return null;

  const div = document.createElement('div');
  div.className = 'message';
  div.id = 'liveGenMsg';
  div.innerHTML = `<div class="avatar bot">BOT_AV</div><div class="msg-body"><div class="msg-role">Vessie-AI</div><div class="msg-content"></div></div>`;

  const contentEl = div.querySelector('.msg-content');
  if (genFull) { 
    contentEl.innerHTML = renderMarkdownSafe(genFull); 
  } else {
    contentEl.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  }

  box.appendChild(div);
  const sw = document.createElement('div');
  sw.className = 'stop-wrap';
  sw.id = 'liveGenStop';
  sw.innerHTML = `<button class="stop-btn">⏹ Parar de gerar</button>`;
  sw.querySelector('button').onclick = () => stopGeneration();
  box.appendChild(sw);
  scrollBottom();
  genContentEl = contentEl;
  return contentEl;
}

function paintGenLive(started) {
  if (!viewingGenChat()) return started;
  if (!genContentEl) genContentEl = attachLiveBubble();
  if (!genContentEl) return started;
  if (!started) { started = true; genContentEl.innerHTML = ''; }
  genContentEl.innerHTML = renderMarkdownSafe(genFull);
  scrollBottom();
  return started;
}

async function generate(chat) {
  state.isGenerating = true;
  stopFlag = false;
  updateSendBtn();
  abortCtrl = new AbortController();
  genChatId = chat.id;
  genFull = '';
  genContentEl = null;
  genT0 = performance.now();

  try {
    if (viewingGenChat()) { 
      renderChat(); 
      attachLiveBubble(); 
    }
  } catch (preErr) {
    console.error('Falha ao iniciar geração:', preErr);
    state.isGenerating = false;
    stopFlag = false;
    abortCtrl = null;
    genChatId = null;
    updateSendBtn();
    return;
  }

  renderSidebar();
  setAgentStatus('busy');

  const wantImage = isImageRequest(
    chat.messages.filter(m => m.role === 'user').slice(-1)[0]?.content || ''
  );

  let full = '';

  try {
    const r = await api('/chat/completions', { 
      method: 'POST', 
      body: JSON.stringify(buildPayload(chat, wantImage)), 
      signal: abortCtrl.signal 
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error('HTTP ' + r.status + ' — ' + t.slice(0, 300));
    }

    if (settings.stream && r.body) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let started = false;

      while (true) {
        if (stopFlag) { 
          try { reader.cancel(); } catch (e) {} 
          break; 
        }

        const { done, value } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            const j = JSON.parse(data);
            const delta = j.choices && j.choices[0] && (j.choices[0].delta && j.choices[0].delta.content || j.choices[0].text) || '';

            if (delta) { 
              full += delta;
              genFull = full;
              started = paintGenLive(started);
            }
          } catch (e) { /* chunk parcial */ }
        }
      }
    } else {
      const j = await r.json();
      full = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || JSON.stringify(j).slice(0, 2000);
      genFull = full;
      paintGenLive(false);
    }
  } catch (e) {
    if (stopFlag && full) { /* parcial ok */ }
    else if (e.name === 'AbortError' && !full) {
      if (viewingGenChat()) { 
        if (!genContentEl) genContentEl = attachLiveBubble(); 
        if (genContentEl) genContentEl.innerHTML = '<div class="error-box"><b>Geração interrompida.</b></div>';
      }
    } else if (!full) {
      const errHtml = `<div class="error-box"><b>❌ Erro ao gerar resposta:</b> ${escapeHtml(e.message)}<br><br>Verifique se o servidor do LM Studio está ligado com CORS ativado. <a style="color:var(--accent-cyan);cursor:pointer" onclick="openModal('helpModal')">Abrir guia →</a></div>`;
      if (viewingGenChat()) { 
        if (!genContentEl) genContentEl = attachLiveBubble(); 
        if (genContentEl) genContentEl.innerHTML = errHtml;
      } else {
        chat.messages.push({ role: 'assistant', content: `❌ Erro ao gerar resposta: ${e.message}` });
      }
    }
  } finally {
    state.isGenerating = false;
    stopFlag = false;
    abortCtrl = null;
    genChatId = null;
    genContentEl = null;

    try {
      const ms = Math.round(performance.now() - genT0);
      if (full) {
        chat.messages.push({ role: 'assistant', content: full, meta: { model: settings.model, ms } });

        if (settings.voiceEnabled && window.VoiceSynthesis) {
          VoiceSynthesis.speak(full).catch(e => console.warn('Voice synthesis failed:', e));
        }
      }

      saveState();
      renderSidebar();

      if (state.activeChatId === chat.id) { 
        renderChat(); 
        updateTokenBadge(); 
        messageInput.focus(); 
      } else {
        updateTokenBadge();
      }
    } catch (err) { 
      console.error('Falha ao finalizar resposta:', err); 
    }

    updateSendBtn();
    setAgentStatus(full ? 'done' : 'hide');
  }
}

export { sendMessage, regenerate, stopGeneration, onSendBtn, sendMessage as default };