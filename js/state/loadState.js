// loadState.js
import { state } from './state.js';

export function loadState() { 
  try { 
    const d = JSON.parse(localStorage.getItem('lmchat_chats')); 
    if (d && d.chats) { state = d; } 
  } catch (e) { } 
}

export { loadState };