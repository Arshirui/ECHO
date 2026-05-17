// @vitest-environment jsdom
import { useEffect, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryTrack } from '../../shared/types/library';
import { I18nProvider } from '../i18n/I18nProvider';
import { PlaybackQueueProvider, usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { QueuePage } from './QueuePage';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 64,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 64 })),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock('../components/library/OsuTimingPanel', () => ({
  OsuTimingPanel: () => null,
}));

vi.mock('../components/library/TrackTagEditorDrawer', () => ({
  TrackTagEditorDrawer: () => null,
}));

const makeTrack = (index: number): LibraryTrack => ({
  id: `track-${index}`,
  path: `D:\\Music\\track-${index}.flac`,
  title: `Track ${index}`,
  artist: `Artist ${index}`,
  album: 'Album',
  albumArtist: 'Album Artist',
  trackNo: index,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: 320000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
});

const QueueSeeder = ({ tracks }: { tracks: LibraryTrack[] }): null => {
  const queue = usePlaybackQueue();
  const didSeedRef = useRef(false);

  useEffect(() => {
    if (didSeedRef.current) {
      return;
    }

    didSeedRef.current = true;
    queue.replaceQueue(tracks);
  }, [queue, tracks]);

  return null;
};

const renderQueuePage = (tracks: LibraryTrack[]): void => {
  render(
    <I18nProvider>
      <PlaybackQueueProvider>
        <QueueSeeder tracks={tracks} />
        <QueuePage />
      </PlaybackQueueProvider>
    </I18nProvider>,
  );
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('QueuePage', () => {
  it('plays a queued item when its row is double-clicked', async () => {
    const first = makeTrack(1);
    const second = makeTrack(2);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: 180000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
      },
      library: {
        startPlaybackHistory: vi.fn().mockResolvedValue({ historyId: 'history-1' }),
      },
    } as unknown as Window['echo'];

    renderQueuePage([first, second]);

    const secondTitle = await screen.findByText('Track 2');
    const secondRow = secondTitle.closest('.queue-row');
    expect(secondRow).toBeTruthy();

    fireEvent.doubleClick(secondRow!);

    await waitFor(() => expect(playLocalFile).toHaveBeenCalledWith(expect.objectContaining({ trackId: second.id })));
  });

  it('does not treat double-clicks inside the action group as row playback', async () => {
    const first = makeTrack(1);
    const playLocalFile = vi.fn().mockImplementation((request: { trackId: string; filePath: string }) =>
      Promise.resolve({
        state: 'playing',
        currentTrackId: request.trackId,
        positionMs: 0,
        durationMs: 180000,
        filePath: request.filePath,
      }),
    );

    window.echo = {
      playback: {
        playLocalFile,
      },
      library: {
        startPlaybackHistory: vi.fn().mockResolvedValue({ historyId: 'history-1' }),
      },
    } as unknown as Window['echo'];

    renderQueuePage([first]);

    const firstRow = (await screen.findByText('Track 1')).closest('.queue-row');
    const actionGroup = firstRow?.querySelector('.queue-row-actions');
    expect(actionGroup).toBeTruthy();

    fireEvent.doubleClick(actionGroup!);

    expect(playLocalFile).not.toHaveBeenCalled();
  });
});
