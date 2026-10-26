// End-to-end tests: load the built extension (dist/) into a real Chromium and check what happens to a page.
// Run with `npm test` (which builds first).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';

const extensionPath = path.resolve('dist');

const PAGE = `<!doctype html><html><head><title>Fixture</title><style>.fa{font-family:"FakeIconFont",monospace}</style></head><body>
  <article>
    <h1>A heading</h1>
    <p id="p1">Reading should be comfortable and calm. Every sentence deserves some room to breathe.</p>
    <ul><li id="li1"><p id="nested">Nested paragraph inside a list item.</p></li></ul>
    <p>Second paragraph with <a id="link" href="#">a link</a> in it.</p>
    <pre id="code"><code>const x = 1;</code></pre>
    <i id="icon" class="fa fa-home">H</i>
    <input id="field" value="typed">
  </article>
</body></html>`;

let server, baseUrl, context, worker, userDataDir;

const setState = (state) => worker.evaluate((s) => chrome.storage.sync.set(s), state);
const clearState = () => worker.evaluate(() => chrome.storage.sync.clear());
const style = (page, selector, prop) =>
  page.evaluate(([sel, p]) => getComputedStyle(document.querySelector(sel))[p], [selector, prop]);

async function openPage() {
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForSelector('#ra-style', { state: 'attached' });
  return page;
}

