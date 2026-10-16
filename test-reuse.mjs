global.window = global;
global.window.state = { activeChatId: 'c1', conversations: [{ id: 'c1', messages: [
  { role: 'user', content: 'faça um jogo' },
  { role: 'assistant', content: 'ok\n```html:jogo.html\n<h1>A</h1>\n<p>B</p>\n```' },
  { role: 'assistant', content: 'css\n```css:style.css\nh1{x:y}\n```' }
]}] };
await import('./js/lineedit.js');
const L = global.LineEdit;
console.log('promptEdit removido:', L.promptEdit === undefined && L.promptEditBtn === undefined);
const inv = L.contextInventory(8000);
console.log('--- inventário ---'); console.log(inv);
console.log('has header:', inv.includes('REUTILIZE') && inv.includes('jogo.html') && inv.includes('2 linhas'));
// limite de contexto
const big = L.contextInventory(120);
console.log('truncado:', big.includes('(cortado)'));
const m = await import('./js/markdown.js');
const out = m.simpleMarkdown('```js:app.js\nl1\n```');
console.log('sem botão linhas:', !out.includes('script-edit-btn') && !out.includes('promptEditBtn'), '| botão script ok:', out.includes('script-open-btn'));
