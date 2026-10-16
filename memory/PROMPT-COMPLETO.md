# 🧠 MEMORY — Pasta Virtual .ZIP para IA + Console JS + Reuso

> Leitura obrigatória antes de qualquer edição: `docs/LM-Studio-Skill.md`
> Skill lida em: 2026-10-11 — protocolo LM Studio via `fetch` OpenAI-compatible, `GET /v1/models`, `POST /v1/chat/completions`, streaming SSE, `baseUrl http://localhost:1234/v1`, persistência em `localStorage`, XSS via `sanitizeMarkdown`.

---

## 1. PROMPT COMPLETO — O que é o Memory

Você é o **Memory**, a pasta virtual do site Vessie AI Chat.

### O que você PODE fazer:
1. **Salvar qualquer conteúdo** que a IA gerar: `Memory.putFile('guia/receita.txt','texto...')`
2. **Salvar sistemas inteiros** (HTML/CSS/JS) como arquivos reutilizáveis
3. **Executar JavaScript no console do site** via `Memory.runJS('2+2')` — a IA pode chamar isso respondendo com bloco especial
4. **Criar triggers** que disparam scripts quando uma mensagem contém um padrão: `Memory.addTrigger('auto-save',{pattern:'salve isso',action:'save'})`
5. **Criar scripts reutilizáveis** em `VessieLang` ou `JavaScript` e re-executar com 1 clique
6. **Exportar tudo como `.zip` real** (gerado 100% no navegador, sem dependência) e **importar de volta**
7. **Reutilizar**: qualquer arquivo/script/conteúdo pode ser inserido no chat, copiado ou baixado

### O que PODE SER MELHORADO (roadmap):
- [ ] Compressão DEFLATE (hoje é STORE sem compressão para ser puro-JS)
- [ ] Criptografia AES do .zip com senha
- [ ] Sincronização IndexedDB para arquivos >5MB
- [ ] Versionamento (histórico de cada arquivo)
- [ ] Compartilhamento P2P via WebRTC

### Ordem de criação (obrigatória):
1. `memory/VESSIE-LANG.md` — linguagem própria (esta pasta)
2. `memory/PROMPT-COMPLETO.md` — este arquivo
3. `memory/examples/*.mem` — exemplos antes de carregar
4. `memory/memory-zip.js` — escritor/leitor .zip puro
5. `memory/memory-core.js` — núcleo (arquivos+triggers+scripts+conteúdos)
6. `memory/memory-console.js` — console JS seguro para IA + humano
7. `memory/memory-ui.js` — interface da pasta virtual
8. `memory/memory.css` — estilos
9. `index.html` — remontagem da interface (botão Memory + painel)
10. `js/app.js` — correção dos imports quebrados

### Como a IA usa (contrato):
A IA (LM Studio) recebe este system-prompt extra:

```
Você tem acesso ao Memory (pasta virtual).
Para SALVAR: responda com ```memory:put:nome/do/arquivo.txt <conteúdo> ```
Para EXECUTAR JS: responda com ```memory:run <código JS> ```
Para CRIAR TRIGGER: ```memory:trigger:nome|padrão|script ```
O site intercepta esses blocos, executa e mostra o resultado no chat.
Nunca invente que salvou — só após o bloco o sistema confirma.
```

### Exemplos (antes de carregar — obrigatório):
Ver pasta `memory/examples/`:
- `01-salvar-arquivo.mem` — salva texto
- `02-executar-js.mem` — executa JS no console
- `03-trigger-auto.mem` — trigger que auto-salva respostas com código
- `04-sistema-reutilizavel.mem` — salva mini-app completo e reusa
- `05-exportar-zip.mem` — exporta tudo
