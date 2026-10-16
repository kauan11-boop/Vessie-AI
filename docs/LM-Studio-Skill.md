# Skill LM-Studio (Documentação Interna)

> Esta skill documenta o protocolo de integração com LM Studio no Vessie AI Chat.

---

## 1. Visão Geral

O Vessie AI Chat é um chatbot frontend 100% local que se conecta a um servidor **LM Studio** via API REST OpenAI-compatible. A comunicação ocorre no navegador via `fetch` e `EventSource` (SSE streaming).

**Arquitetura:** Sem backend algum. Tudo roda no client. Dados salvos em `localStorage`.

---

## 2. Protocolo de Conexão

### Endpoints

| Método | Path                  | Descrição                    |
|--------|-----------------------|------------------------------|
| GET    | `/v1/models`          | Lista modelos disponíveis    |
| POST   | `/v1/chat/completions`| Enviar mensagem (não stream) |
| GET    | `/v1/chat/completions`| SSE stream (stream: true)    |

### Configuração padrão

```js
baseUrl: "http://localhost:1234/v1"
apiKey: "lm-studio"       // LM Studio aceita qualquer string
model: ""                 // vazio = auto-select first available
timeout: 120              // segundos
stream: true
```

### Fluxo de conexão

1. Usuário preenche `baseUrl` no modal de configurações
2. Clica "Salvar & Conectar"
3. `Settings.save()` → `checkConnection()`
4. `api('/models')` → verifica se o servidor responde
5. `allModels` preenchido com a lista de modelos
6. Se não há modelo selecionado, o primeiro modelo disponível é auto-selecionado
7. Badge de conexão atualizado: `Conectado` ou `Desconectado`

---

## 3. Streaming SSE

### Formato

```
data: {"id":"...", "model":"...", "object":"chat.completion.chunk", "choices":[{"index":0,"delta":{"content":"Olá"}}]}
data: {"id":"...", "model":"...", "object":"chat.completion.chunk", "choices":[{"index":0,"delta":{},"finish_reason":null}]}
data: [DONE]
```

### Processamento no código

```js
const reader = r.body.getReader();
const dec = new TextDecoder();
let buf = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop(); // último fragmento pode ser incompleto

  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (data === "[DONE]") continue;
    const j = JSON.parse(data);
    const delta = j.choices?.[0]?.delta?.content || "";
    if (delta) { appendToUI(delta); }
  }
}
```

### Cancelamento

```js
abortCtrl.abort();  // para o fetch/SSE
stopFlag = true;     // flag interna para parar loop
```

---

## 4. Testes de Conexão

### Roteiro manual (para documentação do usuário)

1. Abra o **LM Studio**
2. Vá em **Local Server** (ícone `</>`)
3. Selecione o modelo → **Start Server**
4. Ative **Serve on Local Network** e **Enable CORS**
5. Padrão: porta `1234`
6. No site: preencha `http://localhost:1234/v1`
7. Clique **Salvar & Conectar**
8. O modelo deve aparecer no seletor

### Possíveis erros

| Erro                                   | Causa                          | Solução                        |
|----------------------------------------|--------------------------------|--------------------------------|
| "Desconectado" persistente             | Servidor não está rodando      | Verificar LM Studio            |
| "CORS blocked" (HTTPS)                 | Mixed-content policy           | Usar ngrok / npx serve         |
| "HTTP 404"                             | URL errada                     | Verificar porta e base URL     |
| "HTTP 429"                             | Rate limit                     | Aumentar timeout ou pausar     |
| "Servidor ok, sem modelo"              | Nenhum modelo carregado        | Carregar modelo no LM Studio   |

---

## 5. Segurança e Limitações

- **No GitHub Pages (HTTPS)** → requer tunnel HTTPS (ngrok, cloudflared) para acessar `http://localhost`
- **Chave de API**: `lm-studio` (LM Studio aceita qualquer string)
- **Nenhum dado é enviado a terceiros** (API externa)
- **localStorage** é usado para persistência de configurações e conversas
- **XSS prevention**: `sanitizeMarkdown()` converte markdown para HTML seguro

---

## 6. Novos Módulos Sugeridos

| Módulo                   | Descrição                          | Prioridade |
|--------------------------|------------------------------------|------------|
| `js/modules/ClipboardFallback.js` | Fallback para `navigator.clipboard` | Alta      |
| `js/modules/LazyImageLoader.js`   | Lazy load de imagens               | Média     |
| `js/modules/MessageSearch.js`     | Busca em conversas                 | Média     |
| `js/modules/DraftManager.js`      | Reenvio de mensagens                | Média     |
| `js/modules/IdleManager.js`       | Timeout quando inativo             | Baixa     |
| `js/modules/ResourcePreloader.js` | Pré-carga de recursos              | Baixa     |
| `js/modules/Telemetry.js`         | Métricas opcionais                 | Baixa     |
| `js/modules/PWAManager.js`        | Service worker e PWA               | Baixa     |
| `js/modules/ErrorRecovery.js`     | Retry com backoff                  | Média     |
| `js/modules/ConnectionQuality.js` | Indicador de qualidade de rede     | Baixa     |

---

## 7. Troubleshooting

### Modelo não aparece no seletor

1. Verifique se o servidor LM Studio está rodando
2. Clique no botão 🠒 (update) para recarregar modelos
3. Refresque a página

### Imagem não gera

1. Verifique se a API Pollinations está disponível
2. O prompt de imagem deve começar com `/imagine` ou "crie uma imagem"
3. O modelo deve ser um modelo de texto (não é estritamente necessário para imagem)

### Voz não funciona

1. Verifique se o Web Speech API está disponível
2. Navegadores Chrome/Edge e Firefox suportam; Safari tem limitações
3. O sistema operacional deve ter voz PT-BR instalada
