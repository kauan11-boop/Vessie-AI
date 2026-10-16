// DraftManager.js - Auto-save drafts of messages
export const DraftManager = {
  draftKey(prefix = 'chat') {
    return `lmchat_draft_${prefix}`;
  },

  save(content, prefix = 'chat') {
    try {
      localStorage.setItem(this.draftKey(prefix), content);
      return true;
    } catch (e) {
      console.warn('Draft save failed:', e);
      return false;
    }
  },

  load(prefix = 'chat') {
    try {
      return localStorage.getItem(this.draftKey(prefix));
    } catch (e) {
      console.warn('Draft load failed:', e);
      return null;
    }
  },

  clear(prefix = 'chat') {
    try {
      localStorage.removeItem(this.draftKey(prefix));
    } catch (e) {
      console.warn('Draft clear failed:', e);
    }
  }
};
export { DraftManager };