import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import electron from 'electron';
import type { EchoDatabase } from '../database/createDatabase';
import { createDatabase } from '../database/createDatabase';
import { defaultSettings, getAppSettings } from '../app/appSettings';
import { getLibraryService } from '../library/LibraryService';
import type { LibraryTrack } from '../../shared/types/library';
import type { AppSettings } from '../../shared/types/appSettings';
import type { LyricsQuery, LyricsSearchCandidate, LyricsSource, TrackLyrics } from '../../shared/types/lyrics';
import { deserializeLyricLines, serializeLyricLines } from './lyricsParser';
import { canAutoAcceptLyricsCandidate, normalizeText, scoreLyricsCandidate } from './lyricsScoring';
import { LocalLyricsProvider } from './LocalLyricsProvider';
import { LrclibProvider, mapLrclibRecordToTrackLyrics, type LrclibRecord } from './LrclibProvider';

type LyricsSettings = Pick<
  AppSettings,
  'lyricsNetworkEnabled' | 'lyricsPreferredProvider' | 'lyricsAutoSearch' | 'lyricsAutoAcceptScore' | 'lyricsDefaultOffsetMs'
>;

type LibraryLookup = {
  getTrack: (trackId: string) => LibraryTrack | null;
};

type LocalProvider = Pick<LocalLyricsProvider, 'getLyrics' | 'searchCandidates' | 'getLyricsFromCandidate'>;
type OnlineProvider = Pick<LrclibProvider, 'getLyrics' | 'searchCandidates'>;

type LyricsCacheRow = {
  id: string;
  cache_key: string;
  track_id: string | null;
  provider: string;
  provider_lyrics_id: string | null;
  title: string;
  artist: string;
  album: string | null;
  duration_seconds: number | null;
  kind: string;
  plain_lyrics: string | null;
  synced_lyrics: string | null;
  lines_json: string;
  offset_ms: number;
  score: number | null;
  created_at: string;
  updated_at: string;
};

type LyricsCandidateRow = {
  id: string;
  track_id: string | null;
  provider: 'lrclib' | 'local';
  provider_lyrics_id: string | null;
  title: string;
  artist: string;
  album: string | null;
  duration_seconds: number | null;
  instrumental: number;
  has_synced: number;
  has_plain: number;
  score: number;
  source_label: string;
  raw_json: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type StoredCandidate = LyricsSearchCandidate & {
  raw: unknown;
  status: string;
};

const nowIso = (): string => new Date().toISOString();
const clampOffset = (value: number): number => Math.max(-10000, Math.min(10000, Math.round(value)));

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const numberOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const hashJson = (value: unknown): string => createHash('sha1').update(JSON.stringify(value ?? {})).digest('hex');

const providerName = (value: string): LyricsSource => {
  if (value === 'none' || value === 'local' || value === 'lrclib' || value === 'manual' || value === 'cached') {
    return value;
  }

  return 'cached';
};

const lyricsKind = (value: string): TrackLyrics['kind'] => {
  if (value === 'plain' || value === 'synced' || value === 'instrumental') {
    return value;
  }

  return 'empty';
};

const toQuery = (track: LibraryTrack): LyricsQuery => ({
  trackId: track.id,
  title: track.title || '',
  artist: track.artist || track.albumArtist || '',
  album: track.album || null,
  durationSeconds: track.duration > 0 ? track.duration : null,
  filePath: track.path,
});

const toNetworkQuery = (query: LyricsQuery): LyricsQuery => ({
  trackId: query.trackId,
  title: query.title,
  artist: query.artist,
  album: query.album ?? null,
  durationSeconds: query.durationSeconds ?? null,
  filePath: null,
});

const cacheKeyFor = (query: LyricsQuery, provider: LyricsSource): string =>
  [
    provider,
    normalizeText(query.title),
    normalizeText(query.artist),
    normalizeText(query.album),
    query.durationSeconds ? String(Math.round(query.durationSeconds)) : '',
  ].join('|');

const allCacheKeysFor = (query: LyricsQuery): string[] => ['local', 'lrclib', 'manual', 'cached'].map((provider) => cacheKeyFor(query, provider as LyricsSource));

const parseRawJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
};

