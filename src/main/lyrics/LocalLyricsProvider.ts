import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { LyricsQuery, LyricsSearchCandidate, TrackLyrics } from '../../shared/types/lyrics';
import { detectLyricsKind, parsePlainLyrics, parseSyncedLyrics } from './lyricsParser';

export type LocalLyricsCandidate = LyricsSearchCandidate & {
  filePath: string;
  extension: '.lrc' | '.txt';
};

const nowIso = (): string => new Date().toISOString();

const fileHashId = (filePath: string): string => `local:${createHash('sha1').update(filePath).digest('hex')}`;

const readTextFile = (filePath: string): string | null => {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
};

const candidatePaths = (audioPath: string): Array<{ filePath: string; extension: '.lrc' | '.txt' }> => {
  const folder = dirname(audioPath);
  const baseName = basename(audioPath, extname(audioPath));

  return [
    { filePath: join(folder, `${baseName}.lrc`), extension: '.lrc' },
    { filePath: join(folder, 'lyrics', `${baseName}.lrc`), extension: '.lrc' },
    { filePath: join(folder, `${baseName}.txt`), extension: '.txt' },
    { filePath: join(folder, 'lyrics', `${baseName}.txt`), extension: '.txt' },
  ];
};

export class LocalLyricsProvider {
  getLyrics(query: LyricsQuery): TrackLyrics | null {
    const [candidate] = this.searchCandidates(query);
    return candidate ? this.getLyricsFromCandidate(query, candidate) : null;
  }

  searchCandidates(query: LyricsQuery): LocalLyricsCandidate[] {
    if (!query.filePath) {
      return [];
    }

    return candidatePaths(query.filePath)
      .filter((candidate) => existsSync(candidate.filePath))
      .map((candidate): LocalLyricsCandidate => ({
        id: randomUUID(),
        provider: 'local',
        providerLyricsId: fileHashId(candidate.filePath),
        title: query.title,
        artist: query.artist,
        album: query.album ?? null,
        durationSeconds: query.durationSeconds ?? null,
        instrumental: false,
        hasSynced: candidate.extension === '.lrc',
        hasPlain: candidate.extension === '.txt',
        score: 1,
        sourceLabel: candidate.extension === '.lrc' ? 'Local LRC' : 'Local text',
        filePath: candidate.filePath,
        extension: candidate.extension,
      }));
  }

  getLyricsFromCandidate(query: LyricsQuery, candidate: LocalLyricsCandidate): TrackLyrics | null {
    const raw = readTextFile(candidate.filePath);
    if (!raw) {
      return null;
    }

    const syncedLyrics = candidate.extension === '.lrc' ? raw : null;
    const plainLyrics = candidate.extension === '.txt' ? raw : null;
    const kind = detectLyricsKind({ syncedLyrics, plainLyrics });
    const lines = kind === 'synced' ? parseSyncedLyrics(raw) : kind === 'plain' ? parsePlainLyrics(raw) : [];

    if (kind === 'empty') {
      return null;
    }

    const timestamp = nowIso();
    return {
      id: randomUUID(),
      trackId: query.trackId ?? null,
      provider: 'local',
      providerLyricsId: candidate.providerLyricsId ?? fileHashId(candidate.filePath),
      kind,
      title: query.title,
      artist: query.artist,
      album: query.album ?? null,
      durationSeconds: query.durationSeconds ?? null,
      lines,
      plainText: plainLyrics,
      syncedText: syncedLyrics,
      offsetMs: 0,
      score: 1,
      cachedAt: timestamp,
      updatedAt: timestamp,
    };
  }
}
