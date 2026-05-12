import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Disc3, Play } from 'lucide-react';
import type { LibraryAlbum, LibraryTrack } from '../../../shared/types/library';
import { usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { AlbumTrackList } from './AlbumTrackList';

type AlbumDetailViewProps = {
  album: LibraryAlbum;
  onBack: () => void;
};

const formatDuration = (duration: number): string | null => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const totalMinutes = Math.round(duration / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours} hr ${minutes} min` : `${totalMinutes} min`;
};

const formatSampleRate = (sampleRate: number | null): string | null => {
  if (!sampleRate) {
    return null;
  }

  if (sampleRate >= 1000) {
    const khz = sampleRate / 1000;
    return `${Number.isInteger(khz) ? khz : khz.toFixed(1)}kHz`;
  }

  return `${sampleRate}Hz`;
};

const formatBitrate = (bitrate: number | null): string | null => {
  if (!bitrate || !Number.isFinite(bitrate)) {
    return null;
  }

  return bitrate >= 1000000 ? `${(bitrate / 1000000).toFixed(1)}Mbps` : `${Math.round(bitrate / 1000)}kbps`;
};

const formatTechnicalSummary = (track: LibraryTrack | null): string | null => {
  if (!track) {
    return null;
  }

  return [
    track.codec?.toUpperCase() ?? null,
    track.bitDepth ? `${track.bitDepth}bit` : null,
    formatSampleRate(track.sampleRate),
  ]
    .filter(Boolean)
    .join(' / ') || null;
};

const uniqueValues = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));

export const AlbumDetailView = ({ album, onBack }: AlbumDetailViewProps): JSX.Element => {
  const { currentTrackId, playTrack, setQueue } = usePlaybackQueue();
  const [firstTrack, setFirstTrack] = useState<LibraryTrack | null>(null);
  const [loadedTracks, setLoadedTracks] = useState<LibraryTrack[]>([]);
  const [loadedTotal, setLoadedTotal] = useState(0);
  const [isLoadingFirstTrack, setIsLoadingFirstTrack] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const duration = formatDuration(album.duration);
  const formatSummary = formatTechnicalSummary(firstTrack);
  const albumMetadata = useMemo(
    () =>
      [
        album.year ? String(album.year) : null,
        `${album.trackCount} ${album.trackCount === 1 ? 'track' : 'tracks'}`,
        duration,
        formatSummary,
      ].filter((item): item is string => Boolean(item)),
    [album.trackCount, album.year, duration, formatSummary],
  );
  const signalItems = useMemo(
    () =>
      firstTrack
        ? [
            firstTrack.codec?.toUpperCase() ?? null,
            firstTrack.bitDepth ? `${firstTrack.bitDepth}bit` : null,
            formatSampleRate(firstTrack.sampleRate),
            formatBitrate(firstTrack.bitrate),
          ].filter((item): item is string => Boolean(item))
        : [],
    [firstTrack],
  );
  const libraryItems = useMemo(
    () =>
      [
        album.year ? `Released ${album.year}` : null,
        `${album.trackCount} ${album.trackCount === 1 ? 'track' : 'tracks'}`,
        duration,
      ].filter((item): item is string => Boolean(item)),
    [album.trackCount, album.year, duration],
  );
  const textureItems = useMemo(() => {
    const genres = uniqueValues(loadedTracks.map((track) => track.genre)).slice(0, 3);
    const discs = new Set(loadedTracks.map((track) => track.discNo).filter((discNo): discNo is number => Boolean(discNo && discNo > 0)));

    return [
      ...genres,
      discs.size > 1 ? `${discs.size} discs` : null,
      loadedTotal > loadedTracks.length ? `${loadedTracks.length} loaded` : null,
    ].filter((item): item is string => Boolean(item));
  }, [loadedTotal, loadedTracks]);

  const handleFirstTrackChange = useCallback((track: LibraryTrack | null, isLoading: boolean): void => {
    setFirstTrack(track);
    setIsLoadingFirstTrack(isLoading);
  }, []);

  const handleLoadedTracksChange = useCallback((tracks: LibraryTrack[], total: number, isLoading: boolean): void => {
    setLoadedTracks(tracks);
    setLoadedTotal(total);
    setFirstTrack(tracks[0] ?? null);
    setIsLoadingFirstTrack(isLoading && tracks.length === 0);
  }, []);

  const withAlbumCoverFallback = useCallback(
    (track: LibraryTrack): LibraryTrack => (track.coverThumb || !album.coverThumb ? track : { ...track, coverThumb: album.coverThumb }),
    [album.coverThumb],
  );

  const handlePlayTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      try {
        setPlayError(null);
        await playTrack(withAlbumCoverFallback(track));
      } catch (error) {
        setPlayError(error instanceof Error ? error.message : String(error));
      }
    },
    [playTrack, withAlbumCoverFallback],
  );

  const handlePlayNow = useCallback((): void => {
    if (firstTrack) {
      const playableTracks = loadedTracks.length > 0 ? loadedTracks.map(withAlbumCoverFallback) : [withAlbumCoverFallback(firstTrack)];
      setQueue(playableTracks);
      void handlePlayTrack(playableTracks[0] ?? firstTrack);
    }
  }, [firstTrack, handlePlayTrack, loadedTracks, setQueue, withAlbumCoverFallback]);

  return (
    <div className="album-detail-page">
      <button className="album-back-button" type="button" onClick={onBack}>
        <ArrowLeft size={17} />
        Albums
      </button>

      <section className="album-detail-hero" aria-label={`${album.title} album details`}>
        <div className="album-detail-cover" data-empty={!album.coverThumb}>
          {album.coverThumb ? (
            <img alt="" decoding="async" draggable={false} height={320} loading="lazy" src={album.coverThumb} width={320} />
          ) : (
            <Disc3 size={58} />
          )}
        </div>

        <div className="album-detail-console">
          <div className="album-detail-copy">
            <span className="album-detail-kicker">Album console</span>
            <h1>{album.title}</h1>
            <p>{album.albumArtist}</p>

            <div className="album-detail-meta" aria-label="Album metadata">
              {albumMetadata.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="album-detail-actions">
            <button className="album-primary-action" type="button" disabled={!firstTrack || isLoadingFirstTrack} onClick={handlePlayNow}>
              <Play size={16} fill="currentColor" />
              {isLoadingFirstTrack ? 'Reading album' : 'Play Album'}
            </button>
            <span className="album-action-note">{loadedTotal > 0 ? `${loadedTracks.length}/${loadedTotal} tracks ready` : 'Waiting for tracks'}</span>
          </div>

          <div className="album-console-grid" aria-label="Album signal summary">
            <section className="album-console-panel">
              <span>Signal</span>
              <strong>{signalItems[0] ?? 'Pending'}</strong>
              <small>{signalItems.slice(1).join(' / ') || 'Reading first track'}</small>
            </section>
            <section className="album-console-panel">
              <span>Library</span>
              <strong>{album.trackCount} {album.trackCount === 1 ? 'track' : 'tracks'}</strong>
              <small>{libraryItems.join(' / ')}</small>
            </section>
            {textureItems.length > 0 ? (
              <section className="album-console-panel">
                <span>Texture</span>
                <strong>{textureItems[0]}</strong>
                <small>{textureItems.slice(1).join(' / ') || 'Tagged locally'}</small>
              </section>
            ) : null}
          </div>

          {playError ? <p className="album-detail-error">{playError}</p> : null}
        </div>
      </section>

      <section className="album-detail-track-console" aria-label={`${album.title} track console`}>
        <header className="album-track-heading">
          <div>
            <span>Track deck</span>
            <h2>{album.title}</h2>
          </div>
          <small>{formatSummary ?? 'Signal appears after the first track loads'}</small>
        </header>
        <AlbumTrackList
          albumId={album.id}
          currentTrackId={currentTrackId}
          onFirstTrackChange={handleFirstTrackChange}
          onLoadedTracksChange={handleLoadedTracksChange}
          onPlayTrack={handlePlayTrack}
        />
      </section>
    </div>
  );
};
