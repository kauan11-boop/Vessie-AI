#!/usr/bin/env node
// system-memory\scripts\01-listar-arquivos.js — lista os arquivos da raiz do projeto
// Uso: node system-memory/scripts/01-listar-arquivos.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
fs.readdirSync(ROOT).filter(f => !f.startsWith('.')).forEach(f => console.log(f));
