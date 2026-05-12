import type { EchoDatabase } from './createDatabase';
import { librarySchemaSql, schemaMigrationTableSql } from './schema';

type Migration = {
  id: number;
  apply: (database: EchoDatabase) => void;
};

type ColumnInfoRow = {
  name: string;
};

const hasColumn = (database: EchoDatabase, tableName: string, columnName: string): boolean => {
  const rows = database.prepare<unknown[], ColumnInfoRow>(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
};

const addColumnIfMissing = (
  database: EchoDatabase,
  tableName: string,
  columnName: string,
  columnSql: string,
): void => {
  if (!hasColumn(database, tableName, columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }
};

export const migrations: Migration[] = [
  {
    id: 1,
    apply: (database) => database.exec(librarySchemaSql),
  },
  {
    id: 2,
    apply: (database) => {
      addColumnIfMissing(database, 'tracks', 'track_no', 'track_no INTEGER');
      addColumnIfMissing(database, 'tracks', 'disc_no', 'disc_no INTEGER');
      addColumnIfMissing(database, 'tracks', 'year', 'year INTEGER');
      addColumnIfMissing(database, 'scan_jobs', 'phase', "phase TEXT NOT NULL DEFAULT 'queued'");
      addColumnIfMissing(database, 'scan_jobs', 'removed_tracks', 'removed_tracks INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    id: 3,
    apply: (database) => {
      addColumnIfMissing(database, 'folders', 'enabled', 'enabled INTEGER NOT NULL DEFAULT 1');
      addColumnIfMissing(database, 'folders', 'last_scan_at', 'last_scan_at TEXT');

      addColumnIfMissing(database, 'tracks', 'genre', 'genre TEXT');
      addColumnIfMissing(database, 'tracks', 'metadata_status', "metadata_status TEXT NOT NULL DEFAULT 'ok'");
      addColumnIfMissing(database, 'tracks', 'missing', 'missing INTEGER NOT NULL DEFAULT 0');

      addColumnIfMissing(database, 'albums', 'year', 'year INTEGER');

      addColumnIfMissing(database, 'album_tracks', 'disc_no', 'disc_no INTEGER');
      addColumnIfMissing(database, 'album_tracks', 'track_no', 'track_no INTEGER');

      addColumnIfMissing(database, 'artists', 'sort_name', 'sort_name TEXT');
      addColumnIfMissing(database, 'artists', 'track_count', 'track_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'artists', 'album_count', 'album_count INTEGER NOT NULL DEFAULT 0');

      addColumnIfMissing(database, 'covers', 'thumb_path', 'thumb_path TEXT');
      addColumnIfMissing(database, 'covers', 'album_path', 'album_path TEXT');
      addColumnIfMissing(database, 'covers', 'large_path', 'large_path TEXT');
      addColumnIfMissing(database, 'covers', 'original_ref', 'original_ref TEXT');

      addColumnIfMissing(database, 'scan_jobs', 'discovered_count', 'discovered_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'scan_jobs', 'parsed_count', 'parsed_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'scan_jobs', 'skipped_count', 'skipped_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'scan_jobs', 'cover_count', 'cover_count INTEGER NOT NULL DEFAULT 0');

      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_album_tracks_track_id ON album_tracks(track_id);
        CREATE INDEX IF NOT EXISTS idx_covers_id ON covers(id);
      `);
    },
  },
  {
    id: 4,
    apply: (database) => {
      addColumnIfMissing(database, 'covers', 'album_path', 'album_path TEXT');
      addColumnIfMissing(database, 'covers', 'cache_version', 'cache_version INTEGER');
      addColumnIfMissing(database, 'covers', 'warnings_json', "warnings_json TEXT NOT NULL DEFAULT '[]'");
      addColumnIfMissing(database, 'covers', 'errors_json', "errors_json TEXT NOT NULL DEFAULT '[]'");
    },
  },
  {
    id: 5,
    apply: (database) => {
      addColumnIfMissing(database, 'tracks', 'embedded_metadata_status', "embedded_metadata_status TEXT NOT NULL DEFAULT 'pending'");
      addColumnIfMissing(database, 'tracks', 'embedded_cover_status', "embedded_cover_status TEXT NOT NULL DEFAULT 'pending'");
      addColumnIfMissing(database, 'tracks', 'network_metadata_status', "network_metadata_status TEXT NOT NULL DEFAULT 'none'");

      database.exec(`
        CREATE TABLE IF NOT EXISTS network_metadata_candidates (
          id TEXT PRIMARY KEY,
          track_id TEXT NOT NULL,
          album_id TEXT,
          provider TEXT NOT NULL,
          provider_item_id TEXT NOT NULL,
          title TEXT,
          artist TEXT,
          album TEXT,
          album_artist TEXT,
          year INTEGER,
          genre TEXT,
          duration REAL,
          track_no INTEGER,
          disc_no INTEGER,
          cover_url TEXT,
          score REAL NOT NULL,
          raw_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
          FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS network_metadata_decisions (
          id TEXT PRIMARY KEY,
          track_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          decision TEXT NOT NULL,
          applied_fields_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
          FOREIGN KEY (candidate_id) REFERENCES network_metadata_candidates(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS network_cover_candidates (
          id TEXT PRIMARY KEY,
          track_id TEXT,
          album_id TEXT,
          provider TEXT NOT NULL,
          cover_url TEXT NOT NULL,
          width INTEGER,
          height INTEGER,
          mime_type TEXT,
          score REAL NOT NULL,
          cached_thumb_path TEXT,
          cached_large_path TEXT,
          raw_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
          FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_network_metadata_candidates_track_id ON network_metadata_candidates(track_id);
        CREATE INDEX IF NOT EXISTS idx_network_metadata_decisions_track_id ON network_metadata_decisions(track_id);
        CREATE INDEX IF NOT EXISTS idx_network_cover_candidates_track_id ON network_cover_candidates(track_id);
      `);
    },
  },
];

export const runMigrations = (database: EchoDatabase): void => {
  database.exec(schemaMigrationTableSql);

  const appliedRows = database.prepare<unknown[], { id: number }>('SELECT id FROM schema_migrations').all();
  const appliedIds = new Set(appliedRows.map((row) => Number(row.id)));

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    database.exec('BEGIN');

    try {
      migration.apply(database);
      database
        .prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
        .run(migration.id, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
};
