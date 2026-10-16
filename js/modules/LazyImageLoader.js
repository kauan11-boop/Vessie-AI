// LazyImageLoader.js - Lazy load images
export const LazyImageLoader = {
  init() {
    if (!('IntersectionObserver' in window)) {
      // Fallback: load all images immediately
      document.querySelectorAll('img').forEach(img => img.load());
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.dataset.src || img.dataset.srcset;
          if (src) {
            img.src = src;
            img.removeAttribute('data-src');
            img.removeAttribute('data-srcset');
          }
          obs.disconnect();
        }
      });
    }, {
      rootMargin: '200px 0px'
    });

    document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
  }
};
export { LazyImageLoader };