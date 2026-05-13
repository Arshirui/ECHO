import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, ListPlus, MoreHorizontal, Music2, Play, Plus, RotateCcw, Trash2, WifiOff } from 'lucide-react';
import type { LibraryPage, LibraryPlaylist, LibraryPlaylistItem, LibraryTrack } from '../../shared/types/library';
import { TrackList } from '../components/library/TrackList';
import { TrackContextMenu, type TrackMenuAction } from '../components/library/TrackContextMenu';
import { likedChangedEvent, likedTracksChangedEvent, useLikedTrackIds } from '../hooks/useLikedMedia';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';

const pageSize = 100;

const emptyItemsPage = (): LibraryPage<LibraryPlaylistItem> => ({
  items: [],
  page: 1,
  pageSize,
  total: 0,
  hasMore: false,
});

const itemToTrack = (item: LibraryPlaylistItem): LibraryTrack => {
  if (item.track && !item.unavailable) {
    return {
      ...item.track,
      playlistItemId: item.id,
      unavailable: false,
    };
  }

  return {
    id: item.mediaId ?? item.id,
    path: '',
    title: item.titleSnapshot ?? 'Unavailable track',
    artist: item.artistSnapshot ?? 'Unknown artist',
    album: item.albumSnapshot ?? '',
    albumArtist: item.artistSnapshot ?? '',
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: item.durationSnapshot ?? 0,
    codec: null,
    sampleRate: null,
    bitDepth: null,
    bitrate: null,
    coverId: item.coverId,
    coverThumb: item.coverThumb,
    fieldSources: {},
    playlistItemId: item.id,
    unavailable: true,
  };
};

