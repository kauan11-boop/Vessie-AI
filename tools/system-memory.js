#!/usr/bin/env node
// tools/system-memory.js — System Memory: 7 categorias × 25 itens em arquivos separados.
// Node.js puro (fs/path/child_process), zero dependências.
// Ordem: 1.args/log 2.tabelas 3.seeds 4.init 5.comandos 6.dispatch
// Ex: node tools/system-memory.js init · list scripts · get files/01-guia-offline.md
//     put <caminho> --content-file novo.txt · edit-lines <caminho> --lines 5-9 --content-file patch.txt

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SM = path.join(ROOT, 'system-memory');
const LOG_DIR = path.join(__dirname, 'logs');
const CATS = ['scripts', 'triggers', 'apis', 'mcps', 'plugins', 'skills', 'files'];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

function log(cmd, lines) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = path.join(LOG_DIR, 'sm-' + cmd + '-' + stamp + '.log');
  const body = ['[' + new Date().toISOString() + '] cmd=' + cmd].concat(lines, '').join('\n');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

// ---------- 2. seeds: scripts (25 utilitários reais) ----------
const SCRIPT_DEFS = [
  ['listar-arquivos', 'list', 'lista os arquivos da raiz do projeto'],
  ['contar-linhas', 'count', 'conta as linhas de um arquivo'],
  ['backup-arquivo', 'backup', 'cria copia .bak de um arquivo'],
  ['procurar-texto', 'grep', 'procura um texto dentro de um arquivo'],
  ['mostrar-env', 'env', 'mostra o .env atual'],
  ['limpar-logs', 'logs', 'remove logs com mais de 7 dias'],
  ['relatorio-tags', 'tags', 'relata as tags do index.html'],
  ['detectar-url', 'url', 'detecta a URL do site via site-content'],
  ['validar-json', 'json', 'valida um arquivo JSON'],
  ['titulos-md', 'titles', 'lista os titulos de um .md'],
  ['tamanho-arquivos', 'sizes', 'tamanhos dos arquivos da raiz'],
  ['linhas-duplicadas', 'dup', 'acha linhas duplicadas em um arquivo'],
  ['contar-palavras', 'words', 'conta palavras de um arquivo'],
  ['arvore-pastas', 'tree', 'imprime a arvore de pastas'],
  ['exportar-json', 'export', 'exporta o inventario do projeto em JSON'],
  ['nome-hash', 'hash', 'nome + hash curto de cada arquivo'],
  ['recentes', 'recent', '10 arquivos mais recentes'],
  ['pastas-vazias', 'empty', 'encontra pastas vazias'],
  ['extensoes', 'ext', 'conta arquivos por extensao'],
  ['busca-ext', 'buscaext', 'lista arquivos de uma extensao'],
  ['copiar-arvore', 'copy', 'copia uma pasta inteira'],
  ['intervalo-linhas', 'range', 'mostra linhas a-b de um arquivo'],
  ['cabecalho', 'header', 'adiciona cabecalho datado a um arquivo'],
  ['remover-comentarios', 'comments', 'remove linhas de comentario //'],
  ['resumo-geral', 'summary', 'resumo: arquivos, pastas e tamanho']
];

