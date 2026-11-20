// Vessie AI — orquestração do chat (envio → streaming → pós-processamento)
// Implementa B.3.1–B.3.4 do Prompt Master: SSE, [FIM], imagens da IA (corrige D5),
// blocos especiais, auto-registros, título automático, OFFLINE honesto, segundo plano (corrige D30).
// Este módulo também roda: Sub-Agents (mascote variável), loop agêntico permanente,
// auto-continue em parada antecipada, /agent · /agents · /discord e watcher de problemas.
import { toast } from "sonner";
import {
  useChat, chatActions, useSettings, useUi, useStream, useAgents, isGenerating,
  agentActions,
} from "./store";
import type { Message, Lang, Conversation, Agent } from "./types";
import { chatCompletions, autoTitle } from "./ai";
import type { WireMessage } from "./ai";
import {
  handleAiText, autoSaveCodeBlocks, autoCreateSkill, autoRegisterAPIs,
} from "./memory";
import { buildUnifiedSystemPrompt, usePromptMode, getAssistantMode } from "./prompt-mode";
import {
  extractImagePrompt, isImageIntent, buildImageUrl, toImageResult,
  enhancePromptLocally, extractImageBlocks, stripImageBlocks, newSeed,
} from "./image";
import { Simulite } from "./simulite";
import { autoCorrect } from "./spelling";
import { speak, speakNatural } from "./voice";
import { packChatZip } from "./pack";
import { t } from "./i18n";
import { useDsbox, hydrateIsoShelf } from "./dsbox/store";
import { parseToolBlocks, execTool, parseVfsXmlCalls, extractVfsXmlSpans } from "./dsbox/tools";
import { problemMessage } from "./dsbox/terminal";
import { onEmulatorChange } from "./dsbox/emulator";
import { detectVariant } from "./subagents";
import { learnFromExchange, bootstrapFromHistory, personaSummary, resetPersona } from "./persona";
import { isSpam } from "./antispam";
import { isLocalNetworkBlocked } from "./net";
import { showLocalNetworkBlockedHint } from "./local-network-hint";
import {
  discordConfigured, discordRead, discordSend, buildStyleProfile,
  composeStyledReply, startDiscordPolling, stopDiscordPolling, isPolling,
} from "./discord";

/** Rodadas consecutivas de ferramentas por conversa (guard do loop agêntico). */
const toolRounds = new Map<string, number>();

/** Últimas respostas da IA por conversa (para o bloqueio de spam). */
const recentReplies = new Map<string, string[]>();

// Variantes da palavra ISO — "sistema operacional", "distro", "SO"… tudo é ISO.
const ISO_INTENT_RE = /\b(iso|\.iso|sistema operacional|sistema operacion[aá]vel|sistema de disco|imagem de sistema|imagem boot[aá]vel|boot[aá]vel|distro|distribui[cç][ãa]o linux|\bso\b|\bos\b|kernel|compilar sistema|montar sistema)\b/i;

function rememberReply(convId: string, content: string): void {
  const arr = recentReplies.get(convId) ?? [];
  arr.push(content);
  if (arr.length > 6) arr.shift();
  recentReplies.set(convId, arr);
}

/** Remove prosa ao redor de blocos ds:* e tags <vfs_*> — quando a IA usa ferramentas, ela silencia. */
function enforceToolSilence(content: string): string {
  const calls = parseToolBlocks(content);
  const xmlCalls = parseVfsXmlCalls(content);
  if (calls.length === 0 && xmlCalls.length === 0) return content;
  const blocks = content.match(/```ds:[\s\S]*?```/g) ?? [];
  const xmlSpans = extractVfsXmlSpans(content);
  if (blocks.length === 0 && xmlSpans.length === 0) return content;
  return [...blocks, ...xmlSpans].join("\n\n");
}

function settings() { return useSettings.getState().settings; }
function lang(): Lang { return useSettings.getState().settings.language; }

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

/**
 * System prompt ÚNICO — delega ao sistema central de modos (src/lib/prompt-mode.ts):
 * chatbot → apenas 1 chatbot · osdev (DS-BOX ligado) → criação de sistemas operacionais.
 * Todos os fluxos (principal, anti-spam, continuação) passam por aqui.
 */
function buildSystemPrompt(extra?: string): string {
  return buildUnifiedSystemPrompt({ extra });
}

