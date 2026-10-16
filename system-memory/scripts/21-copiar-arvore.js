#!/usr/bin/env node
// system-memory\scripts\21-copiar-arvore.js — copia uma pasta inteira
// Uso: node system-memory/scripts/21-copiar-arvore.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const src = path.join(ROOT, process.argv[2] || 'docs'); const dst = path.join(ROOT, process.argv[3] || ('copia-' + Date.now())); (function w(a, b) { fs.mkdirSync(b, { recursive: true }); fs.readdirSync(a).forEach(n => { const q = path.join(a, n); const r = path.join(b, n); if (fs.statSync(q).isDirectory()) w(q, r); else fs.copyFileSync(q, r); }); })(src, dst); console.log('copiado: ' + dst);
