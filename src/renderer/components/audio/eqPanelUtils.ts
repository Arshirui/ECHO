import type { ChannelBalanceState } from '../../../shared/types/audio';
import {
  channelBalanceMaxBalance,
  channelBalanceMaxGainDb,
  channelBalanceMinBalance,
  channelBalanceMinGainDb,
} from '../../../shared/types/audio';
import type { EqBand, EqState } from '../../../shared/types/eq';
import { eqMaxGainDb, eqMinGainDb, eqMinPreampDb } from '../../../shared/types/eq';

export type EqCurvePoint = {
  x: number;
  y: number;
};

const curveMinFrequencyHz = 20;
const curveMaxFrequencyHz = 20000;

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const formatDb = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;

export const formatFrequencyLabel = (frequencyHz: number): string => {
  if (frequencyHz >= 1000) {
    const khz = frequencyHz / 1000;
    return `${Number.isInteger(khz) ? khz : khz.toFixed(1)}k`;
  }

  return String(frequencyHz);
};

export const computeRecommendedPreamp = (eqState: Pick<EqState, 'bands'>): number => {
  const maxBandGainDb = Math.max(0, ...eqState.bands.map((band) => band.gainDb));
  return maxBandGainDb === 0 ? 0 : clamp(-maxBandGainDb, eqMinPreampDb, 0);
};

const gainToCurveY = (gainDb: number): number => {
  const normalized = (clamp(gainDb, eqMinGainDb, eqMaxGainDb) - eqMinGainDb) / (eqMaxGainDb - eqMinGainDb);
  return clamp(1 - normalized, 0, 1);
};

const frequencyToCurveX = (frequencyHz: number): number => {
  const minLog = Math.log10(curveMinFrequencyHz);
  const maxLog = Math.log10(curveMaxFrequencyHz);
  const currentLog = Math.log10(clamp(frequencyHz, curveMinFrequencyHz, curveMaxFrequencyHz));
  return clamp((currentLog - minLog) / (maxLog - minLog), 0, 1);
};

export const computeEqCurvePoints = (bands: EqBand[]): EqCurvePoint[] =>
  bands
    .map((band) => ({
      x: frequencyToCurveX(band.frequencyHz),
      y: gainToCurveY(band.gainDb),
    }))
    .sort((a, b) => a.x - b.x);

export const clampChannelBalancePatch = (patch: Partial<ChannelBalanceState>): Partial<ChannelBalanceState> => {
  const nextPatch = { ...patch };

  if (typeof nextPatch.balance === 'number') {
    nextPatch.balance = clamp(nextPatch.balance, channelBalanceMinBalance, channelBalanceMaxBalance);
  }

  if (typeof nextPatch.leftGainDb === 'number') {
    nextPatch.leftGainDb = clamp(nextPatch.leftGainDb, channelBalanceMinGainDb, channelBalanceMaxGainDb);
  }

  if (typeof nextPatch.rightGainDb === 'number') {
    nextPatch.rightGainDb = clamp(nextPatch.rightGainDb, channelBalanceMinGainDb, channelBalanceMaxGainDb);
  }

  return nextPatch;
};
