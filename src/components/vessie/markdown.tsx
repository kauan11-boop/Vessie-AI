"use client";
// Vessie AI — renderização markdown segura (B.5: sanitização real, links seguros — corrige D12/D13/D14)
// react-markdown sem rehype-raw ignora HTML cru por padrão; links com whitelist de esquema.
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download, ExternalLink, Eye } from "lucide-react";

const SAFE_SCHEMES = /^https?:|^mailto:/i;

function SafeLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  if (!href || !SAFE_SCHEMES.test(href)) {
    return <span className="underline decoration-dotted opacity-70">{children}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline hover:opacity-80">
      {children}
      <ExternalLink className="inline h-3 w-3 ml-0.5" aria-hidden="true" />
    </a>
  );
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const isHtml = /html/i.test(lang ?? "");
  const previewable = isHtml && code.length < 30000;

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast("Copiado!");
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => toast("Não foi possível copiar"));
  };
  const download = () => {
    const name = `vessie-${lang || "txt"}-${Date.now()}.${extFor(lang)}`;
    const blob = new Blob([code], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const preview = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    // iframe sandboxed via srcdoc — nunca window direto com document.write do código
    w.document.body.innerHTML = "";
    const f = w.document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts");
    f.setAttribute("srcdoc", code);
    f.style.cssText = "width:100vw;height:100vh;border:0";
    w.document.body.appendChild(f);
  };

  return (
    <div className="code-block my-2">
      <div className="code-head">
        <span>{lang || "code"}</span>
        <span className="flex items-center gap-1">
          {previewable && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={preview} aria-label="Preview">
              <Eye className="h-3 w-3 mr-1" /> Preview
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={download} aria-label="Download">
            <Download className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={copy} aria-label="Copiar código">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </span>
      </div>
      <pre className="code-body"><code>{code}</code></pre>
    </div>
  );
}

function extFor(lang?: string): string {
  const map: Record<string, string> = {
    html: "html", css: "css", js: "js", javascript: "js", ts: "ts", typescript: "ts",
    python: "py", py: "py", json: "json", bash: "sh", sh: "sh", shell: "sh", md: "md", yaml: "yml", yml: "yml",
  };
  return map[(lang ?? "").toLowerCase()] ?? "txt";
}

/** Markdown seguro — nenhum HTML cru, links validados, código com ações. */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[14.5px] leading-[1.7] break-words [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-bold [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-3 [&_blockquote]:italic [&_table]:my-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_code]:font-mono [&_code]:text-[.88em]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <SafeLink href={href}>{children}</SafeLink>,
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children ?? "");
            if (!text.includes("\n") && !className) {
              return <code className="bg-background-2 border border-border rounded px-1 py-0.5">{text}</code>;
            }
            const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "code";
            return <CodeBlock code={text.replace(/\n$/, "")} lang={lang} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
