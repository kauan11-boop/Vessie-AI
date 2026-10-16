# Vessie AI Chat - Chatbot Local para GitHub Pages

> Chatbot 100% local, privado, conectado ao LM Studio. Funciona 100% no navegador via ES Modules.

---

## Visao Geral

Sistema de chat local que se conecta a um servidor LM Studio (API OpenAI-compatible) e permite conversar com modelos de linguagem rodando localmente. Nada sai do dispositivo - a comunicacao acontece diretamente via HTTP/SSE no navegador.

- Segredo: 100% frontend, nenhum backend
- Compatibilidade: Navegadores modernos (ES Module suporte)
- Deploy: GitHub Pages (ou npx serve . local)
- Idioma: Português Brasileiro

## Arquitetura

BASE_DIR: chat_shadow

- index.html - Ponto de entrada
- css/ - Estilos
- js/ - Lógica em módulos ES
  - core/ - Inicialização
  - config/ - Configurações
  - state/ - Estado global padronizado
  - storage/ - Persistência
  - api/ - Conexão LM Studio
  - chat/ - Lógica de chat
  - sidebar/ - Lista de conversas
  - modal/ - Modais
  - agent/ - Agents
  - image/ - Geração de imagens
  - modules/ - Módulos reutilizáveis
  - settings/ - Configurações do usuário
  - ui/ - Utilitários
