import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Disc3, Music2, RotateCcw, Search, TimerReset } from 'lucide-react';
import type { AudioStatus } from '../../shared/types/audio';
import type { LibraryTrack } from '../../shared/types/library';
import type { LyricsSearchCandidate, TrackLyrics } from '../../shared/types/lyrics';
import type { PlaybackStatus } from '../../shared/types/playback';
import { LyricsView } from '../components/lyrics/LyricsView';
import { MvPanel } from '../components/lyrics/MvPanel';
import type { LyricLine, LyricsState } from '../components/lyrics/lyricsTypes';
import { titleFromPath } from '../components/player/playerFormat';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';

type LyricsPageProps = {
  initialLyrics?: LyricLine[];
};

type TrackWithLargeCover = LibraryTrack & {
  coverLarge?: string | null;
};

const idlePollingStates = new Set(['paused', 'stopped', 'idle', 'error']);

const emptyLyrics = (offsetMs = 0): LyricsState => ({
  kind: 'empty',
  source: 'none',
  lines: [],
  offsetMs,
});

const syncedLyrics = (lines: LyricLine[], offsetMs: number): LyricsState => ({
  kind: 'synced',
  source: 'placeholder',
  lines,
  offsetMs,
});

const trackLyricsToState = (lyrics: TrackLyrics | null, fallbackOffsetMs = 0): LyricsState => {
  if (!lyrics) {
    return emptyLyrics(fallbackOffsetMs);
  }

  return {
    kind: lyrics.kind,
    source: lyrics.provider === 'local' ? 'local' : lyrics.provider === 'lrclib' ? 'online' : lyrics.provider,
    lines: lyrics.lines,
    offsetMs: lyrics.offsetMs,
  };
};

