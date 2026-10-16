// ViewportFix.js - Viewport and orientation fixes for mobile
export const ViewportFix = {
  init() {
    // Set proper viewport on load
    const meta = document.querySelector('meta[name=viewport]');
    if (meta) {
      meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    }

    // Handle orientation change
    const handleOrientation = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${height * 0.01}px`);
    };

    handleOrientation();
    window.addEventListener('resize', handleOrientation);
    window.addEventListener('orientationchange', handleOrientation);
  }
};
export { ViewportFix };