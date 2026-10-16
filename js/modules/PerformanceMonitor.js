// PerformanceMonitor.js - Performance tracking
export const PerformanceMonitor = {
  startTimer(label) {
    this[`_${label}_t0`] = performance.now();
    return this[`_${label}_t0`];
  },

  endTimer(label) {
    const t0 = this[`_${label}_t0`];
    if (t0) {
      const duration = performance.now() - t0;
      console.log(`⏱ [Perf] ${label}: ${duration.toFixed(2)}ms`);
      return duration;
    }
    return null;
  },

  mark(label) {
    console.log(`✓ [Perf] Mark: ${label} at ${performance.now().toFixed(2)}ms`);
  },

  getStats() {
    return {
      memory: typeof performance.memory !== 'undefined' ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null,
      timestamp: performance.now()
    };
  }
};
export { PerformanceMonitor };