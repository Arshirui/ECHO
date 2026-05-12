// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppTitleBar } from './AppTitleBar';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AppTitleBar', () => {
  it('uses direct import actions instead of navigation for import buttons', () => {
    const onRouteChange = vi.fn();
    const onImportFolder = vi.fn();
    const onImportFile = vi.fn();

    render(
      <AppTitleBar
        activeRouteId="songs"
        onRouteChange={onRouteChange}
        onImportFolder={onImportFolder}
        onImportFile={onImportFile}
        onMinimize={vi.fn()}
        onToggleMaximize={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import Folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import File' }));

    expect(onImportFolder).toHaveBeenCalledTimes(1);
    expect(onImportFile).toHaveBeenCalledTimes(1);
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it('keeps navigation buttons as route changes', () => {
    const onRouteChange = vi.fn();

    render(
      <AppTitleBar
        activeRouteId="songs"
        onRouteChange={onRouteChange}
        onImportFolder={vi.fn()}
        onImportFile={vi.fn()}
        onMinimize={vi.fn()}
        onToggleMaximize={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Albums' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(onRouteChange).toHaveBeenNthCalledWith(1, 'albums');
    expect(onRouteChange).toHaveBeenNthCalledWith(2, 'settings');
  });

  it('wires window control buttons to provided handlers', () => {
    const onMinimize = vi.fn();
    const onToggleMaximize = vi.fn();
    const onClose = vi.fn();

    render(
      <AppTitleBar
        activeRouteId="songs"
        onRouteChange={vi.fn()}
        onImportFolder={vi.fn()}
        onImportFile={vi.fn()}
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