function bodiesA() {
  return {
    list: "fs.readdirSync(ROOT).filter(f => !f.startsWith('.')).forEach(f => console.log(f));",
    count: "const f = path.join(ROOT, process.argv[2] || 'index.html'); console.log(fs.readFileSync(f, 'utf8').split(/\\r?\\n/).length + ' linhas em ' + f);",
    backup: "const f = path.join(ROOT, process.argv[2] || 'index.html'); fs.copyFileSync(f, f + '.bak'); console.log('backup: ' + f + '.bak');",
    grep: "const f = path.join(ROOT, process.argv[2] || 'index.html'); const t = (process.argv[3] || '').toLowerCase(); fs.readFileSync(f, 'utf8').split(/\\r?\\n/).forEach((l, i) => { if (t && l.toLowerCase().includes(t)) console.log((i + 1) + ': ' + l.trim().slice(0, 120)); });",
    env: "try { console.log(fs.readFileSync(path.join(ROOT, '.env'), 'utf8')); } catch (e) { console.log('sem .env — rode: node tools/site-content.js env-init'); }",
    logs: "const d = path.join(ROOT, 'tools', 'logs'); if (!fs.existsSync(d)) { console.log('sem logs'); process.exit(0); } const old = Date.now() - 7 * 864e5; let n = 0; fs.readdirSync(d).forEach(f => { const p = path.join(d, f); if (fs.statSync(p).mtimeMs < old) { fs.unlinkSync(p); n++; } }); console.log(n + ' log(s) removido(s)');",
    tags: "const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); const re = /<!--\\s*tag:([\\w-]+)\\s*-->/g; let m, c = 0; while ((m = re.exec(src))) { c++; console.log('tag: ' + m[1]); } console.log(c + ' tag(s) no index.html');",
    url: "try { console.log(execSync('node tools/site-content.js detect', { cwd: ROOT, encoding: 'utf8' })); } catch (e) { console.log('falhou: ' + e.message); }",
    json: "const f = path.join(ROOT, process.argv[2] || 'manifest.json'); try { JSON.parse(fs.readFileSync(f, 'utf8')); console.log('JSON valido: ' + f); } catch (e) { console.log('JSON invalido: ' + e.message); process.exit(1); }",
    titles: "const f = path.join(ROOT, process.argv[2] || 'README.md'); fs.readFileSync(f, 'utf8').split(/\\r?\\n/).forEach(l => { if (/^#{1,6}\\s/.test(l)) console.log(l.trim()); });",
    sizes: "fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => console.log(String(fs.statSync(path.join(ROOT, f)).size).padStart(8) + '  ' + f));",
    dup: "const f = path.join(ROOT, process.argv[2] || 'index.html'); const seen = new Map(); fs.readFileSync(f, 'utf8').split(/\\r?\\n/).forEach((l, i) => { const t = l.trim(); if (t.length > 20) seen.set(t, (seen.get(t) || []).concat(i + 1)); }); seen.forEach((ls, t) => { if (ls.length > 1) console.log('x' + ls.length + ' linhas ' + ls.join(',') + ': ' + t.slice(0, 80)); });"
  };
}

function bodiesB() {
  return {
    words: "const f = path.join(ROOT, process.argv[2] || 'README.md'); console.log(fs.readFileSync(f, 'utf8').split(/\\s+/).filter(Boolean).length + ' palavras');",
    tree: "function w(d, p) { fs.readdirSync(d).forEach(n => { if (n.startsWith('.')) return; const q = path.join(d, n); console.log(p + n); if (fs.statSync(q).isDirectory()) w(q, p + '  '); }); } w(ROOT, '');",
    export: "const out = []; (function w(d) { fs.readdirSync(d).forEach(n => { if (n.startsWith('.') || n === 'node_modules') return; const q = path.join(d, n); const s = fs.statSync(q); if (s.isDirectory()) w(q); else out.push({ path: path.relative(ROOT, q), size: s.size }); }); })(ROOT); console.log(JSON.stringify(out, null, 2));",
    hash: "const c = require('crypto'); fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => console.log(c.createHash('md5').update(f).digest('hex').slice(0, 8) + '  ' + f));",
    recent: "fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isFile()).map(f => ({ f: f, t: fs.statSync(path.join(ROOT, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, 10).forEach(x => console.log(new Date(x.t).toISOString().slice(0, 16) + '  ' + x.f));",
    empty: "let n = 0; (function w(d) { fs.readdirSync(d).forEach(x => { if (x.startsWith('.')) return; const q = path.join(d, x); if (fs.statSync(q).isDirectory()) { if (!fs.readdirSync(q).length) { console.log('vazia: ' + path.relative(ROOT, q)); n++; } else w(q); } }); })(ROOT); console.log(n + ' pasta(s) vazia(s)');",
    ext: "const m = new Map(); fs.readdirSync(ROOT).forEach(f => { const e = path.extname(f) || '(sem)'; m.set(e, (m.get(e) || 0) + 1); }); m.forEach((c, e) => console.log(c + '  ' + e));",
    buscaext: "const e = process.argv[2] || '.js'; (function w(d) { fs.readdirSync(d).forEach(n => { if (n.startsWith('.')) return; const q = path.join(d, n); if (fs.statSync(q).isDirectory()) w(q); else if (n.endsWith(e)) console.log(path.relative(ROOT, q)); }); })(ROOT);",
    copy: "const src = path.join(ROOT, process.argv[2] || 'docs'); const dst = path.join(ROOT, process.argv[3] || ('copia-' + Date.now())); (function w(a, b) { fs.mkdirSync(b, { recursive: true }); fs.readdirSync(a).forEach(n => { const q = path.join(a, n); const r = path.join(b, n); if (fs.statSync(q).isDirectory()) w(q, r); else fs.copyFileSync(q, r); }); })(src, dst); console.log('copiado: ' + dst);",
    range: "const f = path.join(ROOT, process.argv[2] || 'index.html'); const a = +(process.argv[3] || 1); const b = +(process.argv[4] || a + 20); fs.readFileSync(f, 'utf8').split(/\\r?\\n/).slice(a - 1, b).forEach((l, i) => console.log((a + i) + ': ' + l));",
    header: "const f = path.join(ROOT, process.argv[2] || 'README.md'); fs.writeFileSync(f, '// atualizado em ' + new Date().toISOString().slice(0, 10) + String.fromCharCode(10) + fs.readFileSync(f, 'utf8')); console.log('cabecalho adicionado: ' + f);",
    comments: "const f = process.argv[2]; if (!f) { console.log('uso: node remover-comentarios.js arquivo.js'); process.exit(1); } const p = path.join(ROOT, f); const out = fs.readFileSync(p, 'utf8').split(/\\r?\\n/).filter(l => !l.trim().startsWith('//')).join(String.fromCharCode(10)); fs.writeFileSync(p, out); console.log('comentarios removidos: ' + f);",
    summary: "let files = 0, dirs = 0, size = 0; (function w(d) { fs.readdirSync(d).forEach(n => { if (n.startsWith('.')) return; const q = path.join(d, n); const s = fs.statSync(q); if (s.isDirectory()) { dirs++; w(q); } else { files++; size += s.size; } }); })(ROOT); console.log(files + ' arquivos · ' + dirs + ' pastas · ' + Math.round(size / 1024) + ' KB');"
  };
}

