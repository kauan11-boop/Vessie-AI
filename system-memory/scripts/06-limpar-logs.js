#!/usr/bin/env node
// system-memory\scripts\06-limpar-logs.js — remove logs com mais de 7 dias
// Uso: node system-memory/scripts/06-limpar-logs.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const d = path.join(ROOT, 'tools', 'logs'); if (!fs.existsSync(d)) { console.log('sem logs'); process.exit(0); } const old = Date.now() - 7 * 864e5; let n = 0; fs.readdirSync(d).forEach(f => { const p = path.join(d, f); if (fs.statSync(p).mtimeMs < old) { fs.unlinkSync(p); n++; } }); console.log(n + ' log(s) removido(s)');
