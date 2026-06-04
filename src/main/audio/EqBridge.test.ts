import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { EqBridge } from './EqBridge';
import type { EqState } from '../../shared/types/eq';
import { eqBandCount } from '../../shared/types/eq';

const tempDirs: string[] = [];
const servers: net.Server[] = [];
const sockets: net.Socket[] = [];

const createBridge = (): EqBridge => {
  const dir = mkdtempSync(join(tmpdir(), 'echo-next-eq-'));
  tempDirs.push(dir);
  return new EqBridge(dir);
};

const padGains = (gains: number[]): number[] => [...gains, ...Array(Math.max(0, eqBandCount - gains.length)).fill(0)].slice(0, eqBandCount);

const expectedBuiltInCurves: Record<string, { preampDb: number; gains: number[] }> = {
  flat: { preampDb: 0, gains: padGains([]) },
  'bass-boost': { preampDb: -8, gains: [4.8, 5.5, 6.4, 7.2, 7.5, 7.2, 6.6, 5.5, 4.1, 2.8, 1.5, 0.6, 0, -0.3, -0.6, -0.8, -1, -1.1, -1.2, -1.4, -1.5, -1.6, -1.8, -2, -2.2, -2.4, -2.6, -2.8, -3, -3.2, -3.4] },
  'vocal-clear': { preampDb: -6, gains: [-6.5, -6.2, -5.8, -5.2, -4.7, -4.2, -3.5, -2.8, -2, -1.2, -0.4, 0.5, 1.4, 2.3, 3.2, 4.1, 4.8, 5.2, 5, 4.5, 3.8, 3, 2.1, 1.2, 0.2, -0.8, -1.6, -2.2, -2.8, -3.2, -3.6] },
  'treble-sparkle': { preampDb: -7, gains: [-3.2, -3, -2.8, -2.5, -2.2, -1.8, -1.4, -1, -0.7, -0.4, -0.2, 0, 0.3, 0.5, 0.8, 1.1, 1.5, 2, 2.6, 3.2, 3.8, 4.4, 5, 5.6, 6.1, 6.4, 6.2, 5.8, 5.2, 4.6, 3.8] },
  loudness: { preampDb: -8, gains: [5, 5.8, 6.6, 7.2, 7.5, 7.2, 6.5, 5.4, 4, 2.2, 0.6, -0.8, -1.6, -2, -2.2, -2, -1.5, -0.8, 0, 0.7, 1.4, 2.2, 3, 3.8, 4.5, 5, 5.3, 5.2, 4.8, 4.2, 3.5] },
  night: { preampDb: -2, gains: [-6.5, -6.3, -6, -5.5, -5, -4.4, -3.7, -3, -2.3, -1.6, -1, -0.5, 0, 0.6, 1, 1.3, 1.4, 1.2, 0.9, 0.3, -0.4, -1.2, -2.2, -3.2, -4.2, -5, -5.8, -6.4, -6.8, -7, -7.2] },
  'headphone-warm': { preampDb: -6, gains: [3.8, 4.4, 5, 5.3, 5.1, 4.7, 4.1, 3.4, 2.7, 2, 1.3, 0.8, 0.4, 0.1, -0.2, -0.5, -0.8, -1, -1.2, -1.4, -1.7, -2, -2.3, -2.6, -2.9, -3.1, -3.3, -3.5, -3.7, -3.8, -4] },
  'anime-jpop': { preampDb: -6, gains: [2.5, 3, 3.3, 3.2, 2.8, 2.2, 1.4, 0.5, -0.4, -1.2, -1.8, -2.2, -2.4, -2.2, -1.4, -0.4, 0.8, 1.8, 2.8, 3.7, 4.5, 5.2, 5.7, 5.5, 5, 4.3, 3.5, 2.7, 2, 1.3, 0.8] },
  rock: { preampDb: -6, gains: [4.2, 4.8, 5.3, 5.5, 5.2, 4.6, 3.8, 2.6, 1.2, -0.5, -1.8, -2.7, -3.2, -3, -2.3, -1.4, -0.4, 0.8, 1.8, 2.8, 3.6, 4.4, 4.9, 4.7, 4.2, 3.6, 3, 2.4, 2, 1.6, 1.2] },
  classical: { preampDb: -4, gains: [1.2, 1.4, 1.6, 1.8, 1.7, 1.5, 1.2, 0.9, 0.5, 0.1, -0.3, -0.6, -0.9, -1, -0.9, -0.7, -0.4, 0, 0.5, 1, 1.5, 2.1, 2.6, 3, 3.3, 3.5, 3.4, 3, 2.4, 1.8, 1.2] },
  'harman-target': { preampDb: -6, gains: [5.5, 5.9, 6.2, 6.1, 5.7, 5.2, 4.6, 3.8, 3, 2.2, 1.4, 0.8, 0.4, 0.1, 0, -0.1, 0.2, 0.6, 1.1, 1.8, 2.5, 3.1, 3.6, 3.8, 3.5, 3, 2.4, 1.8, 1.2, 0.7, 0.3] },
  'harman-in-ear': { preampDb: -8, gains: [7.2, 7.7, 8, 7.8, 7.2, 6.5, 5.8, 4.8, 3.8, 2.6, 1.4, 0.6, 0.1, -0.2, -0.5, -0.4, 0, 0.7, 1.5, 2.4, 3.2, 4, 4.5, 4.2, 3.7, 3.3, 3, 2.5, 2, 1.4, 0.8] },
  'diffuse-field': { preampDb: -7, gains: [-5.8, -5.5, -5.2, -4.8, -4.2, -3.6, -3, -2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4, 3.2, 4, 4.8, 5.5, 6.1, 6.3, 6, 5.2, 4.3, 3.4, 2.5, 1.6, 0.8, 0.2, -0.4] },
  'bk-room-curve': { preampDb: -6, gains: [5.8, 5.6, 5.4, 5.1, 4.8, 4.5, 4.1, 3.7, 3.2, 2.7, 2.2, 1.6, 1, 0.4, 0, -0.5, -1, -1.5, -2, -2.5, -3, -3.5, -4, -4.5, -5, -5.4, -5.8, -6, -6.2, -6.4, -6.6] },
  'studio-neutral': { preampDb: -2, gains: [-1.5, -1.6, -1.6, -1.5, -1.4, -1.2, -1, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 1.7, 1.9, 2, 1.8, 1.5, 1.1, 0.7, 0.3, -0.2, -0.7, -1.2] },
  'classic-smiley': { preampDb: -8, gains: [6.2, 6.7, 7, 7.2, 7, 6.5, 5.8, 4.7, 3.2, 1.4, -0.8, -2.5, -3.8, -4.5, -4.6, -4.2, -3.4, -2.2, -0.8, 0.6, 1.8, 3, 4.2, 5.2, 6, 6.5, 6.8, 7, 7, 6.7, 6.2] },
  'vinyl-warmth': { preampDb: -6, gains: [4.2, 4.7, 5, 5, 4.7, 4.2, 3.5, 2.8, 2, 1.2, 0.5, 0.1, -0.2, -0.4, -0.6, -0.8, -1, -1.2, -1.5, -1.8, -2.2, -2.6, -3, -3.4, -3.8, -4.2, -4.6, -5, -5.4, -5.8, -6] },
  'broadcast-voice': { preampDb: -6, gains: [-8, -7.6, -7.1, -6.5, -5.8, -5, -4.2, -3.2, -2, -0.5, 1, 2.5, 3.8, 4.8, 5.4, 5.8, 5.6, 5.2, 4.5, 3.6, 2.4, 1.2, 0, -1.4, -2.8, -4, -5.2, -6.2, -7, -7.6, -8] },
  'city-pop': { preampDb: -6, gains: [3, 3.4, 3.6, 3.4, 3, 2.4, 1.5, 0.5, -0.5, -1.2, -1.8, -2, -1.8, -1.3, -0.6, 0.2, 1, 1.8, 2.6, 3.5, 4.3, 4.9, 5.2, 5, 4.5, 3.8, 3.2, 2.7, 2.2, 1.6, 1] },
  'acoustic-silk': { preampDb: -4, gains: [1.8, 2, 2.2, 2.1, 1.9, 1.6, 1.2, 0.8, 0.3, 0, -0.2, 0, 0.4, 0.9, 1.4, 1.8, 2.1, 2.3, 2.1, 1.8, 1.5, 1.1, 0.8, 0.4, 0, -0.6, -1.2, -1.8, -2.3, -2.8, -3] },
  'piano-room': { preampDb: -5, gains: [0.8, 1, 1.2, 1.4, 1.5, 1.4, 1.2, 0.8, 0.3, -0.2, -0.6, -0.8, -0.6, -0.2, 0.4, 1, 1.6, 2.2, 2.8, 3.3, 3.8, 4.1, 4, 3.5, 2.8, 2.1, 1.3, 0.4, -0.4, -1.1, -1.8] },
  'lofi-dusk': { preampDb: -4, gains: [3, 3.2, 3.3, 3.1, 2.8, 2.4, 1.8, 1.2, 0.6, 0.1, -0.4, -0.8, -1, -1.2, -1.2, -1, -0.8, -0.6, -0.5, -0.6, -0.8, -1.2, -1.8, -2.6, -3.5, -4.4, -5.2, -5.8, -6.3, -6.8, -7] },
  'cinema-orchestra': { preampDb: -7, gains: [5, 5.5, 5.9, 6.2, 6, 5.6, 5, 4.2, 3.2, 2.1, 1, 0.2, -0.3, -0.5, -0.4, 0, 0.6, 1.4, 2.3, 3.2, 4, 4.7, 5.2, 5.5, 5.4, 5, 4.5, 3.8, 3, 2.1, 1.2] },
  'live-house': { preampDb: -6, gains: [4, 4.5, 4.8, 4.6, 4, 3.2, 2.2, 1.1, -0.2, -1.4, -2.4, -3, -3.2, -2.8, -2, -1, 0.2, 1.4, 2.6, 3.8, 4.8, 5.4, 5.6, 5.2, 4.6, 3.8, 3, 2.3, 1.8, 1.2, 0.7] },
  'female-vocal-air': { preampDb: -6, gains: [-5, -4.8, -4.5, -4.1, -3.6, -3, -2.3, -1.6, -0.8, 0, 0.8, 1.8, 2.8, 3.8, 4.8, 5.5, 5.8, 5.6, 5, 4.3, 3.6, 3.1, 3, 3.2, 3.6, 4, 4.2, 3.8, 3, 2, 1] },
  'sub-cleanup': { preampDb: -2, gains: padGains([0, 1.5, 0, -2.5, 0, 0, 0, 0, 0, 0]) },
  'vocal-de-ess': { preampDb: -3, gains: padGains([0, 0, -1.5, 0, 0, 0, 1.5, 0, -4.5, 0]) },
  'headphone-notch': { preampDb: -3, gains: padGains([1.5, 0, 0, 0, 0, -2, 0, 0, -2.5, 0]) },
  'subsonic-filter': { preampDb: -2, gains: padGains([0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0]) },
  'sibilance-tamer': { preampDb: -4, gains: padGains([0, 0, -1.2, 0, 0, 0, 0, -2.8, 0, -1]) },
  'bluetooth-speaker-cleanup': { preampDb: -3, gains: padGains([0, -2, 0, -2, 0, 0, 0, 2, 0, 0]) },
};

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  sockets.splice(0).forEach((socket) => socket.destroy());
  servers.splice(0).forEach((server) => server.close());
});

