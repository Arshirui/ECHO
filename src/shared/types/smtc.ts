export type SmtcPlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'error';

export type SmtcButtonCommand = 'play' | 'pause' | 'playPause' | 'previous' | 'next' | 'stop';

export type SmtcSeekCommand = {
  type: 'seek';
  positionSeconds: number;
};

export type SmtcCommand = SmtcButtonCommand | SmtcSeekCommand;

export type SmtcTrackMetadata = {
  trackId: string | null;
  title: string;
  artist: string;
  album: string | null;
  albumArtist: string | null;
  durationSeconds: number;
  positionSeconds: number;
  coverPath: string | null;
  coverUrl: string | null;
};

export type SmtcEnabledActions = {
  play: boolean;
  pause: boolean;
  previous: boolean;
  next: boolean;
  seek?: boolean;
};
