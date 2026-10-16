// modal/modals.js - Modal management
export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.add('open');
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.add('active');

  // Focus trap - focus first interactive element
  setTimeout(() => {
    const firstInput = modal.querySelector('button, input, textarea');
    if (firstInput) firstInput.focus();
  }, 100);
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.remove('open');
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.remove('active');
}