import { useCallback, useEffect, useState } from 'react';
import type { PlaybackStatus } from '../../../shared/types/playback';
import type { GlobalShortcutAction } from '../../../shared/types/globalShortcuts';
import type { SmtcCommand } from '../../../shared/types/smtc';
import { isSpotifyTrack, pauseSpotifyPlayback, resumeSpotifyPlayback, seekSpotifyPlayback } from '../../integrations/spotify/spotifyPlayback';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { getVisualPlaybackState, refreshPlaybackStatus, setPlaybackStatusSnapshot, useSharedPlaybackStatus } from '../../stores/playbackStatusStore';
import { shouldSuppressAudioHostError } from './audioErrorFormat';
import { bindMediaSessionActions, clearMediaSession } from './mediaSession';

const playbackSeekedEvent = 'playback:seeked';
const clampPlaybackRate = (value: number): number => Math.max(0.5, Math.min(2, value));
const openAudioSettingsEvent = 'app:open-audio-settings';
const openMvSettingsEvent = 'app:open-mv-settings';
const openLyricsSettingsEvent = 'app:open-lyrics-settings';

const dispatchPlaybackSeeked = (positionSeconds: number, trackId: string | null): void => {
  window.dispatchEvent(new CustomEvent(playbackSeekedEvent, { detail: { positionSeconds, trackId } }));
};

export const PlaybackCommandController = (): null => {
  const queue = usePlaybackQueue();
  const sharedPlaybackStatus = useSharedPlaybackStatus();
  const [smtcEnabled, setSmtcEnabled] = useState(true);
  const playbackStatus = sharedPlaybackStatus.playbackStatus;
  const audioStatus = sharedPlaybackStatus.audioStatus;
  const state = audioStatus?.state ?? playbackStatus?.state ?? 'idle';
  const visualState = getVisualPlaybackState(sharedPlaybackStatus);
  const isPlaying = visualState === 'playing';
  const positionSeconds = audioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000;
  const durationSeconds = audioStatus?.durationSeconds ?? (playbackStatus?.durationMs ?? 0) / 1000;
  const isSpotifyCurrentTrack = isSpotifyTrack(queue.currentTrack);

  const runPlaybackAction = useCallback(async (action: () => Promise<PlaybackStatus | null>): Promise<void> => {
    try {
      const status = await action();
      if (status) {
        setPlaybackStatusSnapshot({ playbackStatus: status, error: null });
      }
      await refreshPlaybackStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPlaybackStatusSnapshot({ error: shouldSuppressAudioHostError(message) ? null : message });
    }
  }, []);

  const handlePlayPause = useCallback(async (): Promise<void> => {
    const playback = window.echo?.playback;

    if (isSpotifyCurrentTrack && queue.currentTrack) {
      await runPlaybackAction(() =>
        visualState === 'playing' || visualState === 'loading'
          ? pauseSpotifyPlayback(queue.currentTrack!)
          : resumeSpotifyPlayback(queue.currentTrack!),
      );
      return;
    }

    if (!playback) {
      return;
    }

    await runPlaybackAction(async () => {
      const latestStatus = await playback.getStatus();
      return latestStatus.state === 'playing' || latestStatus.state === 'loading' ? playback.pause() : playback.play();
    });
  }, [isSpotifyCurrentTrack, queue, runPlaybackAction, visualState]);

  const handlePrevious = useCallback((): void => {
    void runPlaybackAction(queue.playPrevious);
  }, [queue.playPrevious, runPlaybackAction]);

  const handleNext = useCallback((): void => {
    void runPlaybackAction(queue.playNext);
  }, [queue.playNext, runPlaybackAction]);

  const handleStop = useCallback((): void => {
    const playback = window.echo?.playback;
    if (!playback) {
      return;
    }

    void runPlaybackAction(() => playback.stop());
  }, [runPlaybackAction]);

  const handleVolumeStep = useCallback(
    async (delta: number): Promise<void> => {
      const audio = window.echo?.audio;
      if (!audio) {
        return;
      }

      const latestStatus = audioStatus ?? (await audio.getStatus());
      const nextVolume = Math.max(0, Math.min(1, (latestStatus.volume ?? 1) + delta));
      await audio.setOutput({ volume: nextVolume });
      await refreshPlaybackStatus();
    },
    [audioStatus],
  );

  const handleSpeedStep = useCallback(
    async (delta: number): Promise<void> => {
      const audio = window.echo?.audio;
      if (!audio) {
        return;
      }

      const latestStatus = audioStatus ?? (await audio.getStatus());
      const nextRate = clampPlaybackRate(Math.round(((latestStatus.playbackRate ?? 1) + delta) * 10) / 10);
      const playbackSpeedMode = latestStatus.playbackSpeedMode ?? 'nightcore';
      await audio.setOutput({ playbackRate: nextRate, playbackSpeedMode });
      await window.echo?.app?.setSettings?.({ playbackSpeed: nextRate, playbackSpeedMode }).catch(() => undefined);
      await refreshPlaybackStatus();
    },
    [audioStatus],
  );

  const handleBossKey = useCallback(async (): Promise<void> => {
    const audio = window.echo?.audio;
    if (!audio) {
      return;
    }

    await audio.setOutput({ volume: 0 });
    await refreshPlaybackStatus();
  }, []);

  const commitSeek = useCallback(
    async (nextPositionSeconds: number): Promise<void> => {
      const playback = window.echo?.playback;

      if (!playback || durationSeconds <= 0) {
        return;
      }

      const safePositionSeconds = Math.min(durationSeconds, Math.max(0, nextPositionSeconds));
      if (isSpotifyCurrentTrack && queue.currentTrack) {
        const status = await seekSpotifyPlayback(queue.currentTrack, safePositionSeconds);
        setPlaybackStatusSnapshot({ playbackStatus: status, error: null });
        dispatchPlaybackSeeked(safePositionSeconds, status.currentTrackId ?? queue.currentTrackId ?? null);
        return;
      }

      const status = await playback.seek(safePositionSeconds);
      setPlaybackStatusSnapshot({
        playbackStatus: {
          ...status,
          positionMs: Math.round(safePositionSeconds * 1000),
        },
        error: null,
      });
      dispatchPlaybackSeeked(safePositionSeconds, status.currentTrackId ?? queue.currentTrackId ?? null);
      await refreshPlaybackStatus();
    },
    [durationSeconds, isSpotifyCurrentTrack, queue.currentTrack, queue.currentTrackId],
  );

  const handleSmtcCommand = useCallback(
    (command: SmtcCommand): void => {
      const playback = window.echo?.playback;

      if (!playback) {
        return;
      }

      if (typeof command !== 'string') {
        if (command.type === 'seek') {
          void commitSeek(command.positionSeconds);
        }
        return;
      }

      if (command === 'playPause') {
        void handlePlayPause();
        return;
      }

      if (command === 'play') {
        if (!isPlaying) {
          if (isSpotifyCurrentTrack && queue.currentTrack) {
            void runPlaybackAction(() => resumeSpotifyPlayback(queue.currentTrack!));
            return;
          }

          void runPlaybackAction(() =>
            (state === 'idle' || state === 'stopped') && queue.currentTrack ? queue.playTrack(queue.currentTrack) : playback.play(),
          );
        }
        return;
      }

      if (command === 'pause') {
        if (isSpotifyCurrentTrack && queue.currentTrack) {
          void runPlaybackAction(() => pauseSpotifyPlayback(queue.currentTrack!));
          return;
        }

        void runPlaybackAction(() => playback.pause());
        return;
      }

      if (command === 'previous') {
        handlePrevious();
        return;
      }

      if (command === 'next') {
        handleNext();
        return;
      }

      if (command === 'stop') {
        handleStop();
      }
    },
    [commitSeek, handleNext, handlePlayPause, handlePrevious, handleStop, isPlaying, isSpotifyCurrentTrack, queue, runPlaybackAction, state],
  );

  const handleGlobalShortcutCommand = useCallback(
    (action: GlobalShortcutAction): void => {
      if (action === 'playPause') {
        void handlePlayPause();
        return;
      }

      if (action === 'previousTrack') {
        handlePrevious();
        return;
      }

      if (action === 'nextTrack') {
        handleNext();
        return;
      }

      if (action === 'stop') {
        handleStop();
        return;
      }

      if (action === 'volumeUp') {
        void handleVolumeStep(0.05);
        return;
      }

      if (action === 'volumeDown') {
        void handleVolumeStep(-0.05);
        return;
      }

      if (action === 'speedUp') {
        void handleSpeedStep(0.1);
        return;
      }

      if (action === 'speedDown') {
        void handleSpeedStep(-0.1);
        return;
      }

      if (action === 'bossKey') {
        void handleBossKey();
        return;
      }

      if (action === 'openAudioSettings') {
        window.dispatchEvent(new Event(openAudioSettingsEvent));
        return;
      }

      if (action === 'openMvSettings') {
        window.dispatchEvent(new Event(openMvSettingsEvent));
        return;
      }

      if (action === 'openLyricsSettings') {
        window.dispatchEvent(new Event(openLyricsSettingsEvent));
        return;
      }

      if (action === 'seekBackward') {
        void commitSeek(positionSeconds - 10);
        return;
      }

      if (action === 'seekForward') {
        void commitSeek(positionSeconds + 10);
      }
    },
    [commitSeek, handleBossKey, handleNext, handlePlayPause, handlePrevious, handleSpeedStep, handleStop, handleVolumeStep, positionSeconds],
  );

  useEffect(() => {
    let cancelled = false;
    const refreshSmtcSetting = (): void => {
      void window.echo?.app
        ?.getSettings?.()
        .then((settings) => {
          if (!cancelled) {
            setSmtcEnabled(settings.smtcEnabled !== false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSmtcEnabled(true);
          }
        });
    };

    refreshSmtcSetting();
    window.addEventListener('settings:changed', refreshSmtcSetting);

    return () => {
      cancelled = true;
      window.removeEventListener('settings:changed', refreshSmtcSetting);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.echo?.smtc?.onCommand(handleSmtcCommand);
    return () => unsubscribe?.();
  }, [handleSmtcCommand]);

  useEffect(() => {
    const unsubscribe = window.echo?.app?.onGlobalShortcutCommand?.(handleGlobalShortcutCommand);
    return () => unsubscribe?.();
  }, [handleGlobalShortcutCommand]);

  useEffect(() => {
    if (!smtcEnabled) {
      clearMediaSession();
      return () => undefined;
    }

    return bindMediaSessionActions({
      onPlay: () => handleSmtcCommand('play'),
      onPause: () => handleSmtcCommand('pause'),
      onPrevious: () => handleSmtcCommand('previous'),
      onNext: () => handleSmtcCommand('next'),
      onStop: () => handleSmtcCommand('stop'),
      onSeek: (nextPositionSeconds) => void commitSeek(nextPositionSeconds),
      getPositionSeconds: () => positionSeconds,
    });
  }, [commitSeek, handleSmtcCommand, positionSeconds, smtcEnabled]);

  return null;
};
