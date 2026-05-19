# ECHO Next Audio Crash Report

Generated: 2026-05-19T05:18:46.825Z
Report file: audio-crash-report.md

## Summary

- Phase: error
- Severity: fatal
- Recovered: n/a
- Message: echo-audio-host exit_code_3221225477; host="D:\\music\\ECHO NEXT\\resources\\echo-audio-host.exe"; args="-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin"; mode="shared"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail="[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214"
- Crash timestamp: 2026-05-19T05:18:44.571Z

## Related Audio Events In This Session

- Events included: 5
- Time window: 2026-05-19T05:18:01.678Z -> 2026-05-19T05:18:44.571Z
- Reading tip: different top-level errors can be one incident when the device/mode changes during fallback.

| # | Time | Severity | Phase | Mode | Device | Rate | Failure class | Recovery signal |
| - | - | - | - | - | - | - | - | - |
| 1 | 05:18:01.678 | recoverable | output-start | shared | n/a | 48000 | host_exited_before_ready | file_sample_rate_unknown_using_44100_fallback |
| 2 | 05:18:07.191 | fatal | error | shared | n/a | 48000 | host_exited_before_ready | file_sample_rate_unknown_using_44100_fallback, shared... |
| 3 | 05:18:36.282 | recoverable | output-start | shared | n/a | 48000 | host_exited_before_ready | file_sample_rate_unknown_using_44100_fallback |
| 4 | 05:18:39.069 | recoverable | output-start | shared | n/a | 48000 | host_exited_before_ready | file_sample_rate_unknown_using_44100_fallback, juce_o... |
| 5 | 05:18:44.571 | fatal | error | shared | n/a | 48000 | host_exited_before_ready | file_sample_rate_unknown_using_44100_fallback, juce_o... |

## Correlation Analysis

- Likely one chained incident: yes
- Failure classes observed: host_exited_before_ready
- Output modes involved: shared
- Devices involved: n/a
- Requested/actual rate transitions: 48000
- Recovery/fallback signals: file_sample_rate_unknown_using_44100_fallback, shared_output_recovered_safe_mode, juce_output_fell_back_to_native, juce_shared_output_fell_back_to_native

## Why This Error Happened

- Operation phase: error
- Output mode at the time: shared
- Output device at the time: unknown
- Active warnings: file_sample_rate_unknown_using_44100_fallback, juce_output_fell_back_to_native, juce_shared_output_fell_back_to_native, shared_output_recovered_safe_mode
- Direct cause: echo-audio-host started but exited before audio output became ready.
- Most likely reasons: the selected output device refused the requested mode, crashed during driver setup, or rejected the requested format.
- What to inspect: stderrTail, exitCodeHex, nativeCrash, requestedOutputSampleRate, outputMode, and the selected device name in the JSON sections below.

## Error Cause Details

- Raw message: echo-audio-host exit_code_3221225477; host="D:\\music\\ECHO NEXT\\resources\\echo-audio-host.exe"; args="-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin"; mode="shared"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail="[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214"
- Severity: fatal
- Recovered automatically: false
- Requested sample rate: 48000
- Actual device sample rate: n/a
- Requested buffer frames: n/a
- Actual buffer frames: n/a

## Session

```json
{
  "sessionId": "[redacted]",
  "appVersion": "26.5.18",
  "electronVersion": "37.10.3",
  "chromeVersion": "138.0.7204.251",
  "nodeVersion": "22.21.1",
  "platform": "win32",
  "arch": "x64",
  "startedAt": "2026-05-19T05:17:29.354Z",
  "status": "running"
}
```

## Audio Error

