import { Mic2 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export const ArtistsPage = (): JSX.Element => {
  return (
    <div className="page-stack">
      <div className="artist-columns" aria-hidden="true">
        <div />
        <div />
        <div />
      </div>
      <EmptyState
        icon={Mic2}
        title="Artist views are reserved for the library core."
        description="ArtistService will own artist and album artist normalization, including basic multi-artist handling."
        meta="The renderer only receives display-ready slices."
      />
    </div>
  );
};
