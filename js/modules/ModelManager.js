// ModelManager.js - Model management and status
export const ModelManager = {
  currentModel: '',

  setCurrent(id) {
    this.currentModel = id;
    this.updateUI();
  },

  getCurrent() {
    return this.currentModel;
  },

  updateUI() {
    const label = document.getElementById('modelBtnLabel');
    const circle = document.getElementById('modelStatusCircle');

    if (label) {
      label.textContent = this.currentModel ? (this.currentModel.split('/').pop().replace('.gguf', '') || this.currentModel) : 'selecionar modelo…';
    }

    if (circle) {
      if (this.currentModel) {
        circle.className = 'model-status-circle ok';
        circle.title = 'Conectado';
      } else {
        circle.className = 'model-status-circle err';
        circle.title = 'Nenhum modelo selecionado';
      }
    }
  },

  async loadModels() {
    try {
      const r = await fetch(settings.baseUrl + '/models');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const models = (data.data || []).map(m => m.id).filter(Boolean);
      return models;
    } catch (e) {
      console.warn('Could not load models:', e);
      return [];
    }
  }
};
export { ModelManager };