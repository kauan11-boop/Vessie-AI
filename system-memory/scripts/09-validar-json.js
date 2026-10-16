#!/usr/bin/env node
// system-memory\scripts\09-validar-json.js — valida um arquivo JSON
// Uso: node system-memory/scripts/09-validar-json.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = path.join(ROOT, process.argv[2] || 'manifest.json'); try { JSON.parse(fs.readFileSync(f, 'utf8')); console.log('JSON valido: ' + f); } catch (e) { console.log('JSON invalido: ' + e.message); process.exit(1); }
