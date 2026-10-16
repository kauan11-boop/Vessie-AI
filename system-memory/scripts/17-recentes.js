#!/usr/bin/env node
// system-memory\scripts\17-recentes.js — 10 arquivos mais recentes
// Uso: node system-memory/scripts/17-recentes.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isFile()).map(f => ({ f: f, t: fs.statSync(path.join(ROOT, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, 10).forEach(x => console.log(new Date(x.t).toISOString().slice(0, 16) + '  ' + x.f));
