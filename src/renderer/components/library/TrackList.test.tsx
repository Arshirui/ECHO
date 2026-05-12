// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TrackList } from './TrackList';
import type { LibraryTrack } from '../../../shared/types/library';

const track = (index: number): LibraryTrack => ({
  id: `track-${index}`,
  path: `D:\\Music\\song-${index}.flac`,
  title: `Song ${index}`,
  artist: 'Artist',
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
  bitrate: 900000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
});

afterEach(() => {
  cleanup();
});

describe('TrackList', () => {
  it('renders the old ECHO-style empty list without a table header', () => {
    render(<TrackList currentTrackId={null} tracks={[]} />);

    expect(screen.getByRole('list').getAttribute('data-estimated-row-height')).toBe('76');
    expect(screen.getByText(/没有可显示的曲目/)).toBeTruthy();
    expect(screen.queryByText('专辑艺术家')).toBeNull();
    expect(screen.queryByText('发行年份')).toBeNull();
  });

  it('keeps virtualization enabled for large track sets', () => {
    const tracks = Array.from({ length: 120 }, (_, index) => track(index + 1));

    render(<TrackList currentTrackId="track-3" tracks={tracks} />);

    expect(screen.getByRole('list').getAttribute('data-virtualized')).toBe('true');
    expect(screen.queryByText(/没有可显示的曲目/)).toBeNull();
  });
});
