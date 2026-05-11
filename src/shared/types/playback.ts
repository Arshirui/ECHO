export type PlaybackStatus = {
  state: 'idle' | 'playing' | 'paused';
  currentTrackId: string | null;
  positionMs: number;
};