const SCRIPT_BODIES = Object.assign({}, bodiesA(), bodiesB());

// ---------- 2b. seeds: triggers (25, formato .mem importável) ----------
const TRIGGER_DEFS = [
  ['auto-salvar-codigo', '```', 'save'],
  ['salvar-python', 'python', 'save'],
  ['salvar-javascript', 'javascript', 'save'],
  ['executar-sys', 'sys:', 'run'],
  ['log-offline', 'offline', 'save'],
  ['guia-servidor', 'lm studio', 'save'],
  ['backup-memoria', 'backup', 'save'],
  ['resumir-conversa', 'resuma', 'save'],
  ['traduzir-en', 'traduza', 'save'],
  ['explicar', 'explique', 'save'],
  ['teste-rapido', 'teste', 'save'],
  ['nota-rapida', 'nota:', 'save'],
  ['imagem-auto', 'imagem', 'save'],
  ['api-nova', 'api:', 'save'],
  ['trigger-nova', 'trigger', 'save'],
  ['skill-nova', 'skill', 'save'],
  ['deploy', 'deploy', 'save'],
  ['git-status', 'git', 'save'],
  ['ler-arquivo', 'ler ', 'read'],
  ['listar-conteudo', 'liste', 'run'],
  ['limpar-cache', 'limpe', 'save'],
  ['ordenar-lista', 'ordene', 'save'],
  ['converter-formato', 'converta', 'save'],
  ['ajuda-rapida', 'ajuda', 'help'],
  ['status-sistema', 'status', 'run']
];

