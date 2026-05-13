import { describe, expect, it } from 'vitest';
import type { ChannelBalanceState } from '../../../shared/types/audio';
import type { EqState } from '../../../shared/types/eq';
import { clampChannelBalancePatch, computeEqCurvePoints, computeRecommendedPreamp, formatFrequencyLabel } from './eqPanelUtils';

const eqState = (gains: number[]): EqState => ({
  enabled: true,
  preampDb: 0,
  presetId: 'custom',
  presetName: 'Custom',
  clippingRisk: false,
  bands: gains.map((gainDb, index) => ({
    frequencyHz: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000][index] ?? 1000,
    gainDb,
    q: 1,
  })),
});

describe('eqPanelUtils', () => {
  it('computes safe recommended preamp from positive band gain', () => {
    expect(computeRecommendedPreamp(eqState([0, 0, 0]))).toBe(0);
    expect(computeRecommendedPreamp(eqState([0, 6, -2]))).toBe(-6);
    expect(computeRecommendedPreamp(eqState([12, 4, 0]))).toBe(-12);
    expect(computeRecommendedPreamp(eqState([-4, -2, -8]))).toBe(0);
  });

  it('formats graphic EQ frequency labels', () => {
    expect(formatFrequencyLabel(1000)).toBe('1k');
    expect(formatFrequencyLabel(16000)).toBe('16k');
    expect(formatFrequencyLabel(62)).toBe('62');
  });

  it('computes bounded curve points', () => {
    const points = computeEqCurvePoints(eqState([12, 0, -12]).bands);

    expect(points.length).toBeGreaterThan(0);
    points.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    });
  });

  it('clamps channel balance patch values before sending IPC', () => {
    const patch: Partial<ChannelBalanceState> = {
      balance: 3,
      leftGainDb: -30,
      rightGainDb: 12,
    };

    expect(clampChannelBalancePatch(patch)).toMatchObject({
      balance: 1,
      leftGainDb: -12,
      rightGainDb: 6,
    });
  });
});