/** Detecção de intenção de ISO com variantes da palavra (sistema operacional, distro, SO…). */
export function isIsoIntent(text: string): boolean {
  return ISO_INTENT_RE.test(text);
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
  if (s.spellcheck && !text.startsWith("/")) text = autoCorrect(text);

  const convId = chatActions.ensureConversation();
  Simulite.touch();
  toolRounds.set(convId, 0); // nova rodada do usuário zera o loop agêntico

  // mensagem do usuário
  chatActions.addMessage(convId, newMessage({ role: "user", content: text }));

  // 0) comandos de barra (agentes / discord)
  if (text.startsWith("/")) {
    await handleSlashCommand(convId, text);
    return;
  }

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

  // 2) intenção de imagem (gera no próprio chat)
  const imgPrompt = extractImagePrompt(text) ?? (isImageIntent(text) ? text : null);
  if (imgPrompt) {
    await generateImageMessage(convId, imgPrompt);
    return;
  }

  // 3) modelo OFFLINE → Vessie Local (Simulite + datasets)
  if (s.model === "OFFLINE") {
    await offlineReply(convId, text, false);
    return;
  }

  // 4) LM Studio / provider
  await generateResponse(convId);
}

// ---------- comandos de barra ----------
async function handleSlashCommand(convId: string, text: string): Promise<void> {
  const [cmd, ...rest] = text.slice(1).split(" ");
  const arg = rest.join(" ").trim();
  const lg = lang();

  if (cmd === "agents") {
    const agents = useAgents.getState().agents;
    const body = agents.length
      ? agents.map(a => `${a.emoji} **${a.name}**${a.active ? " · ativo" : ""} — temp ${a.temp}\n${a.instructions.slice(0, 140)}`).join("\n\n")
      : (lg === "pt-BR" ? "Nenhum agente ainda. Crie com `/agent <descrição>` — a IA monta a persona sozinha." : "No agents yet. Create one with `/agent <description>`.");
    chatActions.addMessage(convId, newMessage({ content: `🤖 **Sub-Agents**\n\n${body}`, meta: { model: "commands" } }));
    return;
  }

  if (cmd === "agent") {
    if (!arg) {
      chatActions.addMessage(convId, newMessage({
        content: lg === "pt-BR"
          ? "Uso: `/agent <descrição>` — ex.: `/agent especialista em ISO minimalista`"
          : "Usage: `/agent <description>` — e.g. `/agent minimal ISO specialist`",
        meta: { model: "commands" },
      }));
      return;
    }
    await createAgentViaAI(convId, arg);
    return;
  }

  if (cmd === "discord") {
    await handleDiscordCommand(convId, arg);
    return;
  }

  // /modo — sistema único de modos (chatbot ↔ criação de sistemas) direto do chat
  if (cmd === "modo" || cmd === "mode") {
    const cur = getAssistantMode();
    const want = arg.toLowerCase();
    let next: "chatbot" | "osdev";
    if (want.startsWith("chat") || want === "chatbot" || want === "puro") next = "chatbot";
    else if (want.startsWith("ds") || want.startsWith("os") || want.startsWith("iso") || want.startsWith("sistema")) next = "osdev";
    else next = cur === "osdev" ? "chatbot" : "osdev";
    usePromptMode.getState().setMode(next);
    chatActions.addMessage(convId, newMessage({
      content: next === "osdev"
        ? "📦 Modo DS-BOX LIGADO — agora eu crio, compilo e executo sistemas operacionais (.iso). Peça: \"monte um sistema completo\"."
        : "💬 Modo CHATBOT ligado — só conversa, sem ferramentas de sistema. Para voltar à criação de ISOs: /modo dsbox (ou botão DS-BOX na barra).",
      meta: { model: "commands" },
    }));
    return;
  }

  if (cmd === "persona") {
    if (arg === "reset" || arg === "limpar") {
      resetPersona();
      chatActions.addMessage(convId, newMessage({
        content: lg === "pt-BR" ? "🧠 Memória adaptativa zerada — começo a aprender de novo do zero." : "🧠 Adaptive memory cleared — learning from scratch again.",
        meta: { model: "commands" },
      }));
      return;
    }
    chatActions.addMessage(convId, newMessage({
      content: personaSummary() + (lg === "pt-BR"
        ? "\n\nEssa memória fica ligada ao system prompt — as respostas vão se adaptando à conversa para sair naturais e humanas. `/persona reset` zera."
        : "\n\nThis memory is wired into the system prompt — replies keep adapting to the conversation for natural, human output. `/persona reset` clears it."),
      meta: { model: "commands" },
    }));
    return;
  }

  // comando desconhecido → segue para o modelo normalmente (pode ser conteúdo)
  await (settings().model === "OFFLINE" ? offlineReply(convId, text, false) : generateResponse(convId));
}

