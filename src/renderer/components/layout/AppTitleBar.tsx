import {
  Disc3,
  FileAudio,
  FolderPlus,
  Headphones,
  Library,
  Minus,
  Radio,
  Settings,
  Square,
  X,
} from 'lucide-react';
import type { AppRouteId } from '../../app/routes';

type AppTitleBarProps = {
  activeRouteId: AppRouteId;
  onRouteChange: (routeId: AppRouteId) => void;
  onImportFolder: () => void;
  onImportFile: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

type TitleBarAction = {
  id: string;
  label: string;
  icon: typeof Library;
  active?: boolean;
  onClick: () => void;
};

export const AppTitleBar = ({
  activeRouteId,
  onRouteChange,
  onImportFolder,
  onImportFile,
  onMinimize,
  onToggleMaximize,
  onClose,
}: AppTitleBarProps): JSX.Element => {
  const actions: TitleBarAction[] = [
    {
      id: 'songs',
      label: 'Songs',
      icon: Library,
      active: activeRouteId === 'songs',
      onClick: () => onRouteChange('songs'),
    },
    {
      id: 'albums',
      label: 'Albums',
      icon: Disc3,
      active: activeRouteId === 'albums',
      onClick: () => onRouteChange('albums'),
    },
    {
      id: 'import-folder',
      label: 'Import Folder',
      icon: FolderPlus,
      onClick: onImportFolder,
    },
    {
      id: 'import-file',
      label: 'Import File',
      icon: FileAudio,
      onClick: onImportFile,
    },
    {
      id: 'audio-settings',
      label: 'Audio Settings',
      icon: Headphones,
      active: activeRouteId === 'audio-settings',
      onClick: () => onRouteChange('audio-settings'),
    },
    {
      id: 'streaming',
      label: 'Streaming',
      icon: Radio,
      active: activeRouteId === 'streaming',
      onClick: () => onRouteChange('streaming'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      active: activeRouteId === 'settings',
      onClick: () => onRouteChange('settings'),
    },
  ];

  return (
    <header className="app-titlebar" aria-label="Application toolbar">
      <div className="app-titlebar-brand">
        <strong>ECHO</strong>
        <span>Next</span>
      </div>

      <div className="app-titlebar-actions" aria-label="Quick actions">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <button
              className="titlebar-action"
              data-active={action.active ? 'true' : 'false'}
              key={action.id}
              type="button"
              aria-label={action.label}
              title={action.label}
              onClick={action.onClick}
            >
              <Icon size={17} />
            </button>
          );
        })}
      </div>

      <div className="window-controls" aria-label="Window controls">
        <button className="window-control" type="button" aria-label="Minimize" title="Minimize" onClick={onMinimize}>
          <Minus size={16} />
        </button>
        <button
          className="window-control"
          type="button"
          aria-label="Maximize"
          title="Maximize"
          onClick={onToggleMaximize}
        >
          <Square size={14} />
        </button>
        <button className="window-control window-control--close" type="button" aria-label="Close" title="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </header>
  );
};
