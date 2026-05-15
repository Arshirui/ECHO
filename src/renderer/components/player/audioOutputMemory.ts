import type { AudioDeviceInfo, AudioLatencyProfile, AudioOutputMode, AudioOutputSettings } from '../../../shared/types/audio';
import type { RememberedAudioOutput } from '../../../shared/types/appSettings';
import { getAppBridge } from '../../utils/echoBridge';

const storageKey = 'echo-next.audio-output-memory';

export const resolveSupportedLatencyProfile = (
  _outputMode: AudioOutputMode,
  latencyProfile: AudioLatencyProfile,
): AudioLatencyProfile => {
  return latencyProfile;
};

export const readRememberedAudioOutput = (): RememberedAudioOutput => {
  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return { enabled: false, outputMode: 'shared', latencyProfile: 'balanced' };
    }

    const parsed = JSON.parse(raw) as Partial<RememberedAudioOutput>;
    const outputMode = parsed.outputMode === 'exclusive' || parsed.outputMode === 'asio' ? parsed.outputMode : 'shared';
    const latencyProfile =
      parsed.latencyProfile === 'stable' || parsed.latencyProfile === 'balanced' || parsed.latencyProfile === 'lowLatency'
        ? parsed.latencyProfile
        : 'balanced';
    const bufferSizeFrames = Number(parsed.bufferSizeFrames);
    const remembered: RememberedAudioOutput = {
      enabled: parsed.enabled === true,
      outputMode,
      latencyProfile: resolveSupportedLatencyProfile(outputMode, latencyProfile),
      deviceIndex: Number.isInteger(Number(parsed.deviceIndex)) ? Number(parsed.deviceIndex) : undefined,
      deviceName: typeof parsed.deviceName === 'string' && parsed.deviceName.trim() ? parsed.deviceName : undefined,
    };

    if (Number.isFinite(bufferSizeFrames) && bufferSizeFrames > 0) {
      remembered.bufferSizeFrames = Math.round(bufferSizeFrames);
    }

    return remembered;
  } catch {
    return { enabled: false, outputMode: 'shared', latencyProfile: 'balanced' };
  }
};

export const writeRememberedAudioOutput = (settings: RememberedAudioOutput): void => {
  window.localStorage.setItem(storageKey, JSON.stringify(settings));
  void getAppBridge()?.setSettings({ rememberedAudioOutput: settings }).catch(() => undefined);
};

export const loadPersistedRememberedAudioOutput = async (): Promise<RememberedAudioOutput> => {
  const appBridge = getAppBridge();
  const localOutput = readRememberedAudioOutput();

  if (!appBridge) {
    return localOutput;
  }

  const settings = await appBridge.getSettings();
  const remembered = (settings.appMemoryVersion ?? 0) < 1 && localOutput.enabled
    ? localOutput
    : (settings.rememberedAudioOutput ?? { enabled: false, outputMode: 'shared', latencyProfile: 'balanced' });
  window.localStorage.setItem(storageKey, JSON.stringify(remembered));

  if ((settings.appMemoryVersion ?? 0) < 1 && localOutput.enabled) {
    void appBridge.setSettings({ rememberedAudioOutput: remembered }).catch(() => undefined);
  }

  return remembered;
};

export const createOutputSettings = (
  outputMode: AudioOutputMode,
  device: AudioDeviceInfo | null,
  latencyProfile: AudioLatencyProfile = 'balanced',
): AudioOutputSettings => {
  const settings: AudioOutputSettings = { outputMode, latencyProfile: resolveSupportedLatencyProfile(outputMode, latencyProfile) };

  if (device) {
    settings.deviceIndex = device.index;
    settings.deviceName = device.name;
  }

  return settings;
};
