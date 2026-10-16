// TouchGestures.js - Swipe/touch gestures for mobile
export class TouchGestures {
  constructor(element, onSwipe) {
    this.element = element;
    this.onSwipe = onSwipe;
    this.startX = 0;
    this.isDragging = false;

    this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
    this.element.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.element.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
  }

  handleTouchStart(e) {
    this.startX = e.touches[0].clientX;
    this.isDragging = true;
  }

  handleTouchMove(e) {
    if (!this.isDragging) return;
    const dx = e.touches[0].clientX - this.startX;
    // Horizontal swipe threshold
    if (Math.abs(dx) > 50) {
      e.preventDefault();
      this.onSwipe(dx > 0 ? 'right' : 'left');
      this.isDragging = false;
    }
  }

  handleTouchEnd(e) {
    this.isDragging = false;
  }
}
export { TouchGestures };