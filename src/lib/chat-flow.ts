// Vessie AI — orquestração do chat (envio → streaming → pós-processamento)
// Implementa B.3.1–B.3.4 do Prompt Master: SSE, [FIM], imagens da IA (corrige D5),
// blocos especiais, auto-registros, título automático, OFFLINE honesto, segundo plano (corrige D30).
import { toast } from "sonner";
import {
  useChat, chatActions, useSettings, useUi, useStream, useAgents, isGenerating,
} from "./store";
import type { Message, Lang, Conversation } from "./types";
import { chatCompletions, autoTitle } from "./ai";
import type { WireMessage } from "./ai";
import {
  handleAiText, autoSaveCodeBlocks, autoCreateSkill, autoRegisterAPIs,
  contextInventory, raw as memoryRaw,
} from "./memory";
import {
  extractImagePrompt, isImageIntent, buildImageUrl, toImageResult,
  enhancePromptLocally, extractImageBlocks, stripImageBlocks, newSeed,
} from "./image";
import { Simulite } from "./simulite";
import { autoCorrect } from "./spelling";
import { speak } from "./voice";
import { packChatZip } from "./pack";
import { t } from "./i18n";
import { vfs } from "./dsbox/vfs";
import { useDsbox } from "./dsbox/store";
import { parseToolBlocks, execTool, toolsSystemDoc, buildIsoSessionPrompt } from "./dsbox/tools";

/** Rodadas consecutivas de ferramentas por conversa (guard do loop agêntico). */
const toolRounds = new Map<string, number>();

function settings() { return useSettings.getState().settings; }
function lang(): Lang { return useSettings.getState().settings.language; }
function msg(text: string) { toast(text); }

function newMessage(partial: Partial<Message>): Message {
  return {
    id: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    content: "",
    createdAt: Date.now(),
    ...partial,
  };
}

function activeAgent() {
  return useAgents.getState().agents.find(a => a.active) ?? null;
}

/** System prompt montado: prompt padrão + Memory + inventário + DS-BOX/DCS + árvore do projeto. */
function buildSystemPrompt(): string {
  const s = settings();
  const mem = memoryRaw();
  let sys = s.systemPrompt;
  const memEmpty =
    Object.keys(mem.files).length === 0 &&
    Object.keys(mem.scripts).length === 0 &&
    Object.keys(mem.triggers).length === 0;
  if (!memEmpty) {
    sys += "\n\nVocê tem acesso ao Memory (pasta virtual).\n" +
      "Para SALVAR: responda com ```memory:put:nome/do/arquivo.txt <conteúdo> ```\n" +
      "Para EXECUTAR JS: responda com ```memory:run <código JS> ```\n" +
      "Para CRIAR TRIGGER: ```memory:trigger:nome|padrão|script ```\n" +
      "O site intercepta esses blocos, executa e mostra o resultado no chat.\n" +
      "Nunca invente que salvou — só após o bloco o sistema confirma.";
    const inv = contextInventory(8000);
    if (inv) sys += `\n\n${inv}`;
  }

  // Dynamic Creation System: ferramentas + auto-envio da arquitetura de diretórios
  const ds = useDsbox.getState();
  if (ds.dcs) {
    sys += "\n\n" + toolsSystemDoc();
    const st = vfs.stats();
    if (st.files > 0) {
      sys += "\n\n### Projeto atual no VFS (arquitetura auto-enviada)\n" +
        `${st.files} arquivo(s), ${st.bytes} bytes. Árvore:\n\`\`\`\n${vfs.tree()}\n\`\`\``;
    } else {
      sys += "\n\n(O VFS está vazio — crie arquivos com ds:write quando fizer sentido.)";
    }
    if (ds.buildMode) {
      sys += "\n\n" + buildIsoSessionPrompt();
    }
  }
  return sys;
}

function wireFrom(conv: Conversation, systemOverride?: string, temperatureOverride?: number): { wire: WireMessage[]; temperature?: number } {
  return {
    wire: [
      { role: "system", content: systemOverride ?? buildSystemPrompt() },
      ...conv.messages.map(m => ({ role: m.role, content: m.content })),
    ],
    temperature: temperatureOverride,
  };
}

let abortCtrl: AbortController | null = null;

