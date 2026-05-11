# ECHO Next Roadmap

## Phase 0: Skeleton

- Electron + React + TypeScript + Vite
- electron-vite build pipeline
- typed preload API
- main IPC registration
- empty UI shell
- architecture and rule documents

Current Phase 0 intentionally does not implement scanning, playback, or SQLite.

## Phase 1: Library Core

- add library folders
- background scanning
- embedded metadata reading
- cover thumbnail generation
- SQLite schema and migrations
- transaction-backed writes
- `SongsPage` with pagination or virtualization
- `AlbumsPage` with paged album wall
- FTS-backed search
- scan progress and cancellation
- focused tests for metadata, cover, and library store behavior

## Phase 2: Audio Core

- local file playback
- `AudioSession` state machine
- device listing
- native output bridge inspired by `echo-audio-host`
- position events from output-side timing
- play, pause, seek, stop, next, previous
- ended and error events

## Phase 3: HiFi

- WASAPI Exclusive
- ASIO
- bit-perfect output path
- sample-rate switching
- gapless playback
- output format verification

## Phase 4: Experience

- lyrics
- MV
- streaming
- downloader
- Last.fm
- Discord RPC
- plugins

Experience features wait until the library and audio cores are stable.
