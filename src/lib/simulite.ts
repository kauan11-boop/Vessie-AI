// Vessie AI — Simulite: MLP offline em JS puro (B.3.7) — modo OFFLINE honesto
// EMB 20 · HID 36 · CTX 8 · vocab 1500 · backprop manual Float32Array · REINFORCE
// Recusa inventar: sem dados → null. Persiste em vessie-simulite-model/-corpus.
import { datasetAnswer } from "./datasets";

const PAD = 0, UNK = 1, EOS = 2;
const EMB = 20, HID = 36, CTX = 8, MAX_VOCAB = 1500, MAX_GEN = 48;
const IDLE_MS = 4 * 60 * 1000;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

interface Net {
  w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: Float32Array;
}

function initNet(hidden: number): Net {
  const scale = 0.3;
  return {
    w1: new Float32Array(EMB * hidden).map(() => (Math.random() * 2 - 1) * scale),
    b1: new Float32Array(hidden),
    w2: new Float32Array(hidden * (MAX_VOCAB)).map(() => (Math.random() * 2 - 1) * scale),
    b2: new Float32Array(MAX_VOCAB),
  };
}

export class SimuliteModel {
  vocab: string[] = ["<pad>", "<unk>", "<eos>"];
  vocabIdx: Record<string, number> = { "<pad>": PAD, "<unk>": UNK, "<eos>": EOS };
  net: Net = initNet(HID);
  rounds = 0;

  private word(w: string): number {
    if (!(w in this.vocabIdx)) {
      if (this.vocab.length >= MAX_VOCAB) return UNK;
      const id = this.vocab.length;
      this.vocab.push(w);
      this.vocabIdx[w] = id;
    }
    return this.vocabIdx[w];
  }
  encode(tokens: string[]): number[] {
    return tokens.map(t => this.word(t) ?? UNK);
  }
  decode(id: number): string {
    return this.vocab[id] ?? "<unk>";
  }
  vocabCoverage(): number {
    return this.vocab.length / MAX_VOCAB;
  }

  // ---------- rede ----------
  private forward(ctx: number[]): { h: Float32Array; logits: Float32Array } {
    const hid = HID, V = MAX_VOCAB;
    const emb = new Float32Array(EMB);
    for (let c = 0; c < CTX; c++) {
      const tok = ctx[c] ?? PAD;
      const base = ((tok % EMB) * 1);
      emb[base % EMB] += 1 / (c + 1);
    }
    const h = new Float32Array(hid);
    for (let i = 0; i < hid; i++) {
      let s = this.net.b1[i];
      for (let e = 0; e < EMB; e++) s += emb[e] * this.net.w1[e * hid + i];
      h[i] = Math.tanh(s);
    }
    const logits = new Float32Array(V);
    for (let v = 0; v < V; v++) {
      let s = this.net.b2[v];
      for (let i = 0; i < hid; i++) s += h[i] * this.net.w2[i * V + v];
      logits[v] = s;
    }
    return { h, logits };
  }

