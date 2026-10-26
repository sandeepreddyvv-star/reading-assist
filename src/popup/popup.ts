import { MAGIC_LABELS, type ContentMessage, type MagicJobType } from '../shared/messages';
import {
  FONTS, PRESETS, RANGES, THEMES, loadState, saveDisabledSites, saveSettings,
  type FontChoice, type NumericSettingKey, type Settings, type ThemeChoice,
} from '../shared/settings';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`popup.html is missing #${id}`);
  return el as T;
};

const SLIDERS: { key: NumericSettingKey; label: string; format: (v: number) => string }[] = [
  { key: 'fontScale', label: 'Text size', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'lineHeight', label: 'Line spacing', format: (v) => (v === 0 ? 'Page default' : v.toFixed(1)) },
  { key: 'letterSpacing', label: 'Letter spacing', format: (v) => (v === 0 ? 'Page default' : `${v.toFixed(2)} em`) },
  { key: 'wordSpacing', label: 'Word spacing', format: (v) => (v === 0 ? 'Page default' : `${v.toFixed(2)} em`) },
  { key: 'maxWidth', label: 'Line length', format: (v) => (v === 0 ? 'No limit' : `${v} characters`) },
];

let settings: Settings;
let disabledSites: string[] = [];
let tab: chrome.tabs.Tab | undefined;
let hostname: string | null = null;
let saveTimer: number | undefined;

function sendToTab(msg: ContentMessage): Promise<unknown> {
  if (tab?.id === undefined) return Promise.reject(new Error('no tab'));
  return chrome.tabs.sendMessage(tab.id, msg);
}

/** Show the change on the page right away, and save it shortly after (storage.sync is rate-limited). */
function commit(): void {
  void sendToTab({ type: 'preview', settings }).catch(() => {});
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveSettings(settings), 300);
}

function showNote(text: string): void {
  const note = $('note');
  note.textContent = text;
  note.hidden = false;
}

function buildControls(): void {
  const font = $<HTMLSelectElement>('font');
  for (const [id, info] of Object.entries(FONTS)) font.add(new Option(info.label, id));
  font.addEventListener('change', () => {
    settings.font = font.value as FontChoice;
    commit();
  });

  const sliders = $('sliders');
  for (const { key, label } of SLIDERS) {
    const wrap = document.createElement('label');
    wrap.className = 'slider';
    wrap.innerHTML = `<span>${label}</span><output id="out-${key}"></output>`;
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `range-${key}`;
    input.min = String(RANGES[key].min);
    input.max = String(RANGES[key].max);
    input.step = String(RANGES[key].step);
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      renderSlider(key);
      commit();
    });
    wrap.append(input);
    sliders.append(wrap);
  }

  const themes = $('themes');
  const options: [ThemeChoice, string, string, string][] = [
    ['none', 'Original', 'transparent', 'inherit'],
    ...Object.entries(THEMES).map(([id, t]) => [id as ThemeChoice, t.label, t.bg, t.fg] as [ThemeChoice, string, string, string]),
  ];
  for (const [id, label, bg, fg] of options) {
    const wrap = document.createElement('label');
    wrap.className = 'theme';
    wrap.innerHTML = `<input type="radio" name="theme" value="${id}"><span style="background:${bg};color:${fg}">${label}</span>`;
    wrap.querySelector('input')?.addEventListener('change', () => {
      settings.theme = id;
      commit();
    });
    themes.append(wrap);
  }

  const presets = $('presets');
  for (const preset of Object.values(PRESETS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = preset.label;
    b.title = preset.description;
    b.addEventListener('click', () => {
      settings = { ...settings, ...preset.settings, enabled: true };
      renderAll();
      commit();
    });
    presets.append(b);
  }

  for (const key of ['ruler', 'focus', 'anchors'] as const) {
    $<HTMLInputElement>(key).addEventListener('change', (e) => {
      settings[key] = (e.target as HTMLInputElement).checked;
      commit();
    });
  }

  $<HTMLInputElement>('enabled').addEventListener('change', (e) => {
    settings.enabled = (e.target as HTMLInputElement).checked;
    commit();
  });

  $<HTMLInputElement>('site-off').addEventListener('change', (e) => {
    if (!hostname) return;
    const off = (e.target as HTMLInputElement).checked;
    disabledSites = off ? [...new Set([...disabledSites, hostname])] : disabledSites.filter((h) => h !== hostname);
    void saveDisabledSites(disabledSites);
  });

  const speak = $<HTMLButtonElement>('speak');
  speak.addEventListener('click', async () => {
    try {
      const reply = (await sendToTab({ type: 'speak-toggle' })) as { speaking?: boolean };
      speak.textContent = reply.speaking ? '■ Stop reading' : '▶ Read aloud';
    } catch {
      showNote('Reload this page once, then try again.');
    }
  });

  const magic = $('magic');
  for (const job of Object.keys(MAGIC_LABELS) as MagicJobType[]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = MAGIC_LABELS[job];
    b.addEventListener('click', () => {
      void sendToTab({ type: 'magic', job }).then(() => window.close(), () => showNote('Reload this page once, then try again.'));
    });
    magic.append(b);
  }

  $('options').addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.runtime.openOptionsPage();
  });
}

function renderSlider(key: NumericSettingKey): void {
  const def = SLIDERS.find((s) => s.key === key);
  if (!def) return;
  $<HTMLInputElement>(`range-${key}`).value = String(settings[key]);
  $(`out-${key}`).textContent = def.format(settings[key]);
}

function renderAll(): void {
  $<HTMLInputElement>('enabled').checked = settings.enabled;
  $<HTMLSelectElement>('font').value = settings.font;
  for (const { key } of SLIDERS) renderSlider(key);
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="theme"]')) {
    input.checked = input.value === settings.theme;
  }
  for (const key of ['ruler', 'focus', 'anchors'] as const) $<HTMLInputElement>(key).checked = settings[key];
  $<HTMLInputElement>('site-off').checked = hostname !== null && disabledSites.includes(hostname);
}

async function init(): Promise<void> {
  const state = await loadState();
  settings = state.settings;
  disabledSites = state.disabledSites;

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab?.url ?? '');
    if (url.protocol === 'http:' || url.protocol === 'https:') hostname = url.hostname;
  } catch {
    // no usable URL (e.g. chrome:// pages)
  }

  buildControls();
  renderAll();

  if (!hostname) {
    document.body.dataset.unavailable = '';
    showNote('Reading Assist can’t change this kind of page. Your settings are still saved.');
    $('site-name').textContent = 'this page';
    return;
  }
  $('site-name').textContent = hostname;
  try {
    await sendToTab({ type: 'ping' });
  } catch {
    showNote('Reload this page once to start Reading Assist on it.');
  }
}

void init();
