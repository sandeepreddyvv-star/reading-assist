import type { ContentMessage } from '../shared/messages';
import { loadState, saveSettings } from '../shared/settings';

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-enabled') {
    const { settings } = await loadState();
    await saveSettings({ ...settings, enabled: !settings.enabled });
  } else if (command === 'toggle-speech') {
    const id = await activeTabId();
    if (id === undefined) return;
    const msg: ContentMessage = { type: 'speak-toggle' };
    // Fails on pages without our content script (chrome:// pages, tabs opened before install); nothing to do.
    await chrome.tabs.sendMessage(id, msg).catch(() => {});
  }
});
