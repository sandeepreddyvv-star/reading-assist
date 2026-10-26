// "Word anchors": bold the first part of every word so the eye has a fixed point to land on.
// This is the one feature that edits the page's text, so it is deliberately conservative:
// only visible blocks are processed, code/inputs/headings are skipped, and turning it off
// puts the original text back.

const BLOCKS = 'p, li, dd, dt, blockquote, figcaption, td, th, div';
const SKIP =
  'script, style, noscript, code, pre, textarea, input, select, option, svg, button, kbd, samp, math, ' +
  'h1, h2, h3, h4, h5, h6, [contenteditable=""], [contenteditable="true"], b.ra-b';
const WORD = /\p{L}[\p{L}\p{M}'’]*/gu;

let intersection: IntersectionObserver | null = null;
let mutations: MutationObserver | null = null;
const done = new WeakSet<Element>();

function anchorLength(letters: number): number {
  return letters <= 3 ? 1 : Math.ceil(letters / 2);
}

function anchorText(text: string): DocumentFragment | null {
  const frag = document.createDocumentFragment();
  let last = 0;
  let changed = false;
  for (const m of text.matchAll(WORD)) {
    const chars = Array.from(m[0]);
    const n = anchorLength(chars.length);
    const start = m.index ?? 0;
    if (start > last) frag.append(text.slice(last, start));
    const b = document.createElement('b');
    b.className = 'ra-b';
    b.textContent = chars.slice(0, n).join('');
    frag.append(b, chars.slice(n).join(''));
    last = start + m[0].length;
    changed = true;
  }
  if (!changed) return null;
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

function processBlock(block: Element): void {
  if (done.has(block)) return;
  done.add(block);
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    const parent = text.parentElement;
    if (!parent || !text.data.trim()) continue;
    // Each text node belongs to its nearest block, so nested blocks are never processed twice.
    if (parent.closest(BLOCKS) !== block || parent.closest(SKIP)) continue;
    nodes.push(text);
  }
  for (const node of nodes) {
    const frag = anchorText(node.data);
    if (frag) node.replaceWith(frag);
  }
}

function watch(root: ParentNode): void {
  if (!intersection) return;
  const blocks = root.querySelectorAll(BLOCKS);
  for (const b of blocks) if (!done.has(b)) intersection.observe(b);
}

function start(): void {
  intersection = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        intersection?.unobserve(e.target);
        processBlock(e.target);
      }
    },
    { rootMargin: '300px' },
  );
  watch(document);
  // Pages that add content after load (infinite scroll, single-page apps).
  mutations = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (!(node instanceof Element) || node.closest('#ra-ruler, #ra-focus, #ra-magic')) continue;
        if (node.matches(BLOCKS) && !done.has(node)) intersection?.observe(node);
        watch(node);
      }
    }
  });
  mutations.observe(document.body, { childList: true, subtree: true });
}

function stop(): void {
  intersection?.disconnect();
  mutations?.disconnect();
  intersection = null;
  mutations = null;
  const parents = new Set<Node>();
  for (const b of document.querySelectorAll('b.ra-b')) {
    if (b.parentNode) parents.add(b.parentNode);
    b.replaceWith(b.textContent ?? '');
  }
  for (const p of parents) p.normalize();
  // WeakSet has no clear(); a fresh instance is simplest.
  for (const el of document.querySelectorAll(BLOCKS)) done.delete(el);
}

export function setAnchors(on: boolean): void {
  if (on && !intersection) {
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', () => { if (!intersection) start(); }, { once: true });
  } else if (!on && intersection) {
    stop();
  }
}
