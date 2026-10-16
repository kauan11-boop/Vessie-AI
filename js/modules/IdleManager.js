// IdleManager.js - Track user idle time
export const IdleManager = {
  idleTime: 0,
  timeout: 60000, // 1 minute default
  timer: null,

  start(timeout = this.timeout) {
    this.timeout = timeout;
    this.timer = setInterval(() => {
      this.idleTime += 1000;
    }, 1000);

    const reset = () => {
      this.idleTime = 0;
    };

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
      window.addEventListener(event, reset);
    });
  },

  stop() {
    clearInterval(this.timer);
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(event => {
      window.removeEventListener(event, () => true);
    });
  },

  isIdle() {
    return this.idleTime > this.timeout;
  }
};
export { IdleManager };