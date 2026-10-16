#!/usr/bin/env node
// system-memory\scripts\04-procurar-texto.js — procura um texto dentro de um arquivo
// Uso: node system-memory/scripts/04-procurar-texto.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = path.join(ROOT, process.argv[2] || 'index.html'); const t = (process.argv[3] || '').toLowerCase(); fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => { if (t && l.toLowerCase().includes(t)) console.log((i + 1) + ': ' + l.trim().slice(0, 120)); });
