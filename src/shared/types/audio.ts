export type AudioStatus = {
  host: 'not-initialized' | 'ready' | 'unavailable';
  outputDeviceId: string | null;
};
