#!/usr/bin/env node
// system-memory\scripts\08-detectar-url.js — detecta a URL do site via site-content
// Uso: node system-memory/scripts/08-detectar-url.js
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
try { console.log(execSync('node tools/site-content.js detect', { cwd: ROOT, encoding: 'utf8' })); } catch (e) { console.log('falhou: ' + e.message); }
