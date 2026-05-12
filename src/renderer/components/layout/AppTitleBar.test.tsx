// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppTitleBar } from './AppTitleBar';
import { I18nProvider } from '../../i18n/I18nProvider';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AppTitleBar', () => {
  const renderTitleBar = (props: Parameters<typeof AppTitleBar>[0]): void => {
    render(
      <I18nProvider>
        <AppTitleBar {...props} />
      </I18nProvider>,
    );
  };

  it('uses a direct import action instead of navigation for the import file button', () => {
    const onRouteChange = vi.fn();
    const onImportFile = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange,
      onImportFile,
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Import File' }));

    expect(onImportFile).toHaveBeenCalledTimes(1);
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it('keeps navigation buttons as route changes', () => {
    const onRouteChange = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange,
      onImportFile: vi.fn(),
      onOpenAudioSettings: vi.fn(),
      onMinimize: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Albums' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(onRouteChange).toHaveBeenNthCalledWith(1, 'albums');
    expect(onRouteChange).toHaveBeenNthCalledWith(2, 'settings');
  });

  it('opens the audio drawer from the audio settings button', () => {
    const onRouteChange = vi.fn();
    const onOpenAudioSettings = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange,
      onImportFile: vi.fn(),
      onOpenAudioSettings,
      onMinimize: vi.fn(),
      onToggleMaximize: vi.fn(),
      onClose: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Audio Settings' }));

    expect(onOpenAudioSettings).toHaveBeenCalledTimes(1);
    expect(onRouteChange).not.toHaveBeenCalled();
  });


  it('wires window control buttons to provided handlers', () => {
    const onMinimize = vi.fn();
    const onToggleMaximize = vi.fn();
    const onClose = vi.fn();

    renderTitleBar({
      activeRouteId: 'songs',
      onRouteChange: vi.fn(),
      onImportFile: vi.fn(),
      onOpenAudioSettings: vi.fn(),
      onMinimize,
      onToggleMaximize,
      onClose,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