```json
{
  "message": "echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin\"; mode=\"shared\"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214\"",
  "stack": "Error: echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin\"; mode=\"shared\"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214\"\n    at createHostError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2399:10)\n    at createError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2697:54)\n    at ChildProcess.<anonymous> (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2782:23)\n    at ChildProcess.emit (node:events:519:28)\n    at ChildProcess._handle.onexit (node:internal/child_process:293:12)",
  "phase": "error",
  "severity": "fatal",
  "details": {
    "outputWarnings": [
      "juce_output_fell_back_to_native",
      "juce_shared_output_fell_back_to_native",
      "shared_output_recovered_safe_mode"
    ],
    "currentOutputSettings": {
      "outputMode": "shared",
      "latencyProfile": {
        "basename": "stable",
        "pathHash": "f379ccb92b911644"
      },
      "sharedBackend": "windows",
      "useJuceOutput": false,
      "useJuceDecode": true,
      "dsdOutputMode": "pcm",
      "asioNativeDsdExperimentalEnabled": false,
      "asioUnavailableFallbackEnabled": false,
      "soxrFallbackEnabled": true,
      "releaseExclusiveOnPauseExperimentalEnabled": false,
      "volume": 0.38,
      "playbackRate": 1,
      "playbackSpeedMode": "nightcore"
    },
    "currentPlan": {
      "fileSampleRate": null,
      "decoderOutputSampleRate": 48000,
      "requestedOutputSampleRate": 48000,
      "actualDeviceSampleRate": null,
      "sharedDeviceSampleRate": null,
      "dsdOutputMode": "pcm",
      "dsdNativeSampleRate": null,
      "dsdTransportSampleRate": null,
      "outputMode": "shared",
      "resampling": false,
      "bitPerfectCandidate": false,
      "sampleRateMismatch": false,
      "warnings": [
        "file_sample_rate_unknown_using_44100_fallback"
      ]
    }
  },
  "audioStatus": {
    "host": "error",
    "state": "error",
    "outputDeviceId": null,
    "outputDeviceName": null,
    "outputDeviceType": null,
    "outputBackend": null,
    "activeOutputBackendImpl": null,
    "outputMode": "shared",
    "sharedBackend": "windows",
    "useJuceOutputRequested": true,
    "useJuceDecodeRequested": true,
    "activeDecodeBackendImpl": null,
    "dsdOutputModeRequested": "pcm",
    "activeDsdOutputMode": null,
    "dsdNativeSampleRate": null,
    "dsdTransportSampleRate": null,
    "latencyProfile": {
      "basename": "stable",
      "pathHash": "f379ccb92b911644"
    },
    "volume": 0.38,
    "playbackRate": 1,
    "playbackSpeedMode": "nightcore",
    "replayGainEnabled": false,
    "replayGainMode": "track",
    "replayGainAppliedDb": 0,
    "replayGainPreventedClipping": false,
    "automix": {
      "enabled": false,
      "mode": "off",
      "active": false,
      "transitionSeconds": null,
      "transitionStartedAtSeconds": null,
      "nextTrackId": null,
      "transitionMode": null,
      "fallbackReason": null,
      "beatAligned": false,
      "skipIntroSilence": false,
      "engine": null,
      "tempoRatio": null,
      "nextStartSeconds": null,
      "overlapSeconds": null,
      "advanceAtSeconds": null,
      "plannedTrackCount": 0,
      "nextTransitionIndex": 0
    },
    "currentFilePath": {
      "basename": "CerwCI6JUs=",
      "pathHash": "86f15e3074156ec2"
    },
    "currentTrackId": "streaming:netease:1818031620",
    "durationSeconds": 226.858,
    "positionSeconds": 0,
    "channels": 2,
    "codec": "flac",
    "bitDepth": null,
    "bitrate": 5195016,
    "fileSampleRate": null,
    "decoderOutputSampleRate": 48000,
    "requestedOutputSampleRate": 48000,
    "actualDeviceSampleRate": null,
    "sharedDeviceSampleRate": null,
    "resampling": false,
    "ffmpegPath": {
      "basename": "ffmpeg.exe",
      "pathHash": "955f4f57b451fb81"
    },
    "ffmpegSource": "bundled",
    "ffmpegVersion": "8.1.1-full_build-www.gyan.dev",
    "ffmpegHealthy": true,
    "soxrAvailable": true,
    "resamplerEngine": "default",
    "resamplerFallbackActive": false,
    "bitPerfectCandidate": false,
    "sampleRateMismatch": false,
    "eqEnabled": false,
    "channelBalanceEnabled": false,
    "dspActive": false,
    "preampDb": 0,
    "eqPresetName": "Flat",
    "clippingRisk": false,
    "audioLevels": {
      "inputPeakDb": null,
      "inputRmsDb": null,
      "estimatedOutputPeakDb": null,
      "estimatedOutputRmsDb": null,
      "headroomDb": null,
      "clipCount": 0,
      "lastClipAt": null,
      "meterSource": "pre_native_estimated_post_dsp"
    },
    "bitPerfectDisabledReason": null,
    "sharedStabilityTier": "emergency",
    "nativeDeviceBufferFrames": null,
    "nativeRequestedBufferFrames": null,
    "nativeActualBufferFrames": null,
    "nativeOutputLatencyMs": null,
    "nativePositionStalenessMs": null,
    "nativeFifoCapacityFrames": null,
    "nativeStartupPrebufferFrames": null,
    "nativeBufferedFrames": null,
    "nativeBufferedMs": null,
    "nativeUnderrunCallbacks": 0,
    "nativeUnderrunFrames": 0,
    "lastSharedStabilityRecoveryAt": null,
    "warnings": [
      "file_sample_rate_unknown_using_44100_fallback",
      "juce_output_fell_back_to_native",
      "juce_shared_output_fell_back_to_native",
      "shared_output_recovered_safe_mode"
    ],
    "error": "echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin\"; mode=\"shared\"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214\"",
    "asioOutputChannelStart": null
  },
  "type": "audio",
  "timestamp": "2026-05-19T05:18:44.571Z",
  "sessionId": "[redacted]"
}
```

## Stack

```text
Error: echo-audio-host exit_code_3221225477; host="D:\\music\\ECHO NEXT\\resources\\echo-audio-host.exe"; args="-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin"; mode="shared"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail="[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214"
    at createHostError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2399:10)
    at createError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2697:54)
    at ChildProcess.<anonymous> (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2782:23)
    at ChildProcess.emit (node:events:519:28)
    at ChildProcess._handle.onexit (node:internal/child_process:293:12)
```

## Audio Status Snapshot