/** /agent <descrição> — o próprio modelo cria a persona, salva e ativa (sem formulário). */
async function createAgentViaAI(convId: string, desc: string): Promise<void> {
  const lg = lang();
  const s = settings();
  let created: Omit<Agent, "id" | "created" | "active"> | null = null;

  if (s.model !== "OFFLINE") {
    try {
      const r = await chatCompletions(s, [
        {
          role: "system",
          content:
            'Você projeta agentes do Vessie-AI. Receberá a descrição de um agente e responderá APENAS com um bloco cercado ```agent:``` contendo JSON válido com as chaves: name (curto), emoji (1 emoji), temp (0–2), instructions (2–6 frases com a persona, estilo e regras do agente em português). Sem texto fora do bloco. Exemplo:\n```agent:{"name":"IsoSmith","emoji":"🔨","temp":0.6,"instructions":"Você é especialista em ISOs minimalistas…"}```',
        },
        { role: "user", content: desc },
      ], { stream: false, maxTokens: 500, temperature: 0.7 });
      const m = /```agent:\s*(\{[\s\S]*?\})\s*```/.exec(r.content);
      if (m) {
        const parsed = JSON.parse(m[1]) as Record<string, unknown>;
        if (typeof parsed.name === "string" && parsed.name.trim()) {
          created = {
            name: parsed.name.trim().slice(0, 40),
            emoji: typeof parsed.emoji === "string" ? parsed.emoji.slice(0, 4) : "🤖",
            temp: typeof parsed.temp === "number" ? Math.min(2, Math.max(0, parsed.temp)) : 0.7,
            instructions: typeof parsed.instructions === "string" ? parsed.instructions.slice(0, 1200) : desc,
          };
        }
      }
    } catch { /* cai no fallback local */ }
  }

  if (!created) {
    // fallback local: persona direto da descrição (honesto — sem fingir modelo)
    created = {
      name: desc.split(/\s+/).slice(0, 3).join(" ").slice(0, 40) || "Agente",
      emoji: "🤖",
      temp: 0.7,
      instructions: desc,
    };
  }

  const id = agentActions.addAgent(created);
  agentActions.activateAgent(id);
  chatActions.addMessage(convId, newMessage({
    content:
      lg === "pt-BR"
        ? `🤖 **Sub-agente criado e ativado: ${created.emoji} ${created.name}**\n\n${created.instructions}\n\nA partir de agora as respostas seguem esta persona (temp ${created.temp}). Use \`/agents\` para listar ou \`/agent <descrição>\` para criar outro.`
        : `🤖 **Sub-agent created and activated: ${created.emoji} ${created.name}**\n\n${created.instructions}\n\nFrom now on replies follow this persona (temp ${created.temp}). Use \`/agents\` to list or \`/agent <description>\` to create another.`,
    meta: { model: "commands" },
  }));
  toast(`${created.emoji} ${created.name}`);
}

