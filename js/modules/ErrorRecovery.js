// ErrorRecovery.js - Error recovery and retry logic
export const ErrorRecovery = {
  retryCount: new Map(),

  async retry(fn, options = {}) {
    const { maxRetries = 3, delay = 1000, onRetry } = options;
    let attempts = 0;
    const key = fn.toString().slice(0, 100);

    // Initialize or reset retry count for this function
    if (!this.retryCount.has(key)) this.retryCount.set(key, 0);
    let currentAttempts = this.retryCount.get(key);

    while (attempts < maxRetries) {
      try {
        const result = await fn();
        this.retryCount.set(key, 0); // Reset on success
        return result;
      } catch (e) {
        attempts = currentAttempts + 1;
        this.retryCount.set(key, attempts);
        currentAttempts = attempts;

        if (onRetry) onRetry(e, attempts);

        if (attempts >= maxRetries) {
          console.error(`❌ Max retries exceeded for function after ${maxRetries} attempts`, e);
          throw e;
        }

        await new Promise(resolve => setTimeout(resolve, delay * attempts));
      }
    }
  }
};
export { ErrorRecovery };