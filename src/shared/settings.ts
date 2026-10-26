// The single description of what a user can change. The popup, content script,
// service worker and options page all import these types, so a misspelled
// setting name is a compile error instead of a feature that silently does nothing.

export type FontChoice = 'default' | 'opendyslexic' | 'atkinson' | 'lexend' | 'serif';
export type ThemeChoice = 'none' | 'paper' | 'cream' | 'blue' | 'green' | 'darksoft' | 'contrast';

export interface Settings {
  enabled: boolean;
  font: FontChoice;
  /** Multiplier on body text size. 1 leaves the page alone. */
  fontScale: number;
  /** Unitless line height. 0 leaves the page alone. */
  lineHeight: number;
  /** In em. 0 leaves the page alone. */
  letterSpacing: number;
  /** In em. 0 leaves the page alone. */
  wordSpacing: number;
  /** Maximum paragraph width in characters. 0 means no limit. */
  maxWidth: number;
  theme: ThemeChoice;
  ruler: boolean;
  focus: boolean;
  anchors: boolean;
}

export const DEFAULTS: Settings = {
  enabled: true,
  font: 'default',
  fontScale: 1,
  lineHeight: 0,
  letterSpacing: 0,
  wordSpacing: 0,
  maxWidth: 0,
  theme: 'none',
  ruler: false,
  focus: false,
  anchors: false,
};

export const RANGES = {
  fontScale: { min: 1, max: 2, step: 0.05 },
  lineHeight: { min: 0, max: 2.6, step: 0.1 },
  letterSpacing: { min: 0, max: 0.2, step: 0.01 },
  wordSpacing: { min: 0, max: 0.6, step: 0.02 },
  maxWidth: { min: 0, max: 100, step: 5 },
} as const;

export type NumericSettingKey = keyof typeof RANGES;

export interface FontInfo {
  label: string;
  /** CSS font-family value, or null to leave the page's own font. */
  family: string | null;
  /** Bundled files (relative to the extension root), if the font is not a system font. */
  files?: { regular: string; bold: string; format: 'woff' | 'woff2' };
}

export const FONTS: Record<FontChoice, FontInfo> = {
  default: { label: 'Page default', family: null },
  opendyslexic: {
    label: 'OpenDyslexic',
    family: '"RA OpenDyslexic", sans-serif',
    files: { regular: 'fonts/opendyslexic-400.woff', bold: 'fonts/opendyslexic-700.woff', format: 'woff' },
  },
  atkinson: {
    label: 'Atkinson Hyperlegible',
    family: '"RA Atkinson", sans-serif',
    files: { regular: 'fonts/atkinson-400.woff2', bold: 'fonts/atkinson-700.woff2', format: 'woff2' },
  },
  lexend: {
    label: 'Lexend',
    family: '"RA Lexend", sans-serif',
    files: { regular: 'fonts/lexend-400.woff2', bold: 'fonts/lexend-700.woff2', format: 'woff2' },
  },
  serif: { label: 'Book serif', family: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif' },
};

export interface ThemeInfo {
  label: string;
  bg: string;
  fg: string;
  link: string;
}

export const THEMES: Record<Exclude<ThemeChoice, 'none'>, ThemeInfo> = {
  paper: { label: 'Paper (novel)', bg: '#f4ecd8', fg: '#3b3226', link: '#7a3b12' },
  cream: { label: 'Cream', bg: '#fdf6e3', fg: '#222222', link: '#0b5394' },
  blue: { label: 'Soft blue', bg: '#dbe9f6', fg: '#1b2733', link: '#0b3d91' },
  green: { label: 'Soft green', bg: '#dff0d8', fg: '#1d2b1a', link: '#1b5e20' },
  darksoft: { label: 'Soft dark', bg: '#1f2329', fg: '#d8dde3', link: '#8ab4f8' },
  contrast: { label: 'High contrast', bg: '#000000', fg: '#ffffff', link: '#ffeb3b' },
};

export type PresetId = 'dyslexia' | 'adhd' | 'lowvision' | 'reset';

export interface Preset {
  label: string;
  description: string;
  settings: Partial<Settings>;
}

export const PRESETS: Record<PresetId, Preset> = {
  dyslexia: {
    label: 'Dyslexia',
    description: 'OpenDyslexic, roomy spacing, cream background',
    settings: {
      font: 'opendyslexic', fontScale: 1.15, lineHeight: 1.8, letterSpacing: 0.05, wordSpacing: 0.16,
      maxWidth: 70, theme: 'cream', ruler: false, focus: false, anchors: false,
    },
  },
  adhd: {
    label: 'ADHD focus',
    description: 'Lexend, narrow column, focus mode and word anchors',
    settings: {
      font: 'lexend', fontScale: 1.1, lineHeight: 1.7, letterSpacing: 0.02, wordSpacing: 0.08,
      maxWidth: 65, theme: 'paper', ruler: false, focus: true, anchors: true,
    },
  },
  lowvision: {
    label: 'Low vision',
    description: 'Large Atkinson Hyperlegible, high contrast',
    settings: {
      font: 'atkinson', fontScale: 1.5, lineHeight: 1.6, letterSpacing: 0.04, wordSpacing: 0.1,
      maxWidth: 0, theme: 'contrast', ruler: false, focus: false, anchors: false,
    },
  },
  reset: {
    label: 'Reset',
    description: 'Back to the original page',
    settings: { ...DEFAULTS, enabled: true },
  },
};

export interface StoredState {
  settings: Settings;
  /** Hostnames where the user turned Reading Assist off. */
  disabledSites: string[];
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function clampNumber(value: unknown, key: NumericSettingKey): number {
  const { min, max } = RANGES[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULTS[key];
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

/** Turns whatever is in storage (missing, old, or hand-edited) into a valid Settings object. */
export function mergeSettings(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULTS.enabled,
    font: isOneOf(input.font, Object.keys(FONTS) as FontChoice[]) ? input.font : DEFAULTS.font,
    fontScale: clampNumber(input.fontScale, 'fontScale'),
    lineHeight: clampNumber(input.lineHeight, 'lineHeight'),
    letterSpacing: clampNumber(input.letterSpacing, 'letterSpacing'),
    wordSpacing: clampNumber(input.wordSpacing, 'wordSpacing'),
    maxWidth: clampNumber(input.maxWidth, 'maxWidth'),
    theme: isOneOf(input.theme, ['none', ...Object.keys(THEMES)] as ThemeChoice[]) ? input.theme : DEFAULTS.theme,
    ruler: typeof input.ruler === 'boolean' ? input.ruler : DEFAULTS.ruler,
    focus: typeof input.focus === 'boolean' ? input.focus : DEFAULTS.focus,
    anchors: typeof input.anchors === 'boolean' ? input.anchors : DEFAULTS.anchors,
  };
}

export function mergeDisabledSites(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

export async function loadState(): Promise<StoredState> {
  const raw = await chrome.storage.sync.get(['settings', 'disabledSites']);
  return { settings: mergeSettings(raw.settings), disabledSites: mergeDisabledSites(raw.disabledSites) };
}

export function saveSettings(settings: Settings): Promise<void> {
  return chrome.storage.sync.set({ settings });
}

export function saveDisabledSites(disabledSites: string[]): Promise<void> {
  return chrome.storage.sync.set({ disabledSites });
}

/** The settings that should apply on `hostname`, or null when Reading Assist is off there. */
export function effectiveSettings(settings: Settings, disabledSites: readonly string[], hostname: string): Settings | null {
  if (!settings.enabled || disabledSites.includes(hostname)) return null;
  return settings;
}