/** /discord [read|send <texto>|auto on|auto off|status] */
async function handleDiscordCommand(convId: string, arg: string): Promise<void> {
  const lg = lang();
  const sub = arg.split(" ")[0] ?? "";
  const rest = arg.slice(sub.length).trim();

  const addLocal = (content: string) =>
    chatActions.addMessage(convId, newMessage({ content, meta: { model: "commands" } }));

  if (!discordConfigured() && sub !== "auto") {
    addLocal(lg === "pt-BR"
      ? "🎧 Discord não configurado. Em **Configurações → Discord** escolha o modo **Conta direta** (cole o seu token de conta + ID do canal — sem bot) ou **Bot oficial**. Depois: `/discord read`, `/discord send <texto>`, `/discord auto on`."
      : "🎧 Discord not configured. In **Settings → Discord** choose **Direct account** mode (paste your account token + channel ID — no bot) or **Official bot**. Then: `/discord read`, `/discord send <text>`, `/discord auto on`.");
    return;
  }

  try {
    if (sub === "read") {
      const msgs = await discordRead(15);
      addLocal(`🎧 **Discord (${msgs.length} msg)**\n\n${msgs.map(m => `[${m.author.username}] ${m.content}`).join("\n") || "(vazio)"}`);
      return;
    }
    if (sub === "send" && rest) {
      await discordSend(rest);
      addLocal(lg === "pt-BR" ? `🎧 Enviado: “${rest}”` : `🎧 Sent: “${rest}”`);
      return;
    }
    if (sub === "auto") {
      const on = rest === "on" || (rest !== "off" && !isPolling());
      if (on) {
        startDiscordPolling(info => toast(info.sent ? "🎧 Discord: resposta enviada" : `🎧 Discord: ${info.reason ?? "sem resposta"}`));
      } else {
        stopDiscordPolling();
      }
      addLocal(lg === "pt-BR"
        ? `🎧 Modo automático ${on ? "LIGADO — monitoro o canal e respondo no seu estilo" : "desligado"}.`
        : `🎧 Auto mode ${on ? "ON — I watch the channel and reply in your style" : "off"}.`);
      return;
    }
    // status / resumo
    const msgs = await discordRead(10);
    const profile = buildStyleProfile(
      useChat.getState().conversations.flatMap(c => c.messages).filter(m => m.role === "user").map(m => m.content),
    );
    addLocal([
      `🎧 **Discord** — ${msgs.length} msg recentes, ${isPolling() ? "auto ON" : "auto OFF"}`,
      "",
      profile.card || (lg === "pt-BR" ? "Perfil de estilo ainda vazio — converse mais no chat para eu aprender seu jeito de falar." : "Style profile empty — chat more so I learn your style."),
    ].join("\n"));
  } catch (e) {
    addLocal(`🎧 ${(e as Error).message}`);
  }
}

// ---------- OFFLINE (Vessie Local) ----------
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
  // aceita os DOIS formatos do protocolo: blocos ds:* e tags XML <vfs_*>
  const calls = [...parseToolBlocks(content), ...parseVfsXmlCalls(content)];
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
  outcomes.filter(o => o.ok).forEach(o => toast(o.label));
}

/** Pipeline pós-resposta: extrai ds:* da resposta da IA, executa e publica resultados.
 *  Retorna os kinds executados (para o sub-agent) e se o modelo deve continuar. */
async function runAiToolPipeline(convId: string, aiContent: string): Promise<{ kinds: string[]; moreWork: boolean }> {
  const outcomes = await runToolBlocks(convId, aiContent);
  if (outcomes.length === 0) return { kinds: [], moreWork: false };

  chatActions.addMessage(convId, newMessage({
    content: formatOutcomes(outcomes),
    meta: { model: "ds-tools" },
  }));
  outcomes.filter(o => o.ok).forEach(o => toast(o.label));

  // loop agêntico: o modelo recebe os resultados e continua (máx. 3 rodadas)
  const rounds = (toolRounds.get(convId) ?? 0) + 1;
  toolRounds.set(convId, rounds);
  const ds = useDsbox.getState();
  const moreWork = ds.autoLoop && rounds <= 3;
  return { kinds: outcomes.map(o => o.kind), moreWork };
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
  let loopAgain = false;

  try {
    const r = await chatCompletions(s, wire, {
      stream: s.stream,
      signal: abortCtrl.signal,
      onToken: (delta, full, extra) => useStream.getState().update({ content: full, thinking: extra.thinking ?? "" }),
      onThinking: th => useStream.getState().update({ thinking: th }),
      temperature,
    });
    loopAgain = await commitAssistant(convId, asst.id, r.content, r.thinking, false, abortCtrl.signal.aborted);
  } catch (e) {
    const err = e as Error;
    const aborted = err.name === "AbortError" || abortCtrl.signal.aborted;
    const partial = useStream.getState().live?.content ?? "";
    if (partial) {
      await commitAssistant(convId, asst.id, partial, useStream.getState().live?.thinking ?? "", true, true);
      if (aborted) toast(t(lang(), "cancelled"));
    } else if (!aborted && isLocalNetworkBlocked(e)) {
      // bloqueio determinístico do navegador (HTTPS público → servidor local):
      // o retry não resolve — orienta uma vez e cai para OFFLINE (Simulite)
      chatActions.deleteMessage(convId, asst.id);
      showLocalNetworkBlockedHint(lang());
      const lastUser = useChat.getState().conversations.find(c => c.id === convId)
        ?.messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";
      await offlineReply(convId, lastUser, true);
    } else if (!aborted) {
      // retry único em falha de rede (sub-agent corrige o envio automaticamente)
      try {
        const retryCtrl = new AbortController();
        abortCtrl = retryCtrl;
        const r = await chatCompletions(s, wire, {
          stream: false,
          signal: retryCtrl.signal,
          temperature,
        });
        loopAgain = await commitAssistant(convId, asst.id, r.content, r.thinking, false, false);
        toast("🔁 Sub-Agent reenviou a requisição com sucesso");
      } catch {
        // remove bolha vazia e cai para OFFLINE
        chatActions.deleteMessage(convId, asst.id);
        toast(t(lang(), "offlineAssumed"));
        const lastUser = useChat.getState().conversations.find(c => c.id === convId)
          ?.messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";
        await offlineReply(convId, lastUser, true);
      }
    } else {
      chatActions.deleteMessage(convId, asst.id);
      toast(t(lang(), "cancelled"));
    }
  } finally {
    useStream.getState().finish();
    abortCtrl = null;
    if (agent) useUi.getState().setAgentStatus("done");
  }

  // loop agêntico AGORA funciona: roda após o finish() do stream
  if (loopAgain && !isGenerating()) {
    await generateResponse(convId);
  }
}

