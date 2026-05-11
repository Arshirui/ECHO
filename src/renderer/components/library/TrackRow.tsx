import { memo } from 'react';
import type { CSSProperties } from 'react';
import { Heart, ListPlus, MoreHorizontal, Music2 } from 'lucide-react';

export type HifiTagKind = 'flac' | 'lossless' | 'depth' | 'rate' | 'bitrate' | 'bpm' | 'dsf' | 'hires';

export type HifiTag = {
  label: string;
  kind: HifiTagKind;
};

export type TrackListItem = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  tags: HifiTag[];
  cover?: {
    from: string;
    to: string;
  };
};

type TrackRowProps = {
  track: TrackListItem;
  isPlaying: boolean;
};

type CoverStyle = CSSProperties & {
  '--cover-from'?: string;
  '--cover-to'?: string;
};

const tagClassNameByKind: Record<HifiTagKind, string> = {
  flac: 'tag-flac',
  lossless: 'tag-lossless',
  depth: 'tag-depth',
  rate: 'tag-depth',
  bitrate: 'tag-bitrate',
  bpm: 'tag-bpm',
  dsf: 'tag-dsf',
  hires: 'tag-hires',
};

export const TrackRow = memo(
  ({ track, isPlaying }: TrackRowProps): JSX.Element => {
    const coverStyle: CoverStyle | undefined = track.cover
      ? {
          '--cover-from': track.cover.from,
          '--cover-to': track.cover.to,
        }
      : undefined;

    return (
      <div className="track-row" data-playing={isPlaying} role="listitem">
        <div className="track-cover" data-empty={!track.cover} style={coverStyle} aria-hidden="true">
          {track.cover ? <div className="cover-sheen" /> : <Music2 size={20} />}
        </div>

        <div className="track-main">
          <div className="track-title-row">
            {isPlaying ? <span className="playing-dot" aria-hidden="true" /> : null}
            <strong className="track-title">{track.title}</strong>
          </div>
          <div className="track-subtitle">
            {track.artist} - {track.album}
          </div>
          <div className="tag-row" aria-label="音频规格">
            {track.tags.map((tag) => (
              <span className={`hifi-tag ${tagClassNameByKind[tag.kind]}`} key={`${track.id}-${tag.label}`}>
                {tag.label}
              </span>
            ))}
          </div>
        </div>

        <div className="track-duration">{track.duration}</div>

        <div className="track-actions" aria-label={`${track.title} 操作`}>
          <button className="row-action" type="button" aria-label="喜欢" title="喜欢">
            <Heart size={16} />
          </button>
          <button className="row-action" type="button" aria-label="加入队列" title="加入队列">
            <ListPlus size={16} />
          </button>
          <button className="row-action" type="button" aria-label="更多" title="更多">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
    );
  },
  (previous, next) => previous.track === next.track && previous.isPlaying === next.isPlaying,
);

TrackRow.displayName = 'TrackRow';
