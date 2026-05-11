# ECHO Next Rules

These rules are architectural guardrails. They are part of Phase 0 and should be treated as development constraints.

## File Size And Ownership

1. No giant `App.tsx`.
2. No giant `main/index.ts`.
3. No giant global CSS file.
4. Pages over 500 lines must be split.
5. Services over 800 lines must be split.
6. Shared abstractions must have a clear owner and purpose.

## App Entrypoints

`src/renderer/app/App.tsx` may only compose:

- providers
- layout
- routes
- future error boundary

`src/main/index.ts` may only compose:

- app lifecycle
- main window creation through lifecycle
- IPC registration
- necessary service bootstrap

## Renderer Rules

The renderer must not:

- scan folders
- read metadata
- parse covers
- load full covers for lists
- decide album grouping
- hold the whole library in React state
- run heavy search over a full in-memory track array
- let high-frequency playback state rerender the entire app

Songs, albums, artists, and search results must be paged or virtualized.

## Preload Rules

Preload must:

- expose `window.echo`
- keep APIs grouped by domain
- return typed results

Preload must not:

- expose raw `ipcRenderer`
- access files directly
- implement business logic
- parse metadata or covers

## Metadata Priority

Metadata priority is fixed:

1. user manual edit
2. embedded tags
3. sidecar/info files
4. folder structure
5. network completion
6. filename fallback

Filename guessing must never overwrite embedded `title`, `artist`, or `album`.

Network metadata must never overwrite embedded tags.

## Cover Priority

Cover priority is fixed:

1. user manual cover
2. embedded cover
3. local folder cover
4. sidecar cover
5. network cover
6. generated placeholder

Network covers must never overwrite manual, embedded, or local covers.

Covers must be stored as:

- thumb
- large
- original

List views use thumb only. Full covers load on demand.

## Long Tasks

All long tasks must be:

- backgrounded
- cancellable
- progress-reporting
- error-collecting

This includes scanning, metadata extraction, cover generation, audio analysis, and future network enrichment.

## Testing Rules

Changes touching metadata, cover, audio, library, encoding, database migration, or file scanning behavior must include focused tests.