/** Pós-processamento completo da resposta (B.3.1 / B.3.3).
 *  Retorna true quando o loop agêntico deve alimentar o modelo de novo. */
async function commitAssistant(
  convId: string, msgId: string, content: string, thinking: string,
  interruptedOnly = false, aborted = false
): Promise<boolean> {
  const s = settings();
  const agent = activeAgent();
  const hasEnd = /\[FIM\]/.test(content) && !interruptedOnly && !aborted;
  // silêncio: se a resposta contém blocos ds:*, sobra só os blocos (sem prosa)
  let clean = enforceToolSilence(stripImageBlocks(content)).replace(/\[FIM\]/g, "").trimEnd();
  const imgs = extractImageBlocks(content);
  const toolKinds = [...parseToolBlocks(content).map(c => c.kind), ...parseVfsXmlCalls(content).map(c => c.kind)];
  const variant = detectVariant(content, toolKinds, agent?.instructions);
  const patches: Partial<Message> = {
    content: clean,
    thinking: thinking?.slice(0, 4000),
    finished: hasEnd,
    meta: { model: s.model === "OFFLINE" ? "OFFLINE" : "vessie", agent: variant },
  };
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

  // memória adaptativa: aprende com o que o dono falou (persona ligada ao prompt)
  try {
    if (s.personaMemory && !interruptedOnly) {
      const lastUser = useChat.getState().conversations.find(c => c.id === convId)
        ?.messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "";
      learnFromExchange(lastUser);
    }
  } catch { /* persona não bloqueia o chat */ }

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

  // TTS (voz natural adaptativa — prosódia por frase, idioma detectado)
  if (s.voice.enabled) {
    const speakable = clean.replace(/```[\s\S]*?```/g, " bloco de código ");
    if (s.voice.natural !== false) speakNatural(speakable, { rate: s.voice.rate, pitch: s.voice.pitch });
    else speak(speakable, { rate: s.voice.rate, pitch: s.voice.pitch });
  }

  // DS-TOOLS: blocos ds:* da IA
  let kinds: string[] = [];
  let moreWork = false;
  if (!aborted) {
    try {
      const p = await runAiToolPipeline(convId, content);
      kinds = p.kinds;
      moreWork = p.moreWork;
    } catch { /* falha de ferramentas não bloqueia o chat */ }
  }

  // bloqueio de spam: resposta repetida → um retry pedindo respostas diferentes
  const prevReplies = recentReplies.get(convId) ?? [];
  if (!interruptedOnly && !aborted && clean.length > 24 && isSpam(clean, prevReplies)) {
    const conv2 = useChat.getState().conversations.find(c => c.id === convId);
    if (conv2 && s.model !== "OFFLINE") {
      try {
        const { wire } = wireFrom(conv2,
          buildSystemPrompt("ANTI-SPAM: sua última resposta foi quase idêntica a uma resposta anterior. RESPONDA DE NOVO com palavras completamente diferentes, sem repetir frases, mantendo o sentido e no estilo curto de pessoa real."));
        const r = await chatCompletions(s, wire, { stream: false, temperature: 1.0 });
        if (r.content.trim() && !isSpam(r.content, prevReplies)) {
          const retry = enforceToolSilence(r.content.replace(/\[FIM\]/g, "")).trimEnd();
          chatActions.updateMessage(convId, msgId, { content: retry, finished: /\[FIM\]/.test(r.content) });
          clean = retry;
          toast("🚫 Spam bloqueado — resposta repetida foi refeita");
        }
      } catch { /* segue com a original */ }
    }
  }
  rememberReply(convId, clean);

  // parada antecipada (sem [FIM], sem abort) → o Sub-Agent corrige e continua SOZINHO
  if (!hasEnd && !interruptedOnly && !aborted && !moreWork) {
    const ok = await autoContinueResponse(convId, msgId, clean);
    if (ok) moreWork = false;
  } else if (!hasEnd && !interruptedOnly && !aborted) {
    toast(t(lang(), "noEndMark"));
  }

  return moreWork;
}

