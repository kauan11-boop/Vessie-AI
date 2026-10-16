#!/usr/bin/env node
// system-memory\scripts\23-cabecalho.js — adiciona cabecalho datado a um arquivo
// Uso: node system-memory/scripts/23-cabecalho.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = path.join(ROOT, process.argv[2] || 'README.md'); fs.writeFileSync(f, '// atualizado em ' + new Date().toISOString().slice(0, 10) + String.fromCharCode(10) + fs.readFileSync(f, 'utf8')); console.log('cabecalho adicionado: ' + f);
