import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, RotateCcw, Save, ShieldCheck, Shuffle, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { AudioStatus, ChannelBalanceMonoMode, ChannelBalanceState } from '../../../shared/types/audio';
import {
  channelBalanceMaxGainDb,
  channelBalanceMinGainDb,
} from '../../../shared/types/audio';
import type { EqPreset, EqState } from '../../../shared/types/eq';
import { eqFrequenciesHz, eqMaxFrequencyHz, eqMaxPreampDb, eqMinFrequencyHz, eqMinPreampDb } from '../../../shared/types/eq';
import { getEqBridge } from '../../utils/echoBridge';
import { EqCurveView } from './EqCurveView';
import { EqPresetSelector } from './EqPresetSelector';
import { clampChannelBalancePatch, computeRecommendedPreamp, formatDb, formatFrequencyLabel } from './eqPanelUtils';

type EqPanelProps = {
  audioStatus: AudioStatus | null;
  onAudioStatusRefresh?: () => void;
};

const fallbackState: EqState = {
  enabled: false,
  preampDb: 0,
  presetId: 'flat',
  presetName: 'Flat',
  clippingRisk: false,
  bands: eqFrequenciesHz.map((frequencyHz) => ({
    frequencyHz,
    gainDb: 0,
    q: 1,
  })),
};

const fallbackChannelBalanceState: ChannelBalanceState = {
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
};

