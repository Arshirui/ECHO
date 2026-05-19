import { describe, expect, it } from 'vitest';
import { formatAudioHostError, shouldSuppressAudioHostError } from './audioErrorFormat';

describe('audio error formatting', () => {
  it('suppresses non-actionable playback control errors', () => {
    const messages = [
      "Error invoking remote method 'playback:play-local-file': Error: eq_control_disconnected",
      'eq_control_closed',
      'eq_control_sync_skipped',
      'audio_session_run_cancelled',
    ];

    for (const message of messages) {
      expect(shouldSuppressAudioHostError(message)).toBe(true);
      expect(formatAudioHostError(message)).toBeNull();
    }
  });

  it('keeps actionable playback errors visible', () => {
    const message = 'echo-audio-host spawn_error: missing binary';

    expect(shouldSuppressAudioHostError(message)).toBe(false);
    expect(formatAudioHostError(message)).toBeTruthy();
  });

  it('formats invalid executable spawn errors as an audio engine startup problem', () => {
    const message = "Error invoking remote method 'playback:play-local-file': Error: spawn EFTYPE";

    expect(formatAudioHostError(message)).toContain('音频引擎无法启动');
  });

  it('formats Windows native access violations without exposing the raw IPC error', () => {
    const message =
      "Error invoking remote method 'playback:play-media-item': Error: echo-audio-host exit_code_3221225477; mode=\"shared\"; exitCodeHex=0xC0000005; nativeCrash=access_violation";

    const formatted = formatAudioHostError(message);

    expect(formatted).toContain('音频引擎在启动 Windows 共享输出时崩溃');
    expect(formatted).not.toContain('Error invoking remote method');
  });

  it('formats signed native access violation exit codes without exposing the raw IPC error', () => {
    const message =
      "Error invoking remote method 'playback:play-media-item': Error: echo-audio-host exit_code_-3221225477; mode=\"shared\"";

    const formatted = formatAudioHostError(message);

    expect(formatted).toContain('音频引擎在启动 Windows 共享输出时崩溃');
    expect(formatted).not.toContain('Error invoking remote method');
  });
});
