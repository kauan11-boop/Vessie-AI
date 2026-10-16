#!/usr/bin/env node
// system-memory\scripts\22-intervalo-linhas.js — mostra linhas a-b de um arquivo
// Uso: node system-memory/scripts/22-intervalo-linhas.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = path.join(ROOT, process.argv[2] || 'index.html'); const a = +(process.argv[3] || 1); const b = +(process.argv[4] || a + 20); fs.readFileSync(f, 'utf8').split(/\r?\n/).slice(a - 1, b).forEach((l, i) => console.log((a + i) + ': ' + l));
