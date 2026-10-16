// ThemeSync.js - Theme synchronization between light/dark
export const ThemeSync = {
  init() {
    // Check for saved theme or prefers-color-scheme
    const saved = localStorage.getItem('lmchat_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (saved) {
      document.body.setAttribute('data-theme', saved);
    } else if (prefersDark) {
      document.body.setAttribute('data-theme', 'dark');
    }

    // Listen for changes
    const themeToggle = document.querySelector('.theme-btn');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const current = document.body.getAttribute('data-theme');
        const newTheme = current === 'dark' ? '' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('lmchat_theme', newTheme);
      });
    }
  }
};
export { ThemeSync };