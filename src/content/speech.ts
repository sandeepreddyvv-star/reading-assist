import { prefersReducedMotion } from './overlay';

// Read aloud: speaks the selection, or the main text from the top of the screen onward,
// one sentence at a time. Sentence-sized utterances keep Chrome's speech engine reliable
// and give us a natural place to highlight what is being read.

const READ_BLOCKS = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, figcaption';
const NOT_CONTENT = 'nav, header, footer, aside, script, style, noscript, [aria-hidden="true"], #ra-ruler, #ra-focus, #ra-magic';
const HIGHLIGHT = 'ra-speaking';

interface Sentence {
  text: string;
  range: Range | null;
  block: Element | null;
}

let queue: Sentence[] = [];
let index = 0;
let generation = 0;
let speaking = false;

export const isSpeaking = (): boolean => speaking;

function textNodesOf(block: Element): Text[] {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

/** Splits a block into sentences, each with a Range covering exactly its text. */
function sentencesOf(block: Element): Sentence[] {
  const nodes = textNodesOf(block);
  const full = nodes.map((n) => n.data).join('');
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
  const out: Sentence[] = [];

  const locate = (offset: number): [Text, number] | null => {
    let seen = 0;
    for (const n of nodes) {
      if (offset <= seen + n.length) return [n, offset - seen];
      seen += n.length;
    }
    return null;
  };

  for (const seg of segmenter.segment(full)) {
    const text = seg.segment.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const from = locate(seg.index);
    const to = locate(seg.index + seg.segment.trimEnd().length);
    let range: Range | null = null;
    if (from && to) {
      range = document.createRange();
      range.setStart(from[0], from[1]);
      range.setEnd(to[0], to[1]);
    }
    out.push({ text, range, block });
  }
  return out;
}

function fromSelection(): Sentence[] {
  const sel = window.getSelection();
  const text = sel?.toString().replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const sentences = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text)];
  return sentences.map((s) => ({ text: s.segment.trim(), range: null, block: null })).filter((s) => s.text);
}

function fromPage(): Sentence[] {
  const root = document.querySelector('article, main, [role="main"]') ?? document.body;
  const out: Sentence[] = [];
  let started = false;
  for (const block of root.querySelectorAll(READ_BLOCKS)) {
    if (block.closest(NOT_CONTENT) || !block.checkVisibility()) continue;
    // Start at the first block that is on screen (or below it).
    if (!started) {
      if (block.getBoundingClientRect().bottom <= 0) continue;
      started = true;
    }
    // Skip blocks whose text is already covered by a nested block.
    if (block.querySelector(READ_BLOCKS)) continue;
    out.push(...sentencesOf(block));
  }
  return out;
}

function clearHighlight(): void {
  CSS.highlights.delete(HIGHLIGHT);
}

function speakNext(token: number): void {
  if (token !== generation) return;
  const item = queue[index];
  if (!item) {
    stop();
    return;
  }
  clearHighlight();
  if (item.range) {
    CSS.highlights.set(HIGHLIGHT, new Highlight(item.range));
    const r = item.range.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      item.block?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }
  const utterance = new SpeechSynthesisUtterance(item.text);
  const next = () => {
    if (token !== generation) return;
    index += 1;
    speakNext(token);
  };
  utterance.onend = next;
  utterance.onerror = (e) => {
    // 'canceled'/'interrupted' come from stop(); anything else, skip the sentence and carry on.
    if (e.error !== 'canceled' && e.error !== 'interrupted') next();
  };
  speechSynthesis.speak(utterance);
}

export function stop(): void {
  generation += 1;
  speaking = false;
  queue = [];
  index = 0;
  speechSynthesis.cancel();
  clearHighlight();
}

export function start(): boolean {
  stop();
  queue = fromSelection();
  if (!queue.length) queue = fromPage();
  if (!queue.length) return false;
  speaking = true;
  speakNext(generation);
  return true;
}

export function toggle(): boolean {
  if (speaking) {
    stop();
    return false;
  }
  return start();
}

window.addEventListener('pagehide', () => stop());
