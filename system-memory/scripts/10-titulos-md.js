#!/usr/bin/env node
// system-memory\scripts\10-titulos-md.js — lista os titulos de um .md
// Uso: node system-memory/scripts/10-titulos-md.js <arquivo>
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const f = path.join(ROOT, process.argv[2] || 'README.md'); fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(l => { if (/^#{1,6}\s/.test(l)) console.log(l.trim()); });
