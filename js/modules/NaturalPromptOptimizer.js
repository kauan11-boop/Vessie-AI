// NaturalPromptOptimizer.js - Context-aware system prompt optimization

export const NaturalPromptOptimizer = {
  generateSystemPrompt(conversationHistory, lastUserMessage) {
    if (!conversationHistory.length && !lastUserMessage) {
      return settings.system || "Você é a Vessie-AI, uma assistente útil que responde em português brasileiro.";
    }

    const recent = conversationHistory.slice(-5).map(m => {
      const role = m.role === "user" ? "Usuário" : "Assistente";
      return ${role}: ;
    }).join(String.fromCharCode(10));

    let systemPrompt = settings.system || "Você é a Vessie-AI, uma assistente útil que responde em português brasileiro.";

    if (recent) {
      systemPrompt += String.fromCharCode(10).repeat(2) + "Contexto da conversa recente:" + String.fromCharCode(10) + recent + String.fromCharCode(10);
    }

    const lastMsgLower = (lastUserMessage || "").toLowerCase();

    if (lastMsgLower.includes("código") || lastMsgLower.includes("program") || lastMsgLower.includes("function") || lastMsgLower.includes("python") || lastMsgLower.includes("javascript") || lastMsgLower.includes("html") || lastMsgLower.includes("css")) {
      systemPrompt += String.fromCharCode(10) + "--- Instruções especiais ---" + String.fromCharCode(10) + "Responda em português brasileiro. Se for necessário, forneça exemplos de código em blocos de código markdown com linguagem especificada (ex: `python). Seja preciso e direto.";
    }

    if (lastMsgLower.includes("traduz") || lastMsgLower.includes("translation") || lastMsgLower.includes("inglês") || lastMsgLower.includes("ingles")) {
      systemPrompt += String.fromCharCode(10) + "--- Instruções de tradução ---" + String.fromCharCode(10) + "Responda primeiro em português brasileiro, e caso o usuário peça tradução para o inglês, forneça a versão em inglês após a resposta em português.";
    }

    if (lastMsgLower.includes("markdown") || lastMsgLower.includes("formata") || lastMsgLower.includes("formato")) {
      systemPrompt += String.fromCharCode(10) + "--- Instruções de formatação ---" + String.fromCharCode(10) + "Use markdown para formatação de texto. Use **negrito** para ênfase, *itálico* para itens destacados, e blocos de código ` para código.";
    }

    systemPrompt += String.fromCharCode(10) + "--- Padrão geral ---" + String.fromCharCode(10) + "Seja útil, educado e responda sempre em português brasileiro a menos que o usuário peça outro idioma. Use formatação markdown quando relevante.";

    return systemPrompt;
  }
};

export { NaturalPromptOptimizer };