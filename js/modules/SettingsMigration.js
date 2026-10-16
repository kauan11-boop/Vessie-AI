// SettingsMigration.js - Migrate old settings to new format
export const SettingsMigration = {
  migrate() {
    const old = localStorage.getItem('lmchat_old_settings');
    const oldData = localStorage.getItem('lmchat_settings');

    if (!oldData && !old) return false;

    let data = JSON.parse(oldData || '{}');

    // Migrate old settings if they exist
    if (old) {
      const oldParsed = JSON.parse(old);
      if (oldParsed.baseUrl) data.baseUrl = oldParsed.baseUrl;
      if (oldParsed.apiKey) data.apiKey = oldParsed.apiKey;
      if (oldParsed.system) data.system = oldParsed.system;
      if (oldParsed.temp !== undefined) data.temp = oldParsed.temp;
      if (oldParsed.topP !== undefined) data.topP = oldParsed.topP;
      if (oldParsed.maxTok !== undefined) data.maxTok = oldParsed.maxTok;

      // Remove old storage
      localStorage.removeItem('lmchat_old_settings');
    }

    // Save migrated data
    if (oldData) localStorage.setItem('lmchat_settings', JSON.stringify(data));
    return true;
  }
};
export { SettingsMigration };