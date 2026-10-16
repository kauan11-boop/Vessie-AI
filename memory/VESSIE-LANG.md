# 🧬 VessieLang — Linguagem Própria do Memory v2.0

> Linguagem declarativa para conter códigos melhores: 1 arquivo `.mem` descreve arquivos + triggers + scripts + conteúdos reutilizáveis.
> Extensão: `.mem` | MIME: `text/vnd.vessie-mem` | Codificação: UTF-8 sem BOM

---

## 1. Por que existe

JavaScript puro espalha lógica em 8 arquivos quebrados (caso atual de `memory/*.js` com chaves faltando e templates cortados).
VessieLang centraliza em **1 bloco legível pela IA e executável pelo site**.

## 2. Sintaxe (EBNF simplificada)

```ebnf
mem      ::= header section+
header   ::= "@memory" ident version
section  ::= fileSec | triggerSec | scriptSec | contentSec | runSec
fileSec  ::= "@file" path newline fileBody "@end"
triggerSec ::= "@trigger" name "when" stringLit "do" actionLit
scriptSec  ::= "@script" name "lang" langName newline code "@end"
contentSec ::= "@content" category newline text "@end"
runSec     ::= "@run" ("js"|"mem") newline code "@end"
```

## 3. Exemplo completo

```mem
@memory demo 2.0

@file guia/bolo.txt
Bolo de cenoura:
- 3 cenouras
- 2 xícaras de açúcar
@end

@trigger auto-save-codigo when "```" do save-code

@script ola lang js
return "Olá, " + (input.nome || "mundo") + "!";
@end

@content receitas
Bolo de cenoura — categoria doces
@end

@run js
Memory.putFile("teste.txt", "hello");
@end
```

## 4. Tabela de comandos @

| Comando | O que faz | Exemplo |
|---|---|---|
| `@memory nome versão` | cabeçalho obrigatório | `@memory demo 2.0` |
| `@file path ... @end` | salva arquivo na pasta virtual | `@file a/b.txt` |
| `@trigger nome when "padrão" do ação` | cria gatilho | `@trigger t when "salve" do save` |
| `@script nome lang js\|mem ... @end` | salva script reutilizável | `@script soma lang js` |
| `@content categoria ... @end` | salva conteúdo categorizado | `@content ideias` |
| `@run js\|mem ... @end` | executa na hora no console | `@run js` |
| `@end` | fecha bloco | `@end` |

## 5. Ações de trigger permitidas

`save` · `save-code` · `notify` · `run:nomedoscript` · `append:arquivo.txt`

## 6. Regras de segurança (obrigatórias para o parser)

1. `@file` não pode conter `..` nem começar com `/`
2. `@run js` roda em sandbox (sem `fetch`, `XMLHttpRequest`, `eval`, `Function`, `document.write`, `location`)
3. Tamanho máximo de 1 `.mem`: 500 KB
4. Parser deve ignorar linhas `// comentário` e `# comentário` fora de blocos

## 7. Ordem de execução do parser

1. Ler cabeçalho → valida versão
2. Para cada seção na ordem do arquivo → valida → executa
3. `@run` só executa após todos `@file/@script/@trigger/@content` terem sido salvos
4. Retorna relatório `{ files:[], triggers:[], scripts:[], contents:[], runs:[] }`
