// js/simulite/SimuliteCore.js — Simulite-Message · núcleo da rede neural offline.
// Ordem: 1.vocab 2.rede 3.forward/backward 4.treino supervisionado 5.REINFORCE 6.geração 7.serialize.
// Ex: const m = new SimuliteModel(); m.observe(txt); m.trainOnPair(u, a); m.generate(u);
// JS puro (zero dependências), roda 100% no navegador. O vocabulário cresce até
// MAX_VOCAB; palavras novas depois disso viram <unk>.

const PAD = 0, UNK = 1, EOS = 2;
const SPECIALS = ['<pad>', '<unk>', '<eos>'];
const EMB = 20;      // dimensão do embedding
const HID = 36;      // neurônios por camada oculta
const CTX = 8;       // janela de contexto (palavras)
const MAX_VOCAB = 1500;
const MAX_GEN = 48;  // tokens máximos gerados
const MAX_TRAIN_TOKENS = 48;

export function tokenize(text) {
  return String(text || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean);
}

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function softmaxTemp(logits, temp) {
  const t = Math.max(0.05, temp || 1);
  const out = new Float32Array(logits.length);
  let max = -Infinity, sum = 0;
  for (let i = 0; i < logits.length; i++) { if (logits[i] > max) max = logits[i]; }
  for (let i = 0; i < logits.length; i++) { out[i] = Math.exp((logits[i] - max) / t); sum += out[i]; }
  for (let i = 0; i < logits.length; i++) out[i] /= sum || 1;
  return out;
}

function initNet(V) {
  return {
    V,
    emb: Float32Array.from({ length: V * EMB }, () => randn() * 0.08),
    w1: Float32Array.from({ length: HID * EMB }, () => randn() * 0.12),
    b1: new Float32Array(HID),
    w2: Float32Array.from({ length: HID * HID }, () => randn() * 0.12),
    b2: new Float32Array(HID),
    w3: Float32Array.from({ length: V * HID }, () => randn() * 0.1),
    b3: new Float32Array(V)
  };
}

// Forward: média dos embeddings do contexto → tanh → tanh → logits → softmax.
function netForward(net, ctxIds) {
  const x = new Float32Array(EMB);
  const n = ctxIds.length || 1;
  for (let k = 0; k < ctxIds.length; k++) {
    const off = ctxIds[k] * EMB;
    for (let j = 0; j < EMB; j++) x[j] += net.emb[off + j];
  }
  for (let j = 0; j < EMB; j++) x[j] /= n;

  const h1 = new Float32Array(HID), h2 = new Float32Array(HID);
  for (let i = 0; i < HID; i++) {
    let s = net.b1[i]; const off = i * EMB;
    for (let j = 0; j < EMB; j++) s += net.w1[off + j] * x[j];
    h1[i] = Math.tanh(s);
  }
  for (let i = 0; i < HID; i++) {
    let s = net.b2[i]; const off = i * HID;
    for (let j = 0; j < HID; j++) s += net.w2[off + j] * h1[j];
    h2[i] = Math.tanh(s);
  }
  const logits = new Float32Array(net.V);
  for (let i = 0; i < net.V; i++) {
    let s = net.b3[i]; const off = i * HID;
    for (let j = 0; j < HID; j++) s += net.w3[off + j] * h2[j];
    logits[i] = s;
  }
  return { x, h1, h2, logits, probs: softmaxTemp(logits, 1), ctxIds };
}

