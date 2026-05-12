import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../shared/constants/ipcChannels';

const handlers: Record<string, (...args: unknown[]) => unknown> = {};
const handleMock = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
  handlers[channel] = handler;
});
const showOpenDialogMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
  dialog: {
    showOpenDialog: showOpenDialogMock,
  },
}));

const resetHandlers = (): void => {
  for (const key of Object.keys(handlers)) {
    delete handlers[key];
  }
};

describe('library IPC', () => {
  beforeEach(async () => {
    resetHandlers();
    handleMock.mockClear();
    showOpenDialogMock.mockReset();
    const module = await import('./libraryIpc');
    module.registerLibraryIpc();
  });

  it('returns null when choose folder is cancelled', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await handlers[IpcChannels.LibraryChooseFolder]!();

    expect(result).toBeNull();
  });

  it('returns the selected folder path when choose folder succeeds', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['D:\\Music'] });

    const result = await handlers[IpcChannels.LibraryChooseFolder]!();

    expect(result).toBe('D:\\Music');
  });
});
