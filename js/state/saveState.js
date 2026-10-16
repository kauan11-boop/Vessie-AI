// saveState.js
import { state } from './state.js';

export function saveState() { 
  try { 
    localStorage.setItem('lmchat_chats', JSON.stringify(state)); 
  } catch (e) { } 
}