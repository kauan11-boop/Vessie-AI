import React from "react";

export default function Sidebar({ mode, onModeChange, onOpenSettings, settings }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true"><span>V</span></div>
        <div className="brand-copy">
          <span className="brand">Vessie<span>AI</span></span>
          <span className="brand-caption">ESPAÇO DE CRIAÇÃO</span>
        </div>
        <button className="mobile-settings-btn" onClick={onOpenSettings} aria-label="Configurações" title="Configurações">
          ⚙
        </button>
      </div>

      <div className="sidebar-divider" />
      <span className="sidebar-label">FERRAMENTAS</span>
      <nav className="mode-switch" aria-label="Modos de trabalho">
        <button
          className={`mode-btn ${mode === "chatbot" ? "active" : ""}`}
          onClick={() => onModeChange("chatbot")}
          aria-current={mode === "chatbot" ? "page" : undefined}
        >
          <span className="nav-icon chat-nav-icon" aria-hidden="true">◉</span>
          <span>Chat com IA</span>
          <span className="nav-chevron" aria-hidden="true">›</span>
        </button>
        <button
          className={`mode-btn ${mode === "agent" ? "active" : ""}`}
          onClick={() => onModeChange("agent")}
          aria-current={mode === "agent" ? "page" : undefined}
        >
          <span className="nav-icon code-nav-icon" aria-hidden="true">⌘</span>
          <span>Agent Coding</span>
          <span className="nav-chevron" aria-hidden="true">›</span>
        </button>
      </nav>

      <div className="sidebar-spacer" />
      <div className="connection-card">
        <div className="connection-heading"><span className="connection-mark" /> CONFIGURAÇÃO DE IA</div>
        <div className="connection-model">{settings.model || "Nenhum modelo definido"}</div>
        <div className="connection-endpoint" title={settings.baseUrl}>{settings.baseUrl || "Backend não configurado"}</div>
        <button className="settings-btn" onClick={onOpenSettings}>
          <span aria-hidden="true">⚙</span> Configurações
        </button>
      </div>
      <div className="sidebar-footer"><span>Vessie AI</span><span>•</span><span>Privado por padrão</span></div>
    </aside>
  );
}
