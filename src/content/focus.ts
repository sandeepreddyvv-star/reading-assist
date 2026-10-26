import { createOverlay, prefersReducedMotion } from './overlay';

const FOCUS_BLOCKS = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, pre, figcaption, td';
const PAD = 8;

let overlay: ReturnType<typeof createOverlay> | null = null;
let spot: HTMLElement | null = null;
let current: Element | null = null;
let frame = 0;

function place(): void {
  frame = 0;
  if (!spot) return;
  if (!current || !current.isConnected) {
    spot.style.display = 'none';
    return;
  }
  const r = current.getBoundingClientRect();
  spot.style.display = 'block';
  spot.style.top = `${r.top - PAD}px`;
  spot.style.left = `${r.left - PAD}px`;
  spot.style.width = `${r.width + PAD * 2}px`;
  spot.style.height = `${r.height + PAD * 2}px`;
}

function schedule(): void {
  if (!frame) frame = requestAnimationFrame(place);
}

function onMove(e: MouseEvent): void {
  const target = e.target instanceof Element ? e.target : null;
  const block = target?.closest(FOCUS_BLOCKS) ?? null;
  // Keep the last paragraph while the pointer is over gaps or non-text elements.
  if (block && block.textContent?.trim()) {
    current = block;
    schedule();
  }
}

/** Dims the whole page except the paragraph under the pointer. */
export function setFocus(on: boolean): void {
  if (on && !overlay) {
    overlay = createOverlay(
      'ra-focus',
      `.spot{position:fixed;display:none;border-radius:6px;box-shadow:0 0 0 100vmax rgba(0,0,0,.6);` +
        (prefersReducedMotion() ? '' : 'transition:top .12s,left .12s,width .12s,height .12s;') +
        `}`,
      '<div class="spot"></div>',
    );
    spot = overlay.root.querySelector<HTMLElement>('.spot');
    document.documentElement.appendChild(overlay.host);
    document.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
  } else if (!on && overlay) {
    document.removeEventListener('mousemove', onMove);
    window.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
    cancelAnimationFrame(frame);
    frame = 0;
    overlay.host.remove();
    overlay = null;
    spot = null;
    current = null;
  }
}
