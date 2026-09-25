import React from "react";

// Divide o texto em pedaços de texto normal e blocos de código ```lang ... ```
// para exibição simples, sem trazer uma dependência de markdown inteira.
function splitCodeBlocks(text) {
  const parts = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "code", lang: m[1], value: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

export default function Message({ role, content }) {
  const parts = splitCodeBlocks(content || "");
  return (
    <div className={`msg ${role}`}>
      {parts.map((p, i) =>
        p.type === "code" ? (
          <pre key={i}>
            <code>{p.value}</code>
          </pre>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </div>
  );
}