export const PlaylistsPage = (): JSX.Element => {
  const [playlists, setPlaylists] = useState<LibraryPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [itemsPage, setItemsPage] = useState<LibraryPage<LibraryPlaylistItem>>(emptyItemsPage());
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackMenu, setTrackMenu] = useState<{ track: LibraryTrack; position: { x: number; y: number } } | null>(null);
  const requestIdRef = useRef(0);
  const { currentTrackId, items: queueItems, playTrack, appendToQueue, playTrackNext, removeQueueItem } = usePlaybackQueue();
  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? playlists[0] ?? null,
    [playlists, selectedPlaylistId],
  );
  const displayTracks = useMemo(() => itemsPage.items.map(itemToTrack), [itemsPage.items]);
  const playableTracks = useMemo(() => itemsPage.items.flatMap((item) => (item.track && !item.unavailable ? [item.track] : [])), [itemsPage.items]);
  const likedTrackIds = useLikedTrackIds(playableTracks.map((track) => track.id));
  const queueSource = useMemo(
    () => ({ type: 'manual' as const, label: selectedPlaylist ? `Playlist: ${selectedPlaylist.name}` : 'Playlist' }),
    [selectedPlaylist],
  );

  const loadPlaylists = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to use playlists.');
      return;
    }

    try {
      const result = await library.getPlaylists();
      setPlaylists(result);
      setSelectedPlaylistId((current) => current ?? result[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  const loadItems = useCallback(async (playlistId: string, nextPage = 1, mode: 'replace' | 'append' = 'replace'): Promise<void> => {
    const library = window.echo?.library;
    if (!library) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const result = await library.getPlaylistItems(playlistId, { page: nextPage, pageSize });
      if (requestIdRef.current !== requestId) {
        return;
      }

      setItemsPage((current) => (mode === 'append' ? { ...result, items: [...current.items, ...result.items] } : result));
    } catch (loadError) {
      if (requestIdRef.current === requestId) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    const handleChanged = (): void => {
      void loadPlaylists();
    };

    window.addEventListener('library:playlists-changed', handleChanged);
    return () => window.removeEventListener('library:playlists-changed', handleChanged);
  }, [loadPlaylists]);

  useEffect(() => {
    if (selectedPlaylist) {
      void loadItems(selectedPlaylist.id);
    } else {
      setItemsPage(emptyItemsPage());
    }
  }, [loadItems, selectedPlaylist]);

  const refreshSelected = useCallback(async (): Promise<void> => {
    await loadPlaylists();
    if (selectedPlaylist) {
      await loadItems(selectedPlaylist.id);
    }
  }, [loadItems, loadPlaylists, selectedPlaylist]);

  const handleCreatePlaylist = async (): Promise<void> => {
    const library = window.echo?.library;
    const name = window.prompt('新建歌单名称');
    if (!library || !name?.trim()) {
      return;
    }

    try {
      const playlist = await library.createPlaylist({ name });
      await loadPlaylists();
      setSelectedPlaylistId(playlist.id);
      setStatusMessage('歌单已创建');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    }
  };

  const handleDeletePlaylist = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library || !selectedPlaylist || !window.confirm(`删除歌单 "${selectedPlaylist.name}"?`)) {
      return;
    }

    try {
      await library.deletePlaylist(selectedPlaylist.id);
      setSelectedPlaylistId(null);
      await loadPlaylists();
      setStatusMessage('歌单已删除');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const handlePlayAll = async (): Promise<void> => {
    if (playableTracks.length === 0) {
      setError('这个歌单没有可播放的本地歌曲。');
      return;
    }

    try {
      await playTrack(playableTracks[0], {
        replaceQueueWith: playableTracks,
        source: queueSource,
      });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  };

  const handleAddAllToQueue = (): void => {
    for (const track of playableTracks) {
      appendToQueue(track, queueSource);
    }
    setStatusMessage(`已添加 ${playableTracks.length} 首可用歌曲到队列`);
  };

  const handleChoosePlaylistCover = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library || !selectedPlaylist) {
      return;
    }

    try {
      const selection = await library.chooseTrackCover();
      if (!selection) {
        return;
      }

      await library.updatePlaylist({ playlistId: selectedPlaylist.id, coverPath: selection.path });
      await refreshSelected();
      setStatusMessage('歌单封面已更新');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (coverError) {
      setError(coverError instanceof Error ? coverError.message : String(coverError));
    }
  };

  const handleClearPlaylistCover = async (): Promise<void> => {
    const library = window.echo?.library;
    if (!library || !selectedPlaylist) {
      return;
    }

    try {
      await library.updatePlaylist({ playlistId: selectedPlaylist.id, coverId: null });
      await refreshSelected();
      setStatusMessage('已恢复为第一首歌的专辑封面');
      window.dispatchEvent(new Event('library:playlists-changed'));
    } catch (coverError) {
      setError(coverError instanceof Error ? coverError.message : String(coverError));
    }
  };

  const handleLoadMore = (): void => {
    if (selectedPlaylist && itemsPage.hasMore && !isLoading) {
      void loadItems(selectedPlaylist.id, itemsPage.page + 1, 'append');
    }
  };

  const handleTrackPlay = async (track: LibraryTrack): Promise<void> => {
    const item = itemsPage.items.find((candidate) => candidate.id === track.playlistItemId);
    if (!item?.track || item.unavailable) {
      return;
    }

    try {
      await playTrack(item.track, {
        replaceQueueWith: playableTracks,
        source: queueSource,
      });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  };

  const handleAddTrackToQueue = (track: LibraryTrack): void => {
    const item = itemsPage.items.find((candidate) => candidate.id === track.playlistItemId);
    if (item?.track && !item.unavailable) {
      appendToQueue(item.track, queueSource);
    }
  };

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    if (!track.unavailable) {
      setTrackMenu({ track, position });
    }
  }, []);

  const handleToggleLiked = useCallback(async (track: LibraryTrack): Promise<void> => {
    const library = window.echo?.library;
    if (!library || track.unavailable) {
      return;
    }

    try {
      setError(null);
      await library.toggleTrackLiked(track.id);
      window.dispatchEvent(new Event(likedTracksChangedEvent));
      window.dispatchEvent(new Event(likedChangedEvent));
    } catch (likeError) {
      setError(likeError instanceof Error ? likeError.message : String(likeError));
    }
  }, []);

  const handleTrackMenuAction = useCallback(
    async (action: TrackMenuAction, track: LibraryTrack): Promise<void> => {
      const library = window.echo?.library;
      setTrackMenu(null);

      if (track.unavailable) {
        return;
      }

      try {
        setError(null);

        switch (action) {
          case 'play-next':
            playTrackNext(track, queueSource);
            return;
          case 'add-to-queue':
            appendToQueue(track, queueSource);
            setStatusMessage(`已添加到队列：${track.title}`);
            return;
          case 'toggle-liked':
            await handleToggleLiked(track);
            return;
          case 'remove-from-queue':
            {
              const queuedItem = queueItems.find((item) => item.track.id === track.id);
              if (queuedItem) {
                removeQueueItem(queuedItem.queueId);
              }
            }
            return;
          case 'add-to-playlist':
            {
              if (!library) {
                setError('Desktop bridge unavailable. Open ECHO Next in Electron to use playlists.');
                return;
              }

              const playlists = await library.getPlaylists();
              let playlist: (typeof playlists)[number] | null = playlists[0] ?? null;
              if (playlists.length > 1) {
                const names = playlists.map((item, index) => `${index + 1}. ${item.name}`).join('\n');
                const choice = window.prompt(`选择歌单编号：\n${names}`, '1');
                const index = Number(choice) - 1;
                playlist = Number.isInteger(index) ? playlists[index] ?? null : null;
              }

              if (!playlist) {
                const name = window.prompt('还没有歌单，输入名称创建后添加：');
                if (!name?.trim()) {
                  return;
                }
                playlist = await library.createPlaylist({ name });
              }

              if (!playlist) {
                return;
              }

              await library.addTrackToPlaylist(playlist.id, track.id);
              window.dispatchEvent(new Event('library:playlists-changed'));
              setStatusMessage(`已加入歌单：${playlist.name}`);
            }
            return;
          default:
            setError('这个歌单操作还没有接入。');
        }
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      }
    },
    [appendToQueue, handleToggleLiked, playTrackNext, queueItems, queueSource, removeQueueItem],
  );

  return (
    <div className="playlists-page">
      <aside className="playlist-sidebar" aria-label="Playlists">
        <div className="playlist-sidebar-header">
          <h1>Playlists</h1>
          <button className="tool-button" type="button" aria-label="新建歌单" title="新建歌单" onClick={() => void handleCreatePlaylist()}>
            <Plus size={17} />
          </button>
        </div>

        <div className="playlist-list">
          {playlists.map((playlist) => (
            <button
              className="playlist-list-item"
              data-active={playlist.id === selectedPlaylist?.id ? 'true' : undefined}
              key={playlist.id}
              type="button"
              onClick={() => setSelectedPlaylistId(playlist.id)}
            >
              <span>
                <strong>{playlist.name}</strong>
                <small>{playlist.itemCount} tracks</small>
              </span>
            </button>
          ))}
          {playlists.length === 0 ? <p className="playlist-empty">还没有本地歌单。</p> : null}
        </div>

        <div className="streaming-section">
          <h2>流媒体歌单</h2>
          <div>
            <span><WifiOff size={14} /> 网易云音乐</span>
            <em>未连接</em>
          </div>
          <div>
            <span><WifiOff size={14} /> QQ 音乐</span>
            <em>未连接</em>
          </div>
        </div>
      </aside>

      <section className="playlist-detail">
        {selectedPlaylist ? (
          <>
            <header className="playlist-detail-header">
              <div className="playlist-cover" data-empty={!selectedPlaylist.coverThumb}>
                {selectedPlaylist.coverThumb ? <img alt="" src={selectedPlaylist.coverThumb} /> : <Music2 size={34} />}
                <button
                  className="playlist-cover-button"
                  type="button"
                  aria-label="自定义歌单封面"
                  title="自定义歌单封面"
                  onClick={() => void handleChoosePlaylistCover()}
                >
                  <ImagePlus size={17} />
                </button>
                {selectedPlaylist.coverId ? (
                  <button
                    className="playlist-cover-reset"
                    type="button"
                    aria-label="使用第一首歌封面"
                    title="使用第一首歌封面"
                    onClick={() => void handleClearPlaylistCover()}
                  >
                    <RotateCcw size={15} />
                  </button>
                ) : null}
              </div>
              <div className="playlist-detail-copy">
                <h2>{selectedPlaylist.name}</h2>
                <p>{selectedPlaylist.description || 'Manual local playlist'}</p>
                <small>{itemsPage.total} tracks</small>
              </div>
              <div className="playlist-actions">
                <button className="primary-action" type="button" disabled={playableTracks.length === 0} onClick={() => void handlePlayAll()}>
                  <Play size={16} />
                  <span>播放全部</span>
                </button>
                <button className="secondary-action" type="button" disabled={playableTracks.length === 0} onClick={handleAddAllToQueue}>
                  <ListPlus size={16} />
                  <span>添加到队列</span>
                </button>
                <button className="tool-button" type="button" aria-label="更多" title="更多">
                  <MoreHorizontal size={17} />
                </button>
                <button className="tool-button danger" type="button" aria-label="删除歌单" title="删除歌单" onClick={() => void handleDeletePlaylist()}>
                  <Trash2 size={17} />
                </button>
              </div>
            </header>

            <TrackList
              tracks={displayTracks}
              currentTrackId={currentTrackId}
              canLoadMore={itemsPage.hasMore && !isLoading}
              onEndReached={handleLoadMore}
              onAddToQueue={handleAddTrackToQueue}
              likedTrackIds={likedTrackIds}
              onToggleLiked={(track) => void handleToggleLiked(track)}
              onOpenTrackMenu={handleOpenTrackMenu}
              onPlay={handleTrackPlay}
            />
          </>
        ) : (
          <div className="playlist-start">
            <Music2 size={36} />
            <strong>创建第一个本地歌单</strong>
            <button className="primary-action" type="button" onClick={() => void handleCreatePlaylist()}>
              <Plus size={16} />
              <span>新建歌单</span>
            </button>
          </div>
        )}

        {error || statusMessage || isLoading ? (
          <div className="list-footer">
            <span>{error ?? statusMessage ?? '正在读取歌单...'}</span>
            {selectedPlaylist && !isLoading ? (
              <button className="text-action" type="button" onClick={() => void refreshSelected()}>
                刷新
              </button>
            ) : null}
          </div>
        ) : null}

        {trackMenu ? (
          <TrackContextMenu
            track={trackMenu.track}
            position={trackMenu.position}
            liked={likedTrackIds[trackMenu.track.id] === true}
            onAction={(action, track) => void handleTrackMenuAction(action, track)}
            onClose={() => setTrackMenu(null)}
          />
        ) : null}
      </section>
    </div>
  );
};
