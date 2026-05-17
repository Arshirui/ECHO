import { afterEach, describe, expect, it, vi } from 'vitest';
import { NeteaseStreamingProvider, setNeteaseApiForTests } from './NeteaseStreamingProvider';
import { QQMusicStreamingProvider } from './QQMusicStreamingProvider';

const accountStatus = vi.hoisted(() => ({
  connected: true,
  displayName: 'Tester',
  username: 'tester',
  avatarUrl: null,
}));

vi.mock('../../accounts/AccountService', () => ({
  getAccountService: () => ({
    getStatus: (provider: string) => ({
      provider,
      connected: accountStatus.connected,
      username: accountStatus.username,
      displayName: accountStatus.displayName,
      avatarUrl: accountStatus.avatarUrl,
      lastLoginAt: '2026-01-01T00:00:00.000Z',
      lastCheckedAt: null,
      expiresAt: null,
      error: null,
    }),
    getCredentials: (provider: string) => ({
      provider,
      cookie: provider === 'qqmusic' ? 'uin=o123456; qm_keyst=secret' : 'MUSIC_U=secret; csrf=hidden',
    }),
  }),
}));

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const remoteImageUrl = (url: string, referer: string): string =>
  `echo-image://remote/${encodeURIComponent(url)}?referer=${encodeURIComponent(referer)}`;

afterEach(() => {
  vi.unstubAllGlobals();
  setNeteaseApiForTests(undefined);
  accountStatus.connected = true;
});

