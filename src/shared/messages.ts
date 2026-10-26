import type { Settings } from './settings';

export type MagicJobType = 'simplify' | 'summarize' | 'chunk' | 'visualize';

/**
 * Magic-tier work (anything that needs an AI backend and takes seconds).
 * In v1 every job ends as 'unavailable'; the shape is fixed now so a real backend can be added later
 * without touching the popup or the content script.
 */
export type MagicJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'unavailable';

export interface MagicJob {
  type: MagicJobType;
  text: string;
  status: MagicJobStatus;
  /** 0 to 1. Only meaningful while status is 'running'. */
  progress: number;
  result?: string;
}

export const MAGIC_LABELS: Record<MagicJobType, string> = {
  simplify: 'Simplify the text',
  summarize: 'Summarize the page',
  chunk: 'Break into steps',
  visualize: 'Explain visually',
};

/** Messages sent from the popup or service worker to a page's content script. */
export type ContentMessage =
  | { type: 'ping' }
  /** Show these settings immediately, before they are saved. */
  | { type: 'preview'; settings: Settings }
  | { type: 'speak-toggle' }
  | { type: 'magic'; job: MagicJobType };

export interface ContentReply {
  ok: true;
  speaking?: boolean;
}
