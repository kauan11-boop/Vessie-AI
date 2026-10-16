#!/usr/bin/env node
// system-memory\scripts\18-pastas-vazias.js — encontra pastas vazias
// Uso: node system-memory/scripts/18-pastas-vazias.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
let n = 0; (function w(d) { fs.readdirSync(d).forEach(x => { if (x.startsWith('.')) return; const q = path.join(d, x); if (fs.statSync(q).isDirectory()) { if (!fs.readdirSync(q).length) { console.log('vazia: ' + path.relative(ROOT, q)); n++; } else w(q); } }); })(ROOT); console.log(n + ' pasta(s) vazia(s)');
