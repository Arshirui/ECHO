import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetadataResult } from '../libraryTypes';
import type { MetadataReader } from './MetadataReader';
import { NativeMetadataReader, NativeThenTsMetadataReader } from './NativeMetadataReader';
import { logLibraryScanPerf } from '../../diagnostics/LibraryScanPerfDiagnostics';

vi.mock('../../diagnostics/LibraryScanPerfDiagnostics', () => ({
  logLibraryScanPerf: vi.fn(),
}));

const metadataResult = (title = 'Native Title'): MetadataResult => ({
  fields: {
    title,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: 123,
    codec: 'FLAC',
    sampleRate: 44100,
    bitDepth: 16,
    bitrate: null,
    bpm: null,
    replayGainTrackGainDb: null,
    replayGainAlbumGainDb: null,
    replayGainTrackPeak: null,
    replayGainAlbumPeak: null,
    replayGainIntegratedLufs: null,
  },
  fieldSources: {},
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  warnings: [],
  errors: [],
  status: 'ok',
});

class StaticMetadataReader implements MetadataReader {
  calls: string[] = [];

  constructor(private readonly result: MetadataResult = metadataResult('TS Title')) {}

  async read(filePath: string): Promise<MetadataResult> {
    this.calls.push(filePath);
    return this.result;
  }
}

class FailingMetadataReader implements MetadataReader {
  calls: string[] = [];

  async read(filePath: string): Promise<MetadataResult> {
    this.calls.push(filePath);
    throw new Error('native metadata unsupported');
  }
}

class FakeNativeProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;
  stdinText = '';

  constructor() {
    super();
    this.stdin.setEncoding('utf8');
    this.stdin.on('data', (chunk: string | Buffer) => {
      this.stdinText += String(chunk);
    });
  }

  kill(): boolean {
    this.killed = true;
    this.stdout.end();
    this.stderr.end();
    this.emit('exit', null, 'SIGTERM');
    return true;
  }

  finish(code = 0): void {
    this.stdout.end();
    this.emit('exit', code, null);
  }
}

const previousNativeMetadataReaderEnv = process.env.ECHO_NATIVE_METADATA_READER;
const previousDisableNativeMetadataReaderEnv = process.env.ECHO_DISABLE_NATIVE_METADATA_READER;

const restoreEnv = (
  name: 'ECHO_NATIVE_METADATA_READER' | 'ECHO_DISABLE_NATIVE_METADATA_READER',
  value: string | undefined,
): void => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
};

describe('NativeThenTsMetadataReader', () => {
  afterEach(() => {
    restoreEnv('ECHO_NATIVE_METADATA_READER', previousNativeMetadataReaderEnv);
    restoreEnv('ECHO_DISABLE_NATIVE_METADATA_READER', previousDisableNativeMetadataReaderEnv);
    vi.mocked(logLibraryScanPerf).mockClear();
  });

  it('uses the TS metadata reader by default', async () => {
    delete process.env.ECHO_NATIVE_METADATA_READER;
    delete process.env.ECHO_DISABLE_NATIVE_METADATA_READER;
    const nativeReader = new StaticMetadataReader(metadataResult('Native Title'));
    const tsReader = new StaticMetadataReader(metadataResult('TS Title'));
    const reader = new NativeThenTsMetadataReader(nativeReader, tsReader);

    await expect(reader.read('D:\\Music\\song.flac')).resolves.toMatchObject({
      fields: { title: 'TS Title' },
    });
    expect(nativeReader.calls).toEqual([]);
    expect(tsReader.calls).toEqual(['D:\\Music\\song.flac']);
  });

  it('falls back to TS when native metadata is enabled but unsupported', async () => {
    process.env.ECHO_NATIVE_METADATA_READER = '1';
    delete process.env.ECHO_DISABLE_NATIVE_METADATA_READER;
    const nativeReader = new FailingMetadataReader();
    const tsReader = new StaticMetadataReader(metadataResult('Fallback Title'));
    const logger = vi.fn();
    const reader = new NativeThenTsMetadataReader(nativeReader, tsReader, logger);

    await expect(reader.read('D:\\Music\\song.flac')).resolves.toMatchObject({
      fields: { title: 'Fallback Title' },
    });
    expect(nativeReader.calls).toEqual(['D:\\Music\\song.flac']);
    expect(tsReader.calls).toEqual(['D:\\Music\\song.flac']);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('falling back to TS reader'));
  });

  it('lets the disable env override the enable env and setting', async () => {
    process.env.ECHO_NATIVE_METADATA_READER = '1';
    process.env.ECHO_DISABLE_NATIVE_METADATA_READER = '1';
    const nativeReader = new StaticMetadataReader(metadataResult('Native Title'));
    const tsReader = new StaticMetadataReader(metadataResult('TS Title'));
    const reader = new NativeThenTsMetadataReader(nativeReader, tsReader, console.warn, () => true);

    await expect(reader.read('D:\\Music\\song.flac')).resolves.toMatchObject({
      fields: { title: 'TS Title' },
    });
    expect(nativeReader.calls).toEqual([]);
    expect(tsReader.calls).toEqual(['D:\\Music\\song.flac']);
  });

  it('skips native metadata for unsupported extensions and uses TS directly', async () => {
    process.env.ECHO_NATIVE_METADATA_READER = '1';
    delete process.env.ECHO_DISABLE_NATIVE_METADATA_READER;
    const nativeReader = new StaticMetadataReader(metadataResult('Native Title'));
    const tsReader = new StaticMetadataReader(metadataResult('TS Title'));
    const logger = vi.fn();
    const reader = new NativeThenTsMetadataReader(nativeReader, tsReader, logger);

    await expect(reader.read('D:\\Music\\song.wav')).resolves.toMatchObject({
      fields: { title: 'TS Title' },
    });

    expect(nativeReader.calls).toEqual([]);
    expect(tsReader.calls).toEqual(['D:\\Music\\song.wav']);
    expect(logger).not.toHaveBeenCalled();
    expect(vi.mocked(logLibraryScanPerf)).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'nativeMetadataReader',
      detail: expect.stringContaining('skippedUnsupportedExtension=1'),
    }));
  });

  it('logs native metadata summaries without logging every successful file', async () => {
    process.env.ECHO_NATIVE_METADATA_READER = '1';
    delete process.env.ECHO_DISABLE_NATIVE_METADATA_READER;
    const nativeReader = new StaticMetadataReader(metadataResult('Native Title'));
    const tsReader = new StaticMetadataReader(metadataResult('TS Title'));
    const reader = new NativeThenTsMetadataReader(nativeReader, tsReader);

    for (let index = 0; index < 50; index += 1) {
      await reader.read(`D:\\Music\\song-${index}.flac`);
    }

    expect(nativeReader.calls).toHaveLength(50);
    expect(tsReader.calls).toEqual([]);
    expect(vi.mocked(logLibraryScanPerf)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logLibraryScanPerf)).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'nativeMetadataReader',
      fileCount: 1,
      detail: expect.stringContaining('nativeOk=1'),
    }));
  });
});