// Backward: aplica dLoss/dLogits via descida de gradiente (backprop manual).
function netBackward(net, cache, dlogits, lr) {
  const { x, h1, h2, ctxIds } = cache;
  const V = net.V;
  for (let i = 0; i < V; i++) {
    const g = dlogits[i];
    if (!g) continue;
    const off = i * HID;
    net.b3[i] -= lr * g;
    for (let j = 0; j < HID; j++) net.w3[off + j] -= lr * g * h2[j];
  }
  const dh2 = new Float32Array(HID);
  for (let j = 0; j < HID; j++) {
    let s = 0;
    for (let i = 0; i < V; i++) s += net.w3[i * HID + j] * dlogits[i];
    dh2[j] = s * (1 - h2[j] * h2[j]);
  }
  for (let i = 0; i < HID; i++) {
    const g = dh2[i];
    if (!g) continue;
    const off = i * HID;
    net.b2[i] -= lr * g;
    for (let j = 0; j < HID; j++) net.w2[off + j] -= lr * g * h1[j];
  }
  const dh1 = new Float32Array(HID);
  for (let j = 0; j < HID; j++) {
    let s = 0;
    for (let i = 0; i < HID; i++) s += net.w2[i * HID + j] * dh2[i];
    dh1[j] = s * (1 - h1[j] * h1[j]);
  }
  for (let i = 0; i < HID; i++) {
    const g = dh1[i];
    if (!g) continue;
    const off = i * EMB;
    net.b1[i] -= lr * g;
    for (let j = 0; j < EMB; j++) net.w1[off + j] -= lr * g * x[j];
  }
  const dx = new Float32Array(EMB);
  for (let j = 0; j < EMB; j++) {
    let s = 0;
    for (let i = 0; i < HID; i++) s += net.w1[i * EMB + j] * dh1[i];
    dx[j] = s;
  }
  const n = ctxIds.length || 1;
  for (let k = 0; k < ctxIds.length; k++) {
    const off = ctxIds[k] * EMB;
    for (let j = 0; j < EMB; j++) net.emb[off + j] -= lr * dx[j] / n;
  }
}

export class SimuliteModel {
  constructor() {
    this.id2word = SPECIALS.slice();
    this.word2id = new Map(SPECIALS.map((w, i) => [w, i]));
    this.net = null;
    this.rounds = 0;
    this.lastLoss = 0;
  }

  get vocabSize() { return this.id2word.length; }

  addWord(word) {
    if (this.word2id.has(word)) return this.word2id.get(word);
    if (this.id2word.length >= MAX_VOCAB) return UNK;
    const id = this.id2word.length;
    this.id2word.push(word);
    this.word2id.set(word, id);
    return id;
  }

  observe(text) { tokenize(text).forEach(w => this.addWord(w)); }

  encode(text, learn) {
    const toks = tokenize(text).slice(-(CTX + MAX_GEN));
    const ids = toks.map(w => (learn ? this.addWord(w) : (this.word2id.has(w) ? this.word2id.get(w) : UNK)));
    return ids.length ? ids : [UNK];
  }

  decode(ids) {
    return ids.filter(id => id > EOS && this.id2word[id])
      .map(id => this.id2word[id]).join(' ');
  }

  // Garante a rede com a dimensão atual do vocabulário (cresce copiando os pesos antigos).
  ensureNet() {
    const V = this.vocabSize;
    if (!this.net) { this.net = initNet(V); return this.net; }
    if (this.net.V === V) return this.net;
    const grown = initNet(V);
    grown.emb.set(this.net.emb.subarray(0, Math.min(this.net.emb.length, grown.emb.length)));
    grown.w3.set(this.net.w3.subarray(0, Math.min(this.net.w3.length, grown.w3.length)));
    grown.b3.set(this.net.b3.subarray(0, Math.min(this.net.b3.length, grown.b3.length)));
    grown.w1.set(this.net.w1); grown.b1.set(this.net.b1);
    grown.w2.set(this.net.w2); grown.b2.set(this.net.b2);
    this.net = grown;
    return this.net;
  }

  // Sequência completa: contexto do usuário + resposta (finalizada com EOS).
  _sequence(userText, replyText) {
    this.observe(userText); this.observe(replyText);
    const net = this.ensureNet();
    const ctx = this.encode(userText, false).slice(-CTX);
    const reply = this.encode(replyText, false).slice(0, MAX_TRAIN_TOKENS).concat([EOS]);
    return { net, ctx, reply };
  }

