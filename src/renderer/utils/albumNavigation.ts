import type { LibraryAlbum, LibraryTrack } from '../../shared/types/library';

export const albumDetailNavigationEvent = 'app:navigate:album-detail';

let pendingAlbumDetail: LibraryAlbum | null = null;

export const requestAlbumDetailNavigation = (album: LibraryAlbum): void => {
  pendingAlbumDetail = album;
  window.dispatchEvent(new CustomEvent<{ album: LibraryAlbum }>(albumDetailNavigationEvent, { detail: { album } }));
};

export const consumePendingAlbumDetailNavigation = (): LibraryAlbum | null => {
  const album = pendingAlbumDetail;
  pendingAlbumDetail = null;
  return album;
};

export const openAlbumDetailForTrack = async (track: LibraryTrack): Promise<LibraryAlbum | null> => {
  const library = window.echo?.library;

  if (!library?.getAlbumForTrack) {
    throw new Error('Desktop bridge unavailable. Open ECHO Next in Electron to locate this album.');
  }

  const album = await library.getAlbumForTrack(track.id);

  if (album) {
    requestAlbumDetailNavigation(album);
  }

  return album;
};
