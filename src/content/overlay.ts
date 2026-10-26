/**
 * Creates a fixed, click-through, full-viewport layer inside a shadow root so the page's own
 * CSS cannot change how our overlays look (and ours cannot leak into the page).
 */
export function createOverlay(id: string, css: string, html: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText =
    'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${css}</style>${html}`;
  return { host, root };
}

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
