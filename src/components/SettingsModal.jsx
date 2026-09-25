import React, { useState } from "react";
import { saveSettings } from "../lib/aiClient.js";

export default function SettingsModal({ settings, onClose, onSaved }) {
  const [form, setForm] = useState(settings);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    saveSettings(form);
    onSaved(form);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Configurações da IA</h2>
        <p className="hint-small">
          Por padrão aponta para o LM Studio rodando localmente
          (http://localhost:1234/v1). Troque a URL para usar outro backend
          compatível com a API da OpenAI (ex.: um proxy próprio).
        </p>

        <div className="field">
          <label>URL base da API</label>
          <input
            value={form.baseUrl}
            onChange={(e) => update("baseUrl", e.target.value)}
            placeholder="http://localhost:1234/v1"
          />
        </div>

        <div className="field">
          <label>Chave de API (opcional)</label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => update("apiKey", e.target.value)}
            placeholder="deixe em branco se não precisar"
          />
        </div>

        <div className="field">
          <label>Modelo</label>
          <input
            value={form.model}
            onChange={(e) => update("model", e.target.value)}
            placeholder="local-model"
          />
        </div>

        <div className="field">
          <label>Temperatura ({form.temperature})</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={form.temperature}
            onChange={(e) => update("temperature", Number(e.target.value))}
          />
        </div>

        <div className="modal-footer">
          <button className="secondary-btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-btn" onClick={handleSave}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
