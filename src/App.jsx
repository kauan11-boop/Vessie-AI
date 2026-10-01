import React, { useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import ChatBot from "./components/ChatBot.jsx";
import AgentCoding from "./components/AgentCoding.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import { loadSettings } from "./lib/aiClient.js";

export default function App() {
  const [mode, setMode] = useState("chatbot"); // "chatbot" | "agent"
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings());

  return (
    <div className="app-shell">
      <Sidebar
        mode={mode}
        onModeChange={setMode}
        onOpenSettings={() => setSettingsOpen(true)}
        settings={settings}
      />

      <div className="main-panel">
        <div className="topbar">
          <div className="topbar-copy">
            <span className="section-kicker">VESSIE AI <span>/</span> WORKSPACE</span>
            <h1>{mode === "chatbot" ? "Chat com IA" : "Agent Coding"}</h1>
          </div>
          <div className="topbar-context"><span className="context-dot" />
            {mode === "chatbot" ? "Assistente pessoal" : "Ambiente de desenvolvimento"}
          </div>
        </div>

        <div className="mode-view" hidden={mode !== "chatbot"}>
          <ChatBot />
        </div>
        <div className="mode-view" hidden={mode !== "agent"}>
          <AgentCoding />
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={setSettings}
        />
      )}
    </div>
  );
}
