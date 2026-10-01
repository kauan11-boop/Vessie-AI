import React, { useState } from "react";
import { formatAIError, listModels, saveSettings, testModel } from "../lib/aiClient.js";

export default function SettingsModal({ settings, onClose, onSaved }) {
  const [form, setForm] = useState(settings);
  const [connection, setConnection] = useState({ state: "idle", message: "" });
  const [availableModels, setAvailableModels] = useState([]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    if (connection.state !== "idle") setConnection({ state: "idle", message: "" });
  }

  async function testConnection() {
    setConnection({ state: "loading", message: "Enviando uma mensagem de teste ao modelo…" });
    try {
      const answer = await testModel(form);
      let models = [];
      try {
        models = await listModels(form);
      } catch {
        models = [];
      }
      setAvailableModels(models);
      setConnection({
        state: "success",
        message: `O modelo “${form.model}” respondeu${answer ? `: ${answer.slice(0, 72)}` : "."}${models.length ? ` · ${models.length} modelos disponíveis` : " · catálogo de modelos indisponível"}`,
      });
    } catch (error) {
      setConnection({ state: "error", message: formatAIError(error, form.baseUrl) });
    }
  }

  function handleSave(event) {
    event.preventDefault();
    saveSettings(form);
    onSaved(form);
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal-card settings-card" onSubmit={handleSave}>
        <div className="modal-heading">
          <div className="settings-symbol" aria-hidden="true">✳</div>
          <div>
            <span className="section-kicker">PERSONALIZE SEU ESPAÇO</span>
            <h2>Conexão com a IA</h2>
          </div>
          <button type="button" className="icon-btn close-btn" onClick={onClose} aria-label="Fechar configurações">×</button>
        </div>
        <p className="settings-description">
          Conecte um endpoint compatível com chat completions. O teste envia uma mensagem real ao modelo selecionado; confirme também que ele está carregado no servidor e que o navegador tem acesso à URL.
        </p>

        <div className="field">
          <label htmlFor="base-url">URL base da API</label>
          <input
            id="base-url"
            value={form.baseUrl}
            onChange={(event) => update("baseUrl", event.target.value)}
            placeholder="http://localhost:1234/v1"
            autoComplete="url"
          />
          <span className="field-hint">No LM Studio, inicie o Local Server. Em preview incorporado, localhost aponta para o dispositivo que abriu esta página.</span>
        </div>

        <div className="field">
          <label htmlFor="api-key">Chave de API <span>(opcional)</span></label>
          <input
            id="api-key"
            type="password"
            value={form.apiKey}
            onChange={(event) => update("apiKey", event.target.value)}
            placeholder="Cole sua chave de API"
            autoComplete="new-password"
          />
        </div>

        <div className="field">
          <label htmlFor="model-name">Modelo</label>
          <input
            id="model-name"
            list="available-models"
            value={form.model}
            onChange={(event) => update("model", event.target.value)}
            placeholder="Ex.: local-model"
          />
          <datalist id="available-models">
            {availableModels.map((model) => <option key={model} value={model} />)}
          </datalist>
        </div>

        <div className="field temperature-field">
          <label htmlFor="temperature">Criatividade <strong>{Number(form.temperature).toFixed(2)}</strong></label>
          <input
            id="temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={form.temperature}
            onChange={(event) => update("temperature", Number(event.target.value))}
          />
          <div className="range-labels"><span>Mais preciso</span><span>Mais criativo</span></div>
        </div>

        {connection.message && (
          <div className={`connection-feedback ${connection.state}`} role="status">
            {connection.state === "loading" && <span className="loading-dot" />}
            {connection.message}
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="test-btn" onClick={testConnection} disabled={connection.state === "loading"}>
            {connection.state === "loading" ? "Testando…" : "Testar conexão"}
          </button>
          <span className="footer-spacer" />
          <button type="button" className="secondary-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-btn">Salvar alterações</button>
        </div>
      </form>
    </div>
  );
}
