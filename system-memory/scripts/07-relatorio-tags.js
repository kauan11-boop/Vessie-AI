#!/usr/bin/env node
// system-memory\scripts\07-relatorio-tags.js — relata as tags do index.html
// Uso: node system-memory/scripts/07-relatorio-tags.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); const re = /<!--\s*tag:([\w-]+)\s*-->/g; let m, c = 0; while ((m = re.exec(src))) { c++; console.log('tag: ' + m[1]); } console.log(c + ' tag(s) no index.html');
