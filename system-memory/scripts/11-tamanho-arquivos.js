#!/usr/bin/env node
// system-memory\scripts\11-tamanho-arquivos.js — tamanhos dos arquivos da raiz
// Uso: node system-memory/scripts/11-tamanho-arquivos.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => console.log(String(fs.statSync(path.join(ROOT, f)).size).padStart(8) + '  ' + f));
