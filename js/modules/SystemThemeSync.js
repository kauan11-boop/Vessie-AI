// SystemThemeSync.js - Sync with system theme
export const SystemThemeSync = {
  init() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    // Apply initial theme
    if (prefersDark.matches) {
      document.body.setAttribute('data-theme', 'dark');
    }

    // Listen for changes
    prefersDark.addEventListener('change', e => {
      const theme = e.matches ? 'dark' : '';
      document.body.setAttribute('data-theme', theme);
      localStorage.setItem('lmchat_theme', theme);
    });
  }
};
export { SystemThemeSync };