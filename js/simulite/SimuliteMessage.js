// js/simulite/SimuliteMessage.js — sistema Simulite-Message (oculto do usuário).
// 1. Detecta AFK prolongado e treina a rede neural + Deep RL em segundo plano.
// 2. Sem LM Studio ativo, vira o modelo OFFLINE e responde no chat.
// 3. Persiste modelo + corpus no Memory Manager (simulite/*.json) + localStorage.
// Ordem: 1.state 2.load/save 3.corpus 4.AFK 5.treino 6.reply 7.RL 8.status
import { SimuliteModel, tokenize } from './SimuliteCore.js?v=1';

const LS_MODEL = 'vessie-simulite-model';
const LS_CORPUS = 'vessie-simulite-corpus';
const MEM_MODEL = 'simulite/model.json';
const MEM_CORPUS = 'simulite/corpus.json';
const OFFLINE_ID = 'OFFLINE';
const MAX_PAIRS = 400;

function tf(tokens) {
  const m = new Map();
  tokens.forEach(t => m.set(t, (m.get(t) || 0) + 1));
  return m;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  a.forEach((v, k) => { na += v * v; if (b.has(k)) dot += v * b.get(k); });
  b.forEach(v => { nb += v * v; });
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export const Simulite = {
  IDLE_MS: 4 * 60 * 1000, // 4 min sem atividade = AFK
  OFFLINE_ID,
  model: null,
  pairs: [],            // [{ u, a }] — pares pergunta→resposta aprendidos
  lastAct: Date.now(),
  _booted: false,
  _busy: false,
  _pending: null,       // última resposta OFFLINE aguardando recompensa RL
  _slice: 0,

  init() {
    if (this._booted) return;
    this._booted = true;
    this.load();
    this._watchIdle();
    console.debug('[Simulite] OFFLINE pronto · pares=' + this.pairs.length + ' · rounds=' + (this.model ? this.model.rounds : 0));
  },

  // ---------- 2. persistência (Memory Manager + espelho localStorage) ----------
  load() {
    try { this.model = SimuliteModel.fromJSON(JSON.parse(localStorage.getItem(LS_MODEL))); }
    catch (e) { this.model = new SimuliteModel(); }
    try { this.pairs = JSON.parse(localStorage.getItem(LS_CORPUS)) || []; } catch (e) { this.pairs = []; }
    try {
      if (window.Memory) {
        const mf = window.Memory.getFile(MEM_MODEL);
        if (mf && mf.content) {
          const m = SimuliteModel.fromJSON(JSON.parse(mf.content));
          if (m.rounds >= (this.model ? this.model.rounds : 0)) this.model = m;
        }
        const cf = window.Memory.getFile(MEM_CORPUS);
        if (cf && cf.content) {
          const p = JSON.parse(cf.content);
          if (Array.isArray(p) && p.length >= this.pairs.length) this.pairs = p;
        }
      }
    } catch (e) { /* segue com o que há */ }
  },

  save() {
    try { localStorage.setItem(LS_MODEL, JSON.stringify(this.model.toJSON())); } catch (e) {}
    try { localStorage.setItem(LS_CORPUS, JSON.stringify(this.pairs)); } catch (e) {}
    try {
      if (window.Memory) {
        window.Memory.putFile(MEM_MODEL, JSON.stringify(this.model.toJSON()), { author: 'simulite' });
        window.Memory.putFile(MEM_CORPUS, JSON.stringify(this.pairs), { author: 'simulite' });
      }
    } catch (e) {}
  },

  // ---------- 3. corpus aprendido das conversas ----------
  learnFromChat(conversations) {
    if (!Array.isArray(conversations)) return;
    const byKey = new Map();
    this.pairs.forEach(p => byKey.set(normalize(p.u), p));
    conversations.forEach(chat => {
      const msgs = (chat && chat.messages) || [];
      for (let i = 0; i < msgs.length - 1; i++) {
        const u = msgs[i], a = msgs[i + 1];
        if (!u || u.role !== 'user' || !a || a.role !== 'assistant') continue;
        if (!u.content || !a.content || a.image) continue;
        const key = normalize(u.content);
        if (!key) continue;
        const prev = byKey.get(key);
        // prefere a resposta real do LM Studio sobre a do modo OFFLINE
        if (!prev || !(prev.a === String(a.content).slice(0, 600) && a.meta && a.meta.model === 'OFFLINE')) {
          if (!(a.meta && a.meta.model === 'OFFLINE')) {
            byKey.set(key, { u: String(u.content).slice(0, 500), a: String(a.content).slice(0, 600) });
          } else if (!prev) {
            byKey.set(key, { u: String(u.content).slice(0, 500), a: String(a.content).slice(0, 600) });
          }
        }
      }
    });
    this.pairs = Array.from(byKey.values()).slice(-MAX_PAIRS);
    if (!this.model) this.model = new SimuliteModel();
    this.pairs.forEach(p => { this.model.observe(p.u); this.model.observe(p.a); });
  },

  // ---------- 4. detecção de AFK (oculta — sem UI) ----------
  _watchIdle() {
    const bump = () => { this.lastAct = Date.now(); };
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, bump, { passive: true }));
    setInterval(() => this._tick(), 15000);
  },

  _tick() {
    if (this._busy) return;
    if (Date.now() - this.lastAct < this.IDLE_MS) return; // ainda não está AFK
    if (!this.pairs.length) return;                       // nada a treinar ainda
    this._busy = true;
    // fatia de tempo curta — o navegador nunca é travado
    setTimeout(() => {
      try { this._trainSlice(); } catch (e) { console.debug('[Simulite] slice falhou:', e.message); }
      this._busy = false;
    }, 40);
  },

  // ---------- 5. treino oculto: supervisionado + Deep RL (REINFORCE) ----------
  _trainSlice() {
    const pair = this.pairs[Math.floor(Math.random() * this.pairs.length)];
    if (!pair) return;
    this.model.trainOnPair(pair.u, pair.a, 0.05);
    this._slice++;
    // a cada 3 fatias, um passo de REINFORCE: gera, mede sobreposição com a
    // resposta real e reforça (adv>0) ou apaga (adv<0) os tokens usados.
    if (this._slice % 3 === 0) {
      const gen = this.model.generate(pair.u, { temperature: 0.9 });
      const sim = cosine(tf(tokenize(gen)), tf(tokenize(pair.a)));
      const adv = Math.max(-1, Math.min(1, sim * 2 - 0.6));
      if (gen && Math.abs(adv) > 0.05) this.model.rlUpdate(pair.u, gen, adv, 0.02);
    }
    if (this.model.rounds % 8 === 0) this.save(); // persiste esporadicamente
  },

  // ---------- 6. resposta OFFLINE ----------
  reply(userText) {
    const q = normalize(userText);
    if (!q) return null;
    if (!this.model) this.model = new SimuliteModel();
    // 1) recuperação: pergunta parecida já vista → resposta correspondente
    const qt = tf(tokenize(userText));
    let best = null, bestSim = 0;
    this.pairs.forEach(p => {
      const s = cosine(qt, tf(tokenize(p.u)));
      if (s > bestSim) { bestSim = s; best = p; }
    });
    if (best && bestSim >= 0.55) return best.a;
    // 2) geração neural — só quando há cobertura real do vocabulário
    if (this.model.rounds >= 5) {
      const toks = tokenize(userText);
      const known = toks.filter(w => this.model.word2id.has(w)).length;
      const coverage = toks.length ? known / toks.length : 0;
      if (coverage >= 0.6) {
        const gen = this.model.generate(userText, { temperature: 0.8 });
        if (gen && gen.split(' ').length >= 3) return '🤖 *(modo OFFLINE)* ' + gen;
      }
    }
    // 3) sem informação real aprendida → não inventa; o chamador avisa o usuário
    return null;
  },

  // Treino imediato com o par recém-criado (LM Studio ativo → aprende já).
  trainBurst(n) {
    if (!this.model || !this.pairs.length) return 0;
    const pair = this.pairs[this.pairs.length - 1];
    let done = 0;
    for (let i = 0; i < (n || 3); i++) { this.model.trainOnPair(pair.u, pair.a, 0.05); done++; }
    if (this.model.rounds % 10 === 0) this.save();
    return done;
  },

  // ---------- 7. Deep RL com o usuário ----------
  noteOfflineReply(userText, replyText) {
    this._pending = { u: String(userText || '').slice(0, 500), a: String(replyText || '').slice(0, 600) };
  },
  rewardContinue() {
    if (!this._pending || !this.model) return;
    // usuário continuou conversando depois da OFFLINE = sinal positivo
    this.model.rlUpdate(this._pending.u, this._pending.a, 0.6, 0.03);
    this._pending = null;
    if (this.model.rounds % 5 === 0) this.save();
  },

  // ---------- 8. status (console/API) ----------
  status() {
    return {
      booted: this._booted,
      pairs: this.pairs.length,
      rounds: this.model ? this.model.rounds : 0,
      loss: this.model ? Number(this.model.lastLoss.toFixed(4)) : 0,
      afkMin: Math.round((Date.now() - this.lastAct) / 60000),
      idleThresholdMin: this.IDLE_MS / 60000
    };
  }
};

export default Simulite;

