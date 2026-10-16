// api.js — Prompt: camada LM Studio central (extraída de chat.js+settings.js).
// Ordem: 1.api 2.models 3.chatCompletions 4.readSSE
// Ex: await api('/models'); chatCompletions(payload,{onToken,signal})
// Skill lm-studio: POST /v1/chat/completions, SSE via ReadableStream.
import { state } from './state.js?v=7';
import { CONFIG } from './config.js?v=7';

function baseUrl() {
  return (state.settings.baseUrl || CONFIG.defaultBaseUrl || '').replace(/\/$/, '');
}

function authHeaders(extra) {
  return Object.assign(
    { 'Content-Type': 'application/json', 'Authorization': 'Bearer lm-studio' },
    extra || {}
  );
}

export async function api(path, opts) {
  opts = opts || {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    return await fetch(baseUrl() + path, Object.assign({}, opts, {
      headers: authHeaders(opts.headers),
      signal: opts.signal || ctrl.signal
    }));
  } finally {
    clearTimeout(timer);
  }
}

export async function checkConnection() {
  state.connection.isChecking = true;
  try {
    const r = await api('/models');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json().catch(() => ({}));
    const models = (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean);
    state.connection.isConnected = true;
    state.connection.lastCheck = Date.now();
    if ((!state.settings.model || models.indexOf(state.settings.model) === -1) && models.length) {
      state.settings.model = models[0];
    }
    return { ok: true, models };
  } catch (e) {
    state.connection.isConnected = false;
    return { ok: false, error: (e && e.message) || String(e) };
  } finally {
    state.connection.isChecking = false;
  }
}

export async function loadModels() {
  const res = await checkConnection();
  return res.models || [];
}

// Lê SSE (skill §3): data: {...} ... data: [DONE]
// Modelos de raciocínio (ex: Qwen3) enviam a fase de pensamento em
// delta.reasoning_content — sem isso a tela só atualiza no texto final.
// O pensamento é acumulado em lastStream.thinking e repassado ao onToken
// como 3º argumento { thinking }, para exibição em tempo real.
export const lastStream = { thinking: '' };
export async function readSSE(response, onToken, signal) {
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  lastStream.thinking = '';
  for (;;) {
    if (signal && signal.aborted) { try { reader.cancel(); } catch (e) {} break; }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (t.indexOf('data:') !== 0) continue;
      const data = t.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const dl = (j.choices && j.choices[0] && j.choices[0].delta) || {};
        const rdelta = dl.reasoning_content || dl.reasoning || '';
        if (rdelta) {
          lastStream.thinking += rdelta;
          if (onToken) { try { onToken(rdelta, full, { thinking: lastStream.thinking }); } catch (e) {} }
        }
        const delta = dl.content || '';
        if (delta) { full += delta; if (onToken) { try { onToken(delta, full, { thinking: lastStream.thinking }); } catch (e) {} } }
      } catch (e) { /* chunk parcial: ignora */ }
    }
  }
  return full;
}

export async function chatCompletions(payload, hooks) {
  hooks = hooks || {};
  const r = await api('/chat/completions', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: hooks.signal
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + ' — ' + String(t).slice(0, 300));
  }
  if (payload.stream && r.body && r.body.getReader) {
    return readSSE(r, hooks.onToken, hooks.signal);
  }
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}
