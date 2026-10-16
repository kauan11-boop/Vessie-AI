#!/usr/bin/env node
// system-memory\scripts\02-contar-linhas.js — conta as linhas de um arquivo
// Uso: node system-memory/scripts/02-contar-linhas.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = path.join(ROOT, process.argv[2] || 'index.html'); console.log(fs.readFileSync(f, 'utf8').split(/\r?\n/).length + ' linhas em ' + f);