const safeSettings = (readSettings: () => AppSettings): LyricsSettings => {
  try {
    const settings = readSettings();
    return {
      lyricsNetworkEnabled: settings.lyricsNetworkEnabled !== false,
      lyricsPreferredProvider: 'lrclib',
      lyricsAutoSearch: settings.lyricsAutoSearch !== false,
      lyricsAutoAcceptScore: Number.isFinite(settings.lyricsAutoAcceptScore)
        ? Math.max(0.5, Math.min(1, settings.lyricsAutoAcceptScore))
        : defaultSettings.lyricsAutoAcceptScore,
      lyricsDefaultOffsetMs: clampOffset(Number(settings.lyricsDefaultOffsetMs ?? 0)),
    };
  } catch {
    return {
      lyricsNetworkEnabled: defaultSettings.lyricsNetworkEnabled,
      lyricsPreferredProvider: defaultSettings.lyricsPreferredProvider,
      lyricsAutoSearch: defaultSettings.lyricsAutoSearch,
      lyricsAutoAcceptScore: defaultSettings.lyricsAutoAcceptScore,
      lyricsDefaultOffsetMs: defaultSettings.lyricsDefaultOffsetMs,
    };
  }
};

export class LyricsService {
  constructor(
    private readonly database: EchoDatabase,
    private readonly library: LibraryLookup,
    private readonly localProvider: LocalProvider = new LocalLyricsProvider(),
    private readonly onlineProvider: OnlineProvider = new LrclibProvider(),
    private readonly readAppSettings: () => AppSettings = getAppSettings,
  ) {}

  async getLyricsForTrack(trackId: string): Promise<TrackLyrics | null> {
    const track = this.library.getTrack(trackId);
    if (!track) {
      return null;
    }

    const query = toQuery(track);
    const cached = this.findCachedLyrics(query);
    if (cached) {
      return cached;
    }

    try {
      const localLyrics = this.localProvider.getLyrics(query);
      if (localLyrics) {
        return this.writeLyricsCache(query, localLyrics);
      }
    } catch {
      // Local sidecar failures should never surface to playback or renderer.
    }

    const settings = safeSettings(this.readAppSettings);
    if (!settings.lyricsNetworkEnabled || !settings.lyricsAutoSearch || settings.lyricsPreferredProvider !== 'lrclib') {
      return null;
    }

    try {
      const onlineLyrics = await this.onlineProvider.getLyrics(toNetworkQuery(query));
      if (!onlineLyrics) {
        return null;
      }

      const candidate = this.trackLyricsToCandidate(query, onlineLyrics);
      if (this.hasRejectedProviderLyrics(trackId, 'lrclib', candidate.providerLyricsId)) {
        return null;
      }

      if (canAutoAcceptLyricsCandidate(query, candidate, settings.lyricsAutoAcceptScore)) {
        return this.writeLyricsCache(query, onlineLyrics);
      }

      this.upsertCandidate(trackId, candidate, this.trackLyricsToRaw(onlineLyrics));
    } catch {
      return null;
    }

    return null;
  }

  async searchLyricsCandidates(trackId: string): Promise<LyricsSearchCandidate[]> {
    const track = this.library.getTrack(trackId);
    if (!track) {
      return [];
    }

    const query = toQuery(track);
    const storedCandidates: StoredCandidate[] = [];

    for (const candidate of this.localProvider.searchCandidates(query)) {
      const stored = this.upsertCandidate(trackId, candidate, {
        filePath: candidate.filePath,
        extension: candidate.extension,
      });
      if (stored.status !== 'rejected') {
        storedCandidates.push(stored);
      }
    }

    const settings = safeSettings(this.readAppSettings);
    if (settings.lyricsNetworkEnabled && settings.lyricsPreferredProvider === 'lrclib') {
      try {
        const onlineCandidates = await this.onlineProvider.searchCandidates(toNetworkQuery(query));
        for (const candidate of onlineCandidates) {
          const raw = 'raw' in candidate ? candidate.raw : candidate;
          const stored = this.upsertCandidate(trackId, candidate, raw);
          if (stored.status !== 'rejected') {
            storedCandidates.push(stored);
          }
        }
      } catch {
        // Candidate search is best-effort; local results remain usable.
      }
    }

    return storedCandidates
      .map((candidate) => ({
        id: candidate.id,
        provider: candidate.provider,
        providerLyricsId: candidate.providerLyricsId,
        title: candidate.title,
        artist: candidate.artist,
        album: candidate.album,
        durationSeconds: candidate.durationSeconds,
        instrumental: candidate.instrumental,
        hasSynced: candidate.hasSynced,
        hasPlain: candidate.hasPlain,
        score: candidate.score,
        sourceLabel: candidate.sourceLabel,
      }))
      .sort((left, right) => right.score - left.score);
  }

