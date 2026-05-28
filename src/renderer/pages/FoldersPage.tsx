import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  ListPlus,
  Play,
  RefreshCw,
  RotateCw,
  Search,
  Shuffle,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  EditableTrackTags,
  LibraryFolderNode,
  LibraryFolderOverview,
  LibraryPage,
  LibraryPlaylist,
  LibraryScanStatus,
  LibrarySort,
  LibraryTrack,
} from '../../shared/types/library';
import type { RemoteDirectoryItem, RemoteSource, RemoteTrackLookupItem } from '../../shared/types/remoteSources';
import { TrackContextMenu } from '../components/library/TrackContextMenu';
import type { TrackMenuAction } from '../components/library/TrackContextMenu';
import { OsuTimingPanel } from '../components/library/OsuTimingPanel';
import { TrackList } from '../components/library/TrackList';
import { TrackTagEditorDrawer } from '../components/library/TrackTagEditorDrawer';
import { StyledSelect } from '../components/ui/StyledSelect';
import {
  forgetLibraryScanStatus,
  getLibraryScanStatuses,
  rememberLibraryScanStatus,
  subscribeLibraryScanStatuses,
  type ScanStatusByFolder,
} from '../stores/libraryScanSession';
import { usePlaybackQueue } from '../stores/PlaybackQueueProvider';
import { useI18n } from '../i18n/I18nProvider';
import { resolvePlaylistForTrackAdd } from '../utils/appPrompt';
import { getRemoteSourcesBridge } from '../utils/echoBridge';
import type { TranslationKey } from '../i18n/locales';
import { openAlbumDetailForTrack } from '../utils/albumNavigation';

type FolderTarget = {
  folderId: string;
  path: string;
  name: string;
  rootName: string;
  rootPath: string;
  trackCount: number;
  childFolderCount: number;
  totalDuration: number;
  totalSizeBytes: number;
  coverThumbs: string[];
};

type TrackMenuState = {
  track: LibraryTrack;
  position: { x: number; y: number };
};

type FolderMode = 'local' | 'remote';

type RemoteFolderTarget = {
  sourceId: string;
  sourceName: string;
  provider: RemoteSource['provider'];
  path: string;
  name: string;
};

const pageSize = 100;
const bulkPageSize = 500;
const maxBulkTracks = 1000;
const terminalStatuses = new Set<LibraryScanStatus['status']>(['completed', 'failed', 'cancelled']);
const runningStatuses = new Set<LibraryScanStatus['status']>(['queued', 'running']);

const remoteProviderLabels = {
  webdav: 'WebDAV / AList',
  baidu: '百度网盘',
  jellyfin: 'Jellyfin',
  emby: 'Emby',
  smb: 'NAS / SMB',
  sshfs: 'SSHFS',
  subsonic: 'Subsonic',
} satisfies Record<RemoteSource['provider'], string>;

const remoteStatusLabels = {
  enabled: '已启用',
  disabled: '已禁用',
  error: '异常',
} satisfies Record<RemoteSource['status'], string>;

const sortOptions: Array<{ value: LibrarySort; labelKey: TranslationKey }> = [
  { value: 'default', labelKey: 'folders.sort.title' },
  { value: 'createdAsc', labelKey: 'library.sort.createdAsc' },
  { value: 'createdDesc', labelKey: 'library.sort.createdDesc' },
  { value: 'artist', labelKey: 'folders.sort.artist' },
  { value: 'album', labelKey: 'folders.sort.album' },
  { value: 'fileModifiedAsc', labelKey: 'library.sort.fileModifiedAsc' },
  { value: 'fileModifiedDesc', labelKey: 'library.sort.fileModifiedDesc' },
  { value: 'recent', labelKey: 'folders.sort.recent' },
  { value: 'durationDesc', labelKey: 'folders.sort.duration' },
  { value: 'qualityDesc', labelKey: 'folders.sort.quality' },
  { value: 'random', labelKey: 'folders.sort.random' },
];

const targetKey = (folderId: string, path: string): string => `${folderId}::${path}`;

const formatDuration = (seconds: number, t: (key: TranslationKey, options?: Record<string, string | number>) => string): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--';
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return t('folders.duration.minutes', { count: minutes });
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? t('folders.duration.hoursMinutes', { hours, minutes: rest }) : t('folders.duration.hours', { count: hours });
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '--';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
};

const statusLabel = (status: LibraryScanStatus['status'], t: (key: TranslationKey) => string): string => {
  switch (status) {
    case 'queued':
      return t('folders.status.queued');
    case 'running':
      return t('folders.status.running');
    case 'completed':
      return t('folders.status.completed');
    case 'cancelled':
      return t('folders.status.cancelled');
    case 'failed':
      return t('folders.status.failed');
    default:
      return status;
  }
};

const phaseLabel = (phase: LibraryScanStatus['phase'], t: (key: TranslationKey) => string): string => {
  switch (phase) {
    case 'discovering':
      return t('folders.phase.discovering');
    case 'checking_cache':
      return t('folders.phase.checkingCache');
    case 'reading_metadata':
      return t('folders.phase.readingMetadata');
    case 'extracting_covers':
      return t('folders.phase.extractingCovers');
    case 'grouping_albums':
      return t('folders.phase.groupingAlbums');
    case 'writing_database':
      return t('folders.phase.writingDatabase');
    case 'finished':
      return t('folders.phase.finished');
    default:
      return phase;
  }
};

const formatFolderError = (error: unknown, t: (key: TranslationKey) => string): string => {
  const message = error instanceof Error ? error.message : String(error);
  const upper = message.toUpperCase();

  if (upper.includes('ENOENT')) {
    return t('folders.error.pathMissing');
  }

  if (upper.includes('ENOTDIR')) {
    return t('folders.error.notFolder');
  }

  if (upper.includes('EACCES') || upper.includes('EPERM')) {
    return t('folders.error.permission');
  }

  return message || t('folders.error.actionFailed');
};

const overviewToTarget = (overview: LibraryFolderOverview): FolderTarget => ({
  folderId: overview.id,
  path: overview.path,
  name: overview.name,
  rootName: overview.name,
  rootPath: overview.path,
  trackCount: overview.trackCount,
  childFolderCount: overview.childFolderCount,
  totalDuration: overview.totalDuration,
  totalSizeBytes: overview.totalSizeBytes,
  coverThumbs: overview.coverThumbs,
});

const nodeToTarget = (node: LibraryFolderNode, root: LibraryFolderOverview): FolderTarget => ({
  folderId: node.folderId,
  path: node.path,
  name: node.name,
  rootName: root.name,
  rootPath: root.path,
  trackCount: node.trackCount,
  childFolderCount: node.childFolderCount,
  totalDuration: node.totalDuration,
  totalSizeBytes: node.totalSizeBytes,
  coverThumbs: node.coverThumbs,
});

