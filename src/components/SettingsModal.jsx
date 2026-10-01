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
          Conecte um endpoint compatível com chat completions. O nível de raciocínio depende do suporte do provedor. A chave Tavily e as consultas de busca são enviadas do navegador diretamente à Tavily.
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

        <div className="field">
          <label htmlFor="reasoning-effort">Raciocínio do modelo</label>
          <select
            id="reasoning-effort"
            value={form.reasoningEffort || ""}
            onChange={(event) => update("reasoningEffort", event.target.value)}
          >
            <option value="">Padrão do modelo</option>
            <option value="low">Baixo</option>
            <option value="medium">Médio</option>
            <option value="high">Alto</option>
          </select>
          <span className="field-hint">Envia reasoning_effort; alguns endpoints/modelos não aceitam esse parâmetro.</span>
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
            disabled={Boolean(form.reasoningEffort)}
          />
          <div className="range-labels"><span>Mais preciso</span><span>Mais criativo</span></div>
        </div>

        <div className="field">
          <label htmlFor="tavily-key">Chave Tavily <span>(opcional)</span></label>
          <input
            id="tavily-key"
            type="password"
            value={form.webSearchApiKey || ""}
            onChange={(event) => update("webSearchApiKey", event.target.value)}
            placeholder="Cole sua chave de busca Tavily"
            autoComplete="new-password"
          />
          <span className="field-hint">Salva apenas neste navegador. As consultas e a chave vão diretamente para Tavily; sem chave, a busca fica desativada.</span>
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
