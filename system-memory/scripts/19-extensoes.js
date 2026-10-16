#!/usr/bin/env node
// system-memory\scripts\19-extensoes.js — conta arquivos por extensao
// Uso: node system-memory/scripts/19-extensoes.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const m = new Map(); fs.readdirSync(ROOT).forEach(f => { const e = path.extname(f) || '(sem)'; m.set(e, (m.get(e) || 0) + 1); }); m.forEach((c, e) => console.log(c + '  ' + e));