// ---------- fluxo principal ----------
export async function sendMessage(rawText: string): Promise<void> {
  if (isGenerating()) { toast(t(lang(), "waitFinish")); return; }
  const s = settings();
  let text = rawText.trim();
  if (!text) return;
  if (s.spellcheck) text = autoCorrect(text);

  const convId = chatActions.ensureConversation();
  Simulite.touch();
  toolRounds.set(convId, 0); // nova rodada do usuário zera o loop agêntico

  // mensagem do usuário
  chatActions.addMessage(convId, newMessage({ role: "user", content: text }));

  // 1) blocos especiais do usuário (memory:*, mem, sys:*, ds:*) — intercepta antes do LM
  const packMatch = /```pack:([^\n]+)```/.exec(text);
  if (packMatch) {
    await packChatZip(convId, packMatch[1].trim());
    return;
  }
  if (/```ds:[a-z]/.test(text)) {
    await runUserTools(convId, text);
    return;
  }
  if (/```(memory:|mem\b|sys:)/.test(text)) {
    const ai = await handleAiText(text);
    if (ai.handled) {
      chatActions.addMessage(convId, newMessage({
        content: ai.results.map(r => `- ${r.label}`).join("\n"),
        meta: { model: "memory" },
      }));
      toast("💾 Memory atualizado");
      return;
    }
  }

  // 2) intenção de imagem
  const imgPrompt = extractImagePrompt(text) ?? (isImageIntent(text) ? text : null);
  if (imgPrompt) {
    await generateImageMessage(convId, imgPrompt);
    return;
  }

  // 3) modelo OFFLINE → Simulite
  if (s.model === "OFFLINE") {
    await offlineReply(convId, text, false);
    return;
  }

  // 4) LM Studio / provider
  await generateResponse(convId);
}

async function offlineReply(convId: string, text: string, dropped: boolean): Promise<void> {
  const reply = Simulite.reply(text);
  if (!reply) {
    chatActions.addMessage(convId, newMessage({
      content: t(lang(), "offlineNoData"),
      meta: { model: "OFFLINE", noInfo: true },
    }));
    Simulite.noteOfflineReply();
    return;
  }
  chatActions.addMessage(convId, newMessage({
    content: reply,
    meta: { model: "OFFLINE" },
  }));
  Simulite.noteOfflineReply();
  if (dropped) toast(t(lang(), "offlineDropped"));
}

// ---------- DS-TOOLS: execução de blocos ds:* ----------
interface ToolOutcome { kind: string; target?: string; ok: boolean; label: string; detail: string }

async function runToolBlocks(convId: string, content: string): Promise<ToolOutcome[]> {
  const calls = parseToolBlocks(content);
  const outcomes: ToolOutcome[] = [];
  for (const call of calls) {
    const r = await execTool(call, convId);
    outcomes.push({ kind: call.kind, target: call.target, ok: r.ok, label: r.label, detail: r.detail ?? "" });
  }
  return outcomes;
}

function formatOutcomes(outcomes: ToolOutcome[]): string {
  const lines = outcomes.map(o => `${o.ok ? "OK" : "ERRO"} · ds:${o.kind}${o.target ? `:${o.target}` : ""} → ${o.label}\n${o.detail}`);
  return ["⚙ **DS-TOOLS** — resultado da execução local:\n", ...lines.map(l => "---\n" + l), "\n(Árvore do projeto atualizada — continue quando necessário.)"].join("\n");
}

/** Ferramentas digitadas manualmente pelo usuário (```ds:…```) — sem modelo envolvido. */
async function runUserTools(convId: string, text: string): Promise<void> {
  const outcomes = await runToolBlocks(convId, text);
  chatActions.addMessage(convId, newMessage({
    content: formatOutcomes(outcomes),
    meta: { model: "ds-tools" },
  }));
}

/** Pipeline pós-resposta: extrai ds:* da resposta da IA, executa, publica resultados e (DCS) continua o loop. */
async function runAiToolPipeline(convId: string, aiContent: string): Promise<void> {
  const outcomes = await runToolBlocks(convId, aiContent);
  if (outcomes.length === 0) return;

  chatActions.addMessage(convId, newMessage({
    content: formatOutcomes(outcomes),
    meta: { model: "ds-tools" },
  }));
  outcomes.filter(o => o.ok).forEach(o => toast(o.label));

  // loop agêntico: o modelo recebe os resultados e continua (máx. 3 rodadas)
  const ds = useDsbox.getState();
  const rounds = (toolRounds.get(convId) ?? 0) + 1;
  toolRounds.set(convId, rounds);
  if (ds.dcs && ds.autoLoop && rounds <= 3 && !isGenerating()) {
    await generateResponse(convId);
  }
}

