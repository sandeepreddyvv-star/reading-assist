import { createOverlay } from './overlay';

const BAND_HEIGHT = 48;

let overlay: ReturnType<typeof createOverlay> | null = null;
let band: HTMLElement | null = null;
let frame = 0;
let pendingY = 0;

function onMove(e: MouseEvent): void {
  pendingY = e.clientY;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (band) band.style.top = `${pendingY - BAND_HEIGHT / 2}px`;
  });
}

/** A horizontal band that follows the mouse; everything above and below it is dimmed. */
export function setRuler(on: boolean): void {
  if (on && !overlay) {
    overlay = createOverlay(
      'ra-ruler',
      `.band{position:fixed;left:0;right:0;height:${BAND_HEIGHT}px;` +
        `box-shadow:0 0 0 100vmax rgba(0,0,0,.45);border-top:2px solid rgba(255,214,0,.9);` +
        `border-bottom:2px solid rgba(255,214,0,.9);box-sizing:border-box}`,
      '<div class="band"></div>',
    );
    band = overlay.root.querySelector<HTMLElement>('.band');
    if (band) band.style.top = `${window.innerHeight / 3}px`;
    document.documentElement.appendChild(overlay.host);
    document.addEventListener('mousemove', onMove, { passive: true });
  } else if (!on && overlay) {
    document.removeEventListener('mousemove', onMove);
    cancelAnimationFrame(frame);
    frame = 0;
    overlay.host.remove();
    overlay = null;
    band = null;
  }
}
