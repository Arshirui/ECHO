# ECHO Next Architecture

ECHO Next is a new architecture, not a patch layer on top of old ECHO. The goal is a high-performance, HiFi-friendly Electron Hybrid music player with stable library management, clear ownership boundaries, and a renderer that stays light.

## Layer 1: Electron Shell

The Electron shell owns desktop integration only:

- app lifecycle
- main window creation
- window state management
- future tray integration
- future global shortcuts
- future auto-update
- packaging
- IPC registration

`src/main/index.ts` is deliberately small. It initializes IPC and app lifecycle, then delegates to focused modules.

It must not contain scanning, metadata parsing, cover processing, playback queues, lyrics, MV, downloading, or database-heavy logic.

## Layer 2: Preload Bridge

Preload is a safe typed bridge. It exposes grouped APIs on `window.echo` and hides Electron internals from the renderer.

Allowed:

- typed API methods
- `ipcRenderer.invoke` wrappers for approved channels
- API grouping by domain

Forbidden:

- exposing raw `ipcRenderer`
- file IO
- metadata parsing
- cover processing
- business logic

## Layer 3: Renderer UI

Renderer owns presentation and interaction. It does not scan files, parse tags, group albums, decode audio, or process full-size covers.

The app shell is split into:

- `src/renderer/app/App.tsx`
- `src/renderer/app/AppLayout.tsx`
- `src/renderer/app/AppProviders.tsx`
- `src/renderer/app/routes.tsx`
- page components under `src/renderer/pages`
- reusable UI under `src/renderer/components`
- modular styles under `src/renderer/styles`

`App.tsx` composes providers, layout, and routes only.

## Layer 4: Library Core

`src/main/library` will become the local music library core. It will own scanning, metadata, covers, album grouping, artist handling, search, and SQLite persistence.

Planned modules:

- `LibraryService.ts`
- `LibraryScanner.ts`
- `MetadataService.ts`
- `CoverService.ts`
- `AlbumService.ts`
- `ArtistService.ts`
- `SearchService.ts`
- `LibraryStore.ts`
- `ScanJobQueue.ts`
- `libraryTypes.ts`

The renderer must receive paged, display-ready data. It must not own library algorithms.

## Layer 5: Database Layer

SQLite will store tracks, albums, artists, folders, covers, scan jobs, playlists, history, and settings.

Core performance rules:

- skip unchanged files by `path + size + mtime`
- batch writes in transactions
- query songs, albums, and artists with pagination
- never return full covers in list queries
- cache generated cover sizes
- keep full cover loading on demand

## Layer 6: Audio Core

`src/main/audio` will become the playback and HiFi output layer. It can reuse the old `echo-audio-host` idea, but not old mixed AudioEngine structure.

Planned modules:

- `AudioSession.ts`
- `DecoderPipeline.ts`
- `NativeOutputBridge.ts`
- `DeviceService.ts`
- `PlaybackClock.ts`
- `GaplessController.ts`
- `AutomixController.ts`
- `audioTypes.ts`

Renderer playback UI should consume state slices and commands through typed IPC, not control decoding or output directly.
