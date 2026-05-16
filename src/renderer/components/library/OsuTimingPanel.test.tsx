// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryTrack } from '../../../shared/types/library';
import { OsuTimingPanel } from './OsuTimingPanel';

const makeTrack = (overrides: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\Song.flac',
  title: 'Song One',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album Artist',
  trackNo: 1,
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
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OsuTimingPanel', () => {
  it('copies the formatted timing line for a track with BPM and offset', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<OsuTimingPanel track={makeTrack({ bpm: 128, bpmConfidence: 0.9, beatOffsetMs: 12, analysisStatus: 'complete' })} isOpen onClose={vi.fn()} />);

    expect(screen.getByText('12,468.75,4,1,0,100,1,0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy timing line' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('12,468.75,4,1,0,100,1,0'));
  });

  it('starts forced BPM analysis for a track missing BPM or offset', async () => {
    const updatedTrack = makeTrack({ bpm: 140, bpmConfidence: 0.91, beatOffsetMs: 33, analysisStatus: 'complete' });
    const onTrackUpdated = vi.fn();
    const startBpmAnalysis = vi.fn().mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      totalTracks: 1,
      processedTracks: 1,
      updatedTracks: 1,
      errorCount: 0,
      currentTrackTitle: null,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      errors: [],
    });
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        library: {
          startBpmAnalysis,
          getBpmAnalysisStatus: vi.fn(),
          getTrack: vi.fn().mockResolvedValue(updatedTrack),
        },
      },
    });

    render(<OsuTimingPanel track={makeTrack({ bpm: null, beatOffsetMs: null })} isOpen onClose={vi.fn()} onTrackUpdated={onTrackUpdated} />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze this track' }));

    await waitFor(() => expect(startBpmAnalysis).toHaveBeenCalledWith({ trackIds: ['track-1'], force: true }));
    await waitFor(() => expect(onTrackUpdated).toHaveBeenCalledWith(updatedTrack));
    expect(await screen.findByText('33,428.571429,4,1,0,100,1,0')).toBeTruthy();
  });

  it('shows a low-confidence warning without blocking copy', () => {
    render(<OsuTimingPanel track={makeTrack({ bpm: 92, bpmConfidence: 0.2, beatOffsetMs: 0, analysisStatus: 'low_confidence' })} isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Low confidence BPM. Copy is allowed, but verify timing in osu! editor.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy timing line' })).toHaveProperty('disabled', false);
  });
});
