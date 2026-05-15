import { afterEach, describe, expect, it, vi } from 'vitest';
import { NeteaseLyricsProvider } from './NeteaseLyricsProvider';
import { QQMusicLyricsProvider } from './QQMusicLyricsProvider';
import { buildNormalizedLyricsQuery } from './lyricsQueryBuilder';
import type { LyricsQuery } from '../../shared/types/lyrics';

const query: LyricsQuery = {
  trackId: 'track-1',
  title: 'Echo Song',
  artist: 'Echo Artist',
  album: 'Echo Album',
  durationSeconds: 120,
};

const request = {
  query,
  normalized: buildNormalizedLyricsQuery(query),
  timeoutMs: 4500,
};

const mockJsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('China lyrics providers', () => {
  it('maps NetEase search and lyric responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          result: {
            songs: [
              {
                id: 123,
                name: 'Echo Song',
                duration: 120000,
                artists: [{ name: 'Echo Artist' }],
                album: { name: 'Echo Album' },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          lrc: { lyric: '[00:01.00]Line' },
          tlyric: { lyric: '[00:01.00]Translated' },
          romalrc: { lyric: '[00:01.00]Romanized' },
        }),
      );
    vi.stubGlobal(
      'fetch',
      fetchMock,
    );

    const [candidate] = await new NeteaseLyricsProvider().search(request);

    expect(candidate).toMatchObject({
      provider: 'netease',
      providerLyricsId: 'netease:123',
      title: 'Echo Song',
      artist: 'Echo Artist',
      album: 'Echo Album',
      durationSeconds: 120,
      syncedLyrics: '[00:01.00]Line',
      translationLyrics: '[00:01.00]Translated',
      romanizationLyrics: '[00:01.00]Romanized',
      sourceLabel: 'NetEase',
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('rv=-1');
  });

  it('maps NetEase nolyric responses to instrumental results', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          mockJsonResponse({
            result: {
              songs: [
                {
                  id: 456,
                  name: 'Echo Song Instrumental',
                  duration: 120000,
                  artists: [{ name: 'Echo Artist' }],
                  album: { name: 'Echo Album' },
                },
              ],
            },
          }),
        )
        .mockResolvedValueOnce(mockJsonResponse({ nolyric: true })),
    );

    const [candidate] = await new NeteaseLyricsProvider().search(request);

    expect(candidate.instrumental).toBe(true);
    expect(candidate.syncedLyrics).toBeNull();
    expect(candidate.plainLyrics).toBeNull();
  });

  it('maps QQ Music search and plain lyric responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          mockJsonResponse({
            req_1: {
              data: {
                body: {
                  song: {
                    list: [
                      {
                        mid: 'song-mid',
                        name: 'Echo Song',
                        interval: 120,
                        singer: [{ name: 'Echo Artist' }],
                        album: { name: 'Echo Album' },
                      },
                    ],
                  },
                },
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            lyric: '[00:01.00]Line',
            trans: '[00:01.00]Translated',
            roma: '[00:01.00]Romanized',
          }),
        ),
    );

    const [candidate] = await new QQMusicLyricsProvider().search(request);

    expect(candidate).toMatchObject({
      provider: 'qqmusic',
      providerLyricsId: 'qqmusic:song-mid',
      title: 'Echo Song',
      artist: 'Echo Artist',
      album: 'Echo Album',
      durationSeconds: 120,
      syncedLyrics: '[00:01.00]Line',
      translationLyrics: '[00:01.00]Translated',
      romanizationLyrics: '[00:01.00]Romanized',
      sourceLabel: 'QQ Music',
    });
  });

  it('decodes QQ Music base64 lyric fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          mockJsonResponse({
            req_1: {
              data: {
                body: {
                  song: {
                    list: [
                      {
                        mid: 'song-mid',
                        name: 'Echo Song',
                        interval: 120,
                        singer: [{ name: 'Echo Artist' }],
                        album: { name: 'Echo Album' },
                      },
                    ],
                  },
                },
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            lyric: Buffer.from('Plain line', 'utf8').toString('base64'),
          }),
        ),
    );

    const [candidate] = await new QQMusicLyricsProvider().search(request);

    expect(candidate.plainLyrics).toBe('Plain line');
  });

  it('falls back to the legacy QQ Music search response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          mockJsonResponse({
            req_1: {
              data: {
                body: {
                  song: {
                    list: [],
                  },
                },
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            data: {
              song: {
                list: [
                  {
                    mid: 'legacy-song-mid',
                    name: 'Echo Song',
                    interval: 120,
                    singer: [{ name: 'Echo Artist' }],
                    album: { name: 'Echo Album' },
                  },
                ],
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            lyric: '[00:01.00]Legacy line',
          }),
        ),
    );

    const [candidate] = await new QQMusicLyricsProvider().search(request);

    expect(candidate).toMatchObject({
      provider: 'qqmusic',
      providerLyricsId: 'qqmusic:legacy-song-mid',
      syncedLyrics: '[00:01.00]Legacy line',
    });
  });

  it('swallows provider network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(new NeteaseLyricsProvider().search(request)).resolves.toEqual([]);
    await expect(new QQMusicLyricsProvider().search(request)).resolves.toEqual([]);
  });
});