describe('NativeMetadataReader', () => {
  it('sends a metadata NDJSON request and parses a metadata result', async () => {
    const child = new FakeNativeProcess();
    const reader = new NativeMetadataReader({
      executablePath: 'echo-native-scanner.exe',
      spawnProcess: vi.fn(() => child as unknown as ChildProcessWithoutNullStreams),
    });

    queueMicrotask(() => {
      child.stdout.write('{"type":"ready"}\n');
      child.stdout.write('{"type":"started","mode":"metadata","path":"D:/Music/song.flac"}\n');
      child.stdout.write(`${JSON.stringify({ type: 'metadata', path: 'D:/Music/song.flac', result: metadataResult('Native Title') })}\n`);
      child.finish();
    });

    await expect(reader.read('D:/Music/song.flac')).resolves.toMatchObject({
      fields: { title: 'Native Title' },
    });
    expect(JSON.parse(child.stdinText)).toMatchObject({
      type: 'metadata',
      readCover: false,
    });
  });

  it('reuses one native process for serial metadata requests', async () => {
    const child = new FakeNativeProcess();
    const spawnProcess = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams);
    const reader = new NativeMetadataReader({
      executablePath: 'echo-native-scanner.exe',
      spawnProcess,
    });

    let responseCount = 0;
    child.stdin.on('data', () => {
      const requestCount = child.stdinText.trim().split(/\r?\n/).filter(Boolean).length;
      while (responseCount < requestCount) {
        responseCount += 1;
        const title = responseCount === 1 ? 'One' : 'Two';
        child.stdout.write(`${JSON.stringify({ type: 'metadata', path: `D:/Music/${title}.flac`, result: metadataResult(title) })}\n`);
        if (responseCount === 2) {
          queueMicrotask(() => child.finish());
        }
      }
    });

    await expect(reader.read('D:/Music/one.flac')).resolves.toMatchObject({
      fields: { title: 'One' },
    });

    await expect(reader.read('D:/Music/two.flac')).resolves.toMatchObject({
      fields: { title: 'Two' },
    });

    expect(spawnProcess).toHaveBeenCalledTimes(1);
    const requests = child.stdinText
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ type: 'metadata', readCover: false });
    expect(requests[1]).toMatchObject({ type: 'metadata', readCover: false });
  });

  it('throws on explicit native metadata unsupported response', async () => {
    const child = new FakeNativeProcess();
    const reader = new NativeMetadataReader({
      executablePath: 'echo-native-scanner.exe',
      spawnProcess: vi.fn(() => child as unknown as ChildProcessWithoutNullStreams),
    });

    queueMicrotask(() => {
      child.stdout.write('{"type":"ready"}\n');
      child.stdout.write('{"type":"unsupported","path":"D:/Music/song.flac","message":"native metadata reader is not implemented yet"}\n');
      child.finish();
    });

    await expect(reader.read('D:/Music/song.flac')).rejects.toThrow('not implemented yet');
  });
});
