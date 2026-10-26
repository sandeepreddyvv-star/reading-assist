# Reading Assist

A Chrome extension that makes any web page easier to read for people with dyslexia, ADHD, low vision, or anyone who just finds a page tiring. Change the font, size and spacing, give the page a "paper novel" background, follow along with a reading ruler, focus on one paragraph at a time, or have the page read aloud.

Everything runs in your browser. Nothing about you or the pages you read is collected or sent anywhere.

## What it does

| Tier | Speed | What you get |
|---|---|---|
| **Instant** | applied as soon as you move a control | Fonts (OpenDyslexic, Atkinson Hyperlegible, Lexend, book serif), text size, line / letter / word spacing, line length, background themes (paper, cream, soft blue, soft green, soft dark, high contrast) |
| **Quick** | well under 2 seconds | Reading ruler, focus mode, word anchors (bold word starts), read aloud with the current sentence highlighted |
| **Magic** | not built yet | Simplify, summarize, break into steps, explain visually. The button and the "We're creating magic ✨" panel exist; nothing runs behind them yet. |

There are also one-click setups (**Dyslexia**, **ADHD focus**, **Low vision**, **Reset**), an on/off switch, a per-site off switch, and two shortcuts: `Alt+Shift+R` toggles the extension, `Alt+Shift+S` starts/stops reading aloud (rebindable at `chrome://extensions/shortcuts`).

## Install and run

Requires Node 20+.

```
npm install
npm run build        # outputs the extension to dist/
```

Then in Chrome: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `dist/` folder. Pin the toolbar icon, open any web page and click it. Pages that were already open before you installed need one reload.

While developing, `npm run watch` rebuilds on every save (reload the extension at `chrome://extensions` afterwards).

Other scripts: `npm run typecheck` (TypeScript only, no output) and `npm test` (build, then end-to-end tests, see below).

## How it works

A Manifest V3 extension has a few separate parts that can only talk to each other by passing messages:

```
 popup ──(1) preview message──▶ content script (inside every page)
   │                                  ▲
   └─(2) saved after 300 ms──▶ chrome.storage.sync ──(3) change event──┘
                                      ▲
 service worker (keyboard shortcuts) ─┘
```

- **Content script** (`src/content/`): runs in every page at `document_start`, reads the saved settings and styles the page. This is the part that changes what you see.
- **Popup** (`src/popup/`): the controls. Moving a control (1) sends the new settings straight to the current tab so the page changes immediately, and (2) saves them a moment later. Saving is delayed because `chrome.storage.sync` allows only about 120 writes a minute, and dragging a slider would exceed that.
- **Storage → other tabs** (3): all other open tabs hear about the saved change and update themselves, so your choices follow you around.
- **Service worker** (`src/background/`): handles the keyboard shortcuts.
- **Options page** (`src/options/`): lists the sites you turned off, resets everything, shows the shortcuts and the privacy note.
- **Shared code** (`src/shared/`): `settings.ts` is the one definition of what can be changed (names, ranges, defaults, presets, fonts, themes) and `messages.ts` the one definition of what the parts say to each other. Both are TypeScript, so a misspelled setting name is an error in your editor instead of a feature that silently does nothing.

### Why the instant tier is instant

The content script never edits page elements one by one. It owns a single `<style id="ra-style">` element and rewrites its text from the current settings (`styles.ts`). The browser then restyles the whole page in one pass, which is why even long pages respond immediately. A settings change in the test suite reaches the page in about a millisecond on a local page; the visible cost is the browser repainting.

Because the style element is added at `document_start`, before the page first paints, pages normally load already styled instead of flashing the original first.

### Not breaking websites

Restyling "everything" would break pages, so `styles.ts` is deliberate about what it leaves alone:

- **Icon fonts** (`<i>`, `.fa-*`, `.material-icons`, any class containing `icon` or `glyph`) and SVG keep their own font.
- **Code** (`code`, `pre`, `kbd`, `samp`) keeps its monospace font and its original letter/word spacing.
- **Form controls, images, video, canvas, iframes** keep their own colors when a theme is on.
- Text size is applied to text blocks (`p`, `li`, `td`, ...) and nested blocks are not scaled twice. Headings use `zoom` so their size stays in proportion to the body text.
- Style rules are wrapped in `:where(...)` so they have the lowest possible specificity; that is what lets themed link colors win over the blanket text color.

### The quick tier

