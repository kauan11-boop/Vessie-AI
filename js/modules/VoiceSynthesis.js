// VoiceSynthesis.js - Brazilian Portuguese Text-to-Speech
export const VoiceSynthesis = {
  synth: null,

  init() {
    if ('speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    } else {
      console.warn('Web Speech API not supported');
    }
  },

  speak(text, options = {}) {
    if (!this.synth) {
      this.init();
      if (!this.synth) throw new Error('Web Speech API not available');
    }

    const utterance = new SpeechSynthesisUtterance(text);

    // Brazilian Portuguese preference
    let voice = this.findPortugueseVoice();
    if (voice) {
      utterance.voice = voice;
    }

    // Apply options
    if (options.rate !== undefined) utterance.rate = options.rate;
    if (options.pitch !== undefined) utterance.pitch = options.pitch;
    if (options.volume !== undefined) utterance.volume = options.volume;

    this.synth.speak(utterance);
    return new Promise((resolve, reject) => {
      this.synth.onend = () => resolve();
      this synth.onerror = (e) => reject(e);
    });
  },

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
  },

  findPortugueseVoice() {
    if (!this.synth) this.init();
    if (!this.synth) return null;

    const voices = this.synth.getVoices();
    // Look for Portuguese Brazil voice
    const portugueseVoice = voices.find(v => 
      v.lang === 'pt-BR' || 
      v.lang === 'pt-PT' ||
      v.name.toLowerCase().includes('portuguese') ||
      v.name.toLowerCase().includes('brasil')
    );

    // Fallback: if no specific Portuguese voice, use first available
    if (portugueseVoice) return portugueseVoice;
    return voices[0] || null;
  }
};
export { VoiceSynthesis };