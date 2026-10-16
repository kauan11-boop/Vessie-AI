#!/usr/bin/env node
// system-memory\scripts\24-remover-comentarios.js — remove linhas de comentario //
// Uso: node system-memory/scripts/24-remover-comentarios.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = process.argv[2]; if (!f) { console.log('uso: node remover-comentarios.js arquivo.js'); process.exit(1); } const p = path.join(ROOT, f); const out = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join(String.fromCharCode(10)); fs.writeFileSync(p, out); console.log('comentarios removidos: ' + f);
