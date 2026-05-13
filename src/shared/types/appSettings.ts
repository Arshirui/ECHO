import type { ChannelBalanceState, PlaybackSpeedMode } from './audio';
import type { DuplicateTrackMode } from './library';

export type ScanPerformanceMode = 'low' | 'balanced' | 'performance';

export type AppSettings = {
  albumMergeStrategy: 'standard' | 'sameTitleAndCover';
  artistWallAlbumArtwork: boolean;
  coverCacheDir: string | null;
  hideToTrayOnClose: boolean;
  networkMetadataEnabled: boolean;
  networkMetadataProviders: Array<'mock' | 'musicbrainz' | 'cover-art-archive' | 'netease-cloud-music' | 'qq-music'>;
  lyricsNetworkEnabled: boolean;
  lyricsPreferredProvider: 'lrclib';
  lyricsAutoSearch: boolean;
  lyricsAutoAcceptScore: number;
  lyricsDefaultOffsetMs: number;
  channelBalance: ChannelBalanceState;
  playerVolume: number;
  playbackSpeed: number;
  playbackSpeedMode: PlaybackSpeedMode;
  scanPerformanceMode: ScanPerformanceMode;
  duplicateTracksEnabled: boolean;
  duplicateTracksMode: DuplicateTrackMode;
  duplicateTracksAutoRebuildAfterScan: boolean;
  discordRichPresenceEnabled: boolean;
  lastFmEnabled: boolean;
  lastFmUsername: string | null;
  lastFmSessionKey: string | null;
  lastFmScrobbleEnabled: boolean;
  lastFmNowPlayingEnabled: boolean;
  lastFmMinScrobbleSeconds: number;
  lastFmAuthToken: string | null;
  smtcEnabled: boolean;
};
