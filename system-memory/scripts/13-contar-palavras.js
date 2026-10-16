#!/usr/bin/env node
// system-memory\scripts\13-contar-palavras.js — conta palavras de um arquivo
// Uso: node system-memory/scripts/13-contar-palavras.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = path.join(ROOT, process.argv[2] || 'README.md'); console.log(fs.readFileSync(f, 'utf8').split(/\s+/).filter(Boolean).length + ' palavras');
