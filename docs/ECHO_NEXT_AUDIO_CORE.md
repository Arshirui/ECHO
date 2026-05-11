# ECHO Next Audio Core

The Audio Core owns playback, timing, and HiFi output. It may reuse the old `echo-audio-host` idea, but it must not copy old mixed playback architecture.

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
