import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FolderPlus, RefreshCw, RotateCw, Search, Trash2 } from 'lucide-react';
import type { EditableTrackTags, LibrarySort, LibraryTrack } from '../../shared/types/library';
import { TrackContextMenu } from '../components/library/TrackContextMenu';
import type { TrackMenuAction } from '../components/library/TrackContextMenu';
import { TrackList } from '../components/library/TrackList';
import { TrackTagEditorDrawer } from '../components/library/TrackTagEditorDrawer';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';

const pageSize = 100;

type TrackMenuState = {
  track: LibraryTrack;
  position: { x: number; y: number };
};

export const SongsPage = (): JSX.Element => {
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('title');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);
  const [editingTrack, setEditingTrack] = useState<LibraryTrack | null>(null);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const requestIdRef = useRef(0);
  const { currentTrackId, playTrack, setQueue, appendToQueue, playTrackNext, removeFromQueue } = usePlaybackQueue();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadTracks = useCallback(
    async (nextPage: number, mode: 'replace' | 'append') => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const library = window.echo?.library;

        if (!library) {
          setTracks([]);
          setPage(1);
          setTotal(0);
          setHasMore(false);
          setError('Desktop bridge unavailable. Open ECHO Next in Electron to read the library.');
          return;
        }

        const result = await library.getTracks({
          page: nextPage,
          pageSize,
          search,
          sort,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setTracks((current) => (mode === 'append' ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (loadError) {
        if (requestIdRef.current === requestId) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [search, sort],
  );

  useEffect(() => {
    void loadTracks(1, 'replace');
  }, [loadTracks]);

  useEffect(() => {
    setQueue(tracks);
  }, [setQueue, tracks]);

  useEffect(() => {
    const handleLibraryChanged = (): void => {
      void loadTracks(1, 'replace');
    };

    window.addEventListener('library:changed', handleLibraryChanged);
    return () => window.removeEventListener('library:changed', handleLibraryChanged);
  }, [loadTracks]);

  const handleLoadMore = useCallback((): void => {
    if (!isLoading && hasMore) {
      void loadTracks(page + 1, 'append');
    }
  }, [hasMore, isLoading, loadTracks, page]);

  const handleRefresh = (): void => {
    void loadTracks(1, 'replace');
  };

  const handleImportFolder = (): void => {
    window.dispatchEvent(new Event('app:navigate:import-folder'));
  };

  const handlePlayTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      const playback = window.echo?.playback;

      if (!playback) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to play local files.');
        return;
      }

      try {
        setError(null);
        await playTrack(track);
      } catch (playError) {
        setError(playError instanceof Error ? playError.message : String(playError));
      }
    },
    [playTrack],
  );

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    setTrackMenu({ track, position });
  }, []);

  const handleTrackMenuAction = useCallback(
    async (action: TrackMenuAction, track: LibraryTrack): Promise<void> => {
      const library = window.echo?.library;
      setTrackMenu(null);

      if (!library && action !== 'play-next' && action !== 'add-to-queue' && action !== 'remove-from-queue' && action !== 'edit-tags') {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to use file actions.');
        return;
      }

      try {
        setError(null);

        switch (action) {
          case 'play-next':
            playTrackNext(track);
            return;
          case 'add-to-queue':
            appendToQueue(track);
            return;
          case 'remove-from-queue':
            removeFromQueue(track.id);
            return;
          case 'edit-tags':
            setTagEditorError(null);
            setEditingTrack(track);
            return;
          case 'go-to-album':
            setSearchInput(track.album);
            setSort('album');
            return;
          case 'show-in-folder':
            await library?.openTrackInFolder(track.id);
            return;
          case 'copy-path':
            await library?.copyTrackPath(track.id);
            return;
          case 'open-system':
            await library?.openTrackWithSystem(track.id);
            return;
          case 'copy-name-artist':
            await library?.copyTrackNameArtist(track.id);
            return;
          case 'copy-cover':
            if (!(await library?.copyTrackCover(track.id))) {
              setError('这首歌没有可复制的歌曲卡片图片。');
            }
            return;
          case 'save-cover':
            if (!(await library?.saveTrackCover(track.id))) {
              setError('没有保存歌曲卡片图片。');
            }
            return;
          case 'delete-song':
            if (!window.confirm(`删除歌曲文件？\n${track.title}`)) {
              return;
            }
            await library?.deleteTrackFile(track.id);
            setTracks((current) => current.filter((item) => item.id !== track.id));
            window.dispatchEvent(new Event('library:changed'));
            return;
          case 'add-to-playlist':
          default:
            setError('歌单功能还在接入中。');
        }
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [appendToQueue, playTrackNext, removeFromQueue],
  );

  const handleSaveTags = useCallback(async (track: LibraryTrack, tags: EditableTrackTags): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setTagEditorError('Desktop bridge unavailable. Open ECHO Next in Electron to edit embedded tags.');
      return;
    }

    setIsSavingTags(true);
    setTagEditorError(null);

    try {
      const updatedTrack = await library.updateTrackTags({ trackId: track.id, tags });
      setTracks((current) => current.map((item) => (item.id === updatedTrack.id ? updatedTrack : item)));
      window.dispatchEvent(new Event('library:changed'));
      setEditingTrack(null);
    } catch (saveError) {
      setTagEditorError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSavingTags(false);
    }
  }, []);

  return (
    <div className="songs-page">
      <header className="songs-header">
        <div className="songs-title-group">
          <h1>歌曲</h1>
          <span>{total} 首</span>
        </div>

        <div className="songs-tools" aria-label="歌曲工具">
          <button className="tool-button" type="button" aria-label="导入文件夹" title="导入文件夹" onClick={handleImportFolder}>
            <FolderPlus size={17} />
          </button>
          <button className="tool-button" type="button" aria-label="扫描曲库" title="扫描曲库">
            <RotateCw size={17} />
          </button>
          <button className="tool-button" type="button" aria-label="下载" title="下载">
            <Download size={17} />
          </button>
          <button className="tool-button" type="button" aria-label="刷新" title="刷新" onClick={handleRefresh}>
            <RefreshCw size={17} />
          </button>
          <button className="tool-button danger" type="button" aria-label="删除" title="删除">
            <Trash2 size={17} />
          </button>
        </div>
      </header>

      <div className="songs-control-row">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="搜索曲目 / 艺人 / 专辑..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <label className="sort-button sort-select">
          <select value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
            <option value="title">默认排序</option>
            <option value="artist">按艺术家</option>
            <option value="album">按专辑</option>
            <option value="recent">最近更新</option>
          </select>
          <ChevronDown size={15} />
        </label>
      </div>

      <TrackList
        tracks={tracks}
        currentTrackId={currentTrackId}
        canLoadMore={hasMore && !isLoading}
        onEndReached={handleLoadMore}
        onOpenTrackMenu={handleOpenTrackMenu}
        onPlay={handlePlayTrack}
      />

      {error || isLoading ? (
        <div className="list-footer">
          <span>{error ?? '正在读取曲库...'}</span>
        </div>
      ) : null}

      {trackMenu ? (
        <TrackContextMenu
          track={trackMenu.track}
          position={trackMenu.position}
          onAction={(action, track) => void handleTrackMenuAction(action, track)}
          onClose={() => setTrackMenu(null)}
        />
      ) : null}

      <TrackTagEditorDrawer
        track={editingTrack}
        isOpen={Boolean(editingTrack)}
        isSaving={isSavingTags}
        error={tagEditorError}
        onClose={() => setEditingTrack(null)}
        onSave={(track, tags) => void handleSaveTags(track, tags)}
      />
    </div>
  );
};
