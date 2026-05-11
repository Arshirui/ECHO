import { memo } from 'react';
import { TrackRow } from './TrackRow';
import type { TrackListItem } from './TrackRow';

type TrackListProps = {
  tracks: TrackListItem[];
  currentTrackId: string;
};

export const TrackList = memo(({ tracks, currentTrackId }: TrackListProps): JSX.Element => {
  return (
    <section className="track-list-card" aria-label="歌曲列表">
      <div className="track-list" role="list" data-virtual-ready="true" data-estimated-row-height="70">
        {tracks.map((track) => (
          <TrackRow isPlaying={track.id === currentTrackId} key={track.id} track={track} />
        ))}
      </div>
    </section>
  );
});

TrackList.displayName = 'TrackList';