```json
{
  "host": "error",
  "state": "error",
  "outputDeviceId": null,
  "outputDeviceName": null,
  "outputDeviceType": null,
  "outputBackend": null,
  "activeOutputBackendImpl": null,
  "outputMode": "shared",
  "sharedBackend": "windows",
  "useJuceOutputRequested": true,
  "useJuceDecodeRequested": true,
  "activeDecodeBackendImpl": null,
  "dsdOutputModeRequested": "pcm",
  "activeDsdOutputMode": null,
  "dsdNativeSampleRate": null,
  "dsdTransportSampleRate": null,
  "latencyProfile": {
    "basename": "stable",
    "pathHash": "f379ccb92b911644"
  },
  "volume": 0.38,
  "playbackRate": 1,
  "playbackSpeedMode": "nightcore",
  "replayGainEnabled": false,
  "replayGainMode": "track",
  "replayGainAppliedDb": 0,
  "replayGainPreventedClipping": false,
  "automix": {
    "enabled": false,
    "mode": "off",
    "active": false,
    "transitionSeconds": null,
    "transitionStartedAtSeconds": null,
    "nextTrackId": null,
    "transitionMode": null,
    "fallbackReason": null,
    "beatAligned": false,
    "skipIntroSilence": false,
    "engine": null,
    "tempoRatio": null,
    "nextStartSeconds": null,
    "overlapSeconds": null,
    "advanceAtSeconds": null,
    "plannedTrackCount": 0,
    "nextTransitionIndex": 0
  },
  "currentFilePath": {
    "basename": "CerwCI6JUs=",
    "pathHash": "86f15e3074156ec2"
  },
  "currentTrackId": "streaming:netease:1818031620",
  "durationSeconds": 226.858,
  "positionSeconds": 0,
  "channels": 2,
  "codec": "flac",
  "bitDepth": null,
  "bitrate": 5195016,
  "fileSampleRate": null,
  "decoderOutputSampleRate": 48000,
  "requestedOutputSampleRate": 48000,
  "actualDeviceSampleRate": null,
  "sharedDeviceSampleRate": null,
  "resampling": false,
  "ffmpegPath": {
    "basename": "ffmpeg.exe",
    "pathHash": "955f4f57b451fb81"
  },
  "ffmpegSource": "bundled",
  "ffmpegVersion": "8.1.1-full_build-www.gyan.dev",
  "ffmpegHealthy": true,
  "soxrAvailable": true,
  "resamplerEngine": "default",
  "resamplerFallbackActive": false,
  "bitPerfectCandidate": false,
  "sampleRateMismatch": false,
  "eqEnabled": false,
  "channelBalanceEnabled": false,
  "dspActive": false,
  "preampDb": 0,
  "eqPresetName": "Flat",
  "clippingRisk": false,
  "audioLevels": {
    "inputPeakDb": null,
    "inputRmsDb": null,
    "estimatedOutputPeakDb": null,
    "estimatedOutputRmsDb": null,
    "headroomDb": null,
    "clipCount": 0,
    "lastClipAt": null,
    "meterSource": "pre_native_estimated_post_dsp"
  },
  "bitPerfectDisabledReason": null,
  "sharedStabilityTier": "emergency",
  "nativeDeviceBufferFrames": null,
  "nativeRequestedBufferFrames": null,
  "nativeActualBufferFrames": null,
  "nativeOutputLatencyMs": null,
  "nativePositionStalenessMs": null,
  "nativeFifoCapacityFrames": null,
  "nativeStartupPrebufferFrames": null,
  "nativeBufferedFrames": null,
  "nativeBufferedMs": null,
  "nativeUnderrunCallbacks": 0,
  "nativeUnderrunFrames": 0,
  "lastSharedStabilityRecoveryAt": null,
  "warnings": [
    "file_sample_rate_unknown_using_44100_fallback",
    "juce_output_fell_back_to_native",
    "juce_shared_output_fell_back_to_native",
    "shared_output_recovered_safe_mode"
  ],
  "error": "echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin\"; mode=\"shared\"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214\"",
  "asioOutputChannelStart": null
}
```

## Current Playback Snapshot

```json
{
  "state": "error",
  "currentTrackId": "streaming:netease:1818031620",
  "positionSeconds": 0,
  "durationSeconds": 226.858,
  "currentFilePath": {
    "basename": "CerwCI6JUs=",
    "pathHash": "86f15e3074156ec2"
  }
}
```

## Recent Audio Logs

### audio.log