  // 4) Treino supervisionado (teacher forcing) — aprende pares pergunta→resposta.
  trainOnPair(userText, replyText, lr) {
    lr = lr || 0.05;
    const { net, ctx, reply } = this._sequence(userText, replyText);
    let loss = 0;
    const window = ctx.slice();
    for (let i = 0; i < reply.length; i++) {
      const cache = netForward(net, window);
      const target = reply[i];
      loss += -Math.log(cache.probs[target] + 1e-9);
      const dlogits = Float32Array.from(cache.probs);
      dlogits[target] -= 1;
      netBackward(net, cache, dlogits, lr);
      window.push(target);
      if (window.length > CTX) window.shift();
    }
    this.rounds++;
    this.lastLoss = loss / reply.length;
    return this.lastLoss;
  }

  // 5) Deep RL (REINFORCE): reforça/remove a probabilidade dos tokens gerados
  // conforme a recompensa (adv > 0 aprende, adv < 0 apaga).
  rlUpdate(userText, replyText, adv, lr) {
    if (!adv) return 0;
    lr = lr || 0.03;
    const { net, ctx, reply } = this._sequence(userText, replyText);
    const window = ctx.slice();
    for (let i = 0; i < reply.length; i++) {
      const cache = netForward(net, window);
      const action = reply[i];
      const dlogits = new Float32Array(net.V);
      for (let k = 0; k < net.V; k++) dlogits[k] = -adv * (cache.probs[k] - (k === action ? 1 : 0));
      netBackward(net, cache, dlogits, lr);
      window.push(action);
      if (window.length > CTX) window.shift();
    }
    this.rounds++;
    return adv;
  }

  // 6) Geração autoregressiva com temperatura e corte top-k.
  generate(userText, opts) {
    opts = opts || {};
    const temperature = opts.temperature || 0.85;
    const topK = opts.topK || 12;
    const net = this.ensureNet();
    let window = this.encode(userText, false).slice(-CTX);
    const out = [];
    for (let step = 0; step < MAX_GEN; step++) {
      const cache = netForward(net, window);
      const probs = softmaxTemp(cache.logits, temperature);
      const idx = Array.from(probs.keys()).sort((a, b) => probs[b] - probs[a]).slice(0, topK);
      let r = Math.random(), acc = 0, pick = idx[idx.length - 1];
      for (const i of idx) { acc += probs[i]; if (r <= acc) { pick = i; break; } }
      if (pick === EOS || pick === PAD || pick === UNK) break;
      out.push(pick);
      window.push(pick);
      if (window.length > CTX) window.shift();
    }
    return this.decode(out);
  }

  // 7) Serialize/deserialize — pesos Float32 viram arrays para o JSON do Memory.
  toJSON() {
    return {
      v: 1, id2word: this.id2word, rounds: this.rounds, lastLoss: this.lastLoss,
      net: this.net ? {
        V: this.net.V,
        emb: Array.from(this.net.emb), w1: Array.from(this.net.w1), b1: Array.from(this.net.b1),
        w2: Array.from(this.net.w2), b2: Array.from(this.net.b2),
        w3: Array.from(this.net.w3), b3: Array.from(this.net.b3)
      } : null
    };
  }

  static fromJSON(obj) {
    const m = new SimuliteModel();
    if (!obj || !Array.isArray(obj.id2word)) return m;
    m.id2word = obj.id2word.slice();
    m.word2id = new Map(m.id2word.map((w, i) => [w, i]));
    m.rounds = obj.rounds || 0;
    m.lastLoss = obj.lastLoss || 0;
    if (obj.net && obj.net.V === m.id2word.length) {
      m.net = {
        V: obj.net.V,
        emb: Float32Array.from(obj.net.emb), w1: Float32Array.from(obj.net.w1), b1: Float32Array.from(obj.net.b1),
        w2: Float32Array.from(obj.net.w2), b2: Float32Array.from(obj.net.b2),
        w3: Float32Array.from(obj.net.w3), b3: Float32Array.from(obj.net.b3)
      };
    }
    return m;
  }
}