// ---------- 2c. seeds: APIs públicas (25) ----------
const API_DEFS = [
  ['jsonplaceholder', 'https://jsonplaceholder.typicode.com/', 'REST falsa para testes'],
  ['open-meteo', 'https://api.open-meteo.com/v1/', 'previsao do tempo sem chave'],
  ['dog-ceo', 'https://dog.ceo/dog-api/', 'imagens de caes'],
  ['thecatapi', 'https://api.thecatapi.com/v1/', 'imagens de gatos'],
  ['official-joke', 'https://official-joke-api.appspot.com/', 'piadas'],
  ['quotable', 'https://api.quotable.io/', 'citacoes'],
  ['github-rest', 'https://api.github.com/', 'dados publicos do GitHub'],
  ['nominatim', 'https://nominatim.openstreetmap.org/', 'geocodificacao OpenStreetMap'],
  ['restcountries', 'https://restcountries.com/v1/', 'dados de paises'],
  ['openlibrary', 'https://openlibrary.org/', 'livros e metadados'],
  ['pokeapi', 'https://pokeapi.co/', 'dados de Pokemon'],
  ['randomuser', 'https://randomuser.me/api/', 'usuarios ficticios'],
  ['httpbin', 'https://httpbin.org/', 'testes de HTTP'],
  ['ipify', 'https://api.ipify.org/', 'IP publico'],
  ['ipwho-is', 'https://ipwho.is/', 'geoip do IP'],
  ['worldbank', 'https://api.worldbank.org/', 'dados economicos'],
  ['gbif', 'https://api.gbif.org/v1/', 'biodiversidade'],
  ['coingecko', 'https://api.coingecko.com/api/v3/', 'criptomoedas'],
  ['er-api', 'https://open.er-api.com/v6/latest/USD', 'taxas de cambio'],
  ['dictionaryapi', 'https://api.dictionaryapi.dev/api/v2/entries/en/', 'dicionario ingles'],
  ['spacex', 'https://api.spacexdata.com/v4/', 'dados da SpaceX'],
  ['advice-slip', 'https://api.adviceslip.com/', 'conselhos'],
  ['icanhazdadjoke', 'https://icanhazdadjoke.com/', 'piadas de pai'],
  ['openverse', 'https://api.openverse.org/v1/', 'imagens livres'],
  ['arxiv', 'https://export.arxiv.org/api/', 'papers e preprints']
];

// ---------- 2d. seeds: MCPs (25) ----------
const MCP_DEFS = [
  ['filesystem', 'npx -y @modelcontextprotocol/server-filesystem .', 'acesso a arquivos locais'],
  ['memory', 'npx -y @modelcontextprotocol/server-memory', 'memoria persistente chave-valor'],
  ['sequential-thinking', 'npx -y @modelcontextprotocol/server-sequential-thinking', 'raciocinio passo a passo'],
  ['git', 'npx -y @modelcontextprotocol/server-git', 'operacoes git locais'],
  ['github', 'npx -y @modelcontextprotocol/server-github', 'repositorios do GitHub'],
  ['postgres', 'npx -y @modelcontextprotocol/server-postgres', 'consulta a PostgreSQL'],
  ['sqlite', 'npx -y @modelcontextprotocol/server-sqlite', 'consulta a SQLite'],
  ['fetch', 'npx -y mcp-server-fetch', 'busca de paginas web'],
  ['puppeteer', 'npx -y @modelcontextprotocol/server-puppeteer', 'automacao de navegador'],
  ['time', 'npx -y mcp-server-time', 'fuso horario e relógio'],
  ['brave-search', 'npx -y @modelcontextprotocol/server-brave-search', 'busca web Brave'],
  ['slack', 'npx -y @modelcontextprotocol/server-slack', 'mensagens no Slack'],
  ['gdrive', 'npx -y @modelcontextprotocol/server-gdrive', 'arquivos do Google Drive'],
  ['everart', 'npx -y @modelcontextprotocol/server-everart', 'template MCP (ajuste o pacote)'],
  ['template-01', 'npx -y seu-mcp-01', 'template MCP — troque pelo pacote real'],
  ['template-02', 'npx -y seu-mcp-02', 'template MCP — troque pelo pacote real'],
  ['template-03', 'npx -y seu-mcp-03', 'template MCP — troque pelo pacote real'],
  ['template-04', 'npx -y seu-mcp-04', 'template MCP — troque pelo pacote real'],
  ['template-05', 'npx -y seu-mcp-05', 'template MCP — troque pelo pacote real'],
  ['template-06', 'npx -y seu-mcp-06', 'template MCP — troque pelo pacote real'],
  ['template-07', 'npx -y seu-mcp-07', 'template MCP — troque pelo pacote real'],
  ['template-08', 'npx -y seu-mcp-08', 'template MCP — troque pelo pacote real'],
  ['template-09', 'npx -y seu-mcp-09', 'template MCP — troque pelo pacote real'],
  ['template-10', 'npx -y seu-mcp-10', 'template MCP — troque pelo pacote real'],
  ['template-11', 'npx -y seu-mcp-11', 'template MCP — troque pelo pacote real']
];

