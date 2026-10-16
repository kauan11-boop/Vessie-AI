#!/usr/bin/env node
// system-memory\scripts\14-arvore-pastas.js — imprime a arvore de pastas
// Uso: node system-memory/scripts/14-arvore-pastas.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
function w(d, p) { fs.readdirSync(d).forEach(n => { if (n.startsWith('.')) return; const q = path.join(d, n); console.log(p + n); if (fs.statSync(q).isDirectory()) w(q, p + '  '); }); } w(ROOT, '');
