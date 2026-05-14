import { describe, expect, it } from 'vitest';
import { fillMissingRomanization } from './lyricsRomanization';

describe('lyricsRomanization', () => {
  it('loads kuroshiro from its CommonJS-shaped ESM namespace and fills missing romaji', async () => {
    const lines = await fillMissingRomanization([{ timeMs: 1000, text: '君が好き' }]);

    expect(lines).toEqual([{ timeMs: 1000, text: '君が好き', romanization: 'kimi ga suki' }]);
  });
});
