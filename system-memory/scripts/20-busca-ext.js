#!/usr/bin/env node
// system-memory\scripts\20-busca-ext.js — lista arquivos de uma extensao
// Uso: node system-memory/scripts/20-busca-ext.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const e = process.argv[2] || '.js'; (function w(d) { fs.readdirSync(d).forEach(n => { if (n.startsWith('.')) return; const q = path.join(d, n); if (fs.statSync(q).isDirectory()) w(q); else if (n.endsWith(e)) console.log(path.relative(ROOT, q)); }); })(ROOT);
