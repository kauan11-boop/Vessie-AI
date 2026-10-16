// ResourcePreloader.js - Preload critical resources
export const ResourcePreloader = {
  preload(href, as) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = href;
    link.as = as || 'fetch';
    document.head.appendChild(link);
  },

  preloadCSS(href) {
    this.preload(href, 'style');
  },

  preloadFont(href) {
    this.preload(href, 'font');
  },

  preloadImage(href) {
    this.preload(href, 'image');
  },

  init() {
    // Preload FontAwesome icons (already via CDN, but ensuring critical CSS)
    this.preloadCSS('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css');
  }
};
export { ResourcePreloader };