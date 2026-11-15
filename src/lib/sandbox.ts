// Vessie AI — sandbox real em Web Worker (corrige D15 do Prompt Master B.5)
// Globals perigosos anulados; API Memory/Sys via bridge postMessage (RPC); timeout e limite de saída.
const MAX_OUTPUT = 64 * 1024;

const WORKER_SRC = `
self.fetch = undefined;
self.XMLHttpRequest = undefined;
self.importScripts = undefined;
self.WebSocket = undefined;
self.EventSource = undefined;
self.navigator = undefined;
self.location = undefined;
self.document = undefined;
self.window = undefined;
self.localStorage = undefined;
self.indexedDB = undefined;
self.eval = undefined;
const _nativeFunction = self.Function;
self.Function = undefined;

const rpc = (op, args) => new Promise((resolve, reject) => {
  const id = Math.random().toString(36).slice(2);
  const onMsg = (ev) => {
    const d = ev.data;
    if (d && d.rid === id) {
      self.removeEventListener('message', onMsg);
      if (d.error) reject(new Error(d.error)); else resolve(d.result);
    }
  };
  self.addEventListener('message', onMsg);
  self.postMessage({ rpcId: id, op, args });
  setTimeout(() => { self.removeEventListener('message', onMsg); reject(new Error('rpc timeout')); }, 5000);
});

const Memory = {
  putFile: (path, content) => rpc('mem.putFile', [path, content]),
  getFile: (path) => rpc('mem.getFile', [path]),
  listFiles: () => rpc('mem.listFiles', []),
  deleteFile: (path) => rpc('mem.deleteFile', [path]),
  addTrigger: (name, cfg) => rpc('mem.addTrigger', [name, cfg]),
  addScript: (name, code, opts) => rpc('mem.addScript', [name, code, opts]),
  addContent: (cat, text) => rpc('mem.addContent', [cat, text]),
  stats: () => rpc('mem.stats', []),
};
const Sys = {
  read: (p) => rpc('mem.getFile', [p]),
  write: (p, c) => rpc('mem.putFile', [p, c]),
  list: () => rpc('mem.listFiles', []),
  get: (k) => rpc('sys.get', [k]),
  set: (k, v) => rpc('sys.set', [k, v]),
  log: (m) => rpc('mem.log', [String(m)]),
};

self.onmessage = async (ev) => {
  const { code, input } = ev.data || {};
  const logs = [];
  const _log = self.console.log;
  self.console.log = (...a) => { logs.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); };
  try {
    if (typeof code !== 'string' || code.length > 100000) throw new Error('código inválido ou muito grande');
    const fn = _nativeFunction('Memory', 'Sys', 'input', '"use strict";' + code);
    const out = await fn(Memory, Sys, input || {});
    self.console.log = _log;
    let result = typeof out === 'string' ? out : (out === undefined ? '' : JSON.stringify(out));
    if (logs.length) result = [logs.join('\\n'), result].filter(Boolean).join('\\n');
    if (result && result.length > ${MAX_OUTPUT}) result = result.slice(0, ${MAX_OUTPUT}) + '…(cortado)';
    self.postMessage({ done: true, ok: true, result: result ?? '' });
  } catch (e) {
    self.console.log = _log;
    self.postMessage({ done: true, ok: false, error: String((e && e.message) || e) });
  }
};
`;

export type RpcOp =
  | "mem.putFile" | "mem.getFile" | "mem.listFiles" | "mem.deleteFile"
  | "mem.addTrigger" | "mem.addScript" | "mem.addContent" | "mem.stats" | "mem.log"
  | "sys.get" | "sys.set";

export type RpcHandler = (op: RpcOp, args: unknown[]) => Promise<unknown> | unknown;

export interface SandboxHandle {
  run: (code: string, input?: Record<string, unknown>) => Promise<string>;
  dispose: () => void;
}

/** Cria um worker sandbox (blob). run() tem timeout embutido de 10 s; RPC limitado a 5 s. */
export function createSandbox(rpcHandler: RpcHandler): SandboxHandle {
  let worker: Worker | null = null;

  const ensure = (): Worker => {
    if (worker) return worker;
    const blob = new Blob([WORKER_SRC], { type: "application/javascript" });
    worker = new Worker(URL.createObjectURL(blob));

    worker.addEventListener("message", async (ev: MessageEvent) => {
      const d = ev.data as { rpcId?: string; op?: RpcOp; args?: unknown[]; done?: boolean };
      if (d?.rpcId && d.op) {
        // requisição RPC do worker → executa no thread principal e responde
        try {
          const result = await rpcHandler(d.op, d.args ?? []);
          worker?.postMessage({ rid: d.rpcId, result });
        } catch (e) {
          worker?.postMessage({ rid: d.rpcId, error: (e as Error).message });
        }
      }
      // mensagens {done:true} são entregues ao listener da run() corrente
    });
    return worker;
  };

  return {
    run(code, input) {
      return new Promise((resolve, reject) => {
        const w = ensure();
        const to = setTimeout(() => {
          cleanup();
          w.terminate();
          worker = null;
          reject(new Error("execução excedeu 10s no sandbox"));
        }, 10_000);
        const onMsg = (ev: MessageEvent) => {
          const d = ev.data as { done?: boolean; ok?: boolean; result?: string; error?: string };
          if (d && d.done) {
            cleanup();
            if (d.ok) resolve(d.result ?? "");
            else reject(new Error(d.error ?? "erro no sandbox"));
          }
        };
        const cleanup = () => { clearTimeout(to); w.removeEventListener("message", onMsg); };
        w.addEventListener("message", onMsg);
        w.postMessage({ code, input: input ?? {} });
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
    },
  };
}