- **Reading ruler** (`ruler.ts`): one overlay band that follows the mouse, with the rest of the page dimmed.
- **Focus mode** (`focus.ts`): a spotlight around the paragraph under the pointer; everything else is dimmed.
- Both overlays live inside a **shadow DOM** so page CSS can't distort them, and they are click-through.
- **Word anchors** (`anchors.ts`): the one feature that edits the page's text. It bolds the first half of each word, but only in blocks near the screen (via `IntersectionObserver`), picks up content added later (`MutationObserver`), skips code, headings, inputs and editable areas, and turning it off restores the original text exactly.
- **Read aloud** (`speech.ts`): speaks the selection, or the page's main text starting at the first block on screen. It speaks one sentence at a time (this keeps Chrome's speech engine reliable) and highlights the current sentence with the CSS Custom Highlight API, which marks text without changing the page's HTML.

### The magic tier (planned)

`src/shared/messages.ts` already defines a `MagicJob` (type, text, status, progress) and `src/content/magic.ts` has a single `startJob()` function that currently answers "unavailable". When AI features are added, that one function is where the backend call goes. The API key must live on a small server of your own, never inside the extension, because anything shipped in an extension can be read by anyone. The "animation to help understanding" idea still needs a design (candidates: sentence-by-sentence reveal, key terms highlighted in turn, generated diagrams).

### Why TypeScript

The popup, content script and service worker pass the same settings object around. In plain JavaScript, reading `msg.fontsize` when the sender wrote `fontSize` just gives `undefined` and the feature quietly does nothing. With the settings defined once in `settings.ts`, that mistake is flagged as you type. The build step is needed anyway because content scripts can't use `import`; `build.mjs` (esbuild) bundles each entry into one plain script.

### Fonts

OpenDyslexic, Atkinson Hyperlegible and Lexend are bundled inside the extension (copied from npm packages by `build.mjs`) rather than loaded from a CDN, because many sites' security policies block outside fonts. All three are open-licensed (SIL OFL). Evidence that any one "dyslexia font" helps is mixed, so the extension offers a choice instead of promoting one.

## Project layout

```
manifest.json            Chrome extension manifest (Manifest V3)
build.mjs                bundles src/ into dist/, copies fonts, draws the icons
src/shared/              settings.ts, messages.ts
src/content/             index.ts (entry), styles.ts, ruler.ts, focus.ts, anchors.ts,
                         speech.ts, magic.ts, overlay.ts
src/popup/               popup.html / .css / .ts
src/options/             options.html / .css / .ts
src/background/          service-worker.ts
tests/e2e.test.mjs       end-to-end tests
```

## Tests

`npm test` builds the extension, starts a real Chromium with it loaded (via Playwright), serves a small fixture page and checks 15 behaviours: defaults leave the page alone; font, size, spacing, width and theme apply; nested text isn't scaled twice; code and icon fonts are left alone; live changes reach open pages; turning the extension or a site off restores the page; corrupt stored values fall back safely; ruler/focus/anchors/magic overlays appear and disappear; anchors restore the original text exactly and handle late-added content; read aloud highlights the right sentence; the popup renders and saves.

First-time setup for tests: `npx playwright install chromium`. Playwright's Chromium is used because branded Chrome 137+ ignores `--load-extension`.

## Known limitations

- **Pages Chrome doesn't draw as normal HTML can't be changed**: Google Docs (canvas), Chrome's PDF viewer, `chrome://` pages and the Chrome Web Store.
- **Theming is blunt on very complex sites.** With a theme on, backgrounds of most elements become transparent so the page color shows through; sites that rely on colored panels, overlays or syntax-highlighted code may look off. Choose "Original" to turn theming off.
- **Text size**: sites that set `px` sizes on elements other than text blocks (and not headings) won't scale those elements.
- **Word anchors replace text nodes.** On pages built with frameworks that keep references to those text nodes (some React/Vue pages), later updates to that exact text may not show. Turn the feature off for such sites.
- **Read aloud uses your browser's built-in voices.** Voice quality and availability depend on your operating system. It picks the main content heuristically (`article`/`main`, skipping nav, header, footer, aside); selecting text first always works.
- **Not built (yet)**: arrow-key movement for the ruler, hiding sidebars/ads in focus mode, per-site setting overrides (a site can only be switched fully off), and the magic tier itself.
- **Permissions**: it needs to run on all sites (`<all_urls>`) to apply your settings automatically, so Chrome shows the "read and change all your data" warning at install. It uses that access only to restyle the page.

## Before publishing to the Chrome Web Store

Not done yet: a store listing, screenshots, a privacy policy page (the text in the options page can be reused), and a manual pass over real-world sites (news sites, Wikipedia, Gmail, Reddit, GitHub). Automated tests so far use a small fixture page.
