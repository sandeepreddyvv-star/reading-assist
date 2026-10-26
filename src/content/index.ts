import type { ContentMessage, ContentReply } from '../shared/messages';
import { effectiveSettings, loadState, mergeDisabledSites, mergeSettings, type Settings, type StoredState } from '../shared/settings';
import { setAnchors } from './anchors';
import { setFocus } from './focus';
import { showMagic } from './magic';
import { setRuler } from './ruler';
import * as speech from './speech';
import { buildCss } from './styles';

const hostname = location.hostname;
let state: StoredState | null = null;
let lastPreviewAt = 0;

const style = document.createElement('style');
style.id = 'ra-style';

function render(s: Settings | null): void {
  if (!style.isConnected) document.documentElement.appendChild(style);
  style.textContent = s ? buildCss(s) : '';
  setRuler(!!s?.ruler);
  setFocus(!!s?.focus);
  setAnchors(!!s?.anchors);
  if (!s) speech.stop();
}

function renderState(): void {
  if (state) render(effectiveSettings(state.settings, state.disabledSites, hostname));
}

void loadState().then((loaded) => {
  state = loaded;
  renderState();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !state) return;
  const previewedJustNow = Date.now() - lastPreviewAt < 800;
  if (changes.disabledSites) state.disabledSites = mergeDisabledSites(changes.disabledSites.newValue);
  // The popup already previewed its latest value, so keep the on-screen one rather than
  // flicker back to an older save that arrives mid-drag.
  if (changes.settings && !previewedJustNow) state.settings = mergeSettings(changes.settings.newValue);
  if (changes.disabledSites || !previewedJustNow) renderState();
});

chrome.runtime.onMessage.addListener((msg: ContentMessage, _sender, sendResponse: (r: ContentReply) => void) => {
  switch (msg.type) {
    case 'preview':
      lastPreviewAt = Date.now();
      if (state) {
        state.settings = msg.settings;
        renderState();
      }
      sendResponse({ ok: true });
      break;
    case 'speak-toggle':
      sendResponse({ ok: true, speaking: speech.toggle() });
      break;
    case 'magic':
      showMagic(msg.job);
      sendResponse({ ok: true });
      break;
    default:
      sendResponse({ ok: true });
  }
});
