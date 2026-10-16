// sandbox.js — Sandbox JS para scripts da IA (VessieScript + blocos).
// A IA executa comandos com Sys (arquivos/KV/log) e js (execução JS).
// Seguro: sem fetch/XHR/document.write/location. Tudo local.
import { state } from './state.js?v=7';

const BLOCKED = ['fetch', 'XMLHttpRequest', 'document.write', 'location', 'eval', 'Function'];

function makeSys() {
  const M = window.Memory;
  return {
    read: p => { const f = M.getFile(p); return f ? f.content : null; },
    write: (p, c) => { M.putFile(p, String(c == null ? '' : c), { author: 'IA-sandbox' }); return p; },
    list: prefix => M.listFiles().map(f => f.path).filter(p => !prefix || p.indexOf(prefix) === 0),
    del: p => { M.deleteFile(p); return true; },
    get: k => { try { return localStorage.getItem('vessie-sys:' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('vessie-sys:' + String(k), String(v)); } catch (e) {} return true; },
    log: m => { console.log('[Sys] ' + m); return true; }
  };
}

// Executa código JS seguro. Retorna o resultado da última expressão.
export function runSandbox(code, input) {
  code = String(code || '');
  for (const b of BLOCKED) {
    if (code.includes(b)) throw new Error('Bloqueado: ' + b);
  }
  const fn = new Function('Memory', 'Sys', 'input', '"use strict";\n' + code);
  return fn(window.Memory, makeSys(), input || {});
}

// Executa um bloco VessieScript com return automático da última linha.
export function runVessieBlock(code) {
  const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
  if (!lines.length) return null;
  const last = lines[lines.length - 1];
  const wrapped = lines.slice(0, -1).join('\n') + '\nreturn (' + last.replace(/;\s*$/, '') + ');';
  return runSandbox(wrapped, {});
}

// ===== Blocos especiais interceptados nas respostas da IA =====

// ```image:prompt``` — a IA pede uma imagem; gera via Pollinations e exibe em iframe.
export function handleImageBlock(text) {
  const blocks = [];
  const re = /```image:([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    blocks.push({ type: 'image', prompt: m[1].trim() });
  }
  return blocks;
}

// ```memory:op:args``` — a IA manipula o Memory Manager (criar/editar/renomear/excluir).
export function handleMemoryOps(text) {
  const ops = [];
  const re = /```memory:(create|edit|rename|delete|write|read):([^`\n]*)(?:\n([\s\S]*?))?```/g;
  let m;
  while ((m = re.exec(text))) {
    ops.push({ op: m[1], path: (m[2] || '').trim(), content: m[3] ? m[3].replace(/\n$/, '') : null });
  }
  return ops;
}

// Executa operações de Memory retornando relatório.
export function executeMemoryOps(ops) {
  const out = [];
  for (const o of ops) {
    try {
      const M = window.Memory;
      if (o.op === 'create' || o.op === 'write') {
        if (!o.path || !o.content) throw new Error('create/write precisam de caminho e conteúdo');
        M.putFile(o.path, o.content, { author: 'IA' });
        out.push({ op: o.op, path: o.path, ok: true });
      } else if (o.op === 'edit') {
        const f = M.getFile(o.path);
        if (!f) throw new Error('arquivo não existe: ' + o.path);
        M.putFile(o.path, o.content != null ? o.content : f.content, { author: 'IA' });
        out.push({ op: 'edit', path: o.path, ok: true });
      } else if (o.op === 'rename') {
        // rename:caminho-antigo|caminho-novo
        const parts = o.path.split('|');
        if (parts.length !== 2) throw new Error('rename precisa de antigo|novo');
        const f = M.getFile(parts[0].trim());
        if (!f) throw new Error('arquivo não existe: ' + parts[0]);
        M.putFile(parts[1].trim(), f.content, { author: 'IA' });
        M.deleteFile(parts[0].trim());
        out.push({ op: 'rename', from: parts[0], to: parts[1], ok: true });
      } else if (o.op === 'delete') {
        M.deleteFile(o.path);
        out.push({ op: 'delete', path: o.path, ok: true });
      } else if (o.op === 'read') {
        const f = M.getFile(o.path);
        out.push({ op: 'read', path: o.path, found: !!f, content: f ? f.content : null });
      } else {
        throw new Error('operação desconhecida: ' + o.op);
      }
    } catch (e) {
      out.push({ op: o.op, path: o.path, ok: false, error: e.message });
    }
  }
  return out;
}

// Expõe globalmente para uso nos blocos inline do HTML.
if (typeof window !== 'undefined') {
  window.runSandbox = runSandbox;
  window.runVessieBlock = runVessieBlock;
  window.handleImageBlock = handleImageBlock;
  window.handleMemoryOps = handleMemoryOps;
  window.executeMemoryOps = executeMemoryOps;
}
