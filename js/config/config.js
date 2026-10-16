// config.js - Configuration
let settings = { 
  baseUrl: 'http://localhost:1234/v1', 
  apiKey: 'lm-studio', 
  system: 'Você é a Vessie-AI, uma assistente útil que responde em português brasileiro, com markdown bem formatado e exemplos de código quando relevante.',
  temp: 0.7, 
  topP: 1, 
  maxTok: '', 
  timeout: 120, 
  stream: true, 
  auto: true, 
  model: '',
  voiceEnabled: true,
  voiceRate: 1.0,
  voicePitch: 1.0,
  voiceVolume: 1.0
};
export { settings };