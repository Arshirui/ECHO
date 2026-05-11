import { Library } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export const PlaylistsPage = (): JSX.Element => {
  return (
    <div className="page-stack">
      <EmptyState
        icon={Library}
        title="Playlists are planned after the base catalog is stable."
        description="User playlists and smart collections will live on top of SQLite-backed track identity."
        meta="No playlist model is invented before Library Core lands."
      />
    </div>
  );
};
