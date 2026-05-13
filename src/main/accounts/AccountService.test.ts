import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountService } from './AccountService';

const tempDirs: string[] = [];

const createService = (): { service: AccountService; storagePath: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'echo-accounts-'));
  tempDirs.push(dir);
  const storagePath = join(dir, 'accounts.json');
  return {
    service: new AccountService(storagePath),
    storagePath,
  };
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('AccountService', () => {
  it('returns disconnected initial statuses for all providers', () => {
    const { service } = createService();

    expect(service.getStatuses()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'netease', connected: false }),
        expect.objectContaining({ provider: 'qqmusic', connected: false }),
        expect.objectContaining({ provider: 'bilibili', connected: false }),
        expect.objectContaining({ provider: 'youtube', connected: false }),
        expect.objectContaining({ provider: 'soundcloud', connected: false }),
      ]),
    );
  });

  it('saves cookies, returns connected status, and does not expose cookies in statuses', () => {
    const { service, storagePath } = createService();

    const status = service.saveCookie('netease', 'MUSIC_U=secret; csrf=hidden');

    expect(status).toEqual(expect.objectContaining({ provider: 'netease', connected: true }));
    expect(JSON.stringify(service.getStatuses())).not.toContain('MUSIC_U');
    expect(readFileSync(storagePath, 'utf8')).toContain('MUSIC_U=secret');
    expect(readFileSync(`${storagePath}.bak`, 'utf8')).toContain('MUSIC_U=secret');
  });

  it('clears a provider cookie', () => {
    const { service, storagePath } = createService();
    service.saveCookie('qqmusic', 'uin=secret');

    const status = service.clearAccount('qqmusic');

    expect(status.connected).toBe(false);
    expect(readFileSync(storagePath, 'utf8')).not.toContain('uin=secret');
    expect(readFileSync(`${storagePath}.bak`, 'utf8')).not.toContain('uin=secret');
  });

  it('keeps account state after service restart', () => {
    const { service, storagePath } = createService();
    service.saveCookie('netease', 'MUSIC_U=secret');

    const restarted = new AccountService(storagePath);

    expect(restarted.getStatus('netease')).toEqual(expect.objectContaining({ provider: 'netease', connected: true }));
  });

  it('persists YouTube browser auth state', () => {
    const { service } = createService();

    const status = service.setYouTubeBrowser('edge');

    expect(status).toEqual(expect.objectContaining({ provider: 'youtube', connected: true }));
    expect(status.displayName).toContain('edge');
  });

  it('falls back to empty statuses when accounts.json is damaged', () => {
    const { service, storagePath } = createService();
    writeFileSync(storagePath, '{broken json', 'utf8');

    expect(service.getStatus('netease')).toEqual(expect.objectContaining({ provider: 'netease', connected: false }));
  });

  it('restores account state from backup when accounts.json is damaged', () => {
    const { service, storagePath } = createService();
    service.saveCookie('netease', 'MUSIC_U=secret');
    expect(existsSync(`${storagePath}.bak`)).toBe(true);
    writeFileSync(storagePath, '{broken json', 'utf8');

    const restored = new AccountService(storagePath);

    expect(restored.getStatus('netease')).toEqual(expect.objectContaining({ provider: 'netease', connected: true }));
    expect(readFileSync(storagePath, 'utf8')).toContain('MUSIC_U=secret');
  });

  it('sanitizes account records for diagnostics', () => {
    const { service } = createService();
    service.saveCookie('bilibili', 'SESSDATA=secret; bili_jct=csrf-secret');

    const safe = JSON.stringify(service.getSanitizedRecords());

    expect(safe).not.toContain('SESSDATA=secret');
    expect(safe).not.toContain('csrf-secret');
    expect(safe).toContain('[redacted]');
  });
});