before(async () => {
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(PAGE);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/`;

  userDataDir = mkdtempSync(path.join(tmpdir(), 'ra-test-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium', // the new headless mode, which supports extensions
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
});

after(async () => {
  await context?.close();
  server?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

describe('Reading Assist', () => {
  test('does not touch the page when settings are default', async () => {
    await clearState();
    const page = await openPage();
    assert.notEqual(await style(page, '#p1', 'fontSize'), '0px');
    assert.equal(await style(page, '#p1', 'lineHeight'), 'normal');
    await page.close();
  });

  test('applies font, size, spacing and width from saved settings', async () => {
    await clearState();
    await setState({ settings: { font: 'lexend', fontScale: 1.5, lineHeight: 2, letterSpacing: 0.1, wordSpacing: 0.2, maxWidth: 50 } });
    const page = await openPage();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#p1')).lineHeight !== 'normal');
    assert.match(await style(page, '#p1', 'fontFamily'), /RA Lexend/);
    assert.equal(await style(page, '#p1', 'fontSize'), '24px'); // 16px * 1.5
    assert.equal(await style(page, '#p1', 'lineHeight'), '48px'); // 24px * 2
    assert.notEqual(await style(page, '#p1', 'letterSpacing'), 'normal');
    // The font file really loaded from the extension.
    const loaded = await page.evaluate(async () => {
      await document.fonts.load('16px "RA Lexend"');
      return document.fonts.check('16px "RA Lexend"');
    });
    assert.equal(loaded, true);
    await page.close();
  });

  test('nested blocks are scaled once, not twice', async () => {
    await clearState();
    await setState({ settings: { fontScale: 1.5 } });
    const page = await openPage();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#p1')).fontSize === '24px');
    assert.equal(await style(page, '#nested', 'fontSize'), '24px');
    await page.close();
  });

  test('keeps code and icon fonts out of restyling', async () => {
    await clearState();
    await setState({ settings: { font: 'opendyslexic', letterSpacing: 0.1 } });
    const page = await openPage();
    await page.waitForFunction(() => /RA OpenDyslexic/.test(getComputedStyle(document.querySelector('#p1')).fontFamily));
    assert.match(await style(page, '#code code', 'fontFamily'), /monospace/);
    assert.match(await style(page, '#icon', 'fontFamily'), /FakeIconFont/);
    assert.equal(await style(page, '#code code', 'letterSpacing'), 'normal');
    await page.close();
  });

  test('applies a theme and recolors links', async () => {
    await clearState();
    await setState({ settings: { theme: 'paper' } });
    const page = await openPage();
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(244, 236, 216)');
    assert.equal(await style(page, '#p1', 'color'), 'rgb(59, 50, 38)');
    assert.equal(await style(page, '#link', 'color'), 'rgb(122, 59, 18)');
    await page.close();
  });

  test('live settings changes reach open pages without a reload', async () => {
    await clearState();
    const page = await openPage();
    await setState({ settings: { theme: 'contrast' } });
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, 0)');
    await setState({ settings: { theme: 'none' } });
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== 'rgb(0, 0, 0)');
    await page.close();
  });

  test('turning the extension off, or a single site off, restores the page', async () => {
    await clearState();
    await setState({ settings: { theme: 'contrast' } });
    const page = await openPage();
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, 0)');

    await setState({ settings: { theme: 'contrast', enabled: false } });
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== 'rgb(0, 0, 0)');

    await setState({ settings: { theme: 'contrast', enabled: true } });
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, 0)');

    await setState({ disabledSites: ['127.0.0.1'] });
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== 'rgb(0, 0, 0)');
    await page.close();
  });

  test('ignores corrupt stored values instead of breaking the page', async () => {
    await clearState();
    await setState({ settings: { fontScale: 'huge', theme: 'neon', font: 42, lineHeight: 999 } });
    const page = await openPage();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#p1')).lineHeight !== 'normal');
    assert.equal(await style(page, '#p1', 'fontSize'), '16px'); // bad fontScale falls back to 1
    assert.equal(await style(page, '#p1', 'lineHeight'), '41.6px'); // 999 is clamped to 2.6 × 16px
    await page.close();
  });

  test('reading ruler and focus mode add and remove their overlays', async () => {
    await clearState();
    await setState({ settings: { ruler: true, focus: true } });
    const page = await openPage();
    await page.waitForSelector('#ra-ruler', { state: 'attached' });
    await page.waitForSelector('#ra-focus', { state: 'attached' });
    await page.mouse.move(200, 100);
    await setState({ settings: { ruler: false, focus: false } });
    await page.waitForFunction(() => !document.querySelector('#ra-ruler') && !document.querySelector('#ra-focus'));
    await page.close();
  });

  test('word anchors bold word starts, skip code, and fully undo', async () => {
    await clearState();
    const page = await openPage();
    const original = await page.evaluate(() => document.querySelector('#p1').textContent);

    await setState({ settings: { anchors: true } });
    await page.waitForSelector('#p1 b.ra-b');
    assert.equal(await page.evaluate(() => document.querySelector('#p1').textContent), original); // text unchanged
    assert.equal(await page.evaluate(() => document.querySelectorAll('#code b, h1 b, #field b').length), 0);
    assert.ok((await page.evaluate(() => document.querySelector('#nested b.ra-b') !== null)));
    assert.equal(await style(page, '#p1 b.ra-b', 'fontWeight'), '700');

    await setState({ settings: { anchors: false } });
    await page.waitForFunction(() => document.querySelectorAll('b.ra-b').length === 0);
    assert.equal(await page.evaluate(() => document.querySelector('#p1').textContent), original);
    assert.equal(await page.evaluate(() => document.querySelector('#p1').childNodes.length), 1); // text nodes merged back
    await page.close();
  });

  test('anchors reach content added after load', async () => {
    await clearState();
    await setState({ settings: { anchors: true } });
    const page = await openPage();
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.id = 'late';
      p.textContent = 'Added dynamically after the page loaded';
      document.querySelector('article').append(p);
    });
    await page.waitForSelector('#late b.ra-b');
    await page.close();
  });

  test('popup loads and shows the controls', async () => {
    await clearState();
    const extId = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForSelector('#range-fontScale');
    assert.equal(await popup.locator('#themes input').count(), 7);
    assert.equal(await popup.locator('#presets button').count(), 4);
    await popup.selectOption('#font', 'lexend');
    await popup.waitForTimeout(500); // debounce before saving
    const saved = await worker.evaluate(() => chrome.storage.sync.get('settings'));
    assert.equal(saved.settings.font, 'lexend');
    await popup.close();
  });

  test('read aloud starts at the visible text and highlights the sentence', async () => {
    await clearState();
    const page = await openPage();
    await page.bringToFront();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true })).at(0)?.id);
    const reply = await worker.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'speak-toggle' }), tabId);
    assert.equal(reply.speaking, true);
    const highlighted = await page.evaluate(() => [...CSS.highlights.get('ra-speaking')].map((r) => r.toString()));
    assert.equal(highlighted[0], 'A heading'); // first visible block, one sentence at a time
    const stopped = await worker.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'speak-toggle' }), tabId);
    assert.equal(stopped.speaking, false);
    assert.equal(await page.evaluate(() => CSS.highlights.has('ra-speaking')), false);
    await page.close();
  });

  test('a previewed change reaches the page in well under a quarter second', async () => {
    await clearState();
    const page = await openPage();
    await page.bringToFront();
    await page.evaluate(() => {
      new MutationObserver(() => { window.__seenAt = Date.now(); }).observe(document.getElementById('ra-style'), { childList: true });
    });
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true })).at(0)?.id);
    const sentAt = await worker.evaluate(async (id) => {
      const t0 = Date.now();
      await chrome.tabs.sendMessage(id, { type: 'preview', settings: { enabled: true, font: 'serif', fontScale: 1.2, lineHeight: 1.8, letterSpacing: 0, wordSpacing: 0, maxWidth: 0, theme: 'paper', ruler: false, focus: false, anchors: false } });
      return t0;
    }, tabId);
    const seenAt = await page.evaluate(() => window.__seenAt);
    const ms = seenAt - sentAt;
    console.log('    preview latency (ms):', ms);
    assert.ok(ms < 250, 'took ' + ms + 'ms');
    await page.close();
  });

  test('magic buttons show the "creating magic" panel', async () => {
    await clearState();
    const page = await openPage();
    await page.bringToFront();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true })).at(0)?.id);
    await worker.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'magic', job: 'simplify' }), tabId);
    await page.waitForSelector('#ra-magic', { state: 'attached' });
    const text = await page.evaluate(() => document.querySelector('#ra-magic').shadowRoot.textContent);
    assert.match(text, /creating magic/);
    await page.close();
  });
});
