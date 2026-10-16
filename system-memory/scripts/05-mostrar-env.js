#!/usr/bin/env node
// system-memory\scripts\05-mostrar-env.js — mostra o .env atual
// Uso: node system-memory/scripts/05-mostrar-env.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
try { console.log(fs.readFileSync(path.join(ROOT, '.env'), 'utf8')); } catch (e) { console.log('sem .env — rode: node tools/site-content.js env-init'); }
