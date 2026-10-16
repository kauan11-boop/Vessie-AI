// telemetry.js — API de erros e problemas do website (100% local).
// Captura erros JS, falhas de rede e problemas de UI, e permite enviar/receber via System API.
// Ordem: 1.capture 2.report 3.routes
// Ex: Telemetry.capture('error', 'Falha ao conectar'); Telemetry.report() → JSON para enviar.
import { state } from './state.js?v=7';

const LOG_KEY = 'vessie-telemetry';
const MAX_LOG = 200;

function load() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (e) { return []; }
}
function save(log) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_LOG))); } catch (e) {}
}

export const Telemetry = {
  log: [],

  init() {
    this.log = load();
    this.installGlobalHandlers();
  },

  installGlobalHandlers() {
    if (window.__telemetryBound) return;
    window.__telemetryBound = true;
    window.addEventListener('error', e => this.capture('error', e.message, e.filename, e.lineno));
    window.addEventListener('unhandledrejection', e => this.capture('unhandledrejection', e.reason?.message || String(e.reason)));
    window.addEventListener('hashchange', () => this.capture('navigation', window.location.hash));
    const origError = console.error;
    console.error = (...args) => { this.capture('console.error', args.map(String).join(' ')); origError.apply(console, args); };
  },

  capture(type, message, source, line) {
    const entry = { t: Date.now(), type, message: String(message || '').slice(0, 500), source: source || null, line: line || null, url: window.location.href };
    this.log.push(entry);
    if (this.log.length > MAX_LOG) this.log = this.log.slice(-MAX_LOG);
    save(this.log);
    return entry;
  },

  report() {
    return {
      app: 'vessie-ai-chat',
      version: '3.0',
      timestamp: new Date().toISOString(),
      url: window.location.href,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      memory: state.settings.model ? { model: state.settings.model, imgSize: state.settings.image?.size } : null,
      errors: this.log.filter(e => e.type === 'error' || e.type === 'unhandledrejection'),
      all: this.log.slice(-50)
    };
  },

  clear() { this.log = []; save(this.log); },

  // Rotas expostas via Memory.runRoute
  routes: {
    'telemetry.report': function () { return window.Telemetry.report(); },
    'telemetry.clear': function () { window.Telemetry.clear(); return { cleared: true }; },
    'telemetry.errors': function () { return window.Telemetry.log.filter(e => e.type === 'error' || e.type === 'unhandledrejection'); }
  }
};

// Auto-inicializa
if (typeof window !== 'undefined' && !window.Telemetry) {
  Telemetry.init();
  window.Telemetry = Telemetry;
  // Registra rotas no Memory se existir
  if (window.Memory && !window.Memory.__telemetryRoutesRegistered) {
    const origRunRoute = window.Memory.runRoute;
    window.Memory.runRoute = function (name, args) {
      if (Telemetry.routes[name]) return Telemetry.routes[name]();
      return origRunRoute(name, args);
    };
    window.Memory.__telemetryRoutesRegistered = true;
  }
}
