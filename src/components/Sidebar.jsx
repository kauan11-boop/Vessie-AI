import React from "react";

export default function Sidebar({ mode, onModeChange, onOpenSettings, settings }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-dot" />
        Vessie Agent
      </div>

      <div className="mode-switch">
        <button
          className={`mode-btn ${mode === "chatbot" ? "active" : ""}`}
          onClick={() => onModeChange("chatbot")}
        >
          💬 Chatbot
        </button>
        <button
          className={`mode-btn ${mode === "agent" ? "active" : ""}`}
          onClick={() => onModeChange("agent")}
        >
          🛠️ Agent Coding
        </button>
      </div>

      <div className="sidebar-section">
        <button className="ghost-btn" onClick={onOpenSettings}>
          ⚙️ Configurações
        </button>
        <div className="status-line">
          Backend: {settings.baseUrl}
          <br />
          Modelo: {settings.model || "—"}
        </div>
      </div>
    </aside>
  );
}
