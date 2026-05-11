# ECHO Next Library Core

The Library Core owns all local music library logic. Renderer UI is a consumer, not a participant.

## Planned Modules

`LibraryService`

- public facade for library IPC
- coordinates scanner, metadata, covers, albums, artists, search, and store
- exposes `getTracks`, `getAlbums`, `getArtists`, `scan`, and `search`

`LibraryScanner`

- walks user-selected folders
- emits seed file data: path, size, mtime, extension
- does not read full covers
- does not notify renderer directly

`MetadataService`

- reads embedded tags
- extracts title, artist, album, album artist, track number, disc number, year, duration, codec, sample rate, bit depth, bitrate
- records `fieldSourcesJson`
- preserves embedded tags above filename guesses and network data

`CoverService`

- resolves cover source priority
- generates thumb, large, and original assets
- caches generated assets
- keeps full cover loading on demand

`AlbumService`

- generates album IDs and album keys
- handles album grouping
- prevents same-name albums by different album artists from merging
- avoids dumping empty-album tracks into one giant unknown album

`ArtistService`

- manages artist and album artist identities
- supports basic multi-artist handling

`SearchService`

- uses SQLite FTS or an equivalent indexed approach
- searches title, artist, and album
- returns paged results

`LibraryStore`

- owns SQLite access
- runs writes in transactions
- owns migrations and indexes

`ScanJobQueue`

- manages scan jobs
- supports background work, cancellation, progress, errors, and incremental scans

## SQLite Tables

Core tables:

- tracks
- albums
- artists
- album_tracks
- folders
- covers
- scan_jobs
- playlists
- playlist_tracks
- play_history
- settings

## Track Fields

`tracks` should include at least:

- id
- path
- folder_id
- size_bytes
- mtime_ms
- title
- artist
- album
- album_artist
- track_no
- disc_no
- year
- genre
- duration
- codec
- sample_rate
- bit_depth
- bitrate
- cover_id
- metadata_status
- field_sources_json
- created_at
- updated_at

## Performance Contract

- Do not reparse unchanged files.
- Metadata work runs in the background.
- Cover work runs in the background.
- Batch writes use transactions.
- List queries are paged.
- List queries return thumbnails only.
- Full covers load on demand.
- React state never receives the full library and all covers at once.
