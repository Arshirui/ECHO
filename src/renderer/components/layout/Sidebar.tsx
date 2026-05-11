import type { AppRoute, AppRouteId } from '../../app/routes';

type SidebarProps = {
  routes: AppRoute[];
  activeRouteId: AppRouteId;
  onRouteChange: (routeId: AppRouteId) => void;
};

export const Sidebar = ({ routes, activeRouteId, onRouteChange }: SidebarProps): JSX.Element => {
  const mainRoutes = routes.filter((route) => route.placement === 'main');
  const utilityRoutes = routes.filter((route) => route.placement === 'utility');

  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="brand-block">
        <div className="brand-name">ECHO</div>
      </div>

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
        <button className="sidebar-folder" type="button">
          <span>已导入文件夹</span>
          <span aria-hidden="true">⌄</span>
        </button>
      </div>

      <nav className="nav-list utility-nav" aria-label="底部导航">
        {utilityRoutes.map((route) => {
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
              <Icon size={17} />
              <span>{route.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
