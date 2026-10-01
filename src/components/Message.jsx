import React from "react";

function splitCodeBlocks(text) {
  const parts = [];
  const pattern = /```([\w-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: "text", value: text.slice(last, match.index) });
    parts.push({ type: "code", lang: match[1], value: match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

export default function Message({ role, content }) {
  const parts = splitCodeBlocks(content || "");
  if (role === "system") {
    return <div className="msg system">{parts.map((part, index) => <span key={index}>{part.value}</span>)}</div>;
  }

  return (
    <div className={`message-row ${role}`}>
      <div className={`message-avatar ${role}`} aria-hidden="true">{role === "user" ? "G" : "V"}</div>
      <div className={`msg ${role}`}>
        <span className="message-author">{role === "user" ? "Você" : "Vessie AI"}</span>
        {parts.map((part, index) =>
          part.type === "code" ? (
            <pre key={index}>
              {part.lang && <span className="code-language">{part.lang}</span>}
              <code>{part.value}</code>
            </pre>
          ) : (
            <span className="message-text" key={index}>{part.value}</span>
          )
        )}
      </div>
    </div>
  );
}
