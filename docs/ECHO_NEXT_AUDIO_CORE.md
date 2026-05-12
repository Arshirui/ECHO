# ECHO Next Audio Core

The Audio Core owns playback, timing, and HiFi output. It may reuse the old `echo-audio-host` idea, but it must not copy old mixed playback architecture.

## Native Host Binary

During local migration development, ECHO Next can test against the old ECHO `echo-audio-host.exe`, but it must not depend on `../ECHO` long term.

To sync the host binary for development:

```powershell
npm run sync:audio-host
```

The sync script copies:

- from `../ECHO/electron-app/build/echo-audio-host.exe`
- to `./electron-app/build/echo-audio-host.exe`

The expected development-time host path is:

```text
ECHO-Next/electron-app/build/echo-audio-host.exe
```

`npm run dev` only prints a reminder when the ECHO Next copy is missing. It does not copy the binary automatically and does not force a sync on every run.

Runtime lookup order prefers:

1. packaged `resourcesPath`
2. ECHO Next app/build locations
3. ECHO Next `electron-app/build`
4. a `../ECHO` fallback for local migration only

For production packaging, the host must be bundled from ECHO Next itself through `extraResources` or an equivalent packaging step. Production builds must not rely on `../ECHO`.

## Dev Acceptance UI

Settings contains a temporary Audio Host acceptance panel during migration:

- `window.echo.audio.listDevices()` output is shown with device name, index, `sampleRate`, `sharedDeviceSampleRate`, and `outputMode`.
- Audio status shows separate `fileSampleRate`, `decoderOutputSampleRate`, `requestedOutputSampleRate`, `actualDeviceSampleRate`, and `sharedDeviceSampleRate` fields.
- A dev-only "Open Local Audio" button opens an Electron file dialog for `flac`, `mp3`, `wav`, `m4a`, and `ogg`, then calls `playback.playLocalFile({ filePath, output })`.

This panel is for host integration acceptance only. It must not grow into a playback queue, full file manager, lyrics UI, MV UI, or streaming surface.

## Manual 48k Regression Smoke Test

Keep `AudioCore.test.ts` as the automated guard, then run this manual smoke test with real files:

Test files:

- 44.1 kHz FLAC
- 48 kHz FLAC
- 96 kHz FLAC

Steps:

1. Run `npm run sync:audio-host` if `electron-app/build/echo-audio-host.exe` is missing.
2. Run `npm run dev`.
3. Open Settings.
4. Select `exclusive` output mode and the target shared/WASAPI device.
5. Use "Open Local Audio" for the 44.1 kHz file.
6. Confirm `fileSampleRate = 44100`, `decoderOutputSampleRate = 44100`, and `requestedOutputSampleRate = 44100`.
7. Repeat with 48 kHz and confirm `requestedOutputSampleRate = 48000`.
8. Repeat with 96 kHz and confirm `requestedOutputSampleRate = 96000`.
9. Switch from 48 kHz to 44.1 kHz and confirm `NativeOutputBridge` restarts with `-sr 44100`.
10. If `actualDeviceSampleRate` differs from `requestedOutputSampleRate`, confirm `sampleRateMismatch = yes` and a warning is visible.

Do not treat `actualDeviceSampleRate` as the file rate. It comes from the native host ready event and describes the output side.

## Decoder Dependency TODO

`DecoderPipeline` resolves ffmpeg in this order:

1. explicit test/dependency injection path
2. `ECHO_FFMPEG_PATH`
3. `ffmpeg-static`
4. system `ffmpeg`

This makes local playback usable on machines without a system ffmpeg install. If all options fail at spawn time, Audio Status exposes `error = ffmpeg_missing`.

Packaging still needs an explicit check before release: `ffmpeg-static` binaries must be included or unpacked by the Electron packaging flow. A later native decoder can replace this, but Phase 1/host acceptance should not migrate the old mixed `AudioEngine.js`.

## Planned Modules

`AudioSession`

- playback state machine
- load, play, pause, seek, stop, next, previous
- owns current playback intent

`DecoderPipeline`

- decodes local files
- emits PCM
- reads audio format information
- future support for DSD, CUE, and streaming

`NativeOutputBridge`

- connects to the native audio host
- starts the native child process
- writes PCM to stdin
- reads JSON events from stdout
- handles ready, position, ended, and error events

`DeviceService`

- lists audio devices
- later supports WASAPI and ASIO device capabilities

`PlaybackClock`

- uses output-side frame counters
- does not guess position from renderer timers

`GaplessController`

- prepares adjacent tracks for gapless playback

`AutomixController`

- future controlled mixing and transition logic

## Phase 2 Scope

The first audio phase should implement:

- local file playback
- play, pause, seek, stop
- device list
- position events
- ended event

## Later HiFi Scope

- WASAPI Exclusive
- ASIO
- bit-perfect output
- sample-rate switching
- gapless
- automix
- EQ
- VST
- DSD
- CUE

## Renderer Contract

Renderer UI may send playback commands and render state. It must not decode files, own output timing, or calculate authoritative playback position.