const createEqControlServer = async (
  options: { responseBands?: EqState['bands'] } = {},
): Promise<{ port: number; messages: Array<Record<string, unknown>>; closeClients: () => void }> => {
  const messages: Array<Record<string, unknown>> = [];
  let responseBands = (options.responseBands ?? createBridge().getState().bands).map((band) => ({ ...band }));
  let responseEnabled = true;
  let responsePreampDb = 0;
  let roomCorrectionState = {
    type: 'roomCorrection:state',
    ok: true,
    enabled: false,
    status: 'empty',
    irId: '',
    irName: '',
    channelMode: 'none',
    sampleRate: 0,
    tapCount: 0,
    trimDb: 0,
    latencySamples: 0,
    clippingRisk: false,
    error: '',
  };
  const clients: net.Socket[] = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    clients.push(socket);
    socket.on('error', () => undefined);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          const message = JSON.parse(line) as Record<string, unknown>;
          messages.push(message);
          const band = Number(message.band);
          if (message.type === 'eq:set-enabled') {
            responseEnabled = message.enabled === true;
          } else if (message.type === 'eq:set-preamp' && Number.isFinite(Number(message.preampDb))) {
            responsePreampDb = Number(message.preampDb);
          } else if (message.type === 'eq:set-preset' && Array.isArray(message.bands)) {
            responsePreampDb = Number(message.preampDb ?? responsePreampDb);
            responseBands = (message.bands as EqState['bands']).map((item) => ({ ...item }));
          } else if (Number.isInteger(band) && band >= 0 && band < responseBands.length) {
            if (message.type === 'eq:set-band-gain' && Number.isFinite(Number(message.gainDb))) {
              responseBands[band] = { ...responseBands[band], gainDb: Number(message.gainDb) };
            } else if (message.type === 'eq:set-band-frequency' && Number.isFinite(Number(message.frequencyHz))) {
              responseBands[band] = { ...responseBands[band], frequencyHz: Number(message.frequencyHz) };
            } else if (message.type === 'eq:set-band-q' && Number.isFinite(Number(message.q))) {
              responseBands[band] = { ...responseBands[band], q: Number(message.q) };
            } else if (message.type === 'eq:set-band-filter-type') {
              responseBands[band] = { ...responseBands[band], filterType: message.filterType as EqState['bands'][number]['filterType'] };
            } else if (message.type === 'eq:set-band-enabled') {
              responseBands[band] = { ...responseBands[band], enabled: message.enabled === true };
            }
          }
          if (message.type === 'channelBalance.setState') {
            socket.write(`${JSON.stringify({ type: 'channelBalance:state' })}\n`);
          } else if (message.type === 'roomCorrection.loadIr') {
            roomCorrectionState = {
              ...roomCorrectionState,
              status: roomCorrectionState.enabled ? 'active' : 'loaded',
              irId: String(message.irId ?? ''),
              irName: String(message.irName ?? ''),
              channelMode: 'mono',
              sampleRate: 48000,
              tapCount: 128,
              error: '',
            };
            socket.write(`${JSON.stringify(roomCorrectionState)}\n`);
          } else if (message.type === 'roomCorrection.setEnabled') {
            roomCorrectionState = {
              ...roomCorrectionState,
              enabled: message.enabled === true,
              status: roomCorrectionState.irId ? message.enabled === true ? 'active' : 'loaded' : 'empty',
            };
            socket.write(`${JSON.stringify(roomCorrectionState)}\n`);
          } else if (message.type === 'roomCorrection.setTrim') {
            roomCorrectionState = { ...roomCorrectionState, trimDb: Number(message.trimDb ?? 0) };
            socket.write(`${JSON.stringify(roomCorrectionState)}\n`);
          } else if (message.type === 'roomCorrection.clear') {
            roomCorrectionState = { ...roomCorrectionState, enabled: false, status: 'empty', irId: '', irName: '', channelMode: 'none', sampleRate: 0, tapCount: 0, error: '' };
            socket.write(`${JSON.stringify(roomCorrectionState)}\n`);
          } else {
            socket.write(`${JSON.stringify({ type: 'eq:state', enabled: responseEnabled, preampDb: responsePreampDb, bands: responseBands })}\n`);
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });
  });

  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('test EQ control server did not bind to a TCP port');
  }

  return {
    port: address.port,
    messages,
    closeClients: () => clients.forEach((socket) => socket.destroy()),
  };
};

