#!/usr/bin/env node
// system-memory\scripts\03-backup-arquivo.js — cria copia .bak de um arquivo
// Uso: node system-memory/scripts/03-backup-arquivo.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = path.join(ROOT, process.argv[2] || 'index.html'); fs.copyFileSync(f, f + '.bak'); console.log('backup: ' + f + '.bak');
