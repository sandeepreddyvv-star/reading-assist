import { MAGIC_LABELS, type MagicJob, type MagicJobType } from '../shared/messages';
import { createOverlay, prefersReducedMotion } from './overlay';

// Magic tier: work that needs an AI backend and takes seconds. v1 ships the job shape and the
// "we're working on it" panel only. When a backend exists, startJob() is the one function to fill in.

export function startJob(type: MagicJobType, text: string, onUpdate: (job: MagicJob) => void): void {
  onUpdate({ type, text, status: 'unavailable', progress: 0 });
}

let overlay: ReturnType<typeof createOverlay> | null = null;

function close(): void {
  document.removeEventListener('keydown', onKey, true);
  overlay?.host.remove();
  overlay = null;
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close();
}

export function showMagic(type: MagicJobType): void {
  close();
  const animation = prefersReducedMotion() ? '' : '.spark{animation:twinkle 1.8s ease-in-out infinite}' +
    '@keyframes twinkle{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.25) rotate(12deg)}}';
  overlay = createOverlay(
    'ra-magic',
    `.panel{position:fixed;right:20px;bottom:20px;max-width:320px;padding:16px 18px;border-radius:12px;` +
      `background:#2b2d42;color:#fff;font:15px/1.5 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);` +
      `pointer-events:auto}` +
      `h2{margin:0 0 6px;font-size:16px}p{margin:0 0 12px}.spark{display:inline-block}` +
      `button{font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#edf2f4;color:#2b2d42;cursor:pointer}` +
      animation,
    `<div class="panel" role="status"><h2><span class="spark" aria-hidden="true">✨</span> We’re creating magic</h2>` +
      `<p>“${MAGIC_LABELS[type]}” isn’t ready yet. We’re working on it. Fonts, spacing, colors, the reading ruler, ` +
      `focus mode and read-aloud already work instantly.</p><button type="button">Got it</button></div>`,
  );
  overlay.root.querySelector('button')?.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.documentElement.appendChild(overlay.host);

  // Wire the (currently always-unavailable) job so the real backend only has to replace startJob().
  startJob(type, window.getSelection()?.toString() ?? '', () => {});
}
