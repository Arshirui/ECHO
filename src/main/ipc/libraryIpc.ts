import { existsSync, writeFileSync } from 'node:fs';
import { clipboard, dialog, ipcMain, nativeImage, shell } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { EditableTrackTags, LibraryPageQuery, LibrarySort, LibraryTrackTagUpdateRequest } from '../../shared/types/library';
import { getLibraryService } from '../library/LibraryService';
import { SongCardRenderer } from '../library/SongCardRenderer';

const sortValues = new Set<LibrarySort>(['title', 'artist', 'album', 'recent']);
const songCardRenderer = new SongCardRenderer();

const requireText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
};

const normalizeQuery = (value: unknown): LibraryPageQuery => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const query: LibraryPageQuery = {};

  if (typeof input.page === 'number') {
    query.page = input.page;
  }

  if (typeof input.pageSize === 'number') {
    query.pageSize = input.pageSize;
  }

  if (typeof input.search === 'string') {
    query.search = input.search;
  }

  if (typeof input.sort === 'string' && sortValues.has(input.sort as LibrarySort)) {
    query.sort = input.sort as LibrarySort;
  }

  return query;
};

const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeTagUpdateRequest = (value: unknown): LibraryTrackTagUpdateRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('tag update request must be an object');
  }

  const input = value as Record<string, unknown>;
  const tagsInput = input.tags;

  if (!tagsInput || typeof tagsInput !== 'object' || Array.isArray(tagsInput)) {
    throw new Error('tags must be an object');
  }

  const tagsRecord = tagsInput as Record<string, unknown>;
  const readText = (key: keyof EditableTrackTags): string => {
    const fieldValue = tagsRecord[key];
    return typeof fieldValue === 'string' ? fieldValue : '';
  };

  return {
    trackId: requireText(input.trackId, 'trackId'),
    tags: {
      title: readText('title'),
      artist: readText('artist'),
      album: readText('album'),
      albumArtist: readText('albumArtist'),
      trackNo: optionalNumber(tagsRecord.trackNo),
      discNo: optionalNumber(tagsRecord.discNo),
      year: optionalNumber(tagsRecord.year),
      genre: typeof tagsRecord.genre === 'string' && tagsRecord.genre.trim().length > 0 ? tagsRecord.genre : null,
    },
  };
};

const getExistingTrack = (trackId: unknown) => {
  const id = requireText(trackId, 'trackId');
  const track = getLibraryService().getTrack(id);

  if (!track) {
    throw new Error(`Unknown track ${id}`);
  }

  return track;
};

const renderTrackCard = async (trackId: unknown) => {
  const track = getExistingTrack(trackId);
  const asset = track.coverId ? getLibraryService().resolveCoverAsset(track.coverId, 'large') : null;

  return songCardRenderer.render({
    track,
    coverPath: asset?.filePath && existsSync(asset.filePath) ? asset.filePath : null,
    coverMimeType: asset?.mimeType ?? null,
  });
};

export const registerLibraryIpc = (): void => {
  ipcMain.handle(IpcChannels.LibraryChooseFolder, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择音乐文件夹',
      properties: ['openDirectory'],
    });

    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(IpcChannels.LibraryAddFolder, (_event, folderPath: unknown) =>
    getLibraryService().addFolder(requireText(folderPath, 'folderPath')),
  );
  ipcMain.handle(IpcChannels.LibraryGetFolders, () => getLibraryService().getFolders());
  ipcMain.handle(IpcChannels.LibraryRemoveFolder, (_event, folderId: unknown) =>
    getLibraryService().removeFolder(requireText(folderId, 'folderId')),
  );
  ipcMain.handle(IpcChannels.LibraryScanFolder, (_event, folderId: unknown) =>
    getLibraryService().scanFolder(requireText(folderId, 'folderId')),
  );
  ipcMain.handle(IpcChannels.LibraryGetScanStatus, (_event, jobId: unknown) =>
    getLibraryService().getScanStatus(requireText(jobId, 'jobId')),
  );
  ipcMain.handle(IpcChannels.LibraryCancelScan, (_event, jobId: unknown) =>
    getLibraryService().cancelScan(requireText(jobId, 'jobId')),
  );
  ipcMain.handle(IpcChannels.LibraryGetTracks, (_event, query: unknown) =>
    getLibraryService().getTracks(normalizeQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetAlbums, (_event, query: unknown) =>
    getLibraryService().getAlbums(normalizeQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetAlbumTracks, (_event, albumId: unknown, query: unknown) =>
    getLibraryService().getAlbumTracks(requireText(albumId, 'albumId'), normalizeQuery(query)),
  );
  ipcMain.handle(IpcChannels.LibraryGetSummary, () => getLibraryService().getSummary());
  ipcMain.handle(IpcChannels.LibraryGetDiagnostics, () => getLibraryService().getDiagnostics());
  ipcMain.handle(IpcChannels.LibraryUpdateTrackTags, (_event, request: unknown) =>
    getLibraryService().updateTrackTags(normalizeTagUpdateRequest(request)),
  );
  ipcMain.handle(IpcChannels.LibraryOpenTrackInFolder, (_event, trackId: unknown): void => {
    shell.showItemInFolder(getExistingTrack(trackId).path);
  });
  ipcMain.handle(IpcChannels.LibraryOpenTrackWithSystem, async (_event, trackId: unknown): Promise<void> => {
    const result = await shell.openPath(getExistingTrack(trackId).path);

    if (result) {
      throw new Error(result);
    }
  });
  ipcMain.handle(IpcChannels.LibraryCopyTrackPath, (_event, trackId: unknown): void => {
    clipboard.writeText(getExistingTrack(trackId).path);
  });
  ipcMain.handle(IpcChannels.LibraryCopyTrackNameArtist, (_event, trackId: unknown): void => {
    const track = getExistingTrack(trackId);
    clipboard.writeText(`${track.title} - ${track.artist}`);
  });
  ipcMain.handle(IpcChannels.LibraryCopyTrackCover, async (_event, trackId: unknown): Promise<boolean> => {
    const card = await renderTrackCard(trackId);
    const image = nativeImage.createFromBuffer(card.pngBuffer);
    if (image.isEmpty()) {
      return false;
    }

    clipboard.writeImage(image);
    return true;
  });
  ipcMain.handle(IpcChannels.LibrarySaveTrackCover, async (_event, trackId: unknown): Promise<string | null> => {
    const card = await renderTrackCard(trackId);
    const result = await dialog.showSaveDialog({
      title: '保存歌曲卡片图片',
      defaultPath: card.suggestedFileName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    writeFileSync(result.filePath, card.pngBuffer);
    return result.filePath;
  });
  ipcMain.handle(IpcChannels.LibraryDeleteTrackFile, async (_event, trackId: unknown): Promise<void> => {
    const track = getExistingTrack(trackId);

    if (existsSync(track.path)) {
      await shell.trashItem(track.path);
    }

    getLibraryService().deleteTrack(track.id);
  });
};
