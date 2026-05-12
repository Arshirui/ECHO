# ECHO Next UI Guide

The UI should feel like a modern desktop music player built for quiet, focused listening.

## Direction

- dark theme first
- light theme later
- refined HiFi visual language
- large artwork where it matters
- dense but calm library surfaces
- restrained motion
- no visual gimmicks that hide data

## Layout

The default shell contains:

- frameless ECHO app titlebar with quick actions and window controls
- left navigation
- main content area
- bottom playback bar

The titlebar should feel owned by ECHO, not like the operating system's default frame. Window actions still go through typed preload IPC; Renderer must not call Electron APIs directly.

Main pages planned for the first shell:

- Songs
- Albums
- Artists
- Now Playing
- Playlists
- Search
- Settings

## Performance Rules

The UI must not trade performance for appearance.

- Use paged or virtualized lists.
- Use thumbnail covers in lists and grids.
- Load large covers only when needed.
- Keep playback tick state away from app-wide React renders.
- Avoid animation on large lists.
- Avoid derived library computations in render paths.

## Styling Rules

Styles are split into:

- `tokens.css`
- `theme.css`
- `layout.css`
- `app.css`

As the UI grows, feature styles should move beside the relevant component or into focused style files. Do not allow one global stylesheet to become the whole application.

## Copy Rules

The app UI should not over-explain itself. Developer-facing architecture notes belong in `docs`, not in visible product copy.
