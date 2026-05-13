import { describe, expect, it } from 'vitest';
import type { LyricsQuery, LyricsSearchCandidate } from '../../shared/types/lyrics';
import { canAutoAcceptLyricsCandidate, normalizeText, scoreLyricsCandidate } from './lyricsScoring';

const query: LyricsQuery = {
  trackId: 'track-1',
  title: 'Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  durationSeconds: 120,
};

const candidate = (overrides: Partial<LyricsSearchCandidate> = {}): LyricsSearchCandidate => ({
  id: 'candidate-1',
  provider: 'lrclib',
  providerLyricsId: 'lrclib-1',
  title: 'Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  durationSeconds: 120,
  instrumental: false,
  hasSynced: true,
  hasPlain: true,
  score: 1,
  sourceLabel: 'LRCLIB',
  ...overrides,
});

describe('lyricsScoring', () => {
  it('normalizes bracketed descriptors conservatively', () => {
    expect(normalizeText('Echo Song (TV Size)')).toBe('echo song');
  });

  it('scores exact matches highly', () => {
    expect(scoreLyricsCandidate(query, candidate())).toBeGreaterThan(0.95);
  });

  it('penalizes large duration mismatch', () => {
    const score = scoreLyricsCandidate(query, candidate({ durationSeconds: 300 }));

    expect(score).toBeLessThan(0.9);
  });

  it('does not auto accept when title or artist is missing', () => {
    expect(canAutoAcceptLyricsCandidate({ ...query, artist: '' }, candidate({ score: 0.99 }), 0.82)).toBe(false);
    expect(canAutoAcceptLyricsCandidate({ ...query, title: '' }, candidate({ score: 0.99 }), 0.82)).toBe(false);
  });
});
