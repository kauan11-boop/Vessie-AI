import { chatOnce } from "./aiClient.js";
import { buildPromptRefinementMessages } from "./systemPrompts.js";

export async function enhanceTaskPrompt({ request, mode, context, history, signal }) {
  const messages = buildPromptRefinementMessages({ request, mode, context, history });
  const refinement = (await chatOnce(messages, signal)).trim();
  if (!refinement) throw new Error("O modelo não devolveu uma versão aprimorada do pedido. Tente novamente.");
  return `Pedido original do usuário:\n${request}\n\nInstrução aprimorada pelo modelo configurado:\n${refinement}`;
}