describe('China streaming providers', () => {
  it('maps NetEase search results to streaming tracks', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            result: {
              songCount: 1,
              songs: [
                {
                  id: 123,
                  name: '测试歌曲',
                  duration: 181000,
                  artists: [{ id: 1, name: '测试歌手' }],
                  album: { id: 2, name: '测试专辑', picId: 109951 },
                },
              ],
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            songs: [
              {
                id: 123,
                album: { picUrl: 'https://p.music.126.net/detail-cover.jpg' },
              },
            ],
          }),
        ),
    );

    const result = await new NeteaseStreamingProvider().search({ provider: 'netease', query: '测试', page: 1, pageSize: 10 });

    expect(result.tracks[0]).toMatchObject({
      provider: 'netease',
      providerTrackId: '123',
      stableKey: 'streaming:netease:123',
      title: '测试歌曲',
      artist: '测试歌手',
      album: '测试专辑',
      duration: 181,
      coverThumb: remoteImageUrl('https://p.music.126.net/detail-cover.jpg?param=160y160', 'https://music.163.com/'),
    });
  });

  it('retries NetEase search with normalized query variants when the exact query is empty', async () => {
    const fetchRunner = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ result: { songCount: 0, songs: [] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            songCount: 1,
            songs: [
              {
                id: 321,
                name: 'Echo Lab',
                duration: 181000,
                artists: [{ id: 1, name: 'Variant Artist' }],
                album: { id: 2, name: 'Variant Album' },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          songs: [
            {
              id: 321,
              album: { picUrl: 'https://p.music.126.net/variant-cover.jpg' },
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchRunner);

    const result = await new NeteaseStreamingProvider().search({ provider: 'netease', query: 'Echo-Lab', page: 1, pageSize: 10 });

    expect(result.query).toBe('Echo-Lab');
    expect(result.tracks[0]).toMatchObject({
      providerTrackId: '321',
      title: 'Echo Lab',
    });
    expect(String(fetchRunner.mock.calls[0][0])).toContain('s=Echo-Lab');
    expect(String(fetchRunner.mock.calls[1][0])).toContain('s=Echo+Lab');
  });

  it('maps NetEase album search results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          result: {
            albumCount: 1,
            albums: [
              {
                id: 456,
                name: '测试专辑',
                publishTime: 1767225600000,
                size: 12,
                picUrl: 'https://p.music.126.net/album.jpg',
                artists: [{ id: 1, name: '测试歌手' }],
              },
            ],
          },
        }),
      ),
    );

    const result = await new NeteaseStreamingProvider().search({ provider: 'netease', query: '测试', mediaTypes: ['album'], page: 1, pageSize: 10 });

    expect(result.albums[0]).toMatchObject({
      provider: 'netease',
      providerAlbumId: '456',
      title: '测试专辑',
      artist: '测试歌手',
      trackCount: 12,
      releaseDate: '2026-01-01',
      coverThumb: remoteImageUrl('https://p.music.126.net/album.jpg?param=160y160', 'https://music.163.com/'),
    });
  });

  it('maps NetEase playlist search results', async () => {
    const fetchRunner = vi.fn().mockResolvedValue(
      jsonResponse({
        result: {
          playlistCount: 1,
          playlists: [
            {
              id: 7788,
              name: 'NetEase Playlist',
              trackCount: 42,
              coverImgUrl: 'https://p.music.126.net/playlist.jpg',
              creator: { nickname: 'NetEase DJ' },
            },
          ],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchRunner);

    const result = await new NeteaseStreamingProvider().search({ provider: 'netease', query: 'mix', mediaTypes: ['playlist'], page: 1, pageSize: 10 });

    expect(String(fetchRunner.mock.calls[0][0])).toContain('type=1000');
    expect(result.playlists[0]).toMatchObject({
      provider: 'netease',
      providerPlaylistId: '7788',
      title: 'NetEase Playlist',
      creator: 'NetEase DJ',
      trackCount: 42,
      coverThumb: remoteImageUrl('https://p.music.126.net/playlist.jpg?param=160y160', 'https://music.163.com/'),
    });
  });

  it('loads NetEase album details for clickable streaming albums', async () => {
    setNeteaseApiForTests(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          album: {
            id: 456,
            name: 'NetEase Detail Album',
            publishTime: 1767225600000,
            size: 1,
            picUrl: 'https://p.music.126.net/album-detail.jpg',
            artists: [{ id: 1, name: 'Detail Artist' }],
          },
          songs: [
            {
              id: 123,
              name: 'Detail Song',
              duration: 181000,
              artists: [{ id: 1, name: 'Detail Artist' }],
              album: { id: 456, name: 'NetEase Detail Album' },
            },
          ],
        }),
      ),
    );

    const detail = await new NeteaseStreamingProvider().getAlbum({ providerAlbumId: '456' });

    expect(detail).toMatchObject({
      provider: 'netease',
      providerAlbumId: '456',
      title: 'NetEase Detail Album',
      artist: 'Detail Artist',
    });
    expect(detail.tracks[0]).toMatchObject({
      providerTrackId: '123',
      title: 'Detail Song',
    });
  });

  it('loads NetEase album tracks from the enhanced album API shape', async () => {
    const albumApi = vi.fn().mockResolvedValue({
      body: {
        album: {
          id: 457,
          name: 'NetEase API Album',
          publishTime: 1767225600000,
          size: 1,
          picUrl: 'https://p.music.126.net/api-album.jpg',
          artists: [{ id: 1, name: 'API Artist' }],
          songs: [
            {
              id: 124,
              name: 'API Song',
              duration: 181000,
              artists: [{ id: 1, name: 'API Artist' }],
              album: { id: 457, name: 'NetEase API Album' },
            },
          ],
        },
      },
    });
    setNeteaseApiForTests({ album: albumApi });

    const detail = await new NeteaseStreamingProvider().getAlbum({ providerAlbumId: '457' });

    expect(albumApi).toHaveBeenCalledWith(expect.objectContaining({ id: '457', cookie: 'MUSIC_U=secret; csrf=hidden' }));
    expect(detail.tracks).toHaveLength(1);
    expect(detail.tracks[0]).toMatchObject({
      providerTrackId: '124',
      title: 'API Song',
    });
  });

  it('maps NetEase artist search results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          result: {
            artistCount: 1,
            artists: [
              {
                id: 789,
                name: '测试歌手',
                picUrl: 'https://p.music.126.net/artist.jpg',
              },
            ],
          },
        }),
      ),
    );

    const result = await new NeteaseStreamingProvider().search({ provider: 'netease', query: '测试', mediaTypes: ['artist'], page: 1, pageSize: 10 });

    expect(result.artists[0]).toMatchObject({
      provider: 'netease',
      providerArtistId: '789',
      name: '测试歌手',
      avatarUrl: remoteImageUrl('https://p.music.126.net/artist.jpg?param=160y160', 'https://music.163.com/'),
    });
  });

  it('falls back to NetEase track search to discover strict artist results', async () => {
    const fetchRunner = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ result: { artistCount: 0, artists: [] } }))
      .mockResolvedValueOnce(jsonResponse({ result: { artistCount: 0, artists: [] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            songCount: 1,
            songs: [
              {
                id: 123,
                name: 'Isekai Song',
                duration: 181000,
                artists: [{ id: 789, name: '異世界情緒' }],
                album: { id: 456, name: 'Isekai Album' },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ songs: [{ id: 123, album: { picUrl: 'https://p.music.126.net/isekai.jpg' } }] }));
    vi.stubGlobal('fetch', fetchRunner);

    const result = await new NeteaseStreamingProvider().search({ provider: 'netease', query: '异世界情绪', mediaTypes: ['artist'], page: 1, pageSize: 10 });

    expect(result.query).toBe('异世界情绪');
    expect(result.tracks).toEqual([]);
    expect(result.artists[0]).toMatchObject({
      provider: 'netease',
      providerArtistId: '789',
      name: '異世界情緒',
    });
    expect(String(fetchRunner.mock.calls[0][0])).toContain('type=100');
    expect(String(fetchRunner.mock.calls[2][0])).toContain('type=1');
  });

  it('loads NetEase artist details with top tracks and albums', async () => {
    const artistsApi = vi.fn().mockResolvedValue({
      body: {
        artist: { id: 789, name: 'NetEase Artist', picUrl: 'https://p.music.126.net/artist-detail.jpg' },
        hotSongs: [],
      },
    });
    const topSongApi = vi.fn().mockResolvedValue({
      body: {
        songs: [
          {
            id: 123,
            name: 'Artist Song',
            duration: 181000,
            artists: [{ id: 789, name: 'NetEase Artist' }],
            album: { id: 456, name: 'Artist Album' },
          },
        ],
      },
    });
    const artistAlbumApi = vi.fn().mockResolvedValue({
      body: {
        hotAlbums: [
          {
            id: 456,
            name: 'Artist Album',
            publishTime: 1767225600000,
            size: 1,
            picUrl: 'https://p.music.126.net/artist-album.jpg',
            artists: [{ id: 789, name: 'NetEase Artist' }],
          },
        ],
      },
    });
    setNeteaseApiForTests({ artists: artistsApi, artist_top_song: topSongApi, artist_album: artistAlbumApi });

    const detail = await new NeteaseStreamingProvider().getArtist({ providerArtistId: '789' });

    expect(artistsApi).toHaveBeenCalledWith(expect.objectContaining({ id: '789', cookie: 'MUSIC_U=secret; csrf=hidden' }));
    expect(detail).toMatchObject({
      provider: 'netease',
      providerArtistId: '789',
      name: 'NetEase Artist',
    });
    expect(detail.topTracks[0]).toMatchObject({ providerTrackId: '123', title: 'Artist Song' });
    expect(detail.albums[0]).toMatchObject({ providerAlbumId: '456', title: 'Artist Album' });
  });

  it('resolves NetEase playback with CDN request headers for the native decoder', async () => {
    setNeteaseApiForTests(null);
    const fetchRunner = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 123,
            url: 'https://m701.music.126.net/token/song.mp3',
            br: 320000,
            type: 'mp3',
          },
        ],
      }),
    );
    vi.stubGlobal(
      'fetch',
      fetchRunner,
    );

    const source = await new NeteaseStreamingProvider().resolvePlayback({ provider: 'netease', providerTrackId: '123', quality: 'high' });

    expect(String(fetchRunner.mock.calls[0][0])).toContain('csrf_token=hidden');
    expect(String(fetchRunner.mock.calls[0][0])).toContain('os=pc');
    expect(source).toMatchObject({
      provider: 'netease',
      providerTrackId: '123',
      url: 'https://m701.music.126.net/token/song.mp3',
      headers: expect.objectContaining({
        Referer: 'https://music.163.com/',
        Origin: 'https://music.163.com',
        Cookie: 'MUSIC_U=secret; csrf=hidden',
      }),
      requiresProxy: false,
      supportsRange: true,
    });
  });

  it('uses the NetEase enhanced song_url_v1 resolver before the public URL fallback', async () => {
    const songUrlV1 = vi.fn().mockResolvedValue({
      body: {
        data: [
          {
            url: 'https://m701.music.126.net/enhanced/song.flac',
            br: 999000,
            type: 'flac',
            level: 'lossless',
          },
        ],
      },
    });
    const fetchRunner = vi.fn();
    setNeteaseApiForTests({ song_url_v1: songUrlV1 });
    vi.stubGlobal('fetch', fetchRunner);

    const source = await new NeteaseStreamingProvider().resolvePlayback({ provider: 'netease', providerTrackId: '123', quality: 'lossless' });

    expect(songUrlV1).toHaveBeenCalledWith({
      id: 123,
      level: 'lossless',
      cookie: 'MUSIC_U=secret; csrf=hidden',
    });
    expect(fetchRunner).not.toHaveBeenCalled();
    expect(source).toMatchObject({
      url: 'https://m701.music.126.net/enhanced/song.flac',
      codec: 'flac',
      bitrate: 999000,
      headers: expect.objectContaining({
        Cookie: 'MUSIC_U=secret; csrf=hidden',
        Referer: 'https://music.163.com/',
      }),
    });
  });

  it('falls back to high quality when NetEase max quality returns no URL', async () => {
    setNeteaseApiForTests(null);
    const fetchRunner = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 123, url: null, br: 999000, type: 'flac', code: 200 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 123, url: null, br: 999000, type: 'flac', code: 200 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 123, url: null, br: 999000, type: 'flac', code: 200 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 123, url: null, br: 999000, type: 'flac', code: 200 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 123, url: null, br: 999000, type: 'flac', code: 200 }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 123,
              url: 'https://m701.music.126.net/token/song.mp3',
              br: 320000,
              type: 'mp3',
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchRunner);

    const source = await new NeteaseStreamingProvider().resolvePlayback({ provider: 'netease', providerTrackId: '123', quality: 'hires' });

    expect(source).toMatchObject({
      url: 'https://m701.music.126.net/token/song.mp3',
      codec: 'mp3',
      bitrate: 320000,
    });
    expect(fetchRunner).toHaveBeenCalledTimes(6);
    expect(String(fetchRunner.mock.calls[0][0])).toContain('level=jymaster');
    expect(String(fetchRunner.mock.calls[3][0])).toContain('level=hires');
    expect(String(fetchRunner.mock.calls[5][0])).toContain('level=exhigh');
    expect(String(fetchRunner.mock.calls[0][0])).toContain('encodeType=flac');
  });

  it('maps QQ Music search results to streaming tracks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          req_1: {
            data: {
              body: {
                song: {
                  list: [
                    {
                      mid: 'song-mid',
                      name: '测试歌曲',
                      interval: 180,
                      singer: [{ mid: 'artist-mid', name: '测试歌手' }],
                      album: { mid: 'album-mid', name: '测试专辑' },
                    },
                  ],
                },
              },
              meta: {
                sum: 1,
              },
            },
          },
        }),
      ),
    );

    const result = await new QQMusicStreamingProvider().search({ provider: 'qqmusic', query: '测试', page: 1, pageSize: 10 });

    expect(result.tracks[0]).toMatchObject({
      provider: 'qqmusic',
      providerTrackId: 'song-mid',
      stableKey: 'streaming:qqmusic:song-mid',
      title: '测试歌曲',
      artist: '测试歌手',
      album: '测试专辑',
      duration: 180,
      coverThumb: remoteImageUrl('https://y.gtimg.cn/music/photo_new/T002R150x150M000album-mid.jpg', 'https://y.qq.com/'),
    });
  });

  it('retries QQ Music search with normalized query variants when the exact query is empty', async () => {
    const fetchRunner = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          req_1: {
            data: {
              body: { song: { list: [] } },
              meta: { sum: 0 },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          req_1: {
            data: {
              body: {
                song: {
                  list: [
                    {
                      mid: 'variant-song-mid',
                      name: 'Echo Lab',
                      interval: 180,
                      singer: [{ mid: 'artist-mid', name: 'Variant Artist' }],
                      album: { mid: 'album-mid', name: 'Variant Album' },
                    },
                  ],
                },
              },
              meta: { sum: 1 },
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchRunner);

    const result = await new QQMusicStreamingProvider().search({ provider: 'qqmusic', query: 'Echo-Lab', page: 1, pageSize: 10 });

    expect(result.query).toBe('Echo-Lab');
    expect(result.tracks[0]).toMatchObject({
      providerTrackId: 'variant-song-mid',
      title: 'Echo Lab',
    });
    expect(JSON.parse(String(fetchRunner.mock.calls[0][1]?.body)).req_1.param.query).toBe('Echo-Lab');
    expect(JSON.parse(String(fetchRunner.mock.calls[1][1]?.body)).req_1.param.query).toBe('Echo Lab');
  });

  it('maps QQ Music album search results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          req_1: {
            data: {
              body: {
                album: {
                  totalnum: 1,
                  list: [
                    {
                      albumMID: 'album-mid',
                      albumName: '测试专辑',
                      singerName: '测试歌手',
                      publicTime: '2026-01-01',
                      song_count: 9,
                    },
                  ],
                },
              },
            },
          },
        }),
      ),
    );

    const result = await new QQMusicStreamingProvider().search({ provider: 'qqmusic', query: '测试', mediaTypes: ['album'], page: 1, pageSize: 10 });

    expect(result.albums[0]).toMatchObject({
      provider: 'qqmusic',
      providerAlbumId: 'album-mid',
      title: '测试专辑',
      artist: '测试歌手',
      releaseDate: '2026-01-01',
      trackCount: 9,
      coverThumb: remoteImageUrl('https://y.gtimg.cn/music/photo_new/T002R150x150M000album-mid.jpg', 'https://y.qq.com/'),
    });
  });

  it('maps QQ Music playlist search results', async () => {
    const fetchRunner = vi.fn().mockResolvedValue(
      jsonResponse({
        req_1: {
          data: {
            body: {
              songlist: {
                totalnum: 1,
                list: [
                  {
                    dissid: 'qq-playlist-id',
                    dissname: 'QQ Playlist',
                    song_count: 35,
                    imgurl: 'https://y.gtimg.cn/music/photo_new/T002R150x150M000playlist.jpg',
                    creator: 'QQ DJ',
                  },
                ],
              },
            },
            meta: { sum: 1 },
          },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchRunner);

    const result = await new QQMusicStreamingProvider().search({ provider: 'qqmusic', query: 'mix', mediaTypes: ['playlist'], page: 1, pageSize: 10 });

    expect(JSON.parse(String(fetchRunner.mock.calls[0][1]?.body)).req_1.param.search_type).toBe(3);
    expect(result.playlists[0]).toMatchObject({
      provider: 'qqmusic',
      providerPlaylistId: 'qq-playlist-id',
      title: 'QQ Playlist',
      creator: 'QQ DJ',
      trackCount: 35,
      coverThumb: remoteImageUrl('https://y.gtimg.cn/music/photo_new/T002R150x150M000playlist.jpg', 'https://y.qq.com/'),
    });
  });

  it('loads QQ Music album details for clickable streaming albums', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            mid: 'album-mid',
            name: 'QQ Detail Album',
            singername: 'Detail Artist',
            aDate: '2026-01-01',
            total: 1,
            list: [
              {
                mid: 'detail-song-mid',
                name: 'Detail Song',
                interval: 180,
                singer: [{ mid: 'artist-mid', name: 'Detail Artist' }],
                album: { mid: 'album-mid', name: 'QQ Detail Album' },
              },
            ],
          },
        }),
      ),
    );

    const detail = await new QQMusicStreamingProvider().getAlbum({ providerAlbumId: 'album-mid' });

    expect(detail).toMatchObject({
      provider: 'qqmusic',
      providerAlbumId: 'album-mid',
      title: 'QQ Detail Album',
      artist: 'Detail Artist',
    });
    expect(detail.tracks[0]).toMatchObject({
      providerTrackId: 'detail-song-mid',
      title: 'Detail Song',
    });
  });

  it('maps QQ Music artist search results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          req_1: {
            data: {
              body: {
                singer: {
                  totalnum: 1,
                  list: [
                    {
                      singerMID: 'artist-mid',
                      singerName: '测试歌手',
                    },
                  ],
                },
              },
            },
          },
        }),
      ),
    );

    const result = await new QQMusicStreamingProvider().search({ provider: 'qqmusic', query: '测试', mediaTypes: ['artist'], page: 1, pageSize: 10 });

    expect(result.artists[0]).toMatchObject({
      provider: 'qqmusic',
      providerArtistId: 'artist-mid',
      name: '测试歌手',
      avatarUrl: remoteImageUrl('https://y.gtimg.cn/music/photo_new/T001R500x500M000artist-mid.jpg', 'https://y.qq.com/'),
    });
  });

  it('falls back to QQ Music track search to discover strict artist results', async () => {
    const fetchRunner = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          req_1: {
            data: {
              body: { singer: { list: [] } },
              meta: { sum: 0 },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          req_1: {
            data: {
              body: { singer: { list: [] } },
              meta: { sum: 0 },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          req_1: {
            data: {
              body: {
                song: {
                  list: [
                    {
                      mid: 'song-mid',
                      name: 'Isekai Song',
                      interval: 180,
                      singer: [{ mid: 'artist-mid', name: '異世界情緒' }],
                      album: { mid: 'album-mid', name: 'Isekai Album' },
                    },
                  ],
                },
              },
              meta: { sum: 1 },
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchRunner);

    const result = await new QQMusicStreamingProvider().search({ provider: 'qqmusic', query: '异世界情绪', mediaTypes: ['artist'], page: 1, pageSize: 10 });

    expect(result.query).toBe('异世界情绪');
    expect(result.tracks).toEqual([]);
    expect(result.artists[0]).toMatchObject({
      provider: 'qqmusic',
      providerArtistId: 'artist-mid',
      name: '異世界情緒',
    });
    expect(JSON.parse(String(fetchRunner.mock.calls[0][1]?.body)).req_1.param.search_type).toBe(9);
    expect(JSON.parse(String(fetchRunner.mock.calls[2][1]?.body)).req_1.param.search_type).toBe(0);
  });

  it('loads QQ Music artist details with top tracks and albums', async () => {
    const fetchRunner = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            singer: { mid: 'artist-mid', name: 'QQ Artist' },
            list: [
              {
                musicData: {
                  mid: 'song-mid',
                  name: 'Artist Song',
                  interval: 180,
                  singer: [{ mid: 'artist-mid', name: 'QQ Artist' }],
                  album: { mid: 'album-mid', name: 'Artist Album' },
                },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            singer: { mid: 'artist-mid', name: 'QQ Artist' },
            list: [
              {
                albumMID: 'album-mid',
                albumName: 'Artist Album',
                singerName: 'QQ Artist',
                publicTime: '2026-01-01',
                song_count: 1,
              },
            ],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchRunner);

    const detail = await new QQMusicStreamingProvider().getArtist({ providerArtistId: 'artist-mid' });

    expect(String(fetchRunner.mock.calls[0][0])).toContain('singermid=artist-mid');
    expect(String(fetchRunner.mock.calls[1][0])).toContain('singermid=artist-mid');
    expect(detail).toMatchObject({
      provider: 'qqmusic',
      providerArtistId: 'artist-mid',
      name: 'QQ Artist',
    });
    expect(detail.topTracks[0]).toMatchObject({ providerTrackId: 'song-mid', title: 'Artist Song' });
    expect(detail.albums[0]).toMatchObject({ providerAlbumId: 'album-mid', title: 'Artist Album' });
  });

  it('maps QQ Music playlist song fields to streaming tracks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          cdlist: [
            {
              dissname: 'QQ Playlist',
              desc: 'Imported from QQ Music',
              logo: 'https://qpic.y.qq.com/music_cover/playlist.jpg',
              total_song_num: 1,
              songlist: [
                {
                  songmid: 'playlist-song-mid',
                  songid: 123,
                  songname: 'Playlist Song Title',
                  songorig: 'Original Song Title',
                  interval: 242,
                  singer: [{ mid: 'artist-mid', name: 'Playlist Artist' }],
                  albumname: 'Playlist Album',
                  albummid: 'playlist-album-mid',
                },
              ],
            },
          ],
        }),
      ),
    );

    const playlist = await new QQMusicStreamingProvider().getPlaylist({ providerPlaylistId: '123456', page: 1, pageSize: 10 });

    expect(playlist).toMatchObject({
      provider: 'qqmusic',
      providerPlaylistId: '123456',
      title: 'QQ Playlist',
      trackCount: 1,
    });
    expect(playlist.tracks[0]).toMatchObject({
      provider: 'qqmusic',
      providerTrackId: 'playlist-song-mid',
      stableKey: 'streaming:qqmusic:playlist-song-mid',
      title: 'Playlist Song Title',
      artist: 'Playlist Artist',
      album: 'Playlist Album',
      duration: 242,
      coverThumb: remoteImageUrl('https://y.gtimg.cn/music/photo_new/T002R150x150M000playlist-album-mid.jpg', 'https://y.qq.com/'),
    });
  });

  it('fetches NetEase playlist song details in batches small enough for the API', async () => {
    setNeteaseApiForTests(null);
    const trackIds = Array.from({ length: 250 }, (_value, index) => index + 1);
    const detailSongs = (ids: number[]) =>
      ids.map((id) => ({
        id,
        name: `Song ${id}`,
        dt: 180000 + id,
        ar: [{ id: 1000 + id, name: `Artist ${id}` }],
        al: { id: 2000 + id, name: `Album ${id}`, picUrl: `https://p.music.126.net/${id}.jpg` },
      }));
    const fetchRunner = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          playlist: {
            name: 'NetEase Likes',
            trackCount: trackIds.length,
            trackIds: trackIds.map((id) => ({ id })),
            tracks: [],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ songs: detailSongs(trackIds.slice(0, 100)) }))
      .mockResolvedValueOnce(jsonResponse({ songs: detailSongs(trackIds.slice(100, 200)) }))
      .mockResolvedValueOnce(jsonResponse({ songs: detailSongs(trackIds.slice(200)) }));
    vi.stubGlobal('fetch', fetchRunner);

    const playlist = await new NeteaseStreamingProvider().getPlaylist({ providerPlaylistId: '163289102', page: 1, pageSize: 250 });

    expect(playlist).toMatchObject({
      provider: 'netease',
      providerPlaylistId: '163289102',
      title: 'NetEase Likes',
      trackCount: 250,
      total: 250,
      hasMore: false,
    });
    expect(playlist.tracks).toHaveLength(250);
    expect(playlist.tracks[0]).toMatchObject({
      providerTrackId: '1',
      title: 'Song 1',
      artist: 'Artist 1',
      album: 'Album 1',
    });
    expect(fetchRunner).toHaveBeenCalledTimes(4);
    const detailRequests = fetchRunner.mock.calls.slice(1).map(([url]) => new URL(String(url)));
    expect(detailRequests.map((url) => JSON.parse(url.searchParams.get('ids') ?? '[]')).map((ids) => ids.length)).toEqual([100, 100, 50]);
  });

  it('uses the NetEase playlist track API for large playlist pages', async () => {
    const trackIds = Array.from({ length: 1500 }, (_value, index) => index + 1);
    const playlistTrackAll = vi.fn().mockResolvedValue({
      body: {
        songs: [
          {
            id: 1001,
            name: 'Deep Page Song',
            dt: 188000,
            ar: [{ id: 1, name: 'Deep Artist' }],
            al: { id: 2, name: 'Deep Album', picUrl: 'https://p.music.126.net/deep.jpg' },
          },
        ],
      },
    });
    setNeteaseApiForTests({ playlist_track_all: playlistTrackAll });
    const fetchRunner = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        playlist: {
          name: 'Large NetEase Playlist',
          trackCount: trackIds.length,
          trackIds: trackIds.map((id) => ({ id })),
          tracks: [],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchRunner);

    const playlist = await new NeteaseStreamingProvider().getPlaylist({ providerPlaylistId: '2764805072', page: 3, pageSize: 500 });

    expect(playlistTrackAll).toHaveBeenCalledWith({
      id: '2764805072',
      limit: 500,
      offset: 1000,
      cookie: 'MUSIC_U=secret; csrf=hidden',
    });
    expect(fetchRunner).toHaveBeenCalledTimes(1);
    expect(playlist).toMatchObject({
      provider: 'netease',
      providerPlaylistId: '2764805072',
      title: 'Large NetEase Playlist',
      total: 1500,
      hasMore: false,
    });
    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.tracks[0]).toMatchObject({
      providerTrackId: '1001',
      title: 'Deep Page Song',
      artist: 'Deep Artist',
      album: 'Deep Album',
    });
  });

  it('maps NetEase daily recommendations from the signed-in account', async () => {
    const recommendSongs = vi.fn().mockResolvedValue({
      body: {
        data: {
          dailySongs: [
            {
              id: 456,
              name: 'Daily Song',
              dt: 210000,
              ar: [{ id: 7, name: 'Daily Artist' }],
              al: { id: 8, name: 'Daily Album', picUrl: 'http://p.music.126.net/daily.jpg' },
            },
          ],
        },
      },
    });
    setNeteaseApiForTests({ recommend_songs: recommendSongs });

    const playlist = await new NeteaseStreamingProvider().getDailyRecommendPlaylist();

    expect(recommendSongs).toHaveBeenCalledWith({ cookie: 'MUSIC_U=secret; csrf=hidden' });
    expect(playlist).toMatchObject({
      provider: 'netease',
      providerPlaylistId: 'daily-recommend',
      title: '每日推荐',
      trackCount: 1,
      hasMore: false,
      coverThumb: remoteImageUrl('https://p.music.126.net/daily.jpg?param=160y160', 'https://music.163.com/'),
    });
    expect(playlist.tracks[0]).toMatchObject({
      providerTrackId: '456',
      title: 'Daily Song',
      artist: 'Daily Artist',
      album: 'Daily Album',
      coverThumb: remoteImageUrl('https://p.music.126.net/daily.jpg?param=160y160', 'https://music.163.com/'),
    });
  });

  it('resolves QQ Music playback through vkey without leaking account cookies', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            data: [
              {
                mid: 'song-mid',
                name: '测试歌曲',
                file: { media_mid: 'media-mid' },
                singer: [{ name: '测试歌手' }],
                album: { name: '测试专辑', mid: 'album-mid' },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            req_0: {
              data: {
                sip: ['https://isure.stream.qqmusic.qq.com/'],
                midurlinfo: [{ purl: 'M800media-mid.mp3?vkey=temporary' }],
              },
            },
          }),
        ),
    );

    const source = await new QQMusicStreamingProvider().resolvePlayback({ provider: 'qqmusic', providerTrackId: 'song-mid', quality: 'high' });

    expect(source).toMatchObject({
      provider: 'qqmusic',
      providerTrackId: 'song-mid',
      url: 'https://isure.stream.qqmusic.qq.com/M800media-mid.mp3?vkey=temporary',
      headers: {},
      requiresProxy: false,
      supportsRange: true,
    });
  });

  it('falls back to playable QQ Music quality when lossless returns no URL', async () => {
    const fetchRunner = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              mid: 'song-mid',
              name: 'Fallback Song',
              file: { media_mid: 'media-mid' },
              singer: [{ name: 'Fallback Artist' }],
              album: { name: 'Fallback Album', mid: 'album-mid' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          req_0: {
            data: {
              sip: ['https://isure.stream.qqmusic.qq.com/'],
              midurlinfo: [{ purl: '' }],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          req_0: {
            data: {
              sip: ['https://isure.stream.qqmusic.qq.com/'],
              midurlinfo: [{ purl: 'M800media-mid.mp3?vkey=temporary' }],
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchRunner);

    const source = await new QQMusicStreamingProvider().resolvePlayback({ provider: 'qqmusic', providerTrackId: 'song-mid', quality: 'lossless' });

    const losslessBody = JSON.parse(String(fetchRunner.mock.calls[1][1]?.body));
    const highBody = JSON.parse(String(fetchRunner.mock.calls[2][1]?.body));

    expect(losslessBody.req_0.param.filename).toEqual(['F000media-mid.flac']);
    expect(highBody.req_0.param.filename).toEqual(['M800media-mid.mp3']);
    expect(source).toMatchObject({
      url: 'https://isure.stream.qqmusic.qq.com/M800media-mid.mp3?vkey=temporary',
      codec: 'mp3',
      bitrate: 320000,
      bitDepth: null,
    });
  });

  it('exposes account status through provider descriptors', () => {
    accountStatus.connected = false;
    const descriptor = new QQMusicStreamingProvider().descriptor;

    expect(descriptor).toMatchObject({
      requiresAccount: true,
      accountConnected: false,
      status: 'needs_account',
    });
  });
});
