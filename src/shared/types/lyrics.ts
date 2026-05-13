export type LyricLine = {
  timeMs: number;
  text: string;
  translation?: string | null;
  romanization?: string | null;
};

export type LyricsKind = 'empty' | 'plain' | 'synced' | 'instrumental';

export type LyricsSource = 'none' | 'local' | 'lrclib' | 'manual' | 'cached';

export type TrackLyrics = {
  id: string;
  trackId: string | null;
  provider: LyricsSource;
  providerLyricsId?: string | null;
  kind: LyricsKind;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  lines: LyricLine[];
  plainText?: string | null;
  syncedText?: string | null;
  offsetMs: number;
  score?: number | null;
  cachedAt: string;
  updatedAt: string;
};

export type LyricsSearchCandidate = {
  id: string;
  provider: 'lrclib' | 'local';
  providerLyricsId?: string | null;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  instrumental: boolean;
  hasSynced: boolean;
  hasPlain: boolean;
  score: number;
  sourceLabel: string;
};

export type LyricsQuery = {
  trackId?: string | null;
  title: string;
  artist: string;
  album?: string | null;
  durationSeconds?: number | null;
  filePath?: string | null;
};
