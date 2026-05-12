import { FolderPlus } from 'lucide-react';
import type { AppRoute, AppRouteId } from '../../app/routes';

type SidebarProps = {
  routes: AppRoute[];
  activeRouteId: AppRouteId;
  onRouteChange: (routeId: AppRouteId) => void;
  onImportFolder: () => void;
  onImportFile: () => void;
};

export const Sidebar = ({
  routes,
  activeRouteId,
  onRouteChange,
  onImportFolder,
  onImportFile,
}: SidebarProps): JSX.Element => {
  const mainRoutes = routes.filter((route) => route.placement === 'main');
  const utilityRoutes = routes.filter((route) => route.placement === 'utility');

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <nav className="nav-list">
        {mainRoutes.map((route) => {
          const Icon = route.icon;
          const isActive = route.id === activeRouteId;

          return (
            <button
              className="nav-item"
              data-active={isActive}
              key={route.id}
              onClick={() => onRouteChange(route.id)}
              type="button"
              title={route.label}
            >
              <Icon size={18} />
              <span>{route.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-meta">
        <button className="sidebar-folder" type="button" onClick={onImportFolder} title="Choose Folder" aria-label="Choose Folder">
          <FolderPlus size={16} />
          <span>Choose Folder</span>
        </button>
      </div>

      <nav className="nav-list utility-nav" aria-label="Utility navigation">
        {utilityRoutes.map((route) => {
          const Icon = route.icon;
          const isActive = route.id === activeRouteId;
          const isImportFolder = route.id === 'import-folder';
          const isImportFile = route.id === 'import-file';
          const isDirectAction = isImportFolder || isImportFile;

          return (
            <button
              className="nav-item"
              data-active={isDirectAction ? false : isActive}
              key={route.id}
              onClick={
                isImportFolder
                  ? onImportFolder
                  : isImportFile
                    ? onImportFile
                    : () => onRouteChange(route.id)
              }
              type="button"
              title={route.label}
              aria-label={route.label}
            >
              <Icon size={17} />
              <span>{route.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
