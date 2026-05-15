// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOutputSettings, readRememberedAudioOutput, resolveSupportedLatencyProfile, writeRememberedAudioOutput } from './audioOutputMemory';

vi.mock('../../utils/echoBridge', () => ({
  getAppBridge: () => undefined,
}));

beforeEach(() => {
  window.localStorage.clear();
});

describe('audioOutputMemory', () => {
  it('keeps low latency supported for WASAPI exclusive output', () => {
    expect(resolveSupportedLatencyProfile('exclusive', 'lowLatency')).toBe('lowLatency');
    expect(createOutputSettings('exclusive', null, 'lowLatency')).toMatchObject({
      outputMode: 'exclusive',
      latencyProfile: 'lowLatency',
    });
  });

  it('persists WASAPI exclusive low-latency output memory', () => {
    writeRememberedAudioOutput({
      enabled: true,
      outputMode: 'exclusive',
      latencyProfile: 'lowLatency',
      deviceIndex: 2,
      deviceName: 'USB DAC',
    });

    expect(readRememberedAudioOutput()).toMatchObject({
      enabled: true,
      outputMode: 'exclusive',
      latencyProfile: 'lowLatency',
      deviceIndex: 2,
      deviceName: 'USB DAC',
    });
  });
});