// ---------- 2e. seeds: Plugins do site (25) ----------
const PLUGIN_DEFS = [
  ['export-zip', 'exporta o Memory Manager como .zip'],
  ['markdown-plus', 'realce extra de markdown no chat'],
  ['tema-auto', 'o tema segue o do sistema'],
  ['conta-tokens', 'mostra a contagem de tokens por mensagem'],
  ['auto-titulo', 'titulo automatico da conversa'],
  ['busca-historico', 'busca textual no historico'],
  ['backup-auto', 'backup automatico das conversas'],
  ['atalhos-extra', 'mais atalhos de teclado'],
  ['voz-leitura', 'le as respostas em voz alta'],
  ['voz-ditado', 'ditado por voz no input'],
  ['export-md', 'exporta a conversa em markdown'],
  ['tempo-resposta', 'tempo de resposta por mensagem'],
  ['spellcheck-off', 'desliga o corretor ortografico'],
  ['imagem-rapida', 'atalho para gerar imagens'],
  ['offline-badge', 'selo nas mensagens OFFLINE'],
  ['simulite-tuner', 'expoe ajustes do Simulite'],
  ['tags-report', 'relatorio das tags do site'],
  ['env-switcher', 'troca a BASE_URL rapidamente'],
  ['model-pins', 'fixa modelos favoritos no topo'],
  ['limpa-cache', 'limpa caches locais'],
  ['json-view', 'visualiza JSON colado no chat'],
  ['code-copy', 'botao copiar em todo bloco de codigo'],
  ['linhas-numeradas', 'numera linhas nos blocos de codigo'],
  ['emoji-md', 'atalhos de emoji em markdown'],
  ['log-export', 'exporta o log de comandos']
];

// ---------- 2f. seeds: Skills (25) ----------
const SKILL_DEFS = [
  ['revisar-codigo', 'aponta problemas em um codigo enviado'],
  ['gerar-testes', 'gera testes para um script'],
  ['traduzir', 'traduz texto mantendo o tom'],
  ['resumir', 'resume um texto longo em topicos'],
  ['explicar-codigo', 'explica codigo linha a linha'],
  ['nomear-arquivos', 'sugere nomes consistentes'],
  ['mensagem-commit', 'escreve mensagem de commit'],
  ['docstring', 'escreve documentacao de funcoes'],
  ['converter', 'converte codigo entre linguagens'],
  ['estruturar', 'transforma ideias em plano executavel'],
  ['comparar', 'compara dois arquivos e lista diferencas'],
  ['debug', 'checklist de depuracao para um erro'],
  ['ler-json', 'explica um JSON complexo'],
  ['readme', 'monta README completo'],
  ['release', 'checklist de release'],
  ['limpar', 'remove codigo morto com seguranca'],
  ['padronizar', 'padroniza indentacao e aspas'],
  ['extrair', 'extrai dados de um texto'],
  ['prompt', 'monta um system prompt sob medida'],
  ['api-test', 'monta teste de API via curl'],
  ['otimizar', 'sugere otimizacoes de performance'],
  ['email', 'escreve e-mail profissional'],
  ['planilha', 'transforma texto em tabela'],
  ['resumo-pagina', 'resume o conteudo colado de uma pagina'],
  ['ensejar', 'explica um conceito com exemplos']
];

// ---------- 2g. seeds: Arquivos/guis (25) ----------
const FILE_DEFS = [
  ['guia-offline', 'Guia do modo OFFLINE'],
  ['checklist-deploy', 'Checklist de deploy'],
  ['dicas-lm-studio', 'Dicas de LM Studio'],
  ['estrutura-projeto', 'Estrutura do projeto'],
  ['backup', 'Rotina de backup'],
  ['convencoes', 'Convencoes de codigo'],
  ['env', 'Segredos e .env'],
  ['logs', 'Log de comandos'],
  ['tags', 'Guia das tags'],
  ['memory', 'Memory Manager'],
  ['simulite', 'Simulite-Message'],
  ['gguf', 'Notas sobre GGUF'],
  ['portabilidade', 'Portabilidade do site'],
  ['testes', 'Testes locais'],
  ['powershell', 'Atalhos de PowerShell'],
  ['performance', 'Performance do chat'],
  ['acessibilidade', 'Acessibilidade'],
  ['imagens', 'Gerador de imagens'],
  ['api-guia', 'Guia da API'],
  ['teclado', 'Atalhos de teclado'],
  ['mobile', 'Uso no celular'],
  ['solucao-problemas', 'Solucao de problemas'],
  ['roadmap', 'Roadmap'],
  ['contribuindo', 'Contribuindo'],
  ['changelog', 'Changelog']
];