const normalizeRemoteFolderPath = (value: string | null | undefined): string => {
  const trimmed = value?.trim().replace(/\\/gu, '/') ?? '';
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return `/${trimmed.replace(/^\/+/u, '').replace(/\/+$/u, '')}`;
};

const remoteRootPathForSource = (source: RemoteSource): string => {
  const rootPath = source.config.rootPath;
  return normalizeRemoteFolderPath(typeof rootPath === 'string' ? rootPath : '/');
};

const remoteTargetFromSource = (source: RemoteSource): RemoteFolderTarget => ({
  sourceId: source.id,
  sourceName: source.displayName,
  provider: source.provider,
  path: remoteRootPathForSource(source),
  name: source.displayName,
});

const remoteTargetFromItem = (source: RemoteSource, item: RemoteDirectoryItem): RemoteFolderTarget => ({
  sourceId: source.id,
  sourceName: source.displayName,
  provider: source.provider,
  path: normalizeRemoteFolderPath(item.path),
  name: item.name || item.path.split('/').filter(Boolean).at(-1) || source.displayName,
});

const remoteParentPath = (source: RemoteSource, path: string): string | null => {
  const rootPath = remoteRootPathForSource(source);
  const currentPath = normalizeRemoteFolderPath(path);
  if (currentPath === rootPath) {
    return null;
  }

  const parent = normalizeRemoteFolderPath(currentPath.slice(0, currentPath.lastIndexOf('/')) || '/');
  return parent === rootPath ? rootPath : parent;
};

const remoteItemName = (item: RemoteDirectoryItem): string =>
  item.name || item.path.split('/').filter(Boolean).at(-1) || item.path;

const remoteTitleForAudioItem = (item: RemoteDirectoryItem): string =>
  remoteItemName(item).replace(/\.[^.]+$/u, '').replace(/[_-]+/gu, ' ').trim() || remoteItemName(item);

const remoteAudioFormatFor = (item: RemoteDirectoryItem): string => {
  const match = remoteItemName(item).match(/\.([a-z0-9]+)$/iu);
  return match?.[1]?.toUpperCase() ?? (item.contentType?.split('/').at(-1)?.toUpperCase() || 'AUDIO');
};

const remoteCredentialHintFor = (source: RemoteSource): string | null => {
  if (source.provider !== 'baidu') {
    return null;
  }

  if (source.config.credentialMode === 'oauth-refresh') {
    return 'OAuth 自动续期';
  }

  if (source.config.credentialMode === 'access-token') {
    return 'Access Token';
  }

  return null;
};

const remoteTrackFromItem = (source: RemoteSource, item: RemoteDirectoryItem, indexedTrack?: RemoteTrackLookupItem): LibraryTrack => {
  if (indexedTrack) {
    return {
      id: indexedTrack.trackId,
      mediaType: 'remote',
      path: `remote://${source.id}${indexedTrack.remotePath}`,
      sourceId: source.id,
      sourceDisplayName: source.displayName,
      provider: source.provider,
      remotePath: indexedTrack.remotePath,
      stableKey: null,
      title: indexedTrack.title,
      artist: indexedTrack.artist,
      album: indexedTrack.album,
      albumArtist: indexedTrack.artist,
      trackNo: null,
      discNo: null,
      year: null,
      genre: null,
      duration: indexedTrack.duration ?? 0,
      codec: indexedTrack.codec,
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      coverId: null,
      coverThumb: indexedTrack.coverThumb,
      metadataStatus: indexedTrack.metadataStatus,
      embeddedMetadataStatus: 'pending',
      embeddedCoverStatus: indexedTrack.coverStatus === 'ok' ? 'present' : 'pending',
      fieldSources: {
        title: 'remote-index',
        artist: 'remote-index',
        album: 'remote-index',
      },
      unavailable: indexedTrack.availability === 'missing',
    };
  }

  return {
    id: `remote-browser:${source.id}:${item.path}`,
    mediaType: 'remote',
    isTemporary: true,
    path: `remote://${source.id}${item.path}`,
    sourceId: source.id,
    sourceDisplayName: source.displayName,
    provider: source.provider,
    remotePath: item.path,
    stableKey: `${source.id}:${item.path}:${item.etag ?? item.modifiedAt ?? item.sizeBytes ?? 'unknown'}`,
    title: remoteTitleForAudioItem(item),
    artist: 'Unknown Artist',
    album: source.displayName,
    albumArtist: 'Unknown Artist',
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: 0,
    codec: remoteAudioFormatFor(item).toLowerCase(),
    sampleRate: null,
    bitDepth: null,
    bitrate: null,
    coverId: null,
    coverThumb: null,
    metadataStatus: 'pending',
    embeddedMetadataStatus: 'pending',
    embeddedCoverStatus: 'pending',
    fieldSources: {
      title: 'remote-browser',
      artist: 'remote-browser',
      album: 'remote-source',
    },
  };
};