async function generateImageMessage(convId: string, prompt: string): Promise<void> {
  const s = settings();
  toast(t(lang(), "enhancing"));
  let finalPrompt = prompt;
  if (s.model && s.model !== "OFFLINE") {
    try {
      const r = await chatCompletions(s, [
        { role: "system", content: "You are a prompt engineer. Translate and enhance the user's image idea into ONE English prompt. Reply with the prompt only, no quotes, no explanations. Keep it under 60 words." },
        { role: "user", content: prompt },
      ], { stream: false, maxTokens: 300, temperature: 0.7 });
      if (r.content.trim()) finalPrompt = r.content.trim();
    } catch {
      finalPrompt = enhancePromptLocally(prompt);
    }
  } else {
    finalPrompt = enhancePromptLocally(prompt);
  }
  toast(t(lang(), "imgGenerating"));
  const seed = newSeed();
  const url = buildImageUrl(finalPrompt, s.image.size, s.image.model, seed);
  chatActions.addMessage(convId, newMessage({
    content: `🖼️ **${prompt}**`,
    image: toImageResult(finalPrompt, url, s.image.size, s.image.model, seed),
  }));
}

async function generateResponse(convId: string): Promise<void> {
  const s = settings();
  const agent = activeAgent();
  if (agent) useUi.getState().setAgentStatus("busy");
  const conv = useChat.getState().conversations.find(c => c.id === convId);
  if (!conv) return;

  // mensagem assistant vazia — streaming em segundo plano (corrige D30)
  const asst = newMessage({ role: "assistant", content: "" });
  chatActions.addMessage(convId, asst);
  useStream.getState().begin({ convId, msgId: asst.id, content: "", thinking: "", phase: "streaming" });

  const { wire, temperature } = wireFrom(conv, undefined, agent ? agent.temp : undefined);
  abortCtrl = new AbortController();

  try {
    const r = await chatCompletions(s, wire, {
      stream: s.stream,
      signal: abortCtrl.signal,
      onToken: (delta, full, extra) => useStream.getState().update({ content: full, thinking: extra.thinking ?? "" }),
      onThinking: th => useStream.getState().update({ thinking: th }),
      temperature,
    });
    await commitAssistant(convId, asst.id, r.content, r.thinking, false, abortCtrl.signal.aborted);
  } catch (e) {
    const err = e as Error;
    const aborted = err.name === "AbortError" || abortCtrl.signal.aborted;
    const partial = useStream.getState().live?.content ?? "";
    if (partial) {
      await commitAssistant(convId, asst.id, partial, useStream.getState().live?.thinking ?? "", true, true);
      if (aborted) toast(t(lang(), "cancelled"));
    } else {
      // remove bolha vazia e cai para OFFLINE
      chatActions.deleteMessage(convId, asst.id);
      useStream.getState().finish();
      toast(t(lang(), "offlineAssumed"));
      const lastUser = useChat.getState().conversations.find(c => c.id === convId)
        ?.messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";
      await offlineReply(convId, lastUser, true);
    }
  } finally {
    useStream.getState().finish();
    abortCtrl = null;
    if (agent) useUi.getState().setAgentStatus("done");
  }
}