const monoModeOptions: Array<{ value: ChannelBalanceMonoMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'sum', label: 'Sum' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const calculateBalanceGains = (balance: number, constantPower: boolean): { left: number; right: number } => {
  const safeBalance = clamp(balance, -1, 1);

  if (!constantPower) {
    return {
      left: safeBalance > 0 ? 1 - safeBalance : 1,
      right: safeBalance < 0 ? 1 + safeBalance : 1,
    };
  }

  const pan = (safeBalance + 1) * Math.PI * 0.25;
  const compensation = Math.sqrt(2);
  return {
    left: Math.min(1, Math.cos(pan) * compensation),
    right: Math.min(1, Math.sin(pan) * compensation),
  };
};

const gainToDb = (gain: number): number => (gain > 0 ? 20 * Math.log10(gain) : -Infinity);

export const EqPanel = ({ audioStatus, onAudioStatusRefresh }: EqPanelProps): JSX.Element => {
  const [state, setState] = useState<EqState>(fallbackState);
  const [channelBalance, setChannelBalance] = useState<ChannelBalanceState>(fallbackChannelBalanceState);
  const [presets, setPresets] = useState<EqPreset[]>([]);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedBandIndex, setSelectedBandIndex] = useState(0);
  const [bypassSnapshot, setBypassSnapshot] = useState<boolean | null>(null);
  const debounceTimers = useRef<Record<number, number>>({});
  const frequencyDebounceTimers = useRef<Record<number, number>>({});

  const selectedPresetReadonly = presets.find((preset) => preset.id === state.presetId)?.readonly ?? true;
  const clippingRisk = Boolean(state.clippingRisk || channelBalance.clippingRisk || audioStatus?.clippingRisk);
  const eqOrBalanceEnabled = state.enabled || channelBalance.enabled;
  const dspActive = Boolean(audioStatus?.dspActive || eqOrBalanceEnabled);
  const recommendedPreampDb = computeRecommendedPreamp(state);
  const canAutoPreamp = Math.abs(state.preampDb - recommendedPreampDb) > 0.05;
  const selectedBand = state.bands[selectedBandIndex] ?? state.bands[0];

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const eq = getEqBridge();

      if (!eq) {
        setPresets([]);
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to control EQ.');
        return;
      }

      const [nextState, nextPresets, nextChannelBalance] = await Promise.all([eq.getState(), eq.listPresets(), eq.getChannelBalanceState()]);
      setState(nextState);
      setPresets(nextPresets);
      setChannelBalance(nextChannelBalance);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commitState = useCallback(
    (nextState: EqState): void => {
      setState(nextState);
      onAudioStatusRefresh?.();
    },
    [onAudioStatusRefresh],
  );

  const commitChannelBalance = useCallback(
    (nextState: ChannelBalanceState): void => {
      setChannelBalance(nextState);
      onAudioStatusRefresh?.();
    },
    [onAudioStatusRefresh],
  );

  const setEnabled = (enabled: boolean): void => {
    const eq = getEqBridge();
    setState((current) => ({ ...current, enabled }));

    if (!eq) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to control EQ.');
      return;
    }

    void eq.setEnabled(enabled).then(commitState).catch((toggleError: unknown) => {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    });
  };

  const sendBandGain = useCallback(
    (band: number, gainDb: number): void => {
      const eq = getEqBridge();

      if (!eq) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to control EQ.');
        return;
      }

      void eq.setBandGain({ band, gainDb }).then(commitState).catch((bandError: unknown) => {
        setError(bandError instanceof Error ? bandError.message : String(bandError));
      });
    },
    [commitState],
  );

  const handleBandChange = (band: number, gainDb: number): void => {
    setSelectedBandIndex(band);
    setState((current) => ({
      ...current,
      presetId: 'custom',
      presetName: 'Custom',
      bands: current.bands.map((item, index) => (index === band ? { ...item, gainDb } : item)),
    }));

    window.clearTimeout(debounceTimers.current[band]);
    debounceTimers.current[band] = window.setTimeout(() => sendBandGain(band, gainDb), 45);
  };

  const handleBandCommit = (band: number, gainDb: number): void => {
    setSelectedBandIndex(band);
    window.clearTimeout(debounceTimers.current[band]);
    sendBandGain(band, gainDb);
  };

  const sendBandFrequency = useCallback(
    (band: number, frequencyHz: number): void => {
      const eq = getEqBridge();

      if (!eq) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to control EQ.');
        return;
      }

      void eq.setBandFrequency({ band, frequencyHz }).then(commitState).catch((bandError: unknown) => {
        setError(bandError instanceof Error ? bandError.message : String(bandError));
      });
    },
    [commitState],
  );

  const handleBandFrequencyChange = (band: number, frequencyHz: number): void => {
    const safeFrequencyHz = clamp(frequencyHz, eqMinFrequencyHz, eqMaxFrequencyHz);
    setSelectedBandIndex(band);
    setState((current) => ({
      ...current,
      presetId: 'custom',
      presetName: 'Custom',
      bands: current.bands.map((item, index) => (index === band ? { ...item, frequencyHz: safeFrequencyHz } : item)),
    }));

    window.clearTimeout(frequencyDebounceTimers.current[band]);
    frequencyDebounceTimers.current[band] = window.setTimeout(() => sendBandFrequency(band, safeFrequencyHz), 45);
  };

  const handleBandFrequencyCommit = (band: number, frequencyHz: number): void => {
    const safeFrequencyHz = clamp(frequencyHz, eqMinFrequencyHz, eqMaxFrequencyHz);
    setSelectedBandIndex(band);
    window.clearTimeout(frequencyDebounceTimers.current[band]);
    sendBandFrequency(band, safeFrequencyHz);
  };

  const handlePreampChange = (preampDb: number): void => {
    const eq = getEqBridge();
    setState((current) => ({ ...current, preampDb, presetId: 'custom', presetName: 'Custom' }));

    if (!eq) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to control EQ.');
      return;
    }

    void eq.setPreamp(preampDb).then(commitState).catch((preampError: unknown) => {
      setError(preampError instanceof Error ? preampError.message : String(preampError));
    });
  };

  const setPreset = (presetId: string): void => {
    const eq = getEqBridge();

    if (!eq) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to control EQ.');
      return;
    }

    void eq.setPreset(presetId).then(commitState).catch((presetError: unknown) => {
      setError(presetError instanceof Error ? presetError.message : String(presetError));
    });
  };

  const reset = (): void => {
    const eq = getEqBridge();

    if (!eq) {
      setState(fallbackState);
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to control EQ.');
      return;
    }

    void eq.reset().then(commitState).catch((resetError: unknown) => {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    });
  };

  const savePreset = async (): Promise<void> => {
    if (!saveName.trim()) {
      setError('Enter a preset name before saving.');
      return;
    }

    try {
      const eq = getEqBridge();

      if (!eq) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to save EQ presets.');
        return;
      }

      await eq.savePreset({
        name: saveName,
        preampDb: state.preampDb,
        bands: state.bands,
      });
      setSaveName('');
      setPresets(await eq.listPresets());
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const deletePreset = async (): Promise<void> => {
    if (selectedPresetReadonly) {
      return;
    }

    try {
      const eq = getEqBridge();

      if (!eq) {
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to delete EQ presets.');
        return;
      }

      setPresets(await eq.deletePreset(state.presetId));
      reset();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const patchChannelBalance = (patch: Partial<ChannelBalanceState>): void => {
    const safePatch = clampChannelBalancePatch(patch);
    const eq = getEqBridge();
    setChannelBalance((current) => ({ ...current, ...safePatch }));

    if (!eq) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to control channel balance.');
      return;
    }

    void eq.setChannelBalanceState(safePatch).then(commitChannelBalance).catch((balanceError: unknown) => {
      setError(balanceError instanceof Error ? balanceError.message : String(balanceError));
    });
  };

  const resetChannelBalance = (): void => {
    const eq = getEqBridge();

    if (!eq) {
      setChannelBalance(fallbackChannelBalanceState);
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to control channel balance.');
      return;
    }

    void eq.resetChannelBalance().then(commitChannelBalance).catch((balanceError: unknown) => {
      setError(balanceError instanceof Error ? balanceError.message : String(balanceError));
    });
  };

  const holdBypass = (): void => {
    if (bypassSnapshot !== null) {
      return;
    }

    setBypassSnapshot(state.enabled);
    setEnabled(false);
  };

  const releaseBypass = (): void => {
    if (bypassSnapshot === null) {
      return;
    }

    setEnabled(bypassSnapshot);
    setBypassSnapshot(null);
  };

  const balanceGains = calculateBalanceGains(channelBalance.balance, channelBalance.constantPower);
  const leftTotalDb = channelBalance.leftGainDb + gainToDb(balanceGains.left);
  const rightTotalDb = channelBalance.rightGainDb + gainToDb(balanceGains.right);
  const channelBalanceRisk = leftTotalDb > 0 || rightTotalDb > 0 || Boolean(channelBalance.clippingRisk);
  const bitPerfectText = dspActive
    ? `DSP active: bit-perfect disabled${audioStatus?.bitPerfectDisabledReason ? ` (${audioStatus.bitPerfectDisabledReason.replaceAll('_', ' ')})` : ''}.`
    : 'Bit-perfect path can be preserved.';

  return (
    <section className="eq-panel" aria-label="ECHO Next EQ panel" data-enabled={state.enabled}>
      <header className="eq-header">
        <div className="eq-title-block">
          <span className="eq-title-icon">
            <SlidersHorizontal size={18} />
          </span>
          <div>
            <h2>10-band Graphic EQ</h2>
            <p>HiFi DSP panel</p>
          </div>
        </div>

        <div className="eq-header-actions">
          <label className="eq-enable-pill">
            <input type="checkbox" checked={state.enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} />
            <span>{state.enabled ? 'EQ Enabled' : 'EQ Disabled'}</span>
          </label>
          <EqPresetSelector presets={presets} value={state.presetId} onChange={setPreset} />
          <button className="eq-icon-action" type="button" aria-label="Reset EQ" title="Reset EQ" onClick={reset}>
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      <div className="eq-status-cards">
        <div className="eq-status-card">
          <span>EQ</span>
          <strong>{state.enabled ? 'Enabled' : 'Disabled'}</strong>
        </div>
        <div className="eq-status-card">
          <span>Preset</span>
          <strong>{state.presetName}</strong>
        </div>
        <div className="eq-status-card">
          <span>Preamp</span>
          <strong>{formatDb(state.preampDb)}</strong>
        </div>
        <div className="eq-status-card" data-risk={clippingRisk}>
          <span>{clippingRisk ? 'Clipping Risk' : 'Headroom'}</span>
          <strong>{clippingRisk ? 'Warning' : 'Safe'}</strong>
        </div>
        <div className="eq-status-card" data-active={dspActive}>
          <span>Bit-perfect</span>
          <strong>{dspActive ? 'Disabled' : 'Ready'}</strong>
        </div>
      </div>

      <div className="eq-workbench">
        <aside className="eq-preamp-strip">
          <div>
            <span>Safe Headroom</span>
            <strong>{formatDb(state.preampDb)}</strong>
          </div>
          <input
            aria-label="EQ preamp"
            type="range"
            min={eqMinPreampDb}
            max={eqMaxPreampDb}
            step="0.1"
            value={state.preampDb}
            onChange={(event) => handlePreampChange(Number(event.currentTarget.value))}
          />
          <button className="eq-soft-button" type="button" disabled={!canAutoPreamp} onClick={() => handlePreampChange(recommendedPreampDb)}>
            Auto {formatDb(recommendedPreampDb)}
          </button>
        </aside>

        <div className="eq-curve-column">
          <EqCurveView
            bands={state.bands}
            enabled={state.enabled}
            selectedBandIndex={selectedBandIndex}
            onBandSelect={setSelectedBandIndex}
            onBandChange={handleBandChange}
            onBandCommit={handleBandCommit}
            onBandFrequencyChange={handleBandFrequencyChange}
            onBandFrequencyCommit={handleBandFrequencyCommit}
          />
          <div className="eq-band-strip" aria-label="10-band EQ draggable band readouts">
            {state.bands.map((band, index) => (
              <button
                className="eq-band-chip"
                data-selected={selectedBandIndex === index}
                type="button"
                key={`${band.frequencyHz}-${index}`}
                onClick={() => setSelectedBandIndex(index)}
                onDoubleClick={() => handleBandCommit(index, 0)}
              >
                <span>{formatFrequencyLabel(band.frequencyHz)}</span>
                <strong>{formatDb(band.gainDb)}</strong>
              </button>
            ))}
            <button className="eq-soft-button" type="button" onClick={() => handleBandCommit(selectedBandIndex, 0)}>
              Reset {selectedBand ? formatFrequencyLabel(selectedBand.frequencyHz) : 'Band'}
            </button>
          </div>
        </div>
      </div>

      <div className="eq-compare-row">
        <button
          className="eq-soft-button"
          type="button"
          onPointerDown={holdBypass}
          onPointerUp={releaseBypass}
          onPointerCancel={releaseBypass}
          onBlur={releaseBypass}
        >
          Hold to Bypass EQ
        </button>
        <span>{bitPerfectText}</span>
        {clippingRisk ? <strong>Lower Preamp to avoid clipping.</strong> : <strong><ShieldCheck size={14} /> Safe headroom</strong>}
      </div>

      <section className="channel-balance-panel" aria-label="Channel balance panel" data-enabled={channelBalance.enabled}>
        <header className="channel-balance-header">
          <div className="eq-title-block">
            <span className="eq-title-icon">
              <Headphones size={18} />
            </span>
            <div>
              <h3>Channel Balance</h3>
              <p>Balance shifts left/right. L/R Gain fine-tunes correction. Mono Sum checks mono. Invert checks phase.</p>
            </div>
          </div>
          <div className="channel-balance-actions">
            <label className="eq-enable-pill">
              <input
                type="checkbox"
                checked={channelBalance.enabled}
                onChange={(event) => patchChannelBalance({ enabled: event.currentTarget.checked })}
              />
              <span>{channelBalance.enabled ? 'Enabled' : 'Bypass'}</span>
            </label>
            <button className="eq-icon-action" type="button" aria-label="Reset channel balance" title="Reset channel balance" onClick={resetChannelBalance}>
              <RotateCcw size={15} />
            </button>
          </div>
        </header>

        <div className="channel-balance-grid">
          <label className="channel-balance-wide">
            <span>Balance</span>
            <em>L</em>
            <input
              aria-label="Channel balance"
              type="range"
              min="-100"
              max="100"
              step="1"
              value={Math.round(channelBalance.balance * 100)}
              onChange={(event) => patchChannelBalance({ balance: Number(event.currentTarget.value) / 100 })}
            />
            <em>R</em>
            <strong>{channelBalance.balance === 0 ? 'Center' : `${channelBalance.balance < 0 ? 'L' : 'R'} ${Math.round(Math.abs(channelBalance.balance) * 100)}%`}</strong>
          </label>

          <label>
            <span>Left Gain</span>
            <input
              aria-label="Left gain"
              type="range"
              min={channelBalanceMinGainDb}
              max={channelBalanceMaxGainDb}
              step="0.1"
              value={channelBalance.leftGainDb}
              onChange={(event) => patchChannelBalance({ leftGainDb: Number(event.currentTarget.value) })}
            />
            <strong>{formatDb(channelBalance.leftGainDb)}</strong>
          </label>
          <label>
            <span>Right Gain</span>
            <input
              aria-label="Right gain"
              type="range"
              min={channelBalanceMinGainDb}
              max={channelBalanceMaxGainDb}
              step="0.1"
              value={channelBalance.rightGainDb}
              onChange={(event) => patchChannelBalance({ rightGainDb: Number(event.currentTarget.value) })}
            />
            <strong>{formatDb(channelBalance.rightGainDb)}</strong>
          </label>

          <div className="channel-balance-segmented" role="group" aria-label="Mono mode">
            {monoModeOptions.map((option) => (
              <button
                className="eq-soft-button"
                data-active={channelBalance.monoMode === option.value}
                type="button"
                key={option.value}
                onClick={() => patchChannelBalance({ monoMode: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="channel-balance-switches">
            <button className="eq-soft-button" data-active={channelBalance.swapLeftRight} type="button" onClick={() => patchChannelBalance({ swapLeftRight: !channelBalance.swapLeftRight })}>
              <Shuffle size={14} />
              Swap L/R
            </button>
            <button className="eq-soft-button" data-active={channelBalance.invertLeft} type="button" onClick={() => patchChannelBalance({ invertLeft: !channelBalance.invertLeft })}>
              Invert Left
            </button>
            <button className="eq-soft-button" data-active={channelBalance.invertRight} type="button" onClick={() => patchChannelBalance({ invertRight: !channelBalance.invertRight })}>
              Invert Right
            </button>
            <button className="eq-soft-button" data-active={channelBalance.constantPower} type="button" onClick={() => patchChannelBalance({ constantPower: !channelBalance.constantPower })}>
              Constant Power
            </button>
          </div>
        </div>

        <div className="channel-balance-readout" data-risk={channelBalanceRisk || clippingRisk}>
          <span>
            <em>Left total</em>
            <strong>{Number.isFinite(leftTotalDb) ? formatDb(leftTotalDb) : '-inf dB'}</strong>
          </span>
          <span>
            <em>Right total</em>
            <strong>{Number.isFinite(rightTotalDb) ? formatDb(rightTotalDb) : '-inf dB'}</strong>
          </span>
          <span>
            <em>DSP</em>
            <strong>{channelBalance.enabled ? 'Active' : 'Bypassed'}</strong>
          </span>
          {channelBalanceRisk || clippingRisk ? <p>Clipping risk: lower gain or preamp for safer headroom.</p> : null}
          {channelBalance.enabled ? <p>DSP active: bit-perfect disabled.</p> : null}
        </div>
      </section>

      <footer className="eq-preset-tools">
        <input aria-label="Preset name" value={saveName} onChange={(event) => setSaveName(event.currentTarget.value)} placeholder="Save as user preset" />
        <button type="button" onClick={() => void savePreset()}>
          <Save size={15} />
          Save
        </button>
        <button type="button" disabled={selectedPresetReadonly} onClick={() => void deletePreset()}>
          <Trash2 size={15} />
          Delete
        </button>
        {selectedPresetReadonly ? <span>Built-in presets are read-only.</span> : null}
      </footer>

      {error ? <p className="eq-panel-error">{error}</p> : null}
    </section>
  );
};
