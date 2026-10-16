#!/usr/bin/env node
// system-memory\scripts\25-resumo-geral.js — resumo: arquivos, pastas e tamanho
// Uso: node system-memory/scripts/25-resumo-geral.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
let files = 0, dirs = 0, size = 0; (function w(d) { fs.readdirSync(d).forEach(n => { if (n.startsWith('.')) return; const q = path.join(d, n); const s = fs.statSync(q); if (s.isDirectory()) { dirs++; w(q); } else { files++; size += s.size; } }); })(ROOT); console.log(files + ' arquivos · ' + dirs + ' pastas · ' + Math.round(size / 1024) + ' KB');
