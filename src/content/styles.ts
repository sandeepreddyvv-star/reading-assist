import { FONTS, THEMES, type Settings } from '../shared/settings';

// Elements we never restyle. Icon fonts would turn into random letters, code needs its
// monospace font, and form controls/media should keep the site's own look.
const KEEP_FONT = [
  'i', 'svg', 'svg *', 'code', 'code *', 'pre', 'pre *', 'kbd', 'samp',
  '.material-icons', '.material-symbols-outlined', '[class*="icon" i]', '[class*="fa-"]',
  '[class^="fa" i]', '[class*="glyph" i]',
].map((s) => `:not(${s})`).join('');

const KEEP_COLOR = [
  'img', 'picture', 'video', 'canvas', 'svg', 'svg *', 'iframe', 'input', 'textarea',
  'select', 'button', 'pre', 'pre *', 'code', 'code *',
].map((s) => `:not(${s})`).join('');

// Text containers whose size / line height / width we adjust.
const TEXT_BLOCKS = 'p, li, dd, dt, blockquote, td, th, figcaption';

function fontFaces(font: Settings['font']): string {
  const info = FONTS[font];
  if (!info.files || !info.family) return '';
  const family = info.family.split(',')[0];
  const face = (path: string, weight: number) =>
    `@font-face{font-family:${family};src:url("${chrome.runtime.getURL(path)}") format("${info.files!.format}");` +
    `font-weight:${weight};font-style:normal;font-display:swap}`;
  return face(info.files.regular, 400) + face(info.files.bold, 700);
}

/**
 * Builds the one stylesheet we inject. Rewriting a single <style> element's text is a single
 * restyle for the browser, which is why instant-tier changes feel immediate.
 */
export function buildCss(s: Settings): string {
  const css: string[] = [];
  const family = FONTS[s.font].family;

  css.push(fontFaces(s.font));

  const typography: string[] = [];
  if (family) typography.push(`font-family:${family} !important`);
  if (s.letterSpacing > 0) typography.push(`letter-spacing:${s.letterSpacing}em !important`);
  if (s.wordSpacing > 0) typography.push(`word-spacing:${s.wordSpacing}em !important`);
  if (typography.length) css.push(`html body, html body :where(*${KEEP_FONT}){${typography.join(';')}}`);
  // Excluded elements still inherit spacing from <body>; keep code exactly as the site styled it.
  if (s.letterSpacing > 0 || s.wordSpacing > 0) {
    css.push('html body :is(code, pre, kbd, samp, code *, pre *){letter-spacing:normal !important;word-spacing:normal !important}');
  }

  if (s.fontScale > 1) {
    css.push(`:where(${TEXT_BLOCKS}){font-size:calc(1em * ${s.fontScale}) !important}`);
    // Headings keep their size relative to body text, whatever units the site uses.
    css.push(`:where(h1, h2, h3, h4, h5, h6){zoom:${s.fontScale} !important}`);
    // Nested blocks (a <p> inside an <li>) inherit the scaled size instead of scaling twice.
    const nested = TEXT_BLOCKS.split(', ').map((t) => `:is(${TEXT_BLOCKS}) ${t}`).join(',');
    css.push(`${nested}{font-size:1em !important}`);
  }

  if (s.lineHeight > 0) {
    css.push(
      `:where(${TEXT_BLOCKS}), :where(article, main, [role="main"]) :where(div, span, section){` +
        `line-height:${s.lineHeight} !important}`,
    );
  }

  if (s.maxWidth > 0) {
    css.push(`:where(p, li, dd, blockquote){max-width:${s.maxWidth}ch !important}`);
  }

  if (s.theme !== 'none') {
    const t = THEMES[s.theme];
    css.push(`html, html body{background-color:${t.bg} !important;color:${t.fg} !important}`);
    css.push(`html body :where(*${KEEP_COLOR}){background-color:transparent !important;color:${t.fg} !important}`);
    css.push(`html body a, html body a *{color:${t.link} !important}`);
  }

  if (s.anchors) css.push('b.ra-b{font-weight:700 !important}');

  // Used by read-aloud to mark the sentence being spoken (CSS Custom Highlight API).
  css.push('::highlight(ra-speaking){background-color:#ffe066;color:#000}');

  return css.join('\n');
}
