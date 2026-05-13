// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AudioStatus, ChannelBalanceState } from '../../../shared/types/audio';
import type { EqPreset, EqState } from '../../../shared/types/eq';
import { EqPanel } from './EqPanel';

const bands = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequencyHz) => ({
  frequencyHz,
  gainDb: 0,
  q: 1,
}));

const eqState = (overrides: Partial<EqState> = {}): EqState => ({
  enabled: false,
  preampDb: 0,
  bands,
  presetId: 'flat',
  presetName: 'Flat',
  clippingRisk: false,
  ...overrides,
});

const presets: EqPreset[] = [
  { id: 'flat', name: 'Flat', preampDb: 0, bands, createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
  { id: 'rock', name: 'Rock', preampDb: -3, bands, createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
  { id: 'user-bright', name: 'User Bright', preampDb: -4, bands, createdAt: 'now', updatedAt: 'now', readonly: false },
];

const channelBalanceState = (overrides: Partial<ChannelBalanceState> = {}): ChannelBalanceState => ({
  enabled: false,
  balance: 0,
  leftGainDb: 0,
  rightGainDb: 0,
  swapLeftRight: false,
  monoMode: 'off',
  invertLeft: false,
  invertRight: false,
  constantPower: true,
  clippingRisk: false,
  ...overrides,
});

const audioStatus: AudioStatus = {
  host: 'ready',
  state: 'playing',
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: 'wasapi-exclusive',
  outputMode: 'exclusive',
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: 'nightcore',
  currentFilePath: null,
  currentTrackId: null,
  durationSeconds: 0,
  positionSeconds: 0,
  channels: 2,
  codec: 'FLAC',
  bitDepth: 24,
  bitrate: 1400000,
  fileSampleRate: 44100,
  decoderOutputSampleRate: 44100,
  requestedOutputSampleRate: 44100,
  actualDeviceSampleRate: 44100,
  sharedDeviceSampleRate: null,
  resampling: false,
  bitPerfectCandidate: false,
  sampleRateMismatch: false,
  eqEnabled: true,
  channelBalanceEnabled: false,
  dspActive: true,
  preampDb: 0,
  eqPresetName: 'Flat',
  clippingRisk: false,
  bitPerfectDisabledReason: 'eq_enabled',
  warnings: ['eq_enabled_bit_perfect_disabled'],
  error: null,
};

beforeEach(() => {
  const currentState = eqState({
    bands: bands.map((band, index) => (index === 1 ? { ...band, gainDb: 6 } : band)),
  });

  window.echo = {
    eq: {
      getState: vi.fn().mockResolvedValue(currentState),
      listPresets: vi.fn().mockResolvedValue(presets),
      setEnabled: vi.fn().mockImplementation((enabled: boolean) => Promise.resolve(eqState({ enabled }))),
      setBandGain: vi.fn().mockImplementation(({ band, gainDb }: { band: number; gainDb: number }) =>
        Promise.resolve(eqState({ presetId: 'custom', presetName: 'Custom', bands: bands.map((item, index) => (index === band ? { ...item, gainDb } : item)) })),
      ),
      setBandFrequency: vi.fn().mockImplementation(({ band, frequencyHz }: { band: number; frequencyHz: number }) =>
        Promise.resolve(eqState({ presetId: 'custom', presetName: 'Custom', bands: bands.map((item, index) => (index === band ? { ...item, frequencyHz } : item)) })),
      ),
      setPreamp: vi.fn().mockImplementation((preampDb: number) => Promise.resolve(eqState({ preampDb }))),
      setPreset: vi.fn().mockImplementation((presetId: string) => Promise.resolve(eqState({ presetId, presetName: presetId === 'rock' ? 'Rock' : 'User Bright' }))),
      reset: vi.fn().mockResolvedValue(eqState()),
      savePreset: vi.fn().mockResolvedValue(presets[2]),
      deletePreset: vi.fn().mockResolvedValue(presets.slice(0, 2)),
      getChannelBalanceState: vi.fn().mockResolvedValue(channelBalanceState()),
      setChannelBalanceState: vi.fn().mockImplementation((patch) => Promise.resolve(channelBalanceState(patch))),
      resetChannelBalance: vi.fn().mockResolvedValue(channelBalanceState()),
    },
  } as unknown as Window['echo'];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EqPanel', () => {
  it('renders the HiFi graphic EQ panel with response curve and status cards', async () => {
    render(<EqPanel audioStatus={audioStatus} />);

    await screen.findByRole('img', { name: 'Draggable 10-band EQ frequency response' });
    expect(screen.getByText('10-band Graphic EQ')).toBeTruthy();
    expect(screen.getByText('HiFi DSP panel')).toBeTruthy();
    expect(screen.getByText('Headroom')).toBeTruthy();
    expect(screen.getByText('Bit-perfect')).toBeTruthy();
  });

  it('lets the EQ curve nodes update band gain and frequency directly', async () => {
    render(<EqPanel audioStatus={audioStatus} />);

    const curve = await screen.findByRole('img', { name: 'Draggable 10-band EQ frequency response' });
    curve.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 920,
      bottom: 260,
      width: 920,
      height: 260,
      toJSON: () => undefined,
    }));

    const node = await screen.findByTestId('eq-curve-node-2');
    fireEvent.pointerDown(node, { clientX: 410, clientY: 94, pointerId: 1 });
    fireEvent.pointerMove(curve, { clientX: 410, clientY: 94, pointerId: 1 });
    fireEvent.pointerUp(curve, { clientX: 410, clientY: 94, pointerId: 1 });

    await waitFor(() => expect(window.echo.eq.setBandGain).toHaveBeenCalledWith({ band: 2, gainDb: 3.6 }));
    await waitFor(() => expect(window.echo.eq.setBandFrequency).toHaveBeenCalledWith({ band: 2, frequencyHz: expect.any(Number) }));

    fireEvent.click(screen.getByText(/^Reset \d/));
    await waitFor(() => expect(window.echo.eq.setBandGain).toHaveBeenCalledWith({ band: 2, gainDb: 0 }));
  });

  it('auto preamp applies the recommended safe headroom', async () => {
    render(<EqPanel audioStatus={audioStatus} />);

    fireEvent.click(await screen.findByRole('button', { name: /Auto -6.0 dB/i }));

    await waitFor(() => expect(window.echo.eq.setPreamp).toHaveBeenCalledWith(-6));
  });

  it('temporarily disables EQ while holding the bypass button', async () => {
    render(<EqPanel audioStatus={audioStatus} />);

    const bypass = await screen.findByRole('button', { name: 'Hold to Bypass EQ' });
    fireEvent.pointerDown(bypass);

    await waitFor(() => expect(window.echo.eq.setEnabled).toHaveBeenCalledWith(false));
  });

  it('selects presets, resets to Flat, and prevents built-in preset deletion', async () => {
    render(<EqPanel audioStatus={audioStatus} />);

    fireEvent.change(await screen.findByLabelText('EQ preset'), { target: { value: 'rock' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset EQ' }));

    await waitFor(() => expect(window.echo.eq.setPreset).toHaveBeenCalledWith('rock'));
    expect(window.echo.eq.reset).toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Delete/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows channel balance controls and clamps channel balance patches', async () => {
    render(<EqPanel audioStatus={audioStatus} />);

    fireEvent.change(await screen.findByLabelText('Channel balance'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Left gain'), { target: { value: '-50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sum' }));

    await waitFor(() => expect(window.echo.eq.setChannelBalanceState).toHaveBeenCalledWith({ balance: 1 }));
    await waitFor(() => expect(window.echo.eq.setChannelBalanceState).toHaveBeenCalledWith({ leftGainDb: -12 }));
    await waitFor(() => expect(window.echo.eq.setChannelBalanceState).toHaveBeenCalledWith({ monoMode: 'sum' }));
  });
});