describe('EqBridge protocol validation', () => {
  it('ignores stale control socket closes after a newer native host connects', async () => {
    const bridge = createBridge();
    const first = await createEqControlServer();
    const second = await createEqControlServer();

    bridge.connect(first.port);
    await new Promise((resolve) => setTimeout(resolve, 0));
    bridge.connect(second.port);
    await new Promise((resolve) => setTimeout(resolve, 0));
    first.closeClients();

    await bridge.setBandGain({ band: 2, gainDb: 4 });

    expect(second.messages.some((message) => message.type === 'eq:set-band-gain' && message.band === 2)).toBe(true);
  });

  it('keeps the intended EQ curve when a fresh native host answers enable with Flat state', async () => {
    const bridge = createBridge();
    await bridge.setPreset('rock');
    await bridge.setEnabled(true);
    const intendedBands = bridge.getState().bands;
    const server = await createEqControlServer({ responseBands: createBridge().getState().bands });

    bridge.connect(server.port);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect.poll(() => server.messages.some((message) => message.type === 'eq:set-preset')).toBe(true);
    const presetMessage = server.messages.find((message) => message.type === 'eq:set-preset') as { bands?: EqState['bands'] } | undefined;

    expect(presetMessage?.bands?.map((band) => band.gainDb)).toEqual(intendedBands.map((band) => band.gainDb));
    expect(bridge.getState().bands.map((band) => band.gainDb)).toEqual(intendedBands.map((band) => band.gainDb));
  });

  it('rejects invalid band indexes', async () => {
    const bridge = createBridge();

    await expect(bridge.setBandGain({ band: 99, gainDb: 2 })).rejects.toThrow('invalid_eq_band_index');
  });

  it('clamps gain and preamp ranges before updating state', async () => {
    const bridge = createBridge();

    await bridge.setBandGain({ band: 2, gainDb: 50 });
    await bridge.setPreamp(-40);

    const state = bridge.getState();
    expect(state.bands[2].gainDb).toBe(12);
    expect(state.preampDb).toBe(-12);
  });

  it('clamps editable band frequencies before updating state', async () => {
    const bridge = createBridge();

    await bridge.setBandFrequency({ band: 2, frequencyHz: 50000 });

    expect(bridge.getState().bands[2].frequencyHz).toBe(20000);
  });

  it('normalizes old persisted EQ bands with PEQ defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-next-eq-'));
    tempDirs.push(dir);
    writeFileSync(
      join(dir, 'eq-state.json'),
      JSON.stringify({
        enabled: true,
        preampDb: -2,
        bands: Array.from({ length: 10 }, (_value, index) => ({
          frequencyHz: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000][index],
          gainDb: index === 0 ? 4 : 0,
        })),
      }),
      'utf8',
    );

    const bridge = new EqBridge(dir);
    const state = bridge.getState();

    expect(state.bands[0]).toMatchObject({
      gainDb: 4,
      q: 1,
      filterType: 'peaking',
      enabled: true,
    });
  });

  it('clamps PEQ Q and propagates band type and bypass state to native control', async () => {
    const bridge = createBridge();
    const server = await createEqControlServer();
    bridge.connect(server.port);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await bridge.setBandQ({ band: 3, q: 50 });
    await bridge.setBandFilterType({ band: 3, filterType: 'lowShelf' });
    await bridge.setBandEnabled({ band: 3, enabled: false });

    expect(bridge.getState().bands[3]).toMatchObject({
      q: 12,
      filterType: 'lowShelf',
      enabled: false,
    });
    expect(server.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'eq:set-band-q', band: 3, q: 12 }),
      expect.objectContaining({ type: 'eq:set-band-filter-type', band: 3, filterType: 'lowShelf' }),
      expect.objectContaining({ type: 'eq:set-band-enabled', band: 3, enabled: false }),
    ]));
  });

  it('does not send optional DSP sync commands when Room Correction and channel balance are default off', async () => {
    const bridge = createBridge();
    const server = await createEqControlServer();
    bridge.connect(server.port);

    await expect.poll(() => server.messages.some((message) => message.type === 'eq:set-preset')).toBe(true);

    expect(server.messages.some((message) => String(message.type).startsWith('roomCorrection.'))).toBe(false);
    expect(server.messages.some((message) => String(message.type).startsWith('channelBalance.'))).toBe(false);
  });

  it('imports room correction WAV files and sends the copied IR to native control', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-next-eq-'));
    tempDirs.push(dir);
    const sourceIr = join(dir, 'desk-ir.wav');
    writeFileSync(sourceIr, Buffer.from('RIFF----WAVEfmt '));
    const bridge = new EqBridge(dir);
    const server = await createEqControlServer();
    bridge.connect(server.port);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = await bridge.importRoomCorrectionIr(sourceIr);

    expect(state).toMatchObject({
      status: 'loaded',
      irName: 'desk-ir',
      channelMode: 'mono',
      sampleRate: 48000,
      tapCount: 128,
    });
    const loadMessage = server.messages.find((message) => message.type === 'roomCorrection.loadIr');
    expect(loadMessage).toEqual(expect.objectContaining({
      irId: state.irId,
      irName: 'desk-ir',
    }));
    expect(String(loadMessage?.path)).toContain('room-correction');
    expect(existsSync(String(loadMessage?.path))).toBe(true);
  });

  it('persists room correction trim and enabled state independently from EQ presets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-next-eq-'));
    tempDirs.push(dir);
    const sourceIr = join(dir, 'room.wav');
    writeFileSync(sourceIr, Buffer.from('RIFF----WAVEfmt '));
    const bridge = new EqBridge(dir);
    const server = await createEqControlServer();
    bridge.connect(server.port);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await bridge.syncStateToNative();

    await bridge.importRoomCorrectionIr(sourceIr);
    await bridge.setRoomCorrectionTrim(-99);
    const enabled = await bridge.setRoomCorrectionEnabled(true);

    expect(enabled).toMatchObject({ enabled: true, status: 'active', trimDb: -24 });
    expect(server.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'roomCorrection.setTrim', trimDb: -24 }),
      expect.objectContaining({ type: 'roomCorrection.setEnabled', enabled: true }),
    ]));

    const reloaded = new EqBridge(dir);
    expect(reloaded.getRoomCorrectionState()).toMatchObject({ enabled: true, irName: 'room', trimDb: -24 });

    const cleared = await bridge.clearRoomCorrection();
    expect(cleared).toMatchObject({ enabled: false, status: 'empty', irId: null });
  });

  it('backs up old EQ files before first Phase 2 format write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-next-eq-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'eq-state.json'), JSON.stringify(createBridge().getState()), 'utf8');
    writeFileSync(join(dir, 'eq-presets.json'), JSON.stringify([]), 'utf8');
    const bridge = new EqBridge(dir);

    await bridge.setBandQ({ band: 1, q: 2 });

    expect(existsSync(join(dir, 'eq-backups', 'phase2-backup.done'))).toBe(true);
  });

  it('refuses malformed preset data', () => {
    const bridge = createBridge();

    expect(() =>
      bridge.savePreset({
        name: 'Broken',
        preampDb: 0,
        bands: [{ frequencyHz: 31, gainDb: 0, q: 1 }],
      }),
    ).toThrow('invalid_eq_preset');
  });

  it('persists user presets outside the audio callback path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-next-eq-'));
    tempDirs.push(dir);
    const bridge = new EqBridge(dir);
    const state = bridge.getState();

    bridge.savePreset({
      name: 'Desk Headphones',
      preampDb: -2,
      bands: state.bands,
    });

    const reloaded = new EqBridge(dir);
    expect(reloaded.listPresets().some((preset) => preset.name === 'Desk Headphones')).toBe(true);
  });

  it('restores the last EQ enabled state and curve after restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-next-eq-'));
    tempDirs.push(dir);
    const bridge = new EqBridge(dir);

    await bridge.setPreset('rock');
    await bridge.setEnabled(true);
    await bridge.setBandGain({ band: 0, gainDb: 3.5 });
    await bridge.setPreamp(-3);

    const reloaded = new EqBridge(dir);

    expect(reloaded.getState()).toMatchObject({
      enabled: true,
      preampDb: -3,
      presetId: 'custom',
      presetName: 'Custom',
    });
    expect(reloaded.getState().bands[0].gainDb).toBe(3.5);
  });

  it('falls back to disabled Flat EQ when persisted state is malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-next-eq-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'eq-state.json'), JSON.stringify({ enabled: true, bands: [{ gainDb: 999 }] }), 'utf8');

    const bridge = new EqBridge(dir);

    expect(bridge.getState()).toMatchObject({
      enabled: false,
      preampDb: 0,
      presetId: 'flat',
      presetName: '原音如初',
    });
  });

  it('selects a newly saved preset in the bridge state', () => {
    const bridge = createBridge();
    const stateChanges: EqState[] = [];
    bridge.on('state', (nextState: EqState) => stateChanges.push(nextState));

    const saved = bridge.savePreset({
      name: 'Desk Headphones',
      preampDb: -2,
      bands: bridge.getState().bands.map((band, index) => (index === 1 ? { ...band, gainDb: 3 } : band)),
    });

    expect(bridge.getState()).toMatchObject({
      presetId: saved.id,
      presetName: 'Desk Headphones',
      preampDb: -2,
    });
    expect(bridge.getState().bands[1].gainDb).toBe(3);
    expect(stateChanges.at(-1)).toMatchObject({ presetId: saved.id, presetName: 'Desk Headphones' });
  });

  it('stores EQ profiles and only auto-applies explicitly bound output profiles', async () => {
    const bridge = createBridge();
    await bridge.setBandGain({ band: 0, gainDb: 5 });
    const desk = bridge.saveProfile({
      name: 'Desk DAC',
      state: bridge.getState(),
    });
    await bridge.setBandGain({ band: 0, gainDb: -5 });
    const bt = bridge.saveProfile({
      name: 'Bluetooth',
      state: bridge.getState(),
    });
    const target = {
      outputMode: 'shared',
      outputDeviceId: 'device-a',
      outputDeviceName: 'Desk DAC',
      outputDeviceType: 'shared',
      sharedBackend: 'windows',
    };

    bridge.bindProfileToOutput({ profileId: desk.id, target });
    bridge.bindProfileToOutput({ profileId: bt.id, target: { ...target, outputDeviceId: 'device-b', outputDeviceName: 'Bluetooth' } });

    expect(bridge.getProfileBinding(target)).toMatchObject({ profileId: desk.id, profileName: 'Desk DAC' });
    bridge.applyBoundProfileForOutput(target);
    expect(bridge.getState().bands[0].gainDb).toBe(5);
    bridge.applyBoundProfileForOutput({ ...target, outputDeviceId: 'missing-device' });
    expect(bridge.getState().bands[0].gainDb).toBe(5);
  });

  it('includes professional target curves as read-only built-in presets', async () => {
    const bridge = createBridge();
    const presets = bridge.listPresets();
    const harman = presets.find((preset) => preset.id === 'harman-target');
    const classicSmiley = presets.find((preset) => preset.id === 'classic-smiley');

    expect(harman).toMatchObject({
      name: '暖场哈曼',
      preampDb: -6,
      readonly: true,
    });
    expect(harman?.bands.map((band) => band.gainDb)).toEqual(expectedBuiltInCurves['harman-target'].gains);
    expect(classicSmiley).toMatchObject({
      name: '晨弧微笑',
      readonly: true,
    });

    await bridge.setPreset('harman-target');

    expect(bridge.getState()).toMatchObject({
      presetId: 'harman-target',
      presetName: '暖场哈曼',
      preampDb: -6,
    });
  });

  it('keeps every built-in preset locked to intentional 31-band curve data', () => {
    const bridge = createBridge();
    const builtInPresets = bridge.listPresets().filter((preset) => preset.readonly);

    expect(builtInPresets).toHaveLength(Object.keys(expectedBuiltInCurves).length);
    for (const preset of builtInPresets) {
      const expected = expectedBuiltInCurves[preset.id];
      expect(expected, preset.name).toBeDefined();
      expect(preset.preampDb, preset.name).toBe(expected.preampDb);
      expect(preset.bands).toHaveLength(eqBandCount);
      expect(preset.bands.map((band) => band.gainDb), preset.name).toEqual(expected.gains);

      const usesParametricFilter = preset.bands.some((band) => band.filterType && band.filterType !== 'peaking');

      if (usesParametricFilter) {
        expect(preset.bands.some((band) => band.filterType === 'lowPass' || band.filterType === 'highPass' || band.filterType === 'notch'), preset.name).toBe(true);
        continue;
      }

      if (preset.id === 'flat') {
        continue;
      }

      const gains = preset.bands.map((band) => band.gainDb);
      expect(Math.max(...gains) - Math.min(...gains), preset.name).toBeGreaterThanOrEqual(3.5);
      expect(gains.filter((gainDb) => Math.abs(gainDb) >= 1).length, preset.name).toBeGreaterThanOrEqual(6);
    }
  });

  it('clamps channel balance parameters before updating state', async () => {
    const bridge = createBridge();

    await bridge.setChannelBalanceState({
      enabled: true,
      balance: 5,
      leftGainDb: -80,
      rightGainDb: 12,
      leftDelayMs: -2,
      rightDelayMs: 99,
      monoMode: 'sum',
      constantPower: false,
    });

    expect(bridge.getChannelBalanceState()).toMatchObject({
      enabled: true,
      balance: 1,
      leftGainDb: -12,
      rightGainDb: 6,
      leftDelayMs: 0,
      rightDelayMs: 10,
      monoMode: 'sum',
      constantPower: false,
    });
  });

  it('resets channel balance to a transparent default', async () => {
    const bridge = createBridge();

    await bridge.setChannelBalanceState({
      enabled: true,
      balance: -0.5,
      swapLeftRight: true,
      monoMode: 'left',
      invertRight: true,
    });
    await bridge.resetChannelBalance();

    expect(bridge.getChannelBalanceState()).toMatchObject({
      enabled: false,
      balance: 0,
      leftGainDb: 0,
      rightGainDb: 0,
      leftDelayMs: 0,
      rightDelayMs: 0,
      swapLeftRight: false,
      monoMode: 'off',
      invertLeft: false,
      invertRight: false,
      constantPower: true,
    });
  });
});
