#!/usr/bin/env node
// system-memory\scripts\15-exportar-json.js — exporta o inventario do projeto em JSON
// Uso: node system-memory/scripts/15-exportar-json.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const out = []; (function w(d) { fs.readdirSync(d).forEach(n => { if (n.startsWith('.') || n === 'node_modules') return; const q = path.join(d, n); const s = fs.statSync(q); if (s.isDirectory()) w(q); else out.push({ path: path.relative(ROOT, q), size: s.size }); }); })(ROOT); console.log(JSON.stringify(out, null, 2));
