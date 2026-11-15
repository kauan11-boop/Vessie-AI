"use client";
// Vessie AI — guia de conexão (help) + modal de agentes
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUi, useAgents, agentActions, useSettings } from "@/lib/store";
import { t } from "@/lib/i18n";
import { Trash2, Play, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Lang } from "@/lib/types";

export function HelpModal({ lang: lg }: { lang: Lang }) {
  const open = useUi(s => s.helpOpen);
  const setOpen = useUi(s => s.setHelpOpen);
  const setSettingsOpen = useUi(s => s.setSettingsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[560px]" role="dialog" aria-modal="true">
        <DialogHeader>
          <DialogTitle>{t(lg, "helpTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">{t(lg, "helpSub")}</p>
        <ol className="text-sm space-y-2 list-decimal pl-5">
          <li>Baixe e instale o <b>LM Studio</b> (lmstudio.ai)</li>
          <li>Baixe um modelo — ex.: <code className="font-mono text-xs bg-background-2 border border-border rounded px-1">qwen2.5-7b-instruct</code> ou <code className="font-mono text-xs bg-background-2 border border-border rounded px-1">llama-3.1-8b</code></li>
          <li>Aba <b>Local Server</b> (ícone &lt;&gt;)</li>
          <li><b>Start Server</b></li>
          <li>Ative <b>&quot;Serve on Local Network&quot;</b> e <b>&quot;Enable CORS&quot;</b> nas configurações do servidor</li>
          <li>Porta padrão: <b>1234</b></li>
          <li>Volte aqui — o badge fica verde</li>
        </ol>
        <div className="border border-accent/40 bg-hover rounded-[12px] p-3 text-xs">
          <b>⚠️ Publicou em HTTPS e dá erro de conexão?</b> O navegador bloqueia http://localhost a partir de https.
          Soluções: túnel https (ex.: <code className="font-mono">ngrok http 1234</code>) e cole a URL nas configurações;
          ou rode local com <code className="font-mono">npx serve .</code>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>{t(lg, "close")}</Button>
          <Button className="bg-accent text-white hover:opacity-90" onClick={() => { setOpen(false); setSettingsOpen(true); }}>
            {t(lg, "settings")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgentsModal({ lang: lg }: { lang: Lang }) {
  const open = useUi(s => s.agentsOpen);
  const setOpen = useUi(s => s.setAgentsOpen);
  const agents = useAgents(s => s.agents);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🤖");
  const [temp, setTemp] = useState("0.7");
  const [instr, setInstr] = useState("");

  const create = () => {
    if (!name.trim()) return;
    agentActions.addAgent({
      name: name.trim(),
      emoji: emoji || "🤖",
      temp: parseFloat(temp) || 0.7,
      instructions: instr.trim(),
    });
    toast(t(lg, "agentSaved"));
    setName("");
    setInstr("");
    setEmoji("🤖");
    setTemp("0.7");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[560px] max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
        <DialogHeader>
          <DialogTitle>{t(lg, "agents")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">{t(lg, "noAgents")}</p>

        <ul className="space-y-2">
          {agents.map(a => (
            <li key={a.id} className={`border rounded-[12px] p-3 flex items-start gap-3 ${a.active ? "border-accent bg-hover" : "border-border"}`}>
              <span className="text-xl" aria-hidden>{a.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold flex items-center gap-2">
                  {a.name}
                  {a.active && <span className="text-[10px] uppercase tracking-wide text-accent">{t(lg, "agentActive")}</span>}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.instructions || "—"}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">temp {a.temp}</p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0"
                  aria-label={a.active ? t(lg, "deactivate") : t(lg, "activate")}
                  onClick={() => agentActions.activateAgent(a.active ? null : a.id)}
                >
                  {a.active ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0 text-danger"
                  aria-label={t(lg, "delete")}
                  onClick={() => { agentActions.deleteAgent(a.id); toast(t(lg, "agentDeleted")); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-border pt-3 space-y-2">
          <div className="grid grid-cols-[1fr_70px_90px] gap-2">
            <div>
              <Label className="text-xs" htmlFor="aName">{t(lg, "agentName")}</Label>
              <Input id="aName" value={name} onChange={e => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs" htmlFor="aEmoji">{t(lg, "agentEmoji")}</Label>
              <Input id="aEmoji" value={emoji} onChange={e => setEmoji(e.target.value)} className="mt-1 text-center" />
            </div>
            <div>
              <Label className="text-xs" htmlFor="aTemp">{t(lg, "agentTemp")}</Label>
              <Input id="aTemp" type="number" step="0.1" min="0" max="2" value={temp} onChange={e => setTemp(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs" htmlFor="aInstr">{t(lg, "agentInstr")}</Label>
            <Textarea id="aInstr" value={instr} onChange={e => setInstr(e.target.value)} className="mt-1 min-h-16 text-xs" />
          </div>
          <Button className="w-full bg-accent text-white hover:opacity-90 rounded-[10px]" onClick={create} disabled={!name.trim()}>
            {t(lg, "agentCreate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
