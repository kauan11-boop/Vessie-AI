// VirtualKeyboard.js - Virtual keyboard handling for mobile
export function handleVirtualKeyboard() {
  const textarea = document.getElementById('messageInput');
  if (!textarea) return;

  let lastHeight = textarea.clientHeight;
  let resizeTimeout = null;

  function checkHeight() {
    const newHeight = textarea.scrollHeight;
    if (newHeight !== lastHeight) {
      lastHeight = newHeight;
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(newHeight, 200) + 'px';
    }
  }

  textarea.addEventListener('input', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(checkHeight, 50);
  });

  // Detect keyboard show/hide
  let prevHeight = window.innerHeight;
  setInterval(() => {
    const newHeight = window.innerHeight;
    if (newHeight < prevHeight - 50) {
      // Keyboard shown - adjust layout
      document.body.style.paddingBottom = '200px';
    } else if (newHeight > prevHeight + 50) {
      // Keyboard hidden
      document.body.style.paddingBottom = '0';
    }
    prevHeight = newHeight;
  }, 100);
}
export { handleVirtualKeyboard };