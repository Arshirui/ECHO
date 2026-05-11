import { AudioLines } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export const NowPlayingPage = (): JSX.Element => {
  return (
    <div className="now-playing-shell">
      <div className="now-playing-art" aria-hidden="true">
        <div className="record-ring" />
      </div>
      <EmptyState
        icon={AudioLines}
        title="Playback is intentionally silent in Phase 0."
        description="AudioSession, NativeOutputBridge, and PlaybackClock will attach here after the core playback boundary exists."
        meta="High-frequency playback state must stay outside global app renders."
      />
    </div>
  );
};
