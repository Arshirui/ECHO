import { describe, expect, it } from 'vitest';
import { detectLyricsKind, parsePlainLyrics, parseSyncedLyrics } from './lyricsParser';

describe('lyricsParser', () => {
  it('parses centisecond timestamps', () => {
    expect(parseSyncedLyrics('[00:12.34]Hello')).toEqual([{ timeMs: 12340, text: 'Hello' }]);
  });

  it('parses millisecond timestamps', () => {
    expect(parseSyncedLyrics('[00:12.345]Hello')).toEqual([{ timeMs: 12345, text: 'Hello' }]);
  });

  it('parses multiple timestamps on one line', () => {
    expect(parseSyncedLyrics('[00:01.00][00:02.00]Echo')).toEqual([
      { timeMs: 1000, text: 'Echo' },
      { timeMs: 2000, text: 'Echo' },
    ]);
  });

  it('ignores metadata tags', () => {
    expect(parseSyncedLyrics('[ar:Artist]\n[ti:Title]\n[00:01.00]Line')).toEqual([{ timeMs: 1000, text: 'Line' }]);
  });

  it('parses plain lyrics with timeMs=-1', () => {
    expect(parsePlainLyrics('First\n\nSecond')).toEqual([
      { timeMs: -1, text: 'First' },
      { timeMs: -1, text: 'Second' },
    ]);
  });

  it('detects instrumental before text lyrics', () => {
    expect(detectLyricsKind({ instrumental: true, plainLyrics: 'Text' })).toBe('instrumental');
  });
});
