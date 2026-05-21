// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  StreamingArtist,
  StreamingArtistDetail,
  StreamingProviderDescriptor,
  StreamingSearchResult,
  StreamingTrack,
} from '../../../shared/types/streaming';
import { PlaybackQueueProvider } from '../../stores/PlaybackQueueProvider';
import { StreamingSearchPage } from './StreamingSearchPage';
import { updateStreamingSearchMemory } from './streamingSearchMemory';

const provider: StreamingProviderDescriptor = {
  name: 'netease',
  displayName: 'NetEase Cloud Music',
  enabled: true,
  supportsSearch: true,
  supportsPlayback: true,
  supportsLyrics: true,
  supportsMv: true,
  requiresAccount: false,
};

const artist: StreamingArtist = {
  id: 'streaming:netease:artist:jay',
  provider: 'netease',
  providerArtistId: 'jay',
  name: '周杰伦',
  avatarUrl: null,
  coverUrl: null,
};

const track: StreamingTrack = {
  id: 'streaming:netease:song:sunny',
  provider: 'netease',
  providerTrackId: 'sunny',
  stableKey: 'streaming:netease:sunny',
  title: '晴天',
  artist: '周杰伦',
  artists: [],
  album: '叶惠美',
  albumId: 'album-yhm',
  albumArtist: '周杰伦',
  duration: 269,
  coverUrl: null,
  coverThumb: null,
  qualities: ['high', 'lossless'],
  explicit: false,
  playable: true,
  unavailableReason: null,
  lyricsStatus: 'unknown',
  mvStatus: 'unknown',
};

const searchResult: StreamingSearchResult = {
  provider: 'netease',
  query: '周杰伦',
  page: 1,
  pageSize: 30,
  total: 1,
  hasMore: false,
  tracks: [],
  albums: [],
  artists: [artist],
  playlists: [],
  mvs: [],
};

const resetStreamingMemory = (): void => {
  updateStreamingSearchMemory({
    provider: 'netease',
    quality: 'max',
    activeTab: 'track',
    input: '',
    query: '',
    result: null,
    failedCoverUrls: {},
    scrollTop: 0,
  });
};

afterEach(() => {
  cleanup();
  resetStreamingMemory();
  window.localStorage.clear();
  vi.restoreAllMocks();
  delete (window as Partial<Window>).echo;
});

describe('StreamingSearchPage artist detail', () => {
  it('opens a streaming artist detail even when cached top tracks miss artist refs', async () => {
    const legacyCachedTrack = { ...track, artists: undefined } as unknown as StreamingTrack;
    const artistDetail: StreamingArtistDetail = {
      ...artist,
      topTracks: [legacyCachedTrack],
      albums: [],
    };

    updateStreamingSearchMemory({
      provider: 'netease',
      quality: 'max',
      activeTab: 'artist',
      input: '周杰伦',
      query: '周杰伦',
      result: searchResult,
      failedCoverUrls: {},
      scrollTop: 0,
    });

    window.echo = {
      streaming: {
        getProviders: vi.fn().mockResolvedValue([provider]),
        search: vi.fn().mockResolvedValue(searchResult),
        getArtist: vi.fn().mockResolvedValue(artistDetail),
      },
    } as unknown as Window['echo'];

    render(
      <PlaybackQueueProvider>
        <StreamingSearchPage />
      </PlaybackQueueProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /周杰伦/ }));

    expect(await screen.findByRole('heading', { name: '周杰伦' })).toBeTruthy();
    await waitFor(() => expect(window.echo?.streaming?.getArtist).toHaveBeenCalledWith({
      provider: 'netease',
      providerArtistId: 'jay',
    }));
    expect(await screen.findByText('晴天')).toBeTruthy();
    expect(screen.getAllByText('周杰伦').length).toBeGreaterThan(0);
  });
});