/** Pós-processamento completo da resposta (B.3.1 / B.3.3). */
async function commitAssistant(
  convId: string, msgId: string, content: string, thinking: string,
  interruptedOnly = false, aborted = false
): Promise<void> {
  const s = settings();
  const hasEnd = /\[FIM\]/.test(content) && !interruptedOnly && !aborted;
  let clean = stripImageBlocks(content).replace(/\[FIM\]/g, "").trimEnd();
  const imgs = extractImageBlocks(content);
  const patches: Partial<Message> = { content: clean, thinking: thinking?.slice(0, 4000), finished: hasEnd };
  if (imgs.length > 0) {
    const mk = (p: string) => {
      const seed = newSeed();
      return toImageResult(p, buildImageUrl(p, s.image.size, s.image.model, seed), s.image.size, s.image.model, seed);
    };
    if (imgs.length === 1) patches.imageBlock = mk(imgs[0]);
    else patches.imageBlocks = imgs.map(mk);
  }
  chatActions.updateMessage(convId, msgId, patches);
  useStream.getState().update({ content: clean, thinking: patches.thinking ?? "" });

  // memória: blocos da IA + auto-registros
  try {
    const ai = await handleAiText(content);
    ai.results.forEach(r => { if (r.ok) toast(r.label); });
    const saved = autoSaveCodeBlocks(content);
    const skill = autoCreateSkill(clean);
    const apis = autoRegisterAPIs(content);
    if (saved || skill || apis) {
      const bits: string[] = [];
      if (saved) bits.push(`💾 ${saved} script(s)`);
      if (skill) bits.push(`🧠 skill "${skill}"`);
      if (apis) bits.push(`🌐 ${apis} api(s)`);
      toast(bits.join(" + ") + " salvo(s) no Memory");
    }
  } catch { /* memória não bloqueia o chat */ }

  // aprendizado Simulite
  try {
    Simulite.learnFromChat(useChat.getState().conversations);
    Simulite.trainBurst(3);
  } catch { /* noop */ }
  // título automático
  const conv = useChat.getState().conversations.find(c => c.id === convId);
  if (conv && conv.title === "Nova conversa") {
    const firstUser = conv.messages.find(m => m.role === "user")?.content ?? "";
    const title = await autoTitle(settings(), firstUser);
    chatActions.renameChat(convId, title);
  }

  // TTS
  if (s.voice.enabled) {
    speak(clean.replace(/```[\s\S]*?```/g, " bloco de código "), { rate: s.voice.rate, pitch: s.voice.pitch });
  }

  if (!hasEnd && !interruptedOnly && !aborted) toast(t(lang(), "noEndMark"));

  // DS-TOOLS: blocos ds:* da IA (após tudo — pode disparar o loop agêntico)
  if (!aborted) {
    try {
      await runAiToolPipeline(convId, content);
    } catch { /* falha de ferramentas não bloqueia o chat */ }
  }
}

// ---------- continuar ----------
export async function continueResponse(convId: string, msgId: string): Promise<void> {
  if (isGenerating()) { toast(t(lang(), "waitFinish")); return; }
  const s = settings();
  const conv = useChat.getState().conversations.find(c => c.id === convId);
  const target = conv?.messages.find(m => m.id === msgId);
  if (!conv || !target) return;

  useStream.getState().begin({ convId, msgId, content: target.content, thinking: target.thinking ?? "", phase: "continuing" });
  const { wire } = wireFrom(conv,
    `${buildSystemPrompt()}\n\nCONTINUE a resposta do assistente exatamente de onde parou. Não repita nada do que já foi escrito. Não escreva introduções.`);
  abortCtrl = new AbortController();
  try {
    const r = await chatCompletions(s, wire, {
      stream: s.stream, signal: abortCtrl.signal,
      onToken: (delta, full) => useStream.getState().update({ content: target.content + full }),
    });
    if (!r.content.trim()) {
      toast(t(lang(), "noContinuation"));
      return;
    }
    const hasEnd = /\[FIM\]/.test(r.content);
    chatActions.appendToMessage(convId, msgId, "\n" + r.content.replace(/\[FIM\]/g, "").trim(), { finished: hasEnd });
    toast(hasEnd ? t(lang(), "contInterrupted") : t(lang(), "stillNoEnd"));
  } catch (e) {
    const err = e as Error;
    if (err.name === "AbortError") toast(t(lang(), "cancelled"));
    else toast(t(lang(), "offlineDropped"));
  } finally {
    useStream.getState().finish();
    abortCtrl = null;
  }
}

// ---------- editar / reenviar / recriar / excluir ----------
export async function editAndResend(convId: string, msgId: string, newText: string): Promise<void> {
  chatActions.updateMessage(convId, msgId, { content: newText });
  chatActions.truncateAfter(convId, msgId, false); // remove tudo depois da editada
  await generateResponse(convId);
}

export async function resendMessage(convId: string, msgId: string): Promise<void> {
  chatActions.truncateAfter(convId, msgId, false);
  await generateResponse(convId);
}

export async function regenerateFrom(convId: string, msgId: string): Promise<void> {
  chatActions.truncateAfter(convId, msgId, true); // corta a resposta assistant e regera
  await generateResponse(convId);
}

export async function deleteMsg(convId: string, msgId: string): Promise<void> {
  chatActions.deleteMessage(convId, msgId);
  toast(t(lang(), "msgDeleted"));
}

export function cancelGeneration(): void {
  abortCtrl?.abort();
  toast(t(lang(), "cancelled"));
}