// ---------- 3. geração dos seeds ----------
function pad(i) { return String(i).padStart(2, '0'); }
function writeIfEmpty(file, content, force) {
  if (fs.existsSync(file) && !force) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return true;
}

function seedCategory(cat, defs, make) {
  let n = 0;
  defs.forEach((d, i) => {
    const file = path.join(SM, cat, pad(i + 1) + '-' + d[0] + make.ext);
    if (writeIfEmpty(file, make.body(d, i), make.force)) n++;
  });
  return n;
}

function generateSeeds(force) {
  const total = { scripts: 0, triggers: 0, apis: 0, mcps: 0, plugins: 0, skills: 0, files: 0 };

  total.scripts = seedCategory('scripts', SCRIPT_DEFS, {
    ext: '.js', force,
    body: (d) => {
      const usage = ['count', 'backup', 'grep', 'json', 'titles', 'range', 'header', 'comments', 'buscaext', 'words', 'dup'].includes(d[1]) ? ' <arquivo>' : '';
      return [
        '#!/usr/bin/env node',
        '// ' + path.join('system-memory', 'scripts', pad(SCRIPT_DEFS.indexOf(d) + 1) + '-' + d[0] + '.js') + ' — ' + d[2],
        '// Uso: node system-memory/scripts/' + pad(SCRIPT_DEFS.indexOf(d) + 1) + '-' + d[0] + '.js' + usage,
        "'use strict';",
        "const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');",
        "const ROOT = path.resolve(__dirname, '..', '..');",
        SCRIPT_BODIES[d[1]] || "console.log('script template');",
        ''
      ].join('\n');
    }
  });

  total.triggers = seedCategory('triggers', TRIGGER_DEFS, {
    ext: '.mem', force,
    body: (d) => [
      '// trigger ' + d[0] + ' — dispara quando a mensagem contém "' + d[1] + '"',
      '@trigger ' + d[0] + ' when "' + d[1] + '" do ' + d[2],
      ''
    ].join('\n')
  });

  total.apis = seedCategory('apis', API_DEFS, {
    ext: '.json', force,
    body: (d) => JSON.stringify({ name: d[0], url: d[1], description: d[2] }, null, 2) + '\n'
  });

  total.mcps = seedCategory('mcps', MCP_DEFS, {
    ext: '.json', force,
    body: (d) => JSON.stringify({ name: d[0], command: d[1], description: d[2] }, null, 2) + '\n'
  });

  total.plugins = seedCategory('plugins', PLUGIN_DEFS, {
    ext: '.json', force,
    body: (d) => JSON.stringify({ name: d[0], version: '1.0', description: d[1] }, null, 2) + '\n'
  });

  total.skills = seedCategory('skills', SKILL_DEFS, {
    ext: '.md', force,
    body: (d) => [
      '# Skill: ' + d[0],
      '',
      'Descrição: ' + d[1] + '.',
      '',
      'Prompt: quando o usuário pedir para ' + d[1] + ', faça isso em português brasileiro,',
      'com passos curtos e um exemplo final. Nunca invente dados — declare suposições.',
      ''
    ].join('\n')
  });

  total.files = seedCategory('files', FILE_DEFS, {
    ext: '.md', force,
    body: (d) => [
      '# ' + d[1],
      '',
      'Parte do System Memory (system-memory/files).',
      'Edite só as linhas que precisar:',
      '  node tools/system-memory.js edit-lines system-memory/files/' + pad(FILE_DEFS.indexOf(d) + 1) + '-' + d[0] + '.md --lines 3-3 --content-file novo.txt',
      'Conteúdo inicial criado pelo init — troque pelo guia real quando quiser.',
      ''
    ].join('\n')
  });

  writeIfEmpty(path.join(SM, 'README.md'), [
    '# System Memory',
    '',
    'Memória do projeto em arquivos separados — 7 categorias × 25 itens.',
    'Gerenciada por tools/system-memory.js (init/list/get/put/edit-lines/new-folder/check/bundle/stats).',
    'Unifique tudo para o site com: node tools/system-memory.js bundle → system-memory/bundle.mem',
    'Importe bundle.mem no Memory Manager do site.',
    ''
  ].join('\n'), force);

  return total;
}

