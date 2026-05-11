export const IpcChannels = {
  AppGetVersion: 'app:get-version',
  LibraryGetSummary: 'library:get-summary',
  PlaybackGetStatus: 'playback:get-status',
  AudioGetStatus: 'audio:get-status',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
