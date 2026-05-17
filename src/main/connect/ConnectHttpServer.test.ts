import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectHttpServer, mimeTypeForAudioPath } from './ConnectHttpServer';

let tempRoot: string;
let server: ConnectHttpServer;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'echo-connect-http-'));
  server = new ConnectHttpServer();
});

afterEach(async () => {
  await server.close();
  rmSync(tempRoot, { force: true, recursive: true });
});

describe('Connect HTTP server', () => {
  it('infers MIME type from URL pathnames with query strings', () => {
    expect(mimeTypeForAudioPath('https://media.example.test/stream/song.flac?token=abc')).toBe('audio/flac');
  });

  it('serves direct audio with byte range support', async () => {
    const audioPath = join(tempRoot, 'range-test.mp3');
    writeFileSync(audioPath, Buffer.from('abcdef', 'utf8'));

    const audio = await server.createAudioUrl(audioPath, { host: '127.0.0.1' });
    const response = await fetch(audio.url, { headers: { Range: 'bytes=2-4' } });
    const body = Buffer.from(await response.arrayBuffer()).toString('utf8');

    expect(audio.mimeType).toBe('audio/mpeg');
    expect(audio.sizeBytes).toBe(6);
    expect(response.status).toBe(206);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBe('bytes 2-4/6');
    expect(body).toBe('cde');
  });

  it('returns a cacheable default cover when no local cover exists', async () => {
    const url = await server.createCoverUrl(null, { host: '127.0.0.1' });
    const response = await fetch(url);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
    expect(response.headers.get('cache-control')).toContain('max-age=86400');
    expect(body).toContain('<svg');
  });
});
