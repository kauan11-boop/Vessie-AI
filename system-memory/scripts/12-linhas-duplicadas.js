#!/usr/bin/env node
// system-memory\scripts\12-linhas-duplicadas.js — acha linhas duplicadas em um arquivo
// Uso: node system-memory/scripts/12-linhas-duplicadas.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = path.join(ROOT, process.argv[2] || 'index.html'); const seen = new Map(); fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => { const t = l.trim(); if (t.length > 20) seen.set(t, (seen.get(t) || []).concat(i + 1)); }); seen.forEach((ls, t) => { if (ls.length > 1) console.log('x' + ls.length + ' linhas ' + ls.join(',') + ': ' + t.slice(0, 80)); });
