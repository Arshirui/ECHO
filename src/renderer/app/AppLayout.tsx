import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { PlayerBar } from '../components/player/PlayerBar';
import { Sidebar } from '../components/layout/Sidebar';
import type { AppRoute, AppRouteId } from './routes';

type AppLayoutProps = {
  routes: AppRoute[];
};

export const AppLayout = ({ routes }: AppLayoutProps): JSX.Element => {
  const [activeRouteId, setActiveRouteId] = useState<AppRouteId>('songs');
  const activeRoute = useMemo(
    () => routes.find((route) => route.id === activeRouteId) ?? routes[0],
    [activeRouteId, routes],
  );
  const pageContent: ReactNode = activeRoute.element;

  return (
    <div className="app-shell">
      <Sidebar routes={routes} activeRouteId={activeRouteId} onRouteChange={setActiveRouteId} />

      <main className="page-surface" key={activeRoute.id}>
        {pageContent}
      </main>

      <PlayerBar />
    </div>
  );
};
