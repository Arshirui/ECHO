# ECHO Next Linux Build

Linux packages must be built from a Linux x64 environment. Use native Linux, WSL2, a Linux VM, or a Linux CI runner. Windows-to-Linux cross packaging is intentionally blocked because the build needs a Linux `echo-audio-host` binary and Linux packaging tools.

First-stage Linux support targets x64 AppImage/deb packages that can start, scan a local music folder, and play local WAV/FLAC/MP3 files. Windows-only features are not part of this Linux gate: WASAPI Exclusive, ASIO, DirectSound compatibility mode, SMTC, taskbar thumbnail controls, and Windows audio service restart stay Windows-only.

## Ubuntu dependencies

Install Node.js/npm for the project, then install the native build and packaging tools:

```bash
sudo apt update
sudo apt install cmake g++ pkg-config fakeroot dpkg rpm binutils
```

Install the JUCE Linux development libraries used by `echo-audio-host`. `libasound2-dev` is required for the first-stage ALSA shared output path:

```bash
sudo apt install \
  libasound2-dev libjack-jackd2-dev \
  libfreetype-dev libfontconfig1-dev \
  libx11-dev libxcomposite-dev libxcursor-dev libxext-dev \
  libxinerama-dev libxrandr-dev libxrender-dev
```

## Linux tool preparation

Linux packaging uses a separate tool directory:

```text
electron-app/tools-linux/
  ffmpeg
  ffmpeg-manifest.json
  yt-dlp
```

`ffmpeg` is required. `yt-dlp` is optional and only affects download/streaming helper availability. Large binaries are not committed to git; prepare them locally or in CI, then update `electron-app/tools-linux/ffmpeg-manifest.json` with:

- `artifact`: `electron-app/tools-linux/ffmpeg`
- `version`: a string contained by `ffmpeg -hide_banner -version`
- `sha256`: the SHA256 of the exact Linux x64 binary
- `requiredFilters`: at least `["aresample"]`

Make the tools executable:

```bash
chmod +x electron-app/tools-linux/ffmpeg
test ! -f electron-app/tools-linux/yt-dlp || chmod +x electron-app/tools-linux/yt-dlp
```

Verify the Linux ffmpeg toolchain before packaging:

```bash
npm run verify:ffmpeg
```

On Windows, `npm run verify:ffmpeg` continues to verify `electron-app/tools/ffmpeg-manifest.json`. On Linux, it verifies `electron-app/tools-linux/ffmpeg-manifest.json`.

## Build

```bash
npm ci
npm run verify:ffmpeg
npm run test:audio-engine
npm run build:linux
```

`build:linux` performs the full Linux build:

1. Fast-fails unless the current runner is Linux x64.
2. Verifies the Linux `ffmpeg` manifest and executable.
3. Rebuilds Electron ABI native modules.
4. Builds `electron-app/build/echo-audio-host`.
5. Runs the TypeScript and Electron/Vite production build.
6. Runs `electron-builder --linux`.
7. Verifies the packaged audio host, packaged `resources/tools/ffmpeg`, optional packaged `yt-dlp`, and AppImage/deb artifacts.

Expected outputs:

- `dist/linux-unpacked/resources/echo-audio-host`
- `dist/linux-unpacked/resources/tools/ffmpeg`
- `dist/*.AppImage`
- `dist/*.deb`

Manual Linux desktop acceptance:

1. Start the packaged app.
2. Complete first-run with `System` or `Linux Shared`.
3. Add a small local music folder.
4. Play WAV, FLAC, and MP3.
5. Switch between system output and shared native output.
6. In shared native output, switch shared backend between `Auto` and `ALSA`.
7. Confirm Windows-only controls do not appear.

The Linux audio host currently provides shared native output through JUCE with ALSA as the explicit supported backend. Systems that expose PipeWire through the ALSA compatibility layer can use the same path. Linux-specific JACK/HiFi-exclusive work is intentionally left for a later phase.
