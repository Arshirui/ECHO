import type { AudioOutputMode } from '../../../shared/types/audio';

export type LyricsSmartAlignmentOutputMode = Extract<AudioOutputMode, 'shared' | 'exclusive' | 'asio'>;

export type LyricsSmartAlignmentAnchor = {
  lyricLineTimeMs: number;
  playbackMs: number;
  globalOffsetMs: number;
  outputMode: LyricsSmartAlignmentOutputMode;
};

export type LyricsSmartAlignmentConfidence = 'low' | 'medium' | 'high';

export type LyricsSmartAlignmentSuggestion = {
  offsetMs: number;
  confidence: LyricsSmartAlignmentConfidence;
  reason: string;
  outputMode: LyricsSmartAlignmentOutputMode;
  anchorCount: number;
  spreadMs: number;
  driftMs: number;
  driftDetected: boolean;
  canApply: boolean;
  rejectedAnchors: LyricsSmartAlignmentAnchor[];
};

const minOffsetMs = -10000;
const maxOffsetMs = 10000;
const outlierThresholdMs = 750;
const highConfidenceSpreadMs = 180;
const mediumConfidenceSpreadMs = 420;
const driftThresholdMs = 650;

const clampOffset = (value: number): number =>
  Math.max(minOffsetMs, Math.min(maxOffsetMs, Math.round(value)));

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const isFiniteAnchor = (anchor: LyricsSmartAlignmentAnchor): boolean =>
  Number.isFinite(anchor.lyricLineTimeMs) &&
  Number.isFinite(anchor.playbackMs) &&
  Number.isFinite(anchor.globalOffsetMs) &&
  (anchor.outputMode === 'shared' || anchor.outputMode === 'exclusive' || anchor.outputMode === 'asio');

export const getLyricsSmartAlignmentRawOffset = (anchor: LyricsSmartAlignmentAnchor): number =>
  anchor.lyricLineTimeMs - (anchor.playbackMs + anchor.globalOffsetMs);

const detectDrift = (anchors: LyricsSmartAlignmentAnchor[]): { driftMs: number; driftDetected: boolean } => {
  if (anchors.length < 3) {
    return { driftMs: 0, driftDetected: false };
  }

  const sorted = [...anchors].sort((left, right) => left.lyricLineTimeMs - right.lyricLineTimeMs);
  const firstAnchor = sorted[0]!;
  const lastAnchor = sorted[sorted.length - 1]!;
  const driftMs = Math.round(
    getLyricsSmartAlignmentRawOffset(lastAnchor) -
      getLyricsSmartAlignmentRawOffset(firstAnchor),
  );

  return {
    driftMs,
    driftDetected: Math.abs(driftMs) >= driftThresholdMs,
  };
};

export const suggestLyricsSmartAlignment = (
  anchors: LyricsSmartAlignmentAnchor[],
): LyricsSmartAlignmentSuggestion | null => {
  const validAnchors = anchors.filter(isFiniteAnchor);
  if (!validAnchors.length) {
    return null;
  }

  const rawOffsets = validAnchors.map(getLyricsSmartAlignmentRawOffset);
  const rawMedian = median(rawOffsets);
  const accepted = validAnchors.filter((anchor) =>
    Math.abs(getLyricsSmartAlignmentRawOffset(anchor) - rawMedian) <= outlierThresholdMs,
  );
  const effectiveAnchors = accepted.length ? accepted : validAnchors;
  const effectiveOffsets = effectiveAnchors.map(getLyricsSmartAlignmentRawOffset);
  const nextOffsetMs = clampOffset(median(effectiveOffsets));
  const spreadMs = Math.max(...effectiveOffsets.map((offset) => Math.abs(offset - nextOffsetMs)), 0);
  const rejectedAnchors = validAnchors.filter((anchor) => !effectiveAnchors.includes(anchor));
  const { driftMs, driftDetected } = detectDrift(effectiveAnchors);
  const confidence: LyricsSmartAlignmentConfidence =
    validAnchors.length === 1
      ? 'medium'
      : rejectedAnchors.length > 0 || driftDetected || spreadMs > mediumConfidenceSpreadMs
        ? 'low'
        : spreadMs <= highConfidenceSpreadMs
          ? 'high'
          : 'medium';
  const reason =
    validAnchors.length === 1
      ? 'single_anchor'
      : rejectedAnchors.length > 0
        ? 'outlier_rejected'
        : driftDetected
          ? 'possible_drift'
          : spreadMs > mediumConfidenceSpreadMs
            ? 'unstable_anchors'
            : 'stable_anchors';

  return {
    offsetMs: nextOffsetMs,
    confidence,
    reason,
    outputMode: effectiveAnchors[effectiveAnchors.length - 1].outputMode,
    anchorCount: effectiveAnchors.length,
    spreadMs: Math.round(spreadMs),
    driftMs,
    driftDetected,
    canApply: confidence !== 'low',
    rejectedAnchors,
  };
};