  private softmax(logits: Float32Array, temp = 0.85): Float32Array {
    const out = new Float32Array(logits.length);
    let max = -Infinity;
    for (const l of logits) if (l > max) max = l;
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      out[i] = Math.exp((logits[i] - max) / temp);
      sum += out[i];
    }
    for (let i = 0; i < out.length; i++) out[i] /= sum || 1;
    return out;
  }

  /** Treino supervisionado com teacher forcing + cross-entropy. Retorna loss. */
  trainOnPair(user: string, answer: string, lr = 0.05): number {
    const u = this.encode(tokenize(user)).slice(-CTX);
    const a = this.encode(tokenize(answer)).slice(0, MAX_GEN);
    if (a.length === 0) return 0;
    let totalLoss = 0;
    for (let step = 0; step < a.length; step++) {
      const ctx = u;
      const target = a[step];
      const { h, logits } = this.forward(ctx);
      const probs = this.softmax(logits, 1);
      const loss = -Math.log(Math.max(probs[target], 1e-9));
      totalLoss += loss;
      // backprop manual
      const V = MAX_VOCAB;
      const dLogits = new Float32Array(V);
      for (let v = 0; v < V; v++) dLogits[v] = probs[v] - (v === target ? 1 : 0);
      const dh = new Float32Array(HID);
      for (let i = 0; i < HID; i++) {
        let acc = 0;
        for (let v = 0; v < V; v++) {
          acc += dLogits[v] * this.net.w2[i * V + v];
          this.net.w2[i * V + v] -= lr * dLogits[v] * h[i];
        }
        dh[i] = acc * (1 - h[i] * h[i]); // tanh'
      }
      const emb = new Float32Array(EMB);
      for (let c = 0; c < CTX; c++) {
        const tok = ctx[c] ?? PAD;
        emb[tok % EMB] += 1 / (c + 1);
      }
      for (let e = 0; e < EMB; e++) {
        for (let i = 0; i < HID; i++) this.net.w1[e * HID + i] -= lr * dh[i] * emb[e];
      }
      for (let i = 0; i < HID; i++) this.net.b1[i] -= lr * dh[i];
      for (let v = 0; v < V; v++) this.net.b2[v] -= lr * dLogits[v];
    }
    this.rounds++;
    return totalLoss / a.length;
  }

  /** REINFORCE simples: adv > 0 reforça tokens, adv < 0 apaga. */
  rlUpdate(user: string, reply: string, adv: number, lr = 0.02): void {
    if (adv === 0) return;
    const u = this.encode(tokenize(user)).slice(-CTX);
    const r = this.encode(tokenize(reply)).slice(0, MAX_GEN);
    for (const target of r) {
      const { h, logits } = this.forward(u);
      const probs = this.softmax(logits, 1);
      const V = MAX_VOCAB;
      for (let i = 0; i < HID; i++) {
        for (let v = 0; v < V; v++) {
          const grad = adv * (1 - probs[v]) * h[i];
          this.net.w2[i * V + v] += lr * grad;
        }
      }
    }
    void u;
  }

  /** Geração autoregressiva com temperature/topK e corte EOS/PAD/UNK. */
  generate(user: string, opts: { temperature?: number; topK?: number } = {}): string {
    const temp = opts.temperature ?? 0.85;
    const topK = opts.topK ?? 12;
    const u = this.encode(tokenize(user)).slice(-CTX);
    const out: string[] = [];
    for (let step = 0; step < MAX_GEN; step++) {
      const { logits } = this.forward(u);
      const idxs = Array.from(logits.keys());
      idxs.sort((a, b) => logits[b] - logits[a]);
      const top = idxs.slice(0, topK);
      const probs = this.softmax(
        Float32Array.from(top.map(i => logits[i])), temp
      );
      let r = Math.random(), pick = top[0];
      for (let i = 0; i < top.length; i++) { r -= probs[i]; if (r <= 0) { pick = top[i]; break; } }
      if (pick === EOS || pick === PAD || pick === UNK) break;
      const w = this.decode(pick);
      if (out.includes(w) && out.length > 3) break;
      out.push(w);
      u.push(pick);
      if (u.length > CTX) u.shift();
    }
    return out.join(" ");
  }

  toJSON(): string {
    return JSON.stringify({
      v: 1, vocab: this.vocab, rounds: this.rounds,
      net: {
        w1: Array.from(this.net.w1), b1: Array.from(this.net.b1),
        w2: Array.from(this.net.w2), b2: Array.from(this.net.b2),
      },
    });
  }

  fromJSON(json: string): boolean {
    try {
      const d = JSON.parse(json) as {
        vocab: string[]; rounds: number;
        net: { w1: number[]; b1: number[]; w2: number[]; b2: number[] };
      };
      this.vocab = d.vocab ?? this.vocab;
      this.vocabIdx = {};
      this.vocab.forEach((w, i) => { this.vocabIdx[w] = i; });
      this.rounds = d.rounds ?? 0;
      this.net = {
        w1: Float32Array.from(d.net.w1), b1: Float32Array.from(d.net.b1),
        w2: Float32Array.from(d.net.w2), b2: Float32Array.from(d.net.b2),
      };
      return true;
    } catch {
      return false;
    }
  }
}

// ---------- controlador ----------
export interface CorpusPair { u: string; a: string; offline?: boolean }

const MODEL_KEY = "vessie-simulite-model";
const CORPUS_KEY = "vessie-simulite-corpus";

class SimuliteController {
  model = new SimuliteModel();
  corpus: CorpusPair[] = [];
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();
  private offlineReplies = 0;

