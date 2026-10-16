#!/usr/bin/env node
// system-memory\scripts\16-nome-hash.js — nome + hash curto de cada arquivo
// Uso: node system-memory/scripts/16-nome-hash.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const c = require('crypto'); fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => console.log(c.createHash('md5').update(f).digest('hex').slice(0, 8) + '  ' + f));