  async applyLyricsCandidate(trackId: string, candidateId: string): Promise<TrackLyrics> {
    const track = this.library.getTrack(trackId);
    const row = this.getCandidateRow(candidateId);

    if (!track || !row || row.track_id !== trackId) {
      throw new Error(`Unknown lyrics candidate ${candidateId}`);
    }

    const query = toQuery(track);
    const raw = parseRawJson(row.raw_json);
    let lyrics: TrackLyrics | null = null;

    if (row.provider === 'local') {
      const rawRecord = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const filePath = textOrNull(rawRecord.filePath);
      const extension = rawRecord.extension === '.txt' ? '.txt' : '.lrc';
      if (filePath) {
        lyrics = this.localProvider.getLyricsFromCandidate(query, {
          ...this.mapCandidateRow(row),
          filePath,
          extension,
        });
      }
    } else {
      lyrics = mapLrclibRecordToTrackLyrics(toNetworkQuery(query), raw as LrclibRecord, row.score);
    }

    if (!lyrics) {
      throw new Error('Lyrics candidate is no longer available');
    }

    const cached = this.writeLyricsCache(query, lyrics);
    this.database
      .prepare('UPDATE lyrics_candidates SET status = ?, updated_at = ? WHERE id = ?')
      .run('accepted', nowIso(), candidateId);
    return cached;
  }

  async rejectLyricsCandidate(candidateId: string): Promise<void> {
    this.database
      .prepare('UPDATE lyrics_candidates SET status = ?, updated_at = ? WHERE id = ?')
      .run('rejected', nowIso(), candidateId);
  }

  async setLyricsOffset(trackId: string, offsetMs: number): Promise<TrackLyrics | null> {
    const track = this.library.getTrack(trackId);
    if (!track) {
      return null;
    }

    const clampedOffset = clampOffset(offsetMs);
    const timestamp = nowIso();
    const result = this.database
      .prepare('UPDATE lyrics_cache SET offset_ms = ?, updated_at = ? WHERE track_id = ?')
      .run(clampedOffset, timestamp, trackId);

    if (result.changes === 0) {
      return null;
    }

    return this.findCachedLyrics(toQuery(track));
  }

  async clearLyricsCache(trackId: string): Promise<void> {
    this.database.prepare('DELETE FROM lyrics_cache WHERE track_id = ?').run(trackId);
  }

