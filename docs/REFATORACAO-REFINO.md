# REFINAMENTO — Como modernizar (parte 2)

## 3. Visual feio / UX datada — o que mudar

1. **Tema**: manter variáveis CSS, mas unificar nomes (`--hover` usado e nunca definido; `--text` vs `--text2` vs `--muted` inconsistentes).
2. **Sidebar fixa 290px + `#main { margin-left:290px }` sem `#overlay` funcional** → em mobile cobre o chat. Refinar: drawer com `transform`, `overlay.active`, breakpoint 900px.
3. **Bolhas**: `.message.bot` vs `.user-msg` com classes divergentes do `renderChat` (`msg-content` dentro de `msg-body` duplicado). Padronizar 1 componente `msg`.
4. **Toast via `style.cssText` inline** → extrair para `css/components.css` + fila de toasts.
5. **Modais**: 3 modais com HTML gigante inline no `index.html` → componentizar em `js/modal/*` + templates.
6. **Acessibilidade**: sem `aria-live` no streaming, sem `label` nos inputs, contraste fraco no tema claro.

## 4. Linguagem própria — VessieLang `.mem` (para conter códigos melhores)

> Especificação completa em `memory/VESSIE-LANG.md` (já existente, mantida).

Resumo operacional usado na reconstrução:

```mem
@memory demo 2.0
@file guia/bolo.txt
texto...
@end
@trigger auto-save-codigo when "```" do save-code
@script ola lang js
return "Olá, " + (input.nome || "mundo") + "!";
@end
@content receitas
texto categorizado
@end
@run js
Memory.putFile("teste.txt", "hello");
@end
```

Parser em `memory/memory-core.js` (partes 1-4) + ZIP puro em `memory/memory-zip.js`. A IA usa blocos no chat:
` ```memory:put:path `, ` ```memory:run `, ` ```memory:trigger:nome|padrao|acao `, ` ```mem `.

## 5. Ordem de criação (obrigatória — selecionada)

1. `docs/REFATORACAO-DIAGNOSTICO.md` (este arquivo — antes de carregar)
2. `memory/VESSIE-LANG.md` (já existe — revisar)
3. `memory/PROMPT-COMPLETO.md` (já existe — revisar)
4. `memory/examples/*.mem` (já existem 5 — validar)
5. `memory/memory-zip.js` (existe, 132 linhas — validar ZIP STORE)
6. `memory/memory-core.js` (existe, 232 linhas — validar fachada + `__raw`)
7. `memory/memory-ui.js` (existe — validar painel)
8. `memory/memory.css` NOVO (extrair estilos do `styles.css` quebrado)
9. Reconstruir `js/*` em ordem: `config → state → storage → security → markdown → api → chat → conversations → settings → ui → router → streaming → app`
10. Reescrever `index.html` enxuto + nova `css/` + validar tudo via `node --check`
