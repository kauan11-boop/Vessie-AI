// regenerate.js - Regenerate last response
import { activeChat } from '../chat/chat.js';
import { state } from '../../state/state.js';
import { saveState } from '../../state/state.js';
import { renderChat } from './renderChat.js';
import { generate } from './send.js';

export async function regenerate() {
  const chat = activeChat();
  if (!chat || state.isGenerating) return;

  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === 'assistant') {
      chat.messages.splice(i, 1);
      break;
    }
  }
  saveState();
  renderChat();
  await generate(chat);
}

export { regenerate };