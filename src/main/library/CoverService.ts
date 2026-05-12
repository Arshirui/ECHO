import { randomUUID } from 'node:crypto';
import type { EchoDatabase } from '../database/createDatabase';
import { COVER_CACHE_VERSION } from './libraryTypes';
import type { CoverResult, CoverSource, ParsedTrackMetadata } from './libraryTypes';
import { TsCoverExtractor } from './workers/TsCoverExtractor';

const coverSourceRank: Record<CoverSource, number> = {
  default: 0,
  network: 1,
  folder: 2,
  embedded: 3,
  manual: 4,
};

const coverSourceOrNull = (value: unknown): CoverSource | null =>
  value === 'manual' || value === 'embedded' || value === 'folder' || value === 'network' || value === 'default' ? value : null;

const preferredCoverSource = (current: unknown, next: CoverSource): CoverSource => {
  const currentSource = coverSourceOrNull(current);
  return currentSource && coverSourceRank[currentSource] > coverSourceRank[next] ? currentSource : next;
};

export class CoverService {
  private readonly extractor = new TsCoverExtractor();

  constructor(
    private readonly database: EchoDatabase,
    private readonly cacheRoot: string,
  ) {}

  async ensureCover(filePath: string, metadata: ParsedTrackMetadata, now = new Date().toISOString()): Promise<string | null> {
    const result = await this.extractor.extract(filePath, {
      cacheRoot: this.cacheRoot,
      metadata,
      now,
    });

    return this.upsertCover(result, now);
  }

  private upsertCover(result: CoverResult, now: string): string | null {
    const existing = this.database.prepare<unknown[], { id: string; source_type: string }>('SELECT id, source_type FROM covers WHERE source_hash = ?').get(result.sourceHash);
    const source = preferredCoverSource(existing?.source_type, result.source);

    if (existing?.id) {
      this.database
        .prepare(
          `UPDATE covers SET
            source_type = ?,
            mime_type = ?,
            thumb_path = ?,
            album_path = ?,
            large_path = ?,
            original_ref = ?,
            cache_version = ?,
            warnings_json = ?,
            errors_json = ?,
            cover_thumb = ?,
            cover_large = ?,
            cover_original = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          source,
          result.mimeType,
          result.thumbPath,
          result.albumPath,
          result.largePath,
          result.originalRef,
          COVER_CACHE_VERSION,
          JSON.stringify(result.warnings),
          JSON.stringify(result.errors),
          result.thumbPath,
          result.largePath,
          result.originalRef,
          now,
          existing.id,
        );
      return existing.id;
    }

    const id = randomUUID();
    this.database
      .prepare(
        `INSERT INTO covers (
          id, source_type, source_hash, mime_type,
          thumb_path, album_path, large_path, original_ref,
          cache_version, warnings_json, errors_json,
          cover_thumb, cover_large, cover_original,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        source,
        result.sourceHash,
        result.mimeType,
        result.thumbPath,
        result.albumPath,
        result.largePath,
        result.originalRef,
        COVER_CACHE_VERSION,
        JSON.stringify(result.warnings),
        JSON.stringify(result.errors),
        result.thumbPath,
        result.largePath,
        result.originalRef,
        now,
        now,
      );

    return id;
  }
}
