// Telemetry.js - Basic telemetry/usage tracking (privacy-respecting)
export const Telemetry = {
  events: [],

  track(event, data = {}) {
    const entry = { event, timestamp: performance.now(), data };
    this.events.push(entry);

    // Keep only last 50 events
    if (this.events.length > 50) this.events.shift();

    // Send to analytics if configured
    if (settings.telemetryEnabled) {
      this.send(entry);
    }
  },

  send(event) {
    // Privacy-respecting: only send if explicitly enabled
    fetch('/telemetry', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {}); // Silently fail
  },

  getLast(eventType) {
    return this.events.find(e => e.event === eventType);
  }
};
export { Telemetry };