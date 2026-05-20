import { describe, expect, it } from 'vitest';
import { getLyricsSmartAlignmentRawOffset, suggestLyricsSmartAlignment } from './lyricsSmartAlignment';
import type { LyricsSmartAlignmentAnchor } from './lyricsSmartAlignment';

const anchor = (overrides: Partial<LyricsSmartAlignmentAnchor> = {}): LyricsSmartAlignmentAnchor => ({
  lyricLineTimeMs: 10000,
  playbackMs: 10200,
  globalOffsetMs: 0,
  outputMode: 'shared',
  ...overrides,
});

describe('lyrics smart alignment', () => {
  it('computes the same raw offset formula used by manual alignment', () => {
    expect(getLyricsSmartAlignmentRawOffset(anchor({ globalOffsetMs: 1000 }))).toBe(-1200);
  });

  it('returns a medium-confidence suggestion from one anchor', () => {
    expect(suggestLyricsSmartAlignment([anchor()])).toMatchObject({
      offsetMs: -200,
      confidence: 'medium',
      reason: 'single_anchor',
      outputMode: 'shared',
      anchorCount: 1,
      canApply: true,
      rejectedAnchors: [],
    });
  });

  it('uses the median for stable multiple anchors', () => {
    expect(
      suggestLyricsSmartAlignment([
        anchor({ playbackMs: 10200 }),
        anchor({ playbackMs: 10240 }),
        anchor({ playbackMs: 10180 }),
      ]),
    ).toMatchObject({
      offsetMs: -200,
      confidence: 'high',
      reason: 'stable_anchors',
      anchorCount: 3,
      spreadMs: 40,
      canApply: true,
    });
  });

  it('rejects outlier anchors and lowers confidence', () => {
    const suggestion = suggestLyricsSmartAlignment([
      anchor({ playbackMs: 10200 }),
      anchor({ playbackMs: 10180 }),
      anchor({ playbackMs: 17000 }),
    ]);

    expect(suggestion).toMatchObject({
      offsetMs: -190,
      confidence: 'low',
      reason: 'outlier_rejected',
      anchorCount: 2,
      canApply: false,
    });
    expect(suggestion?.rejectedAnchors).toHaveLength(1);
  });

  it('blocks low-confidence suggestions when anchors are unstable', () => {
    expect(
      suggestLyricsSmartAlignment([
        anchor({ playbackMs: 10200 }),
        anchor({ playbackMs: 11400 }),
      ]),
    ).toMatchObject({
      offsetMs: -800,
      confidence: 'low',
      reason: 'unstable_anchors',
      spreadMs: 600,
      canApply: false,
    });
  });

  it('flags possible timeline drift without creating segmented corrections', () => {
    const suggestion = suggestLyricsSmartAlignment([
      anchor({ lyricLineTimeMs: 0, playbackMs: 100 }),
      anchor({ lyricLineTimeMs: 30000, playbackMs: 30300 }),
      anchor({ lyricLineTimeMs: 60000, playbackMs: 60850 }),
    ]);

    expect(suggestion).toMatchObject({
      offsetMs: -300,
      confidence: 'low',
      reason: 'possible_drift',
      driftDetected: true,
      driftMs: -750,
      canApply: false,
    });
  });

  it('clamps extreme suggestions into the saved lyrics offset range', () => {
    expect(suggestLyricsSmartAlignment([anchor({ lyricLineTimeMs: 60000, playbackMs: 0 })])?.offsetMs).toBe(10000);
    expect(suggestLyricsSmartAlignment([anchor({ lyricLineTimeMs: 0, playbackMs: 60000 })])?.offsetMs).toBe(-10000);
  });

  it('keeps ASIO and exclusive output modes on the suggestion', () => {
    expect(suggestLyricsSmartAlignment([anchor({ outputMode: 'asio' })])?.outputMode).toBe('asio');
    expect(suggestLyricsSmartAlignment([anchor({ outputMode: 'exclusive' })])?.outputMode).toBe('exclusive');
  });
});