/** Continuação automática: até 2 tentativas para completar uma resposta cortada. */
async function autoContinueResponse(convId: string, msgId: string, current: string): Promise<boolean> {
  const s = settings();
  if (s.model === "OFFLINE") return false;
  const conv = useChat.getState().conversations.find(c => c.id === convId);
  if (!conv) return false;
  const lg = lang();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { wire } = wireFrom(conv,
        buildSystemPrompt("SUA RESPOSTA ANTERIOR FOI CORTADA ANTES DA HORA (falha de transmissão). CONTINUE exatamente de onde parou — sem repetir nada do que já foi escrito, sem introduções. Termine com [FIM] em linha própria."));
      const r = await chatCompletions(s, wire, { stream: false });
      if (!r.content.trim()) break;
      const hasEnd = /\[FIM\]/.test(r.content);
      const addition = r.content.replace(/\[FIM\]/g, "").trim();
      chatActions.appendToMessage(convId, msgId, `\n${addition}`, { finished: hasEnd });
      // ferramentas que vieram na continuação também executam
      const p = await runAiToolPipeline(convId, r.content);
      // atualiza o sub-agent conforme o conteúdo final
      const finalConv = useChat.getState().conversations.find(c => c.id === convId);
      const finalMsg = finalConv?.messages.find(m => m.id === msgId);
      if (finalMsg) {
        const variant = detectVariant(finalMsg.content, [...parseToolBlocks(finalMsg.content).map(c => c.kind)], activeAgent()?.instructions);
        chatActions.updateMessage(convId, msgId, { meta: { model: finalMsg.meta?.model ?? "vessie", agent: variant } });
      }
      toast(lg === "pt-BR"
        ? `🔁 Sub-Agent continuou a resposta interrompida (${attempt + 1}/2)`
        : `🔁 Sub-Agent continued the interrupted reply (${attempt + 1}/2)`);
      if (hasEnd || p.moreWork) return true;
    } catch {
      break;
    }
  }
  return false;
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
    buildSystemPrompt("CONTINUE a resposta do assistente exatamente de onde parou. Não repita nada do que já foi escrito. Não escreva introduções."));
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

// ---------- integrações em segundo plano (chamado 1× pelo Page) ----------
let problemCooldown = 0;

export function initDsboxIntegrations(): void {
  if (typeof window === "undefined") return;

  // memória adaptativa: aprende do histórico já existente na primeira carga
  try { if (settings().personaMemory) bootstrapFromHistory(); } catch { /* noop */ }

  // prateleira de ISOs: restaura as ISOs SALVAS (IndexedDB) — "faça que salva as isos criadas"
  void hydrateIsoShelf().then(names => {
    if (names.length > 0) {
      toast(`💿 ISOs salvas restauradas: ${names.join(", ")}`);
      useDsbox.getState().pushBuildLog(`[shelf] ${names.length} ISO(s) restaurada(s) do IndexedDB: ${names.join(", ")}`);
    }
  });

  // watcher de problemas: erro no emulador → relatório terminal → IA corrige sozinha
  onEmulatorChange((st, msg) => {
    if (st !== "error") return;
    const now = Date.now();
    if (now - problemCooldown < 60_000) return;
    problemCooldown = now;
    setTimeout(() => {
      if (isGenerating()) return;
      const text = problemMessage("auto", msg);
      void sendMessage(text);
      toast("🛠 Problema enviado à IA automaticamente");
    }, 1500);
  });

  // Discord automático (se configurado)
  if (discordConfigured() && settings().discord.autoReply) {
    startDiscordPolling(info => toast(info.sent ? "🎧 Discord: resposta enviada" : `🎧 Discord: ${info.reason ?? "sem resposta"}`));
  }
}