```text
{"timestamp":"2026-05-19T05:18:01.684Z","scope":"audio","level":"error","message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -vol 0.38 -buffer 4096 -fifo-ms 750 -prebuffer-ms 180 -prebuffer-timeout-ms 650 -eq-port 45210 -framed-stdin\"; mode=\"shared\"; elapsedMs=62; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: auto | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45210\"","payload":{"message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -vol 0.38 -buffer 4096 -fifo-ms 750 -prebuffer-ms 180 -prebuffer-timeout-ms 650 -eq-port 45210 -framed-stdin\"; mode=\"shared\"; elapsedMs=62; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: auto | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45210\"","stack":"Error: echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -vol 0.38 -buffer 4096 -fifo-ms 750 -prebuffer-ms 180 -prebuffer-timeout-ms 650 -eq-port 45210 -framed-stdin\"; mode=\"shared\"; elapsedMs=62; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: auto | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45210\"\n    at createHostError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2399:10)\n    at createError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2697:54)\n    at ChildProcess.<anonymous> (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2782:23)\n    at ChildProcess.emit (node:events:519:28)\n    at ChildProcess._handle.onexit (node:internal/child_process:293:12)","phase":"output-start","severity":"recoverable","details":{"outputMode":"shared","candidate":"default","requestedOutputSampleRate":48000,"channels":2},"audioStatus":{"host":"starting","state":"loading","outputDeviceId":null,"outputDeviceName":null,"outputDeviceType":null,"outputBackend":null,"activeOutputBackendImpl":null,"outputMode":"shared","sharedBackend":"auto","useJuceOutputRequested":false,"useJuceDecodeRequested":false,"activeDecodeBackendImpl":null,"dsdOutputModeRequested":"pcm","activeDsdOutputMode":null,"dsdNativeSampleRate":null,"dsdTransportSampleRate":null,"latencyProfile":{"basename":"balanced","pathHash":"c0905088ba5b8067"},"volume":0.38,"playbackRate":1,"playbackSpeedMode":"nightcore","replayGainEnabled":false,"replayGainMode":"track","replayGainAppliedDb":0,"replayGainPreventedClipping":false,"automix":{"enabled":false,"mode":"off","active":false,"transitionSeconds":null,"transitionStartedAtSeconds":null,"nextTrackId":null,"transitionMode":null,"fallbackReason":null,"beatAligned":false,"skipIntroSilence":false,"engine":null,"tempoRatio":null,"nextStartSeconds":null,"overlapSeconds":null,"advanceAtSeconds":null,"plannedTrackCount":0,"nextTransitionIndex":0},"currentFilePath":{"basename":"F0TB7Koqfuol8Jurc4BzQ3J+oY8JpIuptY5QulMY=","pathHash":"b3c96a638009f8da"},"currentTrackId":"streaming:netease:2014336709","durationSeconds":230.514,"positionSeconds":0,"channels":2,"codec":"flac","bitDepth":null,"bitrate":5401467,"fileSampleRate":null,"decoderOutputSampleRate":48000,"requestedOutputSampleRate":48000,"actualDeviceSampleRate":null,"sharedDeviceSampleRate":null,"resampling":false,"ffmpegPath":{"basename":"ffmpeg.exe","pathHash":"955f4f57b451fb81"},"ffmpegSource":"bundled","ffmpegVersion":"8.1.1-full_build-www.gyan.dev","ffmpegHealthy":true,"soxrAvailable":true,"resamplerEngine":"default","resamplerFallbackActive":false,"bitPerfectCandidate":false,"sampleRateMismatch":false,"eqEnabled":false,"channelBalanceEnabled":false,"dspActive":false,"preampDb":0,"eqPresetName":"Flat","clippingRisk":false,"audioLevels":{"inputPeakDb":null,"inputRmsDb":null,"estimatedOutputPeakDb":null,"estimatedOutputRmsDb":null,"headroomDb":null,"clipCount":0,"lastClipAt":null,"meterSource":"pre_native_estimated_post_dsp"},"bitPerfectDisabledReason":null,"sharedStabilityTier":"standard","nativeDeviceBufferFrames":null,"nativeRequestedBufferFrames":null,"nativeActualBufferFrames":null,"nativeOutputLatencyMs":null,"nativePositionStalenessMs":null,"nativeFifoCapacityFrames":null,"nativeStartupPrebufferFrames":null,"nativeBufferedFrames":null,"nativeBufferedMs":null,"nativeUnderrunCallbacks":0,"nativeUnderrunFrames":0,"lastSharedStabilityRecoveryAt":null,"warnings":["file_sample_rate_unknown_using_44100_fallback"],"error":null,"asioOutputChannelStart":null},"type":"audio","timestamp":"2026-05-19T05:18:01.678Z","sessionId":"[redacted]"}}
{"timestamp":"2026-05-19T05:18:07.227Z","scope":"audio","level":"error","message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45211 -framed-stdin\"; mode=\"shared\"; elapsedMs=61; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45211\"","payload":{"message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45211 -framed-stdin\"; mode=\"shared\"; elapsedMs=61; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45211\"","stack":"Error: echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45211 -framed-stdin\"; mode=\"shared\"; elapsedMs=61; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45211\"\n    at createHostError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2399:10)\n    at createError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2697:54)\n    at ChildProcess.<anonymous> (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2782:23)\n    at ChildProcess.emit (node:events:519:28)\n    at ChildProcess._handle.onexit (node:internal/child_process:293:12)","phase":"error","severity":"fatal","details":{"outputWarnings":["shared_output_recovered_safe_mode"],"currentOutputSettings":{"outputMode":"shared","latencyProfile":{"basename":"stable","pathHash":"f379ccb92b911644"},"sharedBackend":"windows","useJuceOutput":false,"useJuceDecode":false,"dsdOutputMode":"pcm","asioNativeDsdExperimentalEnabled":false,"asioUnavailableFallbackEnabled":false,"soxrFallbackEnabled":true,"releaseExclusiveOnPauseExperimentalEnabled":false,"volume":0.38,"playbackRate":1,"playbackSpeedMode":"nightcore"},"currentPlan":{"fileSampleRate":null,"decoderOutputSampleRate":48000,"requestedOutputSampleRate":48000,"actualDeviceSampleRate":null,"sharedDeviceSampleRate":null,"dsdOutputMode":"pcm","dsdNativeSampleRate":null,"dsdTransportSampleRate":null,"outputMode":"shared","resampling":false,"bitPerfectCandidate":false,"sampleRateMismatch":false,"warnings":["file_sample_rate_unknown_using_44100_fallback"]}},"audioStatus":{"host":"error","state":"error","outputDeviceId":null,"outputDeviceName":null,"outputDeviceType":null,"outputBackend":null,"activeOutputBackendImpl":null,"outputMode":"shared","sharedBackend":"windows","useJuceOutputRequested":false,"useJuceDecodeRequested":false,"activeDecodeBackendImpl":null,"dsdOutputModeRequested":"pcm","activeDsdOutputMode":null,"dsdNativeSampleRate":null,"dsdTransportSampleRate":null,"latencyProfile":{"basename":"stable","pathHash":"f379ccb92b911644"},"volume":0.38,"playbackRate":1,"playbackSpeedMode":"nightcore","replayGainEnabled":false,"replayGainMode":"track","replayGainAppliedDb":0,"replayGainPreventedClipping":false,"automix":{"enabled":false,"mode":"off","active":false,"transitionSeconds":null,"transitionStartedAtSeconds":null,"nextTrackId":null,"transitionMode":null,"fallbackReason":null,"beatAligned":false,"skipIntroSilence":false,"engine":null,"tempoRatio":null,"nextStartSeconds":null,"overlapSeconds":null,"advanceAtSeconds":null,"plannedTrackCount":0,"nextTransitionIndex":0},"currentFilePath":{"basename":"F0TB7Koqfuol8Jurc4BzQ3J+oY8JpIuptY5QulMY=","pathHash":"b3c96a638009f8da"},"currentTrackId":"streaming:netease:2014336709","durationSeconds":230.514,"positionSeconds":0,"channels":2,"codec":"flac","bitDepth":null,"bitrate":5401467,"fileSampleRate":null,"decoderOutputSampleRate":48000,"requestedOutputSampleRate":48000,"actualDeviceSampleRate":null,"sharedDeviceSampleRate":null,"resampling":false,"ffmpegPath":{"basename":"ffmpeg.exe","pathHash":"955f4f57b451fb81"},"ffmpegSource":"bundled","ffmpegVersion":"8.1.1-full_build-www.gyan.dev","ffmpegHealthy":true,"soxrAvailable":true,"resamplerEngine":"default","resamplerFallbackActive":false,"bitPerfectCandidate":false,"sampleRateMismatch":false,"eqEnabled":false,"channelBalanceEnabled":false,"dspActive":false,"preampDb":0,"eqPresetName":"Flat","clippingRisk":false,"audioLevels":{"inputPeakDb":null,"inputRmsDb":null,"estimatedOutputPeakDb":null,"estimatedOutputRmsDb":null,"headroomDb":null,"clipCount":0,"lastClipAt":null,"meterSource":"pre_native_estimated_post_dsp"},"bitPerfectDisabledReason":null,"sharedStabilityTier":"emergency","nativeDeviceBufferFrames":null,"nativeRequestedBufferFrames":null,"nativeActualBufferFrames":null,"nativeOutputLatencyMs":null,"nativePositionStalenessMs":null,"nativeFifoCapacityFrames":null,"nativeStartupPrebufferFrames":null,"nativeBufferedFrames":null,"nativeBufferedMs":null,"nativeUnderrunCallbacks":0,"nativeUnderrunFrames":0,"lastSharedStabilityRecoveryAt":null,"warnings":["file_sample_rate_unknown_using_44100_fallback","shared_output_recovered_safe_mode"],"error":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45211 -framed-stdin\"; mode=\"shared\"; elapsedMs=61; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45211\"","asioOutputChannelStart":null},"type":"audio","timestamp":"2026-05-19T05:18:07.191Z","sessionId":"[redacted]"}}
{"timestamp":"2026-05-19T05:18:36.288Z","scope":"audio","level":"error","message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -juce-output -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45212 -framed-stdin\"; mode=\"shared\"; elapsedMs=930; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using device index 0: Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] Trying JUCE device type Windows Audio for Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] createDevice starting for Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] createDevice completed in 794 ms for Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] device->open starting at 48000 Hz, 2 ch, buffer=8192\"","payload":{"message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -juce-output -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45212 -framed-stdin\"; mode=\"shared\"; elapsedMs=930; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using device index 0: Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] Trying JUCE device type Windows Audio for Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] createDevice starting for Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] createDevice completed in 794 ms for Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] device->open starting at 48000 Hz, 2 ch, buffer=8192\"","stack":"Error: echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -juce-output -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45212 -framed-stdin\"; mode=\"shared\"; elapsedMs=930; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using device index 0: Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] Trying JUCE device type Windows Audio for Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] createDevice starting for Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] createDevice completed in 794 ms for Realtek HD Audio 2nd output (Realtek High Definition Audio) | [echo-audio-host] device->open starting at 48000 Hz, 2 ch, buffer=8192\"\n    at createHostError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2399:10)\n    at createError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2697:54)\n    at ChildProcess.<anonymous> (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2782:23)\n    at ChildProcess.emit (node:events:519:28)\n    at ChildProcess._handle.onexit (node:internal/child_process:293:12)","phase":"output-start","severity":"recoverable","details":{"outputMode":"shared","candidate":"default","requestedOutputSampleRate":48000,"channels":2},"audioStatus":{"host":"starting","state":"loading","outputDeviceId":null,"outputDeviceName":null,"outputDeviceType":null,"outputBackend":null,"activeOutputBackendImpl":null,"outputMode":"shared","sharedBackend":"windows","useJuceOutputRequested":true,"useJuceDecodeRequested":true,"activeDecodeBackendImpl":null,"dsdOutputModeRequested":"pcm","activeDsdOutputMode":null,"dsdNativeSampleRate":null,"dsdTransportSampleRate":null,"latencyProfile":{"basename":"stable","pathHash":"f379ccb92b911644"},"volume":0.38,"playbackRate":1,"playbackSpeedMode":"nightcore","replayGainEnabled":false,"replayGainMode":"track","replayGainAppliedDb":0,"replayGainPreventedClipping":false,"automix":{"enabled":false,"mode":"off","active":false,"transitionSeconds":null,"transitionStartedAtSeconds":null,"nextTrackId":null,"transitionMode":null,"fallbackReason":null,"beatAligned":false,"skipIntroSilence":false,"engine":null,"tempoRatio":null,"nextStartSeconds":null,"overlapSeconds":null,"advanceAtSeconds":null,"plannedTrackCount":0,"nextTransitionIndex":0},"currentFilePath":{"basename":"CerwCI6JUs=","pathHash":"86f15e3074156ec2"},"currentTrackId":"streaming:netease:1818031620","durationSeconds":226.858,"positionSeconds":0,"channels":2,"codec":"flac","bitDepth":null,"bitrate":5195016,"fileSampleRate":null,"decoderOutputSampleRate":48000,"requestedOutputSampleRate":48000,"actualDeviceSampleRate":null,"sharedDeviceSampleRate":null,"resampling":false,"ffmpegPath":{"basename":"ffmpeg.exe","pathHash":"955f4f57b451fb81"},"ffmpegSource":"bundled","ffmpegVersion":"8.1.1-full_build-www.gyan.dev","ffmpegHealthy":true,"soxrAvailable":true,"resamplerEngine":"default","resamplerFallbackActive":false,"bitPerfectCandidate":false,"sampleRateMismatch":false,"eqEnabled":false,"channelBalanceEnabled":false,"dspActive":false,"preampDb":0,"eqPresetName":"Flat","clippingRisk":false,"audioLevels":{"inputPeakDb":null,"inputRmsDb":null,"estimatedOutputPeakDb":null,"estimatedOutputRmsDb":null,"headroomDb":null,"clipCount":0,"lastClipAt":null,"meterSource":"pre_native_estimated_post_dsp"},"bitPerfectDisabledReason":null,"sharedStabilityTier":"standard","nativeDeviceBufferFrames":null,"nativeRequestedBufferFrames":null,"nativeActualBufferFrames":null,"nativeOutputLatencyMs":null,"nativePositionStalenessMs":null,"nativeFifoCapacityFrames":null,"nativeStartupPrebufferFrames":null,"nativeBufferedFrames":null,"nativeBufferedMs":null,"nativeUnderrunCallbacks":0,"nativeUnderrunFrames":0,"lastSharedStabilityRecoveryAt":null,"warnings":["file_sample_rate_unknown_using_44100_fallback"],"error":null,"asioOutputChannelStart":null},"type":"audio","timestamp":"2026-05-19T05:18:36.282Z","sessionId":"[redacted]"}}
{"timestamp":"2026-05-19T05:18:39.074Z","scope":"audio","level":"error","message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45213 -framed-stdin\"; mode=\"shared\"; elapsedMs=63; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45213\"","payload":{"message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45213 -framed-stdin\"; mode=\"shared\"; elapsedMs=63; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45213\"","stack":"Error: echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45213 -framed-stdin\"; mode=\"shared\"; elapsedMs=63; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45213\"\n    at createHostError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2399:10)\n    at createError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2697:54)\n    at ChildProcess.<anonymous> (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2782:23)\n    at ChildProcess.emit (node:events:519:28)\n    at ChildProcess._handle.onexit (node:internal/child_process:293:12)","phase":"output-start","severity":"recoverable","details":{"outputMode":"shared","recovered":false,"juceFallback":true},"audioStatus":{"host":"starting","state":"loading","outputDeviceId":null,"outputDeviceName":null,"outputDeviceType":null,"outputBackend":null,"activeOutputBackendImpl":null,"outputMode":"shared","sharedBackend":"windows","useJuceOutputRequested":true,"useJuceDecodeRequested":true,"activeDecodeBackendImpl":null,"dsdOutputModeRequested":"pcm","activeDsdOutputMode":null,"dsdNativeSampleRate":null,"dsdTransportSampleRate":null,"latencyProfile":{"basename":"stable","pathHash":"f379ccb92b911644"},"volume":0.38,"playbackRate":1,"playbackSpeedMode":"nightcore","replayGainEnabled":false,"replayGainMode":"track","replayGainAppliedDb":0,"replayGainPreventedClipping":false,"automix":{"enabled":false,"mode":"off","active":false,"transitionSeconds":null,"transitionStartedAtSeconds":null,"nextTrackId":null,"transitionMode":null,"fallbackReason":null,"beatAligned":false,"skipIntroSilence":false,"engine":null,"tempoRatio":null,"nextStartSeconds":null,"overlapSeconds":null,"advanceAtSeconds":null,"plannedTrackCount":0,"nextTransitionIndex":0},"currentFilePath":{"basename":"CerwCI6JUs=","pathHash":"86f15e3074156ec2"},"currentTrackId":"streaming:netease:1818031620","durationSeconds":226.858,"positionSeconds":0,"channels":2,"codec":"flac","bitDepth":null,"bitrate":5195016,"fileSampleRate":null,"decoderOutputSampleRate":48000,"requestedOutputSampleRate":48000,"actualDeviceSampleRate":null,"sharedDeviceSampleRate":null,"resampling":false,"ffmpegPath":{"basename":"ffmpeg.exe","pathHash":"955f4f57b451fb81"},"ffmpegSource":"bundled","ffmpegVersion":"8.1.1-full_build-www.gyan.dev","ffmpegHealthy":true,"soxrAvailable":true,"resamplerEngine":"default","resamplerFallbackActive":false,"bitPerfectCandidate":false,"sampleRateMismatch":false,"eqEnabled":false,"channelBalanceEnabled":false,"dspActive":false,"preampDb":0,"eqPresetName":"Flat","clippingRisk":false,"audioLevels":{"inputPeakDb":null,"inputRmsDb":null,"estimatedOutputPeakDb":null,"estimatedOutputRmsDb":null,"headroomDb":null,"clipCount":0,"lastClipAt":null,"meterSource":"pre_native_estimated_post_dsp"},"bitPerfectDisabledReason":null,"sharedStabilityTier":"standard","nativeDeviceBufferFrames":null,"nativeRequestedBufferFrames":null,"nativeActualBufferFrames":null,"nativeOutputLatencyMs":null,"nativePositionStalenessMs":null,"nativeFifoCapacityFrames":null,"nativeStartupPrebufferFrames":null,"nativeBufferedFrames":null,"nativeBufferedMs":null,"nativeUnderrunCallbacks":0,"nativeUnderrunFrames":0,"lastSharedStabilityRecoveryAt":null,"warnings":["file_sample_rate_unknown_using_44100_fallback","juce_output_fell_back_to_native","juce_shared_output_fell_back_to_native"],"error":null,"asioOutputChannelStart":null},"type":"audio","timestamp":"2026-05-19T05:18:39.069Z","sessionId":"[redacted]"}}
{"timestamp":"2026-05-19T05:18:44.577Z","scope":"audio","level":"error","message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin\"; mode=\"shared\"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214\"","payload":{"message":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin\"; mode=\"shared\"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214\"","stack":"Error: echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin\"; mode=\"shared\"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214\"\n    at createHostError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2399:10)\n    at createError (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2697:54)\n    at ChildProcess.<anonymous> (file:///D:/music/ECHO%20NEXT/resources/app.asar/out/main/index.js:2782:23)\n    at ChildProcess.emit (node:events:519:28)\n    at ChildProcess._handle.onexit (node:internal/child_process:293:12)","phase":"error","severity":"fatal","details":{"outputWarnings":["juce_output_fell_back_to_native","juce_shared_output_fell_back_to_native","shared_output_recovered_safe_mode"],"currentOutputSettings":{"outputMode":"shared","latencyProfile":{"basename":"stable","pathHash":"f379ccb92b911644"},"sharedBackend":"windows","useJuceOutput":false,"useJuceDecode":true,"dsdOutputMode":"pcm","asioNativeDsdExperimentalEnabled":false,"asioUnavailableFallbackEnabled":false,"soxrFallbackEnabled":true,"releaseExclusiveOnPauseExperimentalEnabled":false,"volume":0.38,"playbackRate":1,"playbackSpeedMode":"nightcore"},"currentPlan":{"fileSampleRate":null,"decoderOutputSampleRate":48000,"requestedOutputSampleRate":48000,"actualDeviceSampleRate":null,"sharedDeviceSampleRate":null,"dsdOutputMode":"pcm","dsdNativeSampleRate":null,"dsdTransportSampleRate":null,"outputMode":"shared","resampling":false,"bitPerfectCandidate":false,"sampleRateMismatch":false,"warnings":["file_sample_rate_unknown_using_44100_fallback"]}},"audioStatus":{"host":"error","state":"error","outputDeviceId":null,"outputDeviceName":null,"outputDeviceType":null,"outputBackend":null,"activeOutputBackendImpl":null,"outputMode":"shared","sharedBackend":"windows","useJuceOutputRequested":true,"useJuceDecodeRequested":true,"activeDecodeBackendImpl":null,"dsdOutputModeRequested":"pcm","activeDsdOutputMode":null,"dsdNativeSampleRate":null,"dsdTransportSampleRate":null,"latencyProfile":{"basename":"stable","pathHash":"f379ccb92b911644"},"volume":0.38,"playbackRate":1,"playbackSpeedMode":"nightcore","replayGainEnabled":false,"replayGainMode":"track","replayGainAppliedDb":0,"replayGainPreventedClipping":false,"automix":{"enabled":false,"mode":"off","active":false,"transitionSeconds":null,"transitionStartedAtSeconds":null,"nextTrackId":null,"transitionMode":null,"fallbackReason":null,"beatAligned":false,"skipIntroSilence":false,"engine":null,"tempoRatio":null,"nextStartSeconds":null,"overlapSeconds":null,"advanceAtSeconds":null,"plannedTrackCount":0,"nextTransitionIndex":0},"currentFilePath":{"basename":"CerwCI6JUs=","pathHash":"86f15e3074156ec2"},"currentTrackId":"streaming:netease:1818031620","durationSeconds":226.858,"positionSeconds":0,"channels":2,"codec":"flac","bitDepth":null,"bitrate":5195016,"fileSampleRate":null,"decoderOutputSampleRate":48000,"requestedOutputSampleRate":48000,"actualDeviceSampleRate":null,"sharedDeviceSampleRate":null,"resampling":false,"ffmpegPath":{"basename":"ffmpeg.exe","pathHash":"955f4f57b451fb81"},"ffmpegSource":"bundled","ffmpegVersion":"8.1.1-full_build-www.gyan.dev","ffmpegHealthy":true,"soxrAvailable":true,"resamplerEngine":"default","resamplerFallbackActive":false,"bitPerfectCandidate":false,"sampleRateMismatch":false,"eqEnabled":false,"channelBalanceEnabled":false,"dspActive":false,"preampDb":0,"eqPresetName":"Flat","clippingRisk":false,"audioLevels":{"inputPeakDb":null,"inputRmsDb":null,"estimatedOutputPeakDb":null,"estimatedOutputRmsDb":null,"headroomDb":null,"clipCount":0,"lastClipAt":null,"meterSource":"pre_native_estimated_post_dsp"},"bitPerfectDisabledReason":null,"sharedStabilityTier":"emergency","nativeDeviceBufferFrames":null,"nativeRequestedBufferFrames":null,"nativeActualBufferFrames":null,"nativeOutputLatencyMs":null,"nativePositionStalenessMs":null,"nativeFifoCapacityFrames":null,"nativeStartupPrebufferFrames":null,"nativeBufferedFrames":null,"nativeBufferedMs":null,"nativeUnderrunCallbacks":0,"nativeUnderrunFrames":0,"lastSharedStabilityRecoveryAt":null,"warnings":["file_sample_rate_unknown_using_44100_fallback","juce_output_fell_back_to_native","juce_shared_output_fell_back_to_native","shared_output_recovered_safe_mode"],"error":"echo-audio-host exit_code_3221225477; host=\"D:\\\\music\\\\ECHO NEXT\\\\resources\\\\echo-audio-host.exe\"; args=\"-sr 48000 -ch 2 -shared-backend windows -vol 0.38 -buffer 8192 -fifo-ms 1500 -prebuffer-ms 300 -prebuffer-timeout-ms 1000 -eq-port 45214 -framed-stdin\"; mode=\"shared\"; elapsedMs=68; exitCodeHex=0xC0000005; nativeCrash=access_violation; stderrTail=\"[echo-audio-host] Shared backend preference: windows | [echo-audio-host] Using legacy WASAPI shared device index -1: Default Windows Audio | [echo-audio-host] EQ control listener ready on port 45214\"","asioOutputChannelStart":null},"type":"audio","timestamp":"2026-05-19T05:18:44.571Z","sessionId":"[redacted]"}}
```

