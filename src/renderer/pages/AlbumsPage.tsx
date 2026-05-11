import { Disc3 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export const AlbumsPage = (): JSX.Element => {
  return (
    <div className="album-wall page-stack">
      <div className="album-grid-preview" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="album-tile" key={index} />
        ))}
      </div>
      <EmptyState
        icon={Disc3}
        title="Albums will appear as a fast thumbnail wall."
        description="Album grouping belongs to AlbumService, with album artist boundaries preserved before the UI ever renders."
        meta="Phase 0 keeps this surface visual only."
      />
    </div>
  );
};
