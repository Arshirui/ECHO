import { FolderPlus } from 'lucide-react';
import type { AppRoute, AppRouteId } from '../../app/routes';
import { useI18n } from '../../i18n/I18nProvider';

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
  const { t } = useI18n();
  const mainRoutes = routes.filter((route) => route.placement === 'main');
  const utilityRoutes = routes.filter((route) => route.placement === 'utility');

  return (
    <aside className="sidebar" aria-label={t('app.navigation.main')}>
      <nav className="nav-list">
        {mainRoutes.map((route) => {
          const Icon = route.icon;
          const isActive = route.id === activeRouteId;
          const label = route.labelKey ? t(route.labelKey) : route.label;

          return (
            <button
              className="nav-item"
              data-active={isActive}
              key={route.id}
              onClick={() => onRouteChange(route.id)}
              type="button"
              title={label}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-meta">
        <button className="sidebar-folder" type="button" onClick={onImportFolder} title={t('route.importFolder.label')} aria-label={t('route.importFolder.label')}>
          <FolderPlus size={16} />
          <span>{t('route.importFolder.label')}</span>
        </button>
      </div>

      <nav className="nav-list utility-nav" aria-label={t('app.navigation.utility')}>
        {utilityRoutes.map((route) => {
          const Icon = route.icon;
          const isActive = route.id === activeRouteId;
          const isImportFolder = route.id === 'import-folder';
          const isImportFile = route.id === 'import-file';
          const isDirectAction = isImportFolder || isImportFile;
          const label = route.labelKey ? t(route.labelKey) : route.label;

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
              title={label}
              aria-label={label}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
