// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ConnectSessionStatus } from '../../shared/types/connect';
import {
  getInterpolatedPositionMs,
  getDesktopLyricsTextFitScale,
  hqPlayerConnectStatusToDesktopLyricsClock,
  shouldShowDesktopLyricsText,
} from './DesktopLyricsApp';

describe('desktop lyrics text fitting', () => {
  it('hides text that would overflow the desktop lyrics window', () => {
    expect(shouldShowDesktopLyricsText({
      text: '短歌词',
      availableWidthPx: 320,
      fontSizePx: 34,
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontWeight: 700,
      scalePercent: 100,
    })).toBe(true);

    expect(shouldShowDesktopLyricsText({
      text: 'これはとてもとてもとてもとても長いデスクトップ歌詞です',
      availableWidthPx: 320,
      fontSizePx: 34,
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontWeight: 700,
      scalePercent: 100,
    })).toBe(false);
  });

  it('shrinks long primary lyrics instead of requiring them to be hidden', () => {
    expect(getDesktopLyricsTextFitScale({
      text: 'Short lyric',
      availableWidthPx: 320,
      fontSizePx: 34,
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontWeight: 700,
      scalePercent: 100,
    })).toBe(1);

    const fitScale = getDesktopLyricsTextFitScale({
      text: 'Wonderland '.repeat(10),
      availableWidthPx: 320,
      fontSizePx: 34,
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontWeight: 700,
      scalePercent: 100,
    });

    expect(fitScale).toBeGreaterThanOrEqual(0.62);
    expect(fitScale).toBeLessThan(1);
  });

  it('uses HQPlayer Connect status as a desktop lyrics clock', () => {
    const clock = hqPlayerConnectStatusToDesktopLyricsClock({
      deviceId: 'hqplayer:local-desktop',
      protocol: 'hqplayer',
      state: 'playing',
      currentTrackId: 'track-hq',
      metadata: {
        title: 'HQ Track',
        artist: 'Artist',
        album: null,
        albumArtist: null,
        durationSeconds: 180,
        coverHttpUrl: '',
      },
      positionSeconds: 12.5,
      durationSeconds: 180,
      latencyMs: null,
      error: null,
      updatedAt: '2026-05-25T00:00:00.000Z',
    } satisfies ConnectSessionStatus, 1234);

    expect(clock).toMatchObject({
      currentTrackId: 'track-hq',
      filePath: null,
      state: 'playing',
      positionMs: 12500,
      durationMs: 180000,
      playbackRate: 1,
      updatedAtMs: 1234,
    });
  });

  it('holds forwarded desktop lyrics clock when native position telemetry is stale', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(2000);

    try {
      expect(getInterpolatedPositionMs({
        source: 'forwarded',
        currentTrackId: 'track-1',
        filePath: 'C:\\Music\\track.flac',
        state: 'playing',
        positionMs: 8900,
        durationMs: 180000,
        playbackRate: 1,
        updatedAtMs: 0,
        nativePositionStalenessMs: 1200,
        nativeBufferedMs: 240,
        nativeUnderrunCallbacks: 0,
      })).toBe(8900);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('holds forwarded desktop lyrics clock after underrun with low buffer', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(2000);

    try {
      expect(getInterpolatedPositionMs({
        source: 'forwarded',
        currentTrackId: 'track-1',
        filePath: 'C:\\Music\\track.flac',
        state: 'playing',
        positionMs: 8900,
        durationMs: 180000,
        playbackRate: 1,
        updatedAtMs: 0,
        nativePositionStalenessMs: 0,
        nativeBufferedMs: 12,
        nativeUnderrunCallbacks: 1,
      })).toBe(8900);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('keeps interpolating desktop lyrics when playback telemetry is healthy', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(2000);

    try {
      expect(getInterpolatedPositionMs({
        source: 'forwarded',
        currentTrackId: 'track-1',
        filePath: 'C:\\Music\\track.flac',
        state: 'playing',
        positionMs: 8900,
        durationMs: 180000,
        playbackRate: 1,
        updatedAtMs: 0,
        nativePositionStalenessMs: 20,
        nativeBufferedMs: 240,
        nativeUnderrunCallbacks: 0,
      })).toBe(10900);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
