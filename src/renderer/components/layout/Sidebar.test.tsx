// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FilePlus2, FolderPlus, Music2, Settings } from 'lucide-react';
import { Sidebar } from './Sidebar';
import type { AppRoute } from '../../app/routes';

const routes: AppRoute[] = [
  {
    id: 'songs',
    label: 'Songs',
    description: 'Songs',
    icon: Music2,
    placement: 'main',
    element: <div>Songs</div>,
  },
  {
    id: 'import-folder',
    label: 'Import Folder',
    description: 'Import Folder',
    icon: FolderPlus,
    placement: 'utility',
    element: <div>Import Folder</div>,
  },
  {
    id: 'import-file',
    label: 'Import File',
    description: 'Import File',
    icon: FilePlus2,
    placement: 'utility',
    element: <div>Import File</div>,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Settings',
    icon: Settings,
    placement: 'utility',
    element: <div>Settings</div>,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Sidebar direct import actions', () => {
  it('opens the folder picker from Import Folder without navigating', async () => {
    const onRouteChange = vi.fn();
    const onImportFolder = vi.fn();
    const onImportFile = vi.fn();

    render(
      <Sidebar
        routes={routes}
        activeRouteId="songs"
        onRouteChange={onRouteChange}
        onImportFolder={onImportFolder}
        onImportFile={onImportFile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import Folder' }));

    await waitFor(() => expect(onImportFolder).toHaveBeenCalledTimes(1));
    expect(onImportFile).not.toHaveBeenCalled();
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it('opens the audio file picker from Import File without navigating', async () => {
    const onRouteChange = vi.fn();
    const onImportFolder = vi.fn();
    const onImportFile = vi.fn();

    render(
      <Sidebar
        routes={routes}
        activeRouteId="songs"
        onRouteChange={onRouteChange}
        onImportFolder={onImportFolder}
        onImportFile={onImportFile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import File' }));

    await waitFor(() => expect(onImportFile).toHaveBeenCalledTimes(1));
    expect(onImportFolder).not.toHaveBeenCalled();
    expect(onRouteChange).not.toHaveBeenCalled();
  });
});