export const FoldersPage = (): JSX.Element => {
  const { t } = useI18n();
  const remoteApi = getRemoteSourcesBridge();
  const [mode, setMode] = useState<FolderMode>('local');
  const [overviews, setOverviews] = useState<LibraryFolderOverview[]>([]);
  const [childrenByParent, setChildrenByParent] = useState<Record<string, LibraryFolderNode[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingChildren, setLoadingChildren] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<FolderTarget | null>(null);
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('default');
  const localizedSortOptions = useMemo(
    () => sortOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
    [t],
  );
  const [recursive, setRecursive] = useState(true);
  const [folderPath, setFolderPath] = useState('');
  const [scanStatuses, setScanStatuses] = useState<ScanStatusByFolder>(getLibraryScanStatuses);
  const [isLoadingOverviews, setIsLoadingOverviews] = useState(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackMenu, setTrackMenu] = useState<TrackMenuState | null>(null);
  const [osuTimingTrack, setOsuTimingTrack] = useState<LibraryTrack | null>(null);
  const [editingTrack, setEditingTrack] = useState<LibraryTrack | null>(null);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagEditorError, setTagEditorError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [remoteSources, setRemoteSources] = useState<RemoteSource[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<RemoteFolderTarget | null>(null);
  const [remoteItems, setRemoteItems] = useState<RemoteDirectoryItem[]>([]);
  const [remoteIndexedTracks, setRemoteIndexedTracks] = useState<Record<string, RemoteTrackLookupItem>>({});
  const [isLoadingRemoteSources, setIsLoadingRemoteSources] = useState(false);
  const [isLoadingRemoteDirectory, setIsLoadingRemoteDirectory] = useState(false);
  const trackRequestIdRef = useRef(0);
  const bulkRequestIdRef = useRef(0);
  const refreshedTerminalScanIdsRef = useRef<Set<string>>(new Set());
  const tagEditorCloseTimerRef = useRef<number | null>(null);
  const { currentTrackId, playTrack, appendToQueue, appendTracksToQueue, playTrackNext, removeTrackFromQueue } = usePlaybackQueue();

  const selectedOverview = useMemo(
    () => (selected ? overviews.find((overview) => overview.id === selected.folderId) ?? null : null),
    [overviews, selected],
  );
  const selectedScan = selected ? scanStatuses[selected.folderId] ?? selectedOverview?.recentScan ?? null : null;
  const isSelectedScanning = selectedScan ? runningStatuses.has(selectedScan.status) : false;
  const selectedRemoteSource = useMemo(
    () => remoteSources.find((source) => source.id === selectedRemote?.sourceId) ?? null,
    [remoteSources, selectedRemote],
  );
  const remoteAudioItems = useMemo(() => remoteItems.filter((item) => item.audio), [remoteItems]);
  const remoteDirectoryItems = useMemo(() => remoteItems.filter((item) => item.kind === 'directory'), [remoteItems]);
  const remoteTracks = useMemo(() => {
    if (!selectedRemoteSource) {
      return [];
    }

    const normalizedSearch = search.toLocaleLowerCase();
    const nextTracks = remoteAudioItems
      .map((item) => remoteTrackFromItem(selectedRemoteSource, item, remoteIndexedTracks[item.path]))
      .filter((track) =>
        !normalizedSearch ||
        track.title.toLocaleLowerCase().includes(normalizedSearch) ||
        track.artist.toLocaleLowerCase().includes(normalizedSearch) ||
        track.album.toLocaleLowerCase().includes(normalizedSearch) ||
        track.path.toLocaleLowerCase().includes(normalizedSearch),
      );

    if (sort === 'artist') {
      return nextTracks.sort((left, right) => `${left.artist}\u0000${left.title}`.localeCompare(`${right.artist}\u0000${right.title}`));
    }
    if (sort === 'album') {
      return nextTracks.sort((left, right) => `${left.album}\u0000${left.trackNo ?? 0}\u0000${left.title}`.localeCompare(`${right.album}\u0000${right.trackNo ?? 0}\u0000${right.title}`));
    }
    if (sort === 'qualityDesc') {
      return nextTracks.sort((left, right) => (right.bitrate ?? 0) - (left.bitrate ?? 0));
    }
    if (sort === 'random') {
      return [...nextTracks].sort(() => Math.random() - 0.5);
    }

    return nextTracks.sort((left, right) => left.title.localeCompare(right.title));
  }, [remoteAudioItems, remoteIndexedTracks, search, selectedRemoteSource, sort]);
  const folderSource = useMemo(
    () =>
      selected
        ? {
            type: 'folder' as const,
            label: recursive ? t('folders.queueSource.recursive', { name: selected.name }) : selected.name,
            folderId: selected.folderId,
            path: selected.path,
            recursive,
          }
        : null,
    [recursive, selected, t],
  );
  const remoteSource = useMemo(
    () =>
      selectedRemote
        ? {
            type: 'manual' as const,
            label: `网盘：${selectedRemote.sourceName} / ${selectedRemote.path}`,
          }
        : null,
    [selectedRemote],
  );
  const activeTracks = mode === 'remote' ? remoteTracks : tracks;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 220);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => subscribeLibraryScanStatuses(setScanStatuses), []);

  const refreshOverviews = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library?.getFolderOverviews) {
      setOverviews([]);
      setSelected(null);
      setError(t('folders.error.desktopManage'));
      return;
    }

    setIsLoadingOverviews(true);
    setError(null);

    try {
      const nextOverviews = await library.getFolderOverviews();
      setOverviews(nextOverviews);
      setSelected((current) => {
        if (current && nextOverviews.some((overview) => overview.id === current.folderId)) {
          const root = nextOverviews.find((overview) => overview.id === current.folderId)!;
          return current.path === root.path ? overviewToTarget(root) : current;
        }

        return nextOverviews[0] ? overviewToTarget(nextOverviews[0]) : null;
      });
    } catch (refreshError) {
      setError(formatFolderError(refreshError, t));
    } finally {
      setIsLoadingOverviews(false);
    }
  }, []);

  useEffect(() => {
    void refreshOverviews();
  }, [refreshOverviews]);

  const loadRemoteSources = useCallback(async (): Promise<void> => {
    if (!remoteApi) {
      setRemoteSources([]);
      if (mode === 'remote') {
        setError('桌面桥接不可用。请在 ECHO Next 桌面端浏览网盘文件夹。');
      }
      return;
    }

    setIsLoadingRemoteSources(true);
    setError(null);

    try {
      const sources = await remoteApi.list();
      setRemoteSources(sources);
      setSelectedRemote((current) => {
        if (current && sources.some((source) => source.id === current.sourceId)) {
          return current;
        }
        return sources[0] ? remoteTargetFromSource(sources[0]) : null;
      });
    } catch (remoteError) {
      setError(remoteError instanceof Error ? remoteError.message : '读取网盘来源失败。');
    } finally {
      setIsLoadingRemoteSources(false);
    }
  }, [mode, remoteApi]);

  useEffect(() => {
    if (mode === 'remote') {
      void loadRemoteSources();
    }
  }, [loadRemoteSources, mode]);

  const loadRemoteDirectory = useCallback(
    async (target: RemoteFolderTarget | null): Promise<void> => {
      if (!target || !remoteApi) {
        setRemoteItems([]);
        setRemoteIndexedTracks({});
        return;
      }

      setIsLoadingRemoteDirectory(true);
      setError(null);

      try {
        const items = await remoteApi.browse(target.sourceId, target.path);
        const audioPaths = items.filter((item) => item.audio).map((item) => item.path);
        const indexed = audioPaths.length > 0 ? await remoteApi.lookupTracks(target.sourceId, audioPaths) : [];
        setRemoteItems(items);
        setRemoteIndexedTracks(Object.fromEntries(indexed.map((item) => [item.remotePath, item])));
      } catch (remoteError) {
        setRemoteItems([]);
        setRemoteIndexedTracks({});
        setError(remoteError instanceof Error ? remoteError.message : '读取网盘目录失败。');
      } finally {
        setIsLoadingRemoteDirectory(false);
      }
    },
    [remoteApi],
  );

  useEffect(() => {
    if (mode === 'remote') {
      void loadRemoteDirectory(selectedRemote);
    }
  }, [loadRemoteDirectory, mode, selectedRemote]);

  const loadChildren = useCallback(
    async (folderId: string, parentPath: string, force = false): Promise<void> => {
      const library = window.echo?.library;
      const key = targetKey(folderId, parentPath);

      if (!library?.getFolderChildren || (!force && childrenByParent[key])) {
        return;
      }

      setLoadingChildren((current) => ({ ...current, [key]: true }));
      setError(null);

      try {
        const children = await library.getFolderChildren({ folderId, parentPath });
        setChildrenByParent((current) => ({ ...current, [key]: children }));
      } catch (childrenError) {
        setError(formatFolderError(childrenError, t));
      } finally {
        setLoadingChildren((current) => ({ ...current, [key]: false }));
      }
    },
    [childrenByParent],
  );

  const toggleExpanded = useCallback(
    (folderId: string, path: string): void => {
      const key = targetKey(folderId, path);
      const willExpand = !expanded[key];
      setExpanded((current) => ({ ...current, [key]: willExpand }));

      if (willExpand) {
        void loadChildren(folderId, path);
      }
    },
    [expanded, loadChildren],
  );

  const loadTracks = useCallback(
    async (nextPage: number, loadMode: 'replace' | 'append'): Promise<void> => {
      const library = window.echo?.library;
      const target = selected;

      if (mode === 'remote') {
        setTracks([]);
        setPage(1);
        setHasMore(false);
        setIsLoadingTracks(false);
        return;
      }

      if (!target || !library?.getFolderTracks) {
        setTracks([]);
        setPage(1);
        setHasMore(false);
        return;
      }

      const requestId = trackRequestIdRef.current + 1;
      trackRequestIdRef.current = requestId;
      setIsLoadingTracks(true);
      setError(null);

      try {
        const result = await library.getFolderTracks({
          folderId: target.folderId,
          path: target.path,
          recursive,
          page: nextPage,
          pageSize,
          search,
          sort,
        });

        if (trackRequestIdRef.current !== requestId) {
          return;
        }

        setTracks((current) => (loadMode === 'append' ? [...current, ...result.items] : result.items));
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (tracksError) {
        if (trackRequestIdRef.current === requestId) {
          setError(formatFolderError(tracksError, t));
        }
      } finally {
        if (trackRequestIdRef.current === requestId) {
          setIsLoadingTracks(false);
        }
      }
    },
    [mode, recursive, search, selected, sort],
  );

  useEffect(() => {
    bulkRequestIdRef.current += 1;
    void loadTracks(1, 'replace');
  }, [loadTracks]);

  useEffect(() => {
    const activeJobIds = Object.values(scanStatuses)
      .filter((status) => runningStatuses.has(status.status))
      .map((status) => status.id)
      .sort();

    if (activeJobIds.length === 0) {
      return undefined;
    }

    const pollActiveJobs = (): void => {
      const library = window.echo?.library;
      if (!library?.getScanStatus) {
        return;
      }

      for (const jobId of activeJobIds) {
        void library.getScanStatus(jobId).then((status) => rememberLibraryScanStatus(status));
      }
    };

    pollActiveJobs();
    const timer = window.setInterval(pollActiveJobs, 1000);
    return () => window.clearInterval(timer);
  }, [scanStatuses]);

  useEffect(() => {
    const terminalStatus = Object.values(scanStatuses).find(
      (status) => terminalStatuses.has(status.status) && !refreshedTerminalScanIdsRef.current.has(status.id),
    );

    if (terminalStatus) {
      refreshedTerminalScanIdsRef.current.add(terminalStatus.id);
      void refreshOverviews();
    }
  }, [refreshOverviews, scanStatuses]);

  const fetchBulkTracks = useCallback(
    async (sortMode: LibrarySort): Promise<{ items: LibraryTrack[]; total: number }> => {
      const library = window.echo?.library;
      const target = selected;

      if (mode === 'remote') {
        const items = sortMode === 'random' ? [...remoteTracks].sort(() => Math.random() - 0.5) : remoteTracks;
        return { items: items.slice(0, maxBulkTracks), total: items.length };
      }

      if (!target || !library?.getFolderTracks) {
        return { items: [], total: 0 };
      }

      const requestId = bulkRequestIdRef.current + 1;
      bulkRequestIdRef.current = requestId;
      const items: LibraryTrack[] = [];
      let nextPage = 1;
      let totalTracks = 0;
      let result: LibraryPage<LibraryTrack> | null = null;

      do {
        result = await library.getFolderTracks({
          folderId: target.folderId,
          path: target.path,
          recursive,
          page: nextPage,
          pageSize: bulkPageSize,
          search,
          sort: sortMode,
        });

        if (bulkRequestIdRef.current !== requestId) {
          return { items: [], total: 0 };
        }

        totalTracks = result.total;
        items.push(...result.items);
        nextPage += 1;
      } while (result.hasMore && items.length < maxBulkTracks);

      return { items: items.slice(0, maxBulkTracks), total: totalTracks };
    },
    [mode, recursive, remoteTracks, search, selected],
  );

  const runBulkAction = useCallback(
    async (action: 'play' | 'shuffle' | 'append'): Promise<void> => {
      const queueSource = mode === 'remote' ? remoteSource : folderSource;
      if (!queueSource || (mode === 'local' && !selected) || (mode === 'remote' && !selectedRemote)) {
        return;
      }

      setIsBulkLoading(true);
      setError(null);
      setMessage(null);

      try {
        const result = await fetchBulkTracks(action === 'shuffle' ? 'random' : sort);
        if (result.items.length === 0) {
          setMessage(t('folders.message.noPlayableTracks'));
          return;
        }

        if (action === 'append') {
          appendTracksToQueue(result.items, queueSource);
        } else {
          await playTrack(result.items[0], {
            replaceQueueWith: result.items,
            source: queueSource,
          });
        }

        setMessage(
          result.total > result.items.length
            ? t('folders.message.loadedPartial', { loaded: result.items.length, total: result.total })
            : t(action === 'append' ? 'folders.message.queuedTracks' : 'folders.message.loadedTracks', { count: result.items.length }),
        );
      } catch (bulkError) {
        setError(formatFolderError(bulkError, t));
      } finally {
        setIsBulkLoading(false);
      }
    },
    [appendTracksToQueue, fetchBulkTracks, folderSource, mode, playTrack, remoteSource, selected, selectedRemote, sort, t],
  );

  const handleChooseFolder = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;

    if (!library) {
      setError(t('folders.error.desktopImport'));
      return;
    }

    try {
      const chosenPath = await library.chooseFolder();
      if (!chosenPath) {
        return;
      }

      setFolderPath(chosenPath);
      const folder = await library.addFolder(chosenPath);
      rememberLibraryScanStatus(await library.scanFolder(folder.id));
      setMessage(t('folders.message.folderAddedScanStarted'));
      await refreshOverviews();
    } catch (chooseError) {
      setError(formatFolderError(chooseError, t));
    }
  }, [refreshOverviews, t]);

  const handleAddPath = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    const normalizedPath = folderPath.trim();

    if (!normalizedPath || !library) {
      return;
    }

    try {
      const folder = await library.addFolder(normalizedPath);
      rememberLibraryScanStatus(await library.scanFolder(folder.id));
      setMessage(t('folders.message.folderAddedScanStarted'));
      await refreshOverviews();
    } catch (addError) {
      setError(formatFolderError(addError, t));
    }
  }, [folderPath, refreshOverviews, t]);

  const handleScanSelected = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selected || !library?.scanFolder) {
      return;
    }

    const current = getLibraryScanStatuses()[selected.folderId];
    if (current && runningStatuses.has(current.status)) {
      setMessage(t('folders.message.alreadyScanning'));
      return;
    }

    try {
      rememberLibraryScanStatus(await library.scanFolder(selected.folderId));
      setMessage(t('folders.message.scanStarted'));
    } catch (scanError) {
      setError(formatFolderError(scanError, t));
    }
  }, [selected, t]);

  const handleCancelScan = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selectedScan || !library?.cancelScan || !runningStatuses.has(selectedScan.status)) {
      return;
    }

    try {
      rememberLibraryScanStatus(await library.cancelScan(selectedScan.id));
      setMessage(t('folders.message.scanCancelled'));
    } catch (cancelError) {
      setError(formatFolderError(cancelError, t));
    }
  }, [selectedScan, t]);

  const handleRemoveRoot = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selected || !selectedOverview || !library?.removeFolder) {
      return;
    }

    if (!window.confirm(t('folders.confirm.removeRoot', { name: selectedOverview.name }))) {
      return;
    }

    try {
      await library.removeFolder(selectedOverview.id);
      forgetLibraryScanStatus(selectedOverview.id);
      setChildrenByParent({});
      setExpanded({});
      setSelected(null);
      setMessage(t('folders.message.folderRemoved'));
      await refreshOverviews();
      window.dispatchEvent(new Event('library:changed'));
    } catch (removeError) {
      setError(formatFolderError(removeError, t));
    }
  }, [refreshOverviews, selected, selectedOverview, t]);

  const handleOpenSelectedPath = useCallback(async (): Promise<void> => {
    const library = window.echo?.library;
    if (!selected || !library?.openLibraryFolderPath) {
      return;
    }

    try {
      await library.openLibraryFolderPath({ folderId: selected.folderId, path: selected.path });
    } catch (openError) {
      setError(formatFolderError(openError, t));
    }
  }, [selected, t]);

  const handleRemoteNavigate = useCallback((target: RemoteFolderTarget): void => {
    setSelectedRemote(target);
    setMessage(null);
    setError(null);
  }, []);

  const handleOpenRemoteSourceSettings = useCallback((): void => {
    window.dispatchEvent(new Event('app:navigate:settings'));
  }, []);

  const handleRemoteUp = useCallback((): void => {
    if (!selectedRemote || !selectedRemoteSource) {
      return;
    }

    const parent = remoteParentPath(selectedRemoteSource, selectedRemote.path);
    if (!parent) {
      return;
    }

    setSelectedRemote({
      ...selectedRemote,
      path: parent,
      name: parent === remoteRootPathForSource(selectedRemoteSource) ? selectedRemoteSource.displayName : parent.split('/').filter(Boolean).at(-1) ?? parent,
    });
  }, [selectedRemote, selectedRemoteSource]);

  const handleRemoteSync = useCallback(async (): Promise<void> => {
    if (!remoteApi || !selectedRemoteSource) {
      return;
    }

    try {
      await remoteApi.sync(selectedRemoteSource.id);
      setMessage('网盘同步索引已开始；后台会按现有低负载策略执行。');
      void loadRemoteSources();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '启动网盘同步失败。');
    }
  }, [loadRemoteSources, remoteApi, selectedRemoteSource]);

  const handleLoadMore = useCallback((): void => {
    if (!isLoadingTracks && hasMore) {
      void loadTracks(page + 1, 'append');
    }
  }, [hasMore, isLoadingTracks, loadTracks, page]);

  const handlePlayTrack = useCallback(
    async (track: LibraryTrack): Promise<void> => {
      const queueSource = mode === 'remote' ? remoteSource : folderSource;
      if (!queueSource) {
        return;
      }

      try {
        await playTrack(track, {
          replaceQueueWith: activeTracks,
          source: queueSource,
        });
      } catch (playError) {
        setError(formatFolderError(playError, t));
      }
    },
    [activeTracks, folderSource, mode, playTrack, remoteSource, t],
  );

  const handleOpenTrackMenu = useCallback((track: LibraryTrack, position: { x: number; y: number }): void => {
    setTrackMenu({ track, position });
  }, []);

  const handleTrackMenuAction = useCallback(
    async (action: TrackMenuAction, track: LibraryTrack, playlistTarget?: LibraryPlaylist): Promise<void> => {
      const library = window.echo?.library;
      setTrackMenu(null);

      if (action === 'clear-lyrics-cache') {
        const lyricsApi = window.echo?.lyrics;
        if (!lyricsApi?.clearCache) {
          setError('Desktop bridge unavailable. Open ECHO Next in Electron to clear lyrics cache.');
          return;
        }

        try {
          setError(null);
          setMessage(null);
          await lyricsApi.clearCache(track.id);
          window.dispatchEvent(new CustomEvent('lyrics:rematch-requested', { detail: { trackId: track.id } }));
          setMessage(`已清理歌词缓存：${track.title}`);
        } catch (actionError) {
          setError(formatFolderError(actionError, t));
        }
        return;
      }

      if (!library && action !== 'play-next' && action !== 'add-to-queue' && action !== 'remove-from-queue' && action !== 'edit-tags' && action !== 'reload-embedded-tags' && action !== 'open-osu-timing') {
        setError(t('folders.error.desktopFileActions'));
        return;
      }

      try {
        setError(null);
        setMessage(null);

        if (
          track.mediaType === 'remote' &&
          (action === 'edit-tags' ||
            action === 'reload-embedded-tags' ||
            action === 'open-osu-timing' ||
            action === 'show-in-folder' ||
            action === 'copy-path' ||
            action === 'open-system' ||
            action === 'delete-song')
        ) {
          setError('远程歌曲暂不支持本地文件操作。');
          return;
        }

        switch (action) {
          case 'play-next':
            {
              const queueSource = mode === 'remote' ? remoteSource : folderSource;
              if (queueSource) {
                playTrackNext(track, queueSource);
              }
            }
            return;
          case 'add-to-queue':
            {
              const queueSource = mode === 'remote' ? remoteSource : folderSource;
              if (queueSource) {
                appendToQueue(track, queueSource);
              }
            }
            return;
          case 'toggle-liked':
            await library?.toggleTrackLiked(track.id);
            window.dispatchEvent(new Event('liked:tracks-changed'));
            window.dispatchEvent(new Event('liked:changed'));
            return;
          case 'remove-from-queue':
            {
              const removedCount = removeTrackFromQueue(track.id);
              setMessage(
                removedCount > 0
                  ? `已从播放队列移除：${track.title}`
                  : `播放队列里没有这首歌：${track.title}`,
              );
            }
            return;
          case 'open-osu-timing':
            setOsuTimingTrack(track);
            return;
          case 'edit-tags':
            setTagEditorError(null);
            if (tagEditorCloseTimerRef.current !== null) {
              window.clearTimeout(tagEditorCloseTimerRef.current);
              tagEditorCloseTimerRef.current = null;
            }
            setIsTagEditorOpen(false);
            setEditingTrack(track);
            window.requestAnimationFrame(() => setIsTagEditorOpen(true));
            return;
          case 'reload-embedded-tags':
            {
              const result = await library!.loadEmbeddedTrackTags(track.id);
              setTracks((current) => current.map((item) => (item.id === result.track.id ? result.track : item)));
              if (editingTrack?.id === result.track.id) {
                setEditingTrack(result.track);
              }
              setMessage(`已从内嵌标签重新加载：${result.track.title}`);
              void refreshOverviews();
              window.dispatchEvent(new Event('library:changed'));
            }
            return;
          case 'go-to-album':
            if (!(await openAlbumDetailForTrack(track))) {
              setError(`Album not found: ${track.album || 'Unknown Album'}`);
            }
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
              setError(t('folders.error.noCoverToCopy'));
            }
            return;
          case 'save-cover':
            if (!(await library?.saveTrackCover(track.id))) {
              setError(t('folders.error.noCoverSaved'));
            }
            return;
          case 'delete-song':
            if (!window.confirm(t('folders.confirm.deleteTrack', { title: track.title }))) {
              return;
            }
            await library?.deleteTrackFile(track.id);
            setTracks((current) => current.filter((item) => item.id !== track.id));
            void refreshOverviews();
            window.dispatchEvent(new Event('library:changed'));
            return;
          case 'add-to-playlist':
            {
              const playlist = playlistTarget ?? (await resolvePlaylistForTrackAdd(library!));
              if (!playlist) {
                return;
              }

              await library!.addTrackToPlaylist(playlist.id, track.id);
              window.dispatchEvent(new Event('library:playlists-changed'));
              setMessage(t('folders.message.addedToPlaylist', { name: playlist.name }));
            }
            return;
          default:
            setError(t('folders.error.trackActionUnavailable'));
        }
      } catch (actionError) {
        setError(formatFolderError(actionError, t));
      }
    },
    [appendToQueue, editingTrack, folderSource, mode, playTrackNext, refreshOverviews, remoteSource, removeTrackFromQueue, t],
  );

  const closeTagEditor = useCallback((): void => {
    setIsTagEditorOpen(false);
    if (tagEditorCloseTimerRef.current !== null) {
      window.clearTimeout(tagEditorCloseTimerRef.current);
    }
    tagEditorCloseTimerRef.current = window.setTimeout(() => {
      setEditingTrack(null);
      tagEditorCloseTimerRef.current = null;
    }, 280);
  }, []);

  const handleSaveTags = useCallback(
    async (
      track: LibraryTrack,
      tags: EditableTrackTags,
      coverPath: string | null,
      coverUrl: string | null,
      coverMimeType: string | null,
    ): Promise<void> => {
      const library = window.echo?.library;

      if (!library?.updateTrackTags) {
        setTagEditorError(t('folders.error.desktopEditTags'));
        return;
      }

      setIsSavingTags(true);
      setTagEditorError(null);

      try {
        const updatedTrack = await library.updateTrackTags({ trackId: track.id, tags, coverPath, coverUrl, coverMimeType });
        setTracks((current) => current.map((item) => (item.id === updatedTrack.id ? updatedTrack : item)));
        window.dispatchEvent(new Event('library:changed'));
        closeTagEditor();
      } catch (saveError) {
        setTagEditorError(formatFolderError(saveError, t));
      } finally {
        setIsSavingTags(false);
      }
    },
    [closeTagEditor, t],
  );

  const renderChildNodes = (folderId: string, parentPath: string): JSX.Element | null => {
    const key = targetKey(folderId, parentPath);
    const children = childrenByParent[key] ?? [];
    const root = overviews.find((overview) => overview.id === folderId);

    if (!expanded[key]) {
      return null;
    }

    if (loadingChildren[key]) {
      return <div className="folder-tree-loading">{t('common.loading')}</div>;
    }

    if (!root || children.length === 0) {
      return null;
    }

    return (
      <div className="folder-tree-children">
        {children.map((node) => {
          const nodeKey = targetKey(node.folderId, node.path);
          const isSelected = selected?.folderId === node.folderId && selected.path === node.path;
          return (
            <div className="folder-tree-node-group" key={nodeKey}>
              <button
                className="folder-tree-node"
                data-active={isSelected}
                style={{ paddingLeft: 10 + node.depth * 14 }}
                type="button"
                onClick={() => setSelected(nodeToTarget(node, root))}
              >
                <span
                  className="folder-expand-hit"
                  data-hidden={node.childFolderCount === 0}
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpanded(node.folderId, node.path);
                  }}
                >
                  <ChevronRight size={14} data-open={expanded[nodeKey]} />
                </span>
                {expanded[nodeKey] ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{node.name}</span>
                <em>{node.trackCount}</em>
              </button>
              {renderChildNodes(node.folderId, node.path)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="folders-workbench">
      <aside className="folders-sidebar">
        <div className="folders-pane-header">
          <div>
            <span className="panel-kicker">{mode === 'remote' ? '网盘' : t('folders.sidebar.kicker')}</span>
            <h1>{t('folders.sidebar.title')}</h1>
          </div>
          <div className="folders-header-tools">
            <div className="folder-source-switch" role="tablist" aria-label="文件夹来源">
              <button type="button" className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}>本地</button>
              <button type="button" className={mode === 'remote' ? 'active' : ''} onClick={() => setMode('remote')}>网盘</button>
            </div>
            <button
              className="tool-button"
              type="button"
              aria-label={t('folders.action.refresh')}
              title={t('folders.action.refresh')}
              onClick={() => mode === 'remote' ? void loadRemoteSources() : void refreshOverviews()}
            >
              <RefreshCw className={isLoadingOverviews || isLoadingRemoteSources ? 'spinning-icon' : undefined} size={17} />
            </button>
          </div>
        </div>

        <div className="folders-root-list">
          {mode === 'remote' ? (
            remoteSources.length === 0 ? (
              <div className="folders-empty-state">
                <p className="folders-empty">{isLoadingRemoteSources ? t('common.loading') : '还没有网盘来源。请先在设置里添加 WebDAV / 百度网盘等来源。'}</p>
                {!isLoadingRemoteSources ? (
                  <button className="folders-empty-action" type="button" onClick={handleOpenRemoteSourceSettings}>
                    <FolderPlus size={14} />
                    添加网盘来源
                  </button>
                ) : null}
              </div>
            ) : (
              remoteSources.map((source) => {
                const isSourceSelected = selectedRemote?.sourceId === source.id;
                const currentPath = isSourceSelected ? selectedRemote?.path ?? remoteRootPathForSource(source) : remoteRootPathForSource(source);
                const credentialHint = remoteCredentialHintFor(source);
                return (
                  <div className="folder-root-group" key={source.id}>
                    <button className="folder-root-button" data-active={isSourceSelected && currentPath === remoteRootPathForSource(source)} type="button" onClick={() => handleRemoteNavigate(remoteTargetFromSource(source))}>
                      <span className="folder-expand-hit" data-hidden="true" />
                      <FolderOpen size={17} />
                      <span>
                        <strong>{source.displayName}</strong>
                        <small>{remoteProviderLabels[source.provider]} · {remoteStatusLabels[source.status]}{credentialHint ? ` · ${credentialHint}` : ''}</small>
                      </span>
                      <em>{source.indexedTrackCount}</em>
                    </button>
                    {isSourceSelected ? (
                      <div className="folder-tree-children">
                        {currentPath !== remoteRootPathForSource(source) ? (
                          <button className="folder-tree-node" type="button" onClick={handleRemoteUp}>
                            <span className="folder-expand-hit" data-hidden="true" />
                            <Folder size={15} />
                            <span>..</span>
                            <em />
                          </button>
                        ) : null}
                        {remoteDirectoryItems.map((item) => {
                          const target = remoteTargetFromItem(source, item);
                          return (
                            <button
                              className="folder-tree-node"
                              data-active={selectedRemote?.sourceId === source.id && selectedRemote.path === target.path}
                              key={item.path}
                              type="button"
                              onClick={() => handleRemoteNavigate(target)}
                            >
                              <span className="folder-expand-hit" data-hidden="true" />
                              <Folder size={15} />
                              <span>{target.name}</span>
                              <em>{item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString() : ''}</em>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )
          ) : overviews.length === 0 ? (
            <p className="folders-empty">{t('folders.empty.roots')}</p>
          ) : (
            overviews.map((overview) => {
              const rootKey = targetKey(overview.id, overview.path);
              const isSelected = selected?.folderId === overview.id && selected.path === overview.path;
              const scan = scanStatuses[overview.id] ?? overview.recentScan;
              return (
                <div className="folder-root-group" key={overview.id}>
                  <button className="folder-root-button" data-active={isSelected} type="button" onClick={() => setSelected(overviewToTarget(overview))}>
                    <span
                      className="folder-expand-hit"
                      data-hidden={overview.childFolderCount === 0}
                      role="button"
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleExpanded(overview.id, overview.path);
                      }}
                    >
                      <ChevronRight size={15} data-open={expanded[rootKey]} />
                    </span>
                    <FolderOpen size={17} />
                    <span>
                      <strong>{overview.name}</strong>
                      <small>{scan ? statusLabel(scan.status, t) : t('folders.count.tracks', { count: overview.trackCount })}</small>
                    </span>
                    <em>{overview.childFolderCount}</em>
                  </button>
                  {renderChildNodes(overview.id, overview.path)}
                </div>
              );
            })
          )}
        </div>
      </aside>

      <main className="folders-main">
        <header className="folder-detail-header">
          <div className="folder-cover-stack" data-cover-count={mode === 'remote' ? 0 : Math.min(selected?.coverThumbs.length ?? 0, 4)} aria-hidden="true">
            {mode === 'local' ? (selected?.coverThumbs ?? []).slice(0, 4).map((cover, index) => (
              <img alt="" key={cover} src={cover} style={{ '--cover-index': index } as CSSProperties} />
            )) : null}
            {mode === 'local' && selected?.coverThumbs.length ? null : <FolderOpen size={34} />}
          </div>
          <div className="folder-detail-title">
            <span>
              {mode === 'remote'
                ? selectedRemote
                  ? `${selectedRemote.sourceName} / ${selectedRemoteSource && selectedRemote.path === remoteRootPathForSource(selectedRemoteSource) ? '根目录' : '网盘文件夹'}`
                  : '网盘文件夹'
                : selected
                  ? `${selected.rootName} / ${selected.path === selected.rootPath ? t('folders.detail.root') : t('folders.detail.subfolder')}`
                  : t('folders.detail.libraryFolders')}
            </span>
            <h2>{mode === 'remote' ? selectedRemote?.name ?? '选择网盘来源' : selected?.name ?? t('folders.detail.selectFolder')}</h2>
            <p>{mode === 'remote' ? selectedRemote?.path ?? '添加网盘来源后，可以按目录浏览和播放。' : selected?.path ?? t('folders.detail.importHint')}</p>
          </div>
          <div className="folder-detail-actions">
            <button className="primary-action" type="button" disabled={(mode === 'local' ? !selected : !selectedRemote || remoteTracks.length === 0) || isBulkLoading} onClick={() => void runBulkAction('play')}>
              <Play size={16} fill="currentColor" />
              {t('folders.action.play')}
            </button>
            <button className="secondary-action" type="button" disabled={(mode === 'local' ? !selected : !selectedRemote || remoteTracks.length === 0) || isBulkLoading} onClick={() => void runBulkAction('shuffle')}>
              <Shuffle size={16} />
              {t('folders.action.random')}
            </button>
            <button className="secondary-action" type="button" disabled={(mode === 'local' ? !selected : !selectedRemote || remoteTracks.length === 0) || isBulkLoading} onClick={() => void runBulkAction('append')}>
              <ListPlus size={16} />
              {t('folders.action.queue')}
            </button>
          </div>
        </header>

        <section className="folder-metrics" aria-label={t('folders.metrics.label')}>
          <span>
            <strong>{mode === 'remote' ? remoteTracks.length : selected?.trackCount ?? 0}</strong>
            {mode === 'remote' ? '可播放' : t('folders.metrics.tracks')}
          </span>
          <span>
            <strong>{mode === 'remote' ? remoteAudioItems.length : formatDuration(selected?.totalDuration ?? 0, t)}</strong>
            {mode === 'remote' ? '音频文件' : t('folders.metrics.duration')}
          </span>
          <span>
            <strong>{mode === 'remote' ? formatBytes(remoteItems.reduce((total, item) => total + (item.sizeBytes ?? 0), 0)) : formatBytes(selected?.totalSizeBytes ?? 0)}</strong>
            {t('folders.metrics.size')}
          </span>
          <span>
            <strong>{mode === 'remote' ? remoteDirectoryItems.length : selected?.childFolderCount ?? 0}</strong>
            {t('folders.metrics.subfolders')}
          </span>
        </section>

        <section className="folder-track-toolbar" aria-label={t('folders.filters.label')}>
          <label className="search-box">
            <Search size={18} aria-hidden="true" />
            <input type="search" placeholder={t('folders.filters.searchPlaceholder')} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          </label>
          {mode === 'remote' ? (
            <button className="folder-toggle" type="button" disabled={!selectedRemoteSource || isLoadingRemoteDirectory} onClick={() => void loadRemoteDirectory(selectedRemote)}>
              <RefreshCw size={14} className={isLoadingRemoteDirectory ? 'spinning-icon' : undefined} />
              <span>刷新目录</span>
            </button>
          ) : (
            <label className="folder-toggle">
              <input type="checkbox" checked={recursive} onChange={(event) => setRecursive(event.target.checked)} />
              <span>{t('folders.filters.includeSubfolders')}</span>
            </label>
          )}
          <StyledSelect
            className="folder-sort-control"
            value={sort}
            options={localizedSortOptions}
            onChange={setSort}
            ariaLabel={t('folders.filters.label')}
          />
        </section>

        <TrackList
          tracks={activeTracks}
          currentTrackId={currentTrackId}
          canLoadMore={mode === 'local' && hasMore && !isLoadingTracks}
          onAddToQueue={(track) => {
            const queueSource = mode === 'remote' ? remoteSource : folderSource;
            if (queueSource) {
              appendToQueue(track, queueSource);
            }
          }}
          onEndReached={handleLoadMore}
          onOpenTrackMenu={handleOpenTrackMenu}
          onPlay={(track) => void handlePlayTrack(track)}
        />

        {error || message || isLoadingTracks || isBulkLoading || isLoadingRemoteDirectory ? (
          <div className="folders-status-line">
            <span>{error ?? message ?? (isBulkLoading ? t('folders.statusLine.preparingQueue') : mode === 'remote' ? '正在读取网盘目录...' : t('folders.statusLine.loadingTracks'))}</span>
          </div>
        ) : null}
      </main>

      <aside className="folders-actions-panel">
        {mode === 'local' ? (
          <section>
            <div className="folders-panel-heading">
              <span className="panel-kicker">{t('folders.panel.import')}</span>
              <h2>{t('folders.panel.addFolder')}</h2>
            </div>
            <div className="folder-import-box">
              <input type="text" placeholder="D:\\Music" value={folderPath} onChange={(event) => setFolderPath(event.target.value)} />
              <button type="button" onClick={() => void handleChooseFolder()}>
                <FolderPlus size={16} />
                {t('folders.action.browse')}
              </button>
              <button type="button" disabled={!folderPath.trim()} onClick={() => void handleAddPath()}>
                <RotateCw size={16} />
                {t('folders.action.addScan')}
              </button>
            </div>
          </section>
        ) : (
          <section>
            <div className="folders-panel-heading">
              <span className="panel-kicker">来源</span>
              <h2>网盘文件夹</h2>
            </div>
            <div className="folder-scan-card" data-running={isLoadingRemoteDirectory}>
              <strong>{selectedRemoteSource?.displayName ?? '未选择网盘来源'}</strong>
              <span>{selectedRemote?.path ?? '添加来源后可浏览目录'}</span>
              <em>{remoteDirectoryItems.length} 个文件夹，{remoteAudioItems.length} 个音频</em>
            </div>
          </section>
        )}

        <section>
          <div className="folders-panel-heading">
            <span className="panel-kicker">{mode === 'remote' ? '网盘' : t('folders.panel.manage')}</span>
            <h2>{mode === 'remote' ? '当前目录' : t('folders.panel.selectedRoot')}</h2>
          </div>
          <div className="folder-action-grid">
            {mode === 'remote' ? (
              <>
                <button type="button" disabled={!selectedRemoteSource || !remoteParentPath(selectedRemoteSource, selectedRemote?.path ?? '/')} onClick={handleRemoteUp}>
                  <FolderOpen size={16} />
                  上级
                </button>
                <button type="button" disabled={!selectedRemote || isLoadingRemoteDirectory} onClick={() => void loadRemoteDirectory(selectedRemote)}>
                  <RefreshCw size={16} />
                  刷新
                </button>
                <button type="button" disabled={!selectedRemoteSource} onClick={() => void handleRemoteSync()}>
                  <RotateCw size={16} />
                  同步索引
                </button>
                <button type="button" onClick={handleOpenRemoteSourceSettings}>
                  <FolderPlus size={16} />
                  添加来源
                </button>
              </>
            ) : (
              <>
            <button type="button" disabled={!selected} onClick={() => void handleOpenSelectedPath()}>
              <FolderOpen size={16} />
              {t('folders.action.open')}
            </button>
            <button type="button" disabled={!selected || isSelectedScanning} onClick={() => void handleScanSelected()}>
              <RotateCw size={16} />
              {t('folders.action.scan')}
            </button>
            <button type="button" disabled={!isSelectedScanning} onClick={() => void handleCancelScan()}>
              <XCircle size={16} />
              {t('folders.action.cancel')}
            </button>
            <button className="danger" type="button" disabled={!selectedOverview} onClick={() => void handleRemoveRoot()}>
              <Trash2 size={16} />
              {t('folders.action.remove')}
            </button>
              </>
            )}
          </div>
        </section>

        {mode === 'local' ? (
          <section>
          <div className="folders-panel-heading">
            <span className="panel-kicker">{t('folders.panel.scan')}</span>
            <h2>{t('folders.panel.status')}</h2>
          </div>
          {selectedScan ? (
            <div className="folder-scan-card" data-running={runningStatuses.has(selectedScan.status)}>
              <strong>{statusLabel(selectedScan.status, t)}</strong>
              <span>{phaseLabel(selectedScan.phase, t)}</span>
              <em>
                {t('folders.scan.progress', {
                  processed: selectedScan.processedFiles,
                  total: selectedScan.totalFiles,
                  errors: selectedScan.errorCount,
                })}
              </em>
              {selectedScan.errors.length > 0 ? <p>{selectedScan.errors[0]}</p> : null}
            </div>
          ) : (
            <p className="folders-empty">{t('folders.empty.noScan')}</p>
          )}
          </section>
        ) : (
          <section>
            <div className="folders-panel-heading">
              <span className="panel-kicker">说明</span>
              <h2>低负载浏览</h2>
            </div>
            <p className="folders-empty">网盘模式只读取当前目录；播放时按需取流，同步索引才会启动后台扫描。</p>
          </section>
        )}
      </aside>

      {trackMenu ? (
        <TrackContextMenu
          track={trackMenu.track}
          position={trackMenu.position}
          onAction={(action, track, playlist) => void handleTrackMenuAction(action, track, playlist)}
          onClose={() => setTrackMenu(null)}
        />
      ) : null}

      <TrackTagEditorDrawer
        track={editingTrack}
        isOpen={isTagEditorOpen}
        isSaving={isSavingTags}
        error={tagEditorError}
        onClose={closeTagEditor}
        onSave={(track, tags, coverPath, coverUrl, coverMimeType) => void handleSaveTags(track, tags, coverPath, coverUrl, coverMimeType)}
        onTrackUpdated={(updatedTrack) => {
          setEditingTrack(updatedTrack);
          setTracks((current) => current.map((item) => (item.id === updatedTrack.id ? updatedTrack : item)));
          window.dispatchEvent(new Event('library:changed'));
        }}
      />

      <OsuTimingPanel
        track={osuTimingTrack}
        isOpen={Boolean(osuTimingTrack)}
        onClose={() => setOsuTimingTrack(null)}
        onTrackUpdated={(updatedTrack) => {
          setOsuTimingTrack(updatedTrack);
          setTracks((current) => current.map((item) => (item.id === updatedTrack.id ? updatedTrack : item)));
        }}
      />
    </div>
  );
};