const formatDuration = (durationSeconds: number | null): string => {
  if (!durationSeconds) {
    return '--:--';
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatScore = (score: number): string => `${Math.round(score * 100)}%`;

const safeCoverUrl = (track: LibraryTrack | null): string | null => {
  const coverLarge = (track as TrackWithLargeCover | null)?.coverLarge ?? null;
  const coverUrl = coverLarge ?? (track?.coverId ? `echo-cover://large/${encodeURIComponent(track.coverId)}` : track?.coverThumb ?? null);

  return coverUrl && !coverUrl.startsWith('data:') ? coverUrl : null;
};

const safeOriginalCoverUrl = (track: LibraryTrack | null): string | null => {
  const coverUrl = track?.coverId ? `echo-cover://original/${encodeURIComponent(track.coverId)}` : safeCoverUrl(track);

  return coverUrl && !coverUrl.startsWith('data:') ? coverUrl : null;
};

export const LyricsPage = ({ initialLyrics }: LyricsPageProps): JSX.Element => {
  const queue = usePlaybackQueue();
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(null);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricsState>(() =>
    initialLyrics && initialLyrics.length > 0 ? syncedLyrics(initialLyrics, 0) : emptyLyrics(0),
  );
  const [lyricsStatus, setLyricsStatus] = useState<string | null>(null);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [candidates, setCandidates] = useState<LyricsSearchCandidate[]>([]);
  const [isCandidateLoading, setIsCandidateLoading] = useState(false);
  const [applyingCandidateId, setApplyingCandidateId] = useState<string | null>(null);
  const lyricsRequestRef = useRef(0);
  const state = audioStatus?.state ?? playbackStatus?.state ?? 'idle';
  const pollIntervalMs = idlePollingStates.has(state) && seekPreviewSeconds === null ? 1800 : 180;
  const statusTrackId = playbackStatus?.currentTrackId ?? audioStatus?.currentTrackId ?? null;
  const trackId = queue.currentTrackId ?? statusTrackId;
  const currentTrack =
    queue.currentTrack ??
    (statusTrackId ? queue.tracks.find((track) => track.id === statusTrackId) ?? null : null) ??
    (queue.lastPlayedTrack?.id === statusTrackId ? queue.lastPlayedTrack : null);
  const filePath = currentTrack?.path ?? audioStatus?.currentFilePath ?? playbackStatus?.filePath ?? null;
  const title = currentTrack?.title ?? titleFromPath(filePath);
  const artist = currentTrack?.artist || currentTrack?.albumArtist || (filePath ? 'Local file' : 'Ready');
  const coverUrl = safeCoverUrl(currentTrack);
  const headerCoverUrl = safeOriginalCoverUrl(currentTrack);
  const positionSeconds = seekPreviewSeconds ?? audioStatus?.positionSeconds ?? (playbackStatus?.positionMs ?? 0) / 1000;
  const hasRealLyrics = lyrics.kind !== 'empty' && lyrics.kind !== 'instrumental' && lyrics.lines.length > 0;

  const refreshStatus = useCallback(async (): Promise<void> => {
    const echo = window.echo;

    if (!echo) {
      setError('Desktop bridge unavailable');
      return;
    }

    try {
      const [nextPlaybackStatus, nextAudioStatus] = await Promise.all([
        echo.playback.getStatus(),
        echo.audio.getStatus(),
      ]);

      setPlaybackStatus(nextPlaybackStatus);
      setAudioStatus(nextAudioStatus);
      const nextTrackId = nextPlaybackStatus.currentTrackId ?? nextAudioStatus.currentTrackId ?? null;
      if (nextTrackId) {
        queue.setCurrentTrackId(nextTrackId);
      }
      setError(nextAudioStatus.error);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : String(statusError));
    }
  }, [queue]);

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
  }, [pollIntervalMs, refreshStatus]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        window.dispatchEvent(new Event('app:navigate:lyrics-back'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!trackId) {
      setLyrics(initialLyrics && initialLyrics.length > 0 ? syncedLyrics(initialLyrics, 0) : emptyLyrics(0));
      setLyricsStatus(null);
      setCandidates([]);
      return;
    }

    const lyricsApi = window.echo?.lyrics;
    if (!lyricsApi) {
      setLyrics(initialLyrics && initialLyrics.length > 0 ? syncedLyrics(initialLyrics, 0) : emptyLyrics(0));
      return;
    }

    const requestId = lyricsRequestRef.current + 1;
    lyricsRequestRef.current = requestId;
    setIsLyricsLoading(true);
    setLyricsStatus('正在匹配歌词...');
    setCandidates([]);

    void lyricsApi
      .getForTrack(trackId)
      .then((trackLyrics) => {
        if (lyricsRequestRef.current !== requestId) {
          return;
        }

        setLyrics(trackLyricsToState(trackLyrics));
        setLyricsStatus(trackLyrics ? null : '未找到歌词');
      })
      .catch((lyricsError) => {
        if (lyricsRequestRef.current !== requestId) {
          return;
        }

        setLyrics(emptyLyrics(0));
        setLyricsStatus('未找到歌词');
        setError(lyricsError instanceof Error ? lyricsError.message : String(lyricsError));
      })
      .finally(() => {
        if (lyricsRequestRef.current === requestId) {
          setIsLyricsLoading(false);
        }
      });
  }, [initialLyrics, trackId]);

  const handleSearchLyrics = useCallback(async (): Promise<void> => {
    if (!trackId || !window.echo?.lyrics) {
      setError('Desktop bridge unavailable');
      return;
    }

    setIsCandidateLoading(true);
    setLyricsStatus('正在搜索歌词候选...');
    try {
      const nextCandidates = await window.echo.lyrics.searchCandidates(trackId);
      setCandidates(nextCandidates);
      setLyricsStatus(nextCandidates.length ? null : '未找到歌词');
      setError(null);
    } catch (candidateError) {
      setLyricsStatus('未找到歌词');
      setError(candidateError instanceof Error ? candidateError.message : String(candidateError));
    } finally {
      setIsCandidateLoading(false);
    }
  }, [trackId]);

  const handleRematchLyrics = useCallback(async (): Promise<void> => {
    if (!trackId || !window.echo?.lyrics) {
      setError('Desktop bridge unavailable');
      return;
    }

    setLyrics(emptyLyrics(lyrics.offsetMs));
    setCandidates([]);
    setIsCandidateLoading(true);
    setLyricsStatus('正在重新匹配歌词...');
    try {
      await window.echo.lyrics.clearCache(trackId);
      const nextCandidates = await window.echo.lyrics.searchCandidates(trackId);
      setCandidates(nextCandidates);
      setLyricsStatus(nextCandidates.length ? null : '未找到歌词');
      setError(null);
    } catch (rematchError) {
      setLyricsStatus('未找到歌词');
      setError(rematchError instanceof Error ? rematchError.message : String(rematchError));
    } finally {
      setIsCandidateLoading(false);
    }
  }, [lyrics.offsetMs, trackId]);

  const handleApplyCandidate = useCallback(async (candidateId: string): Promise<void> => {
    if (!trackId || !window.echo?.lyrics) {
      setError('Desktop bridge unavailable');
      return;
    }

    setApplyingCandidateId(candidateId);
    try {
      const trackLyrics = await window.echo.lyrics.applyCandidate(trackId, candidateId);
      setLyrics(trackLyricsToState(trackLyrics));
      setCandidates([]);
      setLyricsStatus(null);
      setError(null);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setApplyingCandidateId(null);
    }
  }, [trackId]);

  const handleOffsetChange = useCallback(async (nextOffsetMs: number): Promise<void> => {
    const safeOffsetMs = Math.max(-10000, Math.min(10000, Math.round(nextOffsetMs)));
    setLyrics((current) => ({ ...current, offsetMs: safeOffsetMs }));

    if (!trackId || !window.echo?.lyrics) {
      return;
    }

    try {
      const trackLyrics = await window.echo.lyrics.setOffset(trackId, safeOffsetMs);
      if (trackLyrics) {
        setLyrics(trackLyricsToState(trackLyrics, safeOffsetMs));
      }
    } catch (offsetError) {
      setError(offsetError instanceof Error ? offsetError.message : String(offsetError));
    }
  }, [trackId]);

  const handleLyricSeek = useCallback(async (timeMs: number): Promise<void> => {
    const playback = window.echo?.playback;

    if (!playback) {
      setError('Desktop bridge unavailable');
      return;
    }

    const nextSeconds = Math.max(0, timeMs / 1000);
    try {
      setSeekPreviewSeconds(nextSeconds);
      setPlaybackStatus(await playback.seek(nextSeconds));
      await refreshStatus();
    } catch (seekError) {
      setError(seekError instanceof Error ? seekError.message : String(seekError));
    } finally {
      setSeekPreviewSeconds(null);
    }
  }, [refreshStatus]);

  const lyricsControls = useMemo(() => {
    if (!trackId) {
      return null;
    }

    return (
      <section className="lyrics-match-panel" aria-label="Lyrics matching">
        {lyricsStatus || isLyricsLoading ? <p className="lyrics-match-status">{isLyricsLoading ? '正在匹配歌词...' : lyricsStatus}</p> : null}
        <div className="lyrics-match-actions">
          {!hasRealLyrics ? (
            <button type="button" onClick={() => void handleSearchLyrics()} disabled={isCandidateLoading || isLyricsLoading}>
              <Search size={15} />
              搜索歌词
            </button>
          ) : null}
          <button type="button" onClick={() => void handleRematchLyrics()} disabled={isCandidateLoading || isLyricsLoading}>
            <RotateCcw size={15} />
            重新匹配
          </button>
          {lyrics.kind === 'synced' ? (
            <>
              <button type="button" onClick={() => void handleOffsetChange(lyrics.offsetMs + 500)}>
                <TimerReset size={15} />
                提前 0.5s
              </button>
              <button type="button" onClick={() => void handleOffsetChange(lyrics.offsetMs - 500)}>
                <TimerReset size={15} />
                延后 0.5s
              </button>
              <button type="button" onClick={() => void handleOffsetChange(0)}>
                重置
              </button>
              <span className="lyrics-offset-chip">{(lyrics.offsetMs / 1000).toFixed(1)}s</span>
            </>
          ) : null}
        </div>
        {candidates.length ? (
          <div className="lyrics-candidate-list">
            {candidates.map((candidate) => (
              <button
                className="lyrics-candidate"
                type="button"
                key={candidate.id}
                disabled={Boolean(applyingCandidateId)}
                onClick={() => void handleApplyCandidate(candidate.id)}
              >
                <span>
                  <strong>{candidate.title}</strong>
                  <em>
                    {candidate.artist}
                    {candidate.album ? ` / ${candidate.album}` : ''} / {formatDuration(candidate.durationSeconds)}
                  </em>
                </span>
                <span className="lyrics-candidate-badges">
                  <small>{candidate.hasSynced ? 'Synced' : candidate.hasPlain ? 'Plain' : candidate.instrumental ? 'Instrumental' : 'Lyrics'}</small>
                  <small>{candidate.sourceLabel}</small>
                  <small>{formatScore(candidate.score)}</small>
                  {applyingCandidateId === candidate.id ? <small>应用中</small> : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    );
  }, [
    applyingCandidateId,
    candidates,
    handleApplyCandidate,
    handleOffsetChange,
    handleRematchLyrics,
    handleSearchLyrics,
    hasRealLyrics,
    isCandidateLoading,
    isLyricsLoading,
    lyrics.kind,
    lyrics.offsetMs,
    lyricsStatus,
    trackId,
  ]);

  if (!currentTrack && !filePath && !trackId) {
    return (
      <div className="lyrics-page lyrics-page--empty">
        <button className="lyrics-back-button" type="button" aria-label="Back" title="Back" onClick={() => window.dispatchEvent(new Event('app:navigate:lyrics-back'))}>
          <ArrowLeft size={17} />
        </button>
        <section className="lyrics-no-track">
          <Music2 size={34} />
          <h1>Nothing is playing</h1>
          <p>Start a song from the library, then return here for lyrics and immersive playback.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="lyrics-page" style={coverUrl ? ({ '--lyrics-cover': `url("${coverUrl}")` } as CSSProperties) : undefined}>
      <div className="lyrics-backdrop" aria-hidden="true" />

      <section className="lyrics-left-panel">
        <button className="lyrics-back-button" type="button" aria-label="Back" title="Back" onClick={() => window.dispatchEvent(new Event('app:navigate:lyrics-back'))}>
          <ArrowLeft size={17} />
        </button>

        <header className="lyrics-track-header">
          <div className="lyrics-track-cover" data-empty={!headerCoverUrl}>
            {headerCoverUrl ? <img alt="" draggable={false} src={headerCoverUrl} /> : <Disc3 size={26} />}
          </div>
          <div className="lyrics-track-copy">
            <span className="lyrics-kicker">Now Playing</span>
            <h1>{title}</h1>
            <p>{artist}</p>
          </div>
        </header>

        {lyricsControls}
        <LyricsView lyrics={lyrics} positionMs={positionSeconds * 1000} onSeek={(timeMs) => void handleLyricSeek(timeMs)} />
      </section>

      <MvPanel title={title} artist={artist} coverUrl={coverUrl} />

      {error ? <div className="lyrics-error" role="status">{error}</div> : null}
    </div>
  );
};