  init(): void {
    if (typeof window === "undefined") return;
    const m = localStorage.getItem(MODEL_KEY);
    if (m) this.model.fromJSON(m);
    try {
      this.corpus = JSON.parse(localStorage.getItem(CORPUS_KEY) ?? "[]") as CorpusPair[];
    } catch { this.corpus = []; }
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = setInterval(() => this.tick(), 15000);
  }

  persist(): void {
    try {
      localStorage.setItem(MODEL_KEY, this.model.toJSON());
      localStorage.setItem(CORPUS_KEY, JSON.stringify(this.corpus.slice(-400)));
    } catch { /* quota */ }
  }

  touch(): void { this.lastActivity = Date.now(); }

  /** Extrai pares user→assistant (máx 400; respostas reais priorizadas). */
  learnFromChat(conversations: Array<{ messages: Array<{ role: string; content: string; meta?: { model?: string } }> }>): number {
    const pairs: CorpusPair[] = [];
    for (const conv of conversations) {
      const msgs = conv.messages ?? [];
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].role === "user" && msgs[i + 1].role === "assistant") {
          const u = msgs[i].content.slice(0, 500);
          const a = msgs[i + 1].content.slice(0, 600);
          if (u && a) pairs.push({ u, a, offline: msgs[i + 1].meta?.model === "OFFLINE" });
        }
      }
    }
    const real = pairs.filter(p => !p.offline);
    const off = pairs.filter(p => p.offline);
    const merged = [...real, ...off].slice(0, 400);
    const before = this.corpus.length;
    this.corpus = merged;
    this.persist();
    return Math.max(0, merged.length - before);
  }

  private tick(): void {
    if (Date.now() - this.lastActivity < IDLE_MS) return;
    if (this.corpus.length === 0) return;
    const pair = this.corpus[Math.floor(Math.random() * this.corpus.length)];
    try { this.model.trainOnPair(pair.u, pair.a, 0.03); } catch { /* noop */ }
  }

  /** Treino imediato pós-resposta real. */
  trainBurst(n = 3): void {
    for (let i = 0; i < n && this.corpus.length > 0; i++) {
      const pair = this.corpus[Math.floor(Math.random() * this.corpus.length)];
      try { this.model.trainOnPair(pair.u, pair.a, 0.05); } catch { /* noop */ }
    }
    this.persist();
  }

  private cosineRecover(user: string): CorpusPair | null {
    const uT = tokenize(user);
    if (uT.length === 0) return null;
    const uSet = new Set(uT);
    let best: CorpusPair | null = null;
    let bestSim = 0;
    for (const p of this.corpus) {
      if (p.offline) continue;
      const aT = tokenize(p.u);
      if (aT.length === 0) continue;
      const aSet = new Set(aT);
      let inter = 0;
      for (const w of uSet) if (aSet.has(w)) inter++;
      const sim = inter / (uSet.size + aSet.size - inter);
      if (sim > bestSim) { bestSim = sim; best = p; }
    }
    return bestSim >= 0.55 && best ? best : null;
  }

  /** 4 estágios: recuperação do corpus → datasets locais → neural → null (não inventa). */
  reply(userText: string): string | null {
    this.touch();
    const rec = this.cosineRecover(userText);
    if (rec) return rec.a;
    // datasets embutidos (conhecimento estruturado, sem GGUF/quantização — roda em mobile)
    const ds = datasetAnswer(userText);
    if (ds) return `🤖 *(Vessie Local)* ${ds}`;
    if (this.model.rounds >= 5 && this.model.vocabCoverage() >= 0.6) {
      const gen = this.model.generate(userText);
      if (gen.split(" ").length >= 3) {
        this.offlineReplies++;
        return `🤖 *(modo OFFLINE)* ${gen}`;
      }
    }
    return null;
  }

  noteOfflineReply(): void { this.offlineReplies++; }
  rewardContinue(): void {
    const last = this.corpus[this.corpus.length - 1];
    if (last) try { this.model.rlUpdate(last.u, last.a, 0.6); } catch { /* noop */ }
  }

  status(): { vocab: number; rounds: number; pairs: number; coverage: number } {
    return {
      vocab: this.model.vocab.length,
      rounds: this.model.rounds,
      pairs: this.corpus.length,
      coverage: Math.round(this.model.vocabCoverage() * 100),
    };
  }
}

export const Simulite = new SimuliteController();