### main.log

```text
{"timestamp":"2026-05-19T05:17:29.354Z","scope":"main","level":"info","message":"diagnostics session started","payload":{"sessionId":"[redacted]"}}
{"timestamp":"2026-05-19T05:17:29.407Z","scope":"main","level":"info","message":"[SMTC] Windows SMTC host initialized","payload":{"hostPath":{"basename":"echo-smtc-host.exe","pathHash":"560e98e3f19ca36a"}}}
{"timestamp":"2026-05-19T05:17:29.468Z","scope":"main","level":"warn","message":"[SMTC] Windows SMTC host stdin closed; using no-op bridge mode","payload":{"hostPath":{"basename":"echo-smtc-host.exe","pathHash":"560e98e3f19ca36a"},"error":"write EPIPE"}}
{"timestamp":"2026-05-19T05:17:29.471Z","scope":"main","level":"warn","message":"[SMTC] Windows SMTC host exited unexpectedly","payload":{"hostPath":{"basename":"echo-smtc-host.exe","pathHash":"560e98e3f19ca36a"},"code":3221225477,"signal":null}}
```

## Notes For Audio Debugging

- timeout_waiting_for_ready usually means echo-audio-host was spawned but did not report ready before the main process timeout.
- Useful fields: phase, severity, recovered, outputMode, outputDeviceId, outputDeviceName, warnings, stderrTail, elapsedMs, and mode.
- If recovered is true, playback continued after falling back to default shared output or safe shared output.

## Privacy

This report is generated locally. Music files, cover binaries, lyric contents, tokens, cookies, and authentication secrets are not included. Local media paths are reduced to basename plus pathHash when captured through diagnostics snapshots.

