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
          <h1>
            Modo: <b>{mode === "chatbot" ? "Chatbot" : "Agent Coding"}</b>
          </h1>
        </div>

        {mode === "chatbot" ? <ChatBot key="chatbot" /> : <AgentCoding key="agent" />}
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