  private findCachedLyrics(query: LyricsQuery): TrackLyrics | null {
    if (query.trackId) {
      const row = this.database
        .prepare<[string], LyricsCacheRow>(
          `SELECT * FROM lyrics_cache
           WHERE track_id = ?
           ORDER BY CASE provider
             WHEN 'local' THEN 0
             WHEN 'manual' THEN 1
             WHEN 'lrclib' THEN 2
             ELSE 3
           END, updated_at DESC
           LIMIT 1`,
        )
        .get(query.trackId);

      if (row) {
        return this.mapCacheRow(row);
      }
    }

    const keys = allCacheKeysFor(query);
    const placeholders = keys.map(() => '?').join(', ');
    const row = this.database
      .prepare<unknown[], LyricsCacheRow>(
        `SELECT * FROM lyrics_cache
         WHERE cache_key IN (${placeholders})
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(...keys);

    return row ? this.mapCacheRow(row) : null;
  }

  private writeLyricsCache(query: LyricsQuery, lyrics: TrackLyrics): TrackLyrics {
    const previous = query.trackId
      ? this.database
          .prepare<[string, string], { offset_ms: number }>('SELECT offset_ms FROM lyrics_cache WHERE track_id = ? AND provider = ? LIMIT 1')
          .get(query.trackId, lyrics.provider)
      : null;
    const settings = safeSettings(this.readAppSettings);
    const offsetMs = previous ? Number(previous.offset_ms) : lyrics.offsetMs === 0 ? settings.lyricsDefaultOffsetMs : lyrics.offsetMs;
    const timestamp = nowIso();
    const cacheKey = cacheKeyFor(query, lyrics.provider);
    const id = lyrics.id || randomUUID();

    this.database
      .prepare(
        `INSERT INTO lyrics_cache (
          id, cache_key, track_id, provider, provider_lyrics_id, title, artist, album,
          duration_seconds, kind, plain_lyrics, synced_lyrics, lines_json, offset_ms,
          score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          track_id = excluded.track_id,
          provider = excluded.provider,
          provider_lyrics_id = excluded.provider_lyrics_id,
          title = excluded.title,
          artist = excluded.artist,
          album = excluded.album,
          duration_seconds = excluded.duration_seconds,
          kind = excluded.kind,
          plain_lyrics = excluded.plain_lyrics,
          synced_lyrics = excluded.synced_lyrics,
          lines_json = excluded.lines_json,
          offset_ms = excluded.offset_ms,
          score = excluded.score,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        cacheKey,
        query.trackId ?? lyrics.trackId,
        lyrics.provider,
        lyrics.providerLyricsId ?? null,
        lyrics.title,
        lyrics.artist,
        lyrics.album ?? null,
        lyrics.durationSeconds ?? null,
        lyrics.kind,
        lyrics.plainText ?? null,
        lyrics.syncedText ?? null,
        serializeLyricLines(lyrics.lines),
        clampOffset(offsetMs),
        lyrics.score ?? null,
        lyrics.cachedAt || timestamp,
        timestamp,
      );

    const row = this.database.prepare<[string], LyricsCacheRow>('SELECT * FROM lyrics_cache WHERE cache_key = ?').get(cacheKey);
    return this.mapCacheRow(row!);
  }

  private upsertCandidate(trackId: string, candidate: LyricsSearchCandidate, raw: unknown): StoredCandidate {
    const providerLyricsId = candidate.providerLyricsId ?? `${candidate.provider}:${hashJson(raw)}`;
    const existing = this.database
      .prepare<[string, string, string], { id: string; status: string }>(
        `SELECT id, status FROM lyrics_candidates
         WHERE track_id = ? AND provider = ? AND provider_lyrics_id = ?
         LIMIT 1`,
      )
      .get(trackId, candidate.provider, providerLyricsId);
    const id = existing?.id ?? randomUUID();
    const timestamp = nowIso();
    const status = existing?.status === 'rejected' ? 'rejected' : existing?.status ?? 'pending';

    this.database
      .prepare(
        `INSERT INTO lyrics_candidates (
          id, track_id, provider, provider_lyrics_id, title, artist, album, duration_seconds,
          instrumental, has_synced, has_plain, score, source_label, raw_json, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          artist = excluded.artist,
          album = excluded.album,
          duration_seconds = excluded.duration_seconds,
          instrumental = excluded.instrumental,
          has_synced = excluded.has_synced,
          has_plain = excluded.has_plain,
          score = excluded.score,
          source_label = excluded.source_label,
          raw_json = excluded.raw_json,
          status = CASE lyrics_candidates.status WHEN 'rejected' THEN lyrics_candidates.status ELSE excluded.status END,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        trackId,
        candidate.provider,
        providerLyricsId,
        candidate.title,
        candidate.artist,
        candidate.album ?? null,
        candidate.durationSeconds ?? null,
        candidate.instrumental ? 1 : 0,
        candidate.hasSynced ? 1 : 0,
        candidate.hasPlain ? 1 : 0,
        candidate.score,
        candidate.sourceLabel,
        JSON.stringify(raw ?? {}),
        status,
        timestamp,
        timestamp,
      );

    const row = this.getCandidateRow(id)!;
    return {
      ...this.mapCandidateRow(row),
      raw: parseRawJson(row.raw_json),
      status: row.status,
    };
  }

  private hasRejectedProviderLyrics(trackId: string, provider: 'lrclib' | 'local', providerLyricsId?: string | null): boolean {
    if (!providerLyricsId) {
      return false;
    }

    const row = this.database
      .prepare<[string, string, string], { id: string }>(
        `SELECT id FROM lyrics_candidates
         WHERE track_id = ? AND provider = ? AND provider_lyrics_id = ? AND status = 'rejected'
         LIMIT 1`,
      )
      .get(trackId, provider, providerLyricsId);

    return Boolean(row);
  }

  private trackLyricsToCandidate(query: LyricsQuery, lyrics: TrackLyrics): LyricsSearchCandidate {
    const candidateWithoutScore = {
      provider: 'lrclib' as const,
      providerLyricsId: lyrics.providerLyricsId ?? null,
      title: lyrics.title,
      artist: lyrics.artist,
      album: lyrics.album ?? null,
      durationSeconds: lyrics.durationSeconds ?? null,
      instrumental: lyrics.kind === 'instrumental',
      hasSynced: Boolean(lyrics.syncedText || lyrics.kind === 'synced'),
      hasPlain: Boolean(lyrics.plainText || lyrics.kind === 'plain'),
      sourceLabel: 'LRCLIB',
    };

    return {
      id: randomUUID(),
      ...candidateWithoutScore,
      score: lyrics.score ?? scoreLyricsCandidate(query, candidateWithoutScore),
    };
  }

  private trackLyricsToRaw(lyrics: TrackLyrics): LrclibRecord {
    return {
      id: lyrics.providerLyricsId ?? null,
      trackName: lyrics.title,
      artistName: lyrics.artist,
      albumName: lyrics.album ?? null,
      duration: lyrics.durationSeconds ?? null,
      instrumental: lyrics.kind === 'instrumental',
      plainLyrics: lyrics.plainText ?? null,
      syncedLyrics: lyrics.syncedText ?? null,
    };
  }

  private getCandidateRow(candidateId: string): LyricsCandidateRow | null {
    return this.database.prepare<[string], LyricsCandidateRow>('SELECT * FROM lyrics_candidates WHERE id = ?').get(candidateId) ?? null;
  }

  private mapCandidateRow(row: LyricsCandidateRow): LyricsSearchCandidate {
    return {
      id: row.id,
      provider: row.provider,
      providerLyricsId: row.provider_lyrics_id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      durationSeconds: numberOrNull(row.duration_seconds),
      instrumental: row.instrumental === 1,
      hasSynced: row.has_synced === 1,
      hasPlain: row.has_plain === 1,
      score: Number(row.score ?? 0),
      sourceLabel: row.source_label,
    };
  }

  private mapCacheRow(row: LyricsCacheRow): TrackLyrics {
    return {
      id: row.id,
      trackId: row.track_id,
      provider: providerName(row.provider),
      providerLyricsId: row.provider_lyrics_id,
      kind: lyricsKind(row.kind),
      title: row.title,
      artist: row.artist,
      album: row.album,
      durationSeconds: numberOrNull(row.duration_seconds),
      lines: deserializeLyricLines(row.lines_json),
      plainText: row.plain_lyrics,
      syncedText: row.synced_lyrics,
      offsetMs: Number(row.offset_ms ?? 0),
      score: typeof row.score === 'number' ? row.score : null,
      cachedAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

let defaultLyricsService: LyricsService | null = null;

export const getLyricsService = (): LyricsService => {
  if (!defaultLyricsService) {
    const electronApp = (electron as unknown as { app?: { getPath: (name: string) => string } }).app;

    if (!electronApp) {
      throw new Error('Electron app module is unavailable outside the Electron main process');
    }

    defaultLyricsService = new LyricsService(
      createDatabase(join(electronApp.getPath('userData'), 'echo-library.sqlite')),
      {
        getTrack: (trackId) => getLibraryService().getTrack(trackId),
      },
    );
  }

  return defaultLyricsService;
};