// ---------- 4. comandos ----------
function safeRel(rel) {
  let r = String(rel || '').replace(/\\/g, '/');
  if (r.startsWith('system-memory/')) r = r.slice('system-memory/'.length);
  const abs = path.resolve(SM, r);
  if (!abs.startsWith(SM)) throw new Error('caminho fora de system-memory: ' + rel);
  return abs;
}

function cmdList(cat) {
  const out = [];
  const cats = cat && CATS.includes(cat) ? [cat] : CATS;
  cats.forEach(c => {
    const dir = path.join(SM, c);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(f => !f.startsWith('.')).sort().forEach(f => out.push(c + '/' + f));
  });
  return out;
}

function cmdGet(rel) {
  const abs = safeRel(rel);
  if (!fs.existsSync(abs)) return null;
  return { file: rel, content: fs.readFileSync(abs, 'utf8') };
}

function contentFromArgs(args) {
  if (args['content-file']) return fs.readFileSync(path.resolve(ROOT, args['content-file']), 'utf8');
  if (args.content) return String(args.content);
  if (!process.stdin.isTTY) return fs.readFileSync(0, 'utf8');
  return null;
}

function cmdPut(rel, content) {
  const abs = safeRel(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const isNew = !fs.existsSync(abs);
  fs.writeFileSync(abs, content, 'utf8');
  return { file: rel, action: isNew ? 'criado' : 'sobrescrito' };
}

// Edição por LINHAS: modifica só o intervalo a-b em vez de reescrever o arquivo.
function cmdEditLines(rel, range, content) {
  const abs = safeRel(rel);
  if (!fs.existsSync(abs)) return null;
  const m = String(range || '').match(/^(\d+)-(\d+)$/);
  if (!m) return { error: 'use --lines a-b (ex: 5-9)' };
  const a = +m[1], b = +m[2];
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  if (a < 1 || b < a || b > lines.length) return { error: 'intervalo fora do arquivo (1-' + lines.length + ')' };
  const patch = content.replace(/\n$/, '').split(/\r?\n/);
  lines.splice(a - 1, b - a + 1, ...patch);
  fs.writeFileSync(abs, lines.join('\n'), 'utf8');
  return { file: rel, de: a, ate: b, substituidas: b - a + 1, inseridas: patch.length, totalAntes: lines.length };
}

function cmdNewFolder(rel) {
  const abs = safeRel(rel);
  fs.mkdirSync(abs, { recursive: true });
  return { folder: rel, action: 'criada' };
}

function cmdCheck(rel) {
  // Aceita caminho relativo à raiz (js/app.js) ou ao System Memory (scripts/01-...).
  let abs = path.resolve(ROOT, String(rel));
  if (!fs.existsSync(abs) && fs.existsSync(safeRel(rel))) abs = safeRel(rel);
  try {
    execSync('node --check "' + abs + '"', { stdio: 'pipe' });
    return { file: rel, sintaxe: 'OK' };
  } catch (e) {
    return { file: rel, sintaxe: 'ERRO', detalhe: String(e.stderr || e.message).slice(0, 300) };
  }
}

// Junta tudo em system-memory/bundle.mem — formato .mem importável no site.
function bundle() {
  const out = ['// System Memory bundle — gerado por tools/system-memory.js bundle em ' + new Date().toISOString(), ''];
  cmdList('scripts').forEach(f => {
    out.push('@script ' + path.basename(f, '.js') + ' lang javascript');
    out.push(fs.readFileSync(path.join(SM, f), 'utf8').trimEnd());
    out.push('');
  });
  cmdList('triggers').forEach(f => {
    const txt = fs.readFileSync(path.join(SM, f), 'utf8');
    const line = txt.split(/\r?\n/).find(l => l.startsWith('@trigger'));
    if (line) out.push(line);
  });
  out.push('');
  ['apis', 'mcps', 'plugins', 'skills'].forEach(c => {
    cmdList(c).forEach(f => {
      out.push('@content ' + c + '/' + path.basename(f, path.extname(f)));
      out.push(fs.readFileSync(path.join(SM, f), 'utf8').trimEnd());
      out.push('');
    });
  });
  cmdList('files').forEach(f => {
    out.push('@file ' + f);
    out.push(fs.readFileSync(path.join(SM, f), 'utf8').trimEnd());
    out.push('');
  });
  const dest = path.join(SM, 'bundle.mem');
  fs.writeFileSync(dest, out.join('\n'), 'utf8');
  return { file: 'system-memory/bundle.mem', linhas: out.length };
}

function cmdStats() {
  const st = {};
  CATS.forEach(c => { st[c] = cmdList(c).length; });
  st.total = CATS.reduce((s, c) => s + st[c], 0);
  return st;
}

function cmdInit(force) {
  fs.mkdirSync(SM, { recursive: true });
  CATS.forEach(c => fs.mkdirSync(path.join(SM, c), { recursive: true }));
  const created = generateSeeds(force === true);
  bundle();
  return {
    action: force ? 'recriado (--force)' : 'inicializado',
    criados: created,
    stats: cmdStats()
  };
}

// ---------- 5. dispatch ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'help';
  const lines = ['args: ' + JSON.stringify(args)];
  let result = null, human = '';
  try {
    switch (cmd) {
      case 'init': {
        result = cmdInit(args.force);
        human = '✓ System Memory ' + result.action + '\n' +
          CATS.map(c => '  ' + c + ': ' + result.stats[c]).join('\n') +
          '\n  total: ' + result.stats.total + ' arquivos' +
          '\n  bundle: system-memory/bundle.mem';
        break;
      }
      case 'list': { result = cmdList(args._[1]); human = result.length ? result.join('\n') : 'Nada encontrado. Rode: node tools/system-memory.js init'; break; }
      case 'get': {
        result = cmdGet(args._[1]);
        if (!result) { console.error('Arquivo não encontrado: ' + args._[1]); process.exit(1); }
        human = result.content;
        break;
      }
      case 'put': {
        const content = contentFromArgs(args);
        if (!content) { console.error('Sem conteúdo: use --content-file, --content ou pipe'); process.exit(1); }
        result = cmdPut(args._[1], content);
        human = '✓ ' + result.action + ': ' + result.file;
        break;
      }
      case 'edit-lines': {
        const content = contentFromArgs(args);
        if (!content) { console.error('Sem patch: use --content-file, --content ou pipe'); process.exit(1); }
        result = cmdEditLines(args._[1], args.lines, content);
        if (!result) { console.error('Arquivo não encontrado: ' + args._[1]); process.exit(1); }
        if (result.error) { console.error('Erro: ' + result.error); process.exit(1); }
        human = '✓ edit-lines ' + result.file + ' — linhas ' + result.de + '-' + result.ate +
          ' (' + result.substituidas + ' removidas → ' + result.inseridas + ' inseridas)';
        break;
      }
      case 'new-folder': { result = cmdNewFolder(args._[1]); human = '✓ pasta criada: ' + result.folder; break; }
      case 'check': {
        if (!args._[1]) { console.error('Uso: check <caminho>'); process.exit(1); }
        result = cmdCheck(args._[1]);
        human = (result.sintaxe === 'OK' ? '✓ sintaxe OK: ' : '✗ sintaxe ERRO: ') + result.file +
          (result.detalhe ? '\n' + result.detalhe : '');
        break;
      }
      case 'bundle': { result = bundle(); human = '✓ ' + result.file + ' (' + result.linhas + ' linhas) — importe no Memory Manager do site'; break; }
      case 'stats': { result = cmdStats(); human = CATS.map(c => c + ': ' + result[c]).join('\n') + '\ntotal: ' + result.total; break; }
      default:
        human = [
          'Uso: node tools/system-memory.js <comando>',
          '',
          '  init [--force]                    cria system-memory/ com 25 itens por categoria',
          '  list [categoria]                  lista arquivos (scripts|triggers|apis|mcps|plugins|skills|files)',
          '  get <categoria/arquivo>           mostra o conteúdo',
          '  put <caminho> --content-file a    cria/sobrescreve (cria pastas sozinho)',
          '  edit-lines <caminho> --lines a-b  edita SÓ as linhas a-b (não reescreve o arquivo)',
          '  new-folder <caminho>              cria pasta',
          '  check <caminho>                   valida sintaxe (node --check)',
          '  bundle                            junta tudo em system-memory/bundle.mem',
          '  stats                             contagem por categoria'
        ].join('\n');
    }
  } catch (e) {
    console.error('Erro: ' + e.message);
    log(cmd, ['ERRO: ' + e.message]);
    process.exit(1);
  }
  const logfile = log(cmd, lines.concat(['result: ' + JSON.stringify(result)]));
  console.log(human + '\n(log: ' + path.relative(ROOT, logfile) + ')');
}

main();


