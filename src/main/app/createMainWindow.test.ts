import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePreloadPath } from './createMainWindow';

const tempDirs: string[] = [];

const makeOutMainDir = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'echo-next-preload-'));
  const mainDir = join(root, 'main');
  const preloadDir = join(root, 'preload');

  mkdirSync(mainDir, { recursive: true });
  mkdirSync(preloadDir, { recursive: true });
  tempDirs.push(root);

  return mainDir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolvePreloadPath', () => {
  it('prefers electron-vite preload index.mjs output', () => {
    const mainDir = makeOutMainDir();
    const preloadPath = join(mainDir, '../preload/index.mjs');
    writeFileSync(preloadPath, '');

    expect(resolvePreloadPath(mainDir)).toBe(preloadPath);
  });

  it('falls back to index.js for compatibility', () => {
    const mainDir = makeOutMainDir();

    expect(resolvePreloadPath(mainDir)).toBe(join(mainDir, '../preload/index.js'));
  });
});
