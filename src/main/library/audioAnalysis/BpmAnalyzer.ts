import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcessByStdio, SpawnOptionsWithStdioTuple } from 'node:child_process';
import type { Readable } from 'node:stream';
import readline from 'node:readline';
import { resolveFfmpegToolchainPath } from '../../audio/FfmpegToolchain';

type AnalyzerProcess = ChildProcessByStdio<null, Readable, Readable>;
type AnalyzerSpawnOptions = SpawnOptionsWithStdioTuple<'ignore', 'pipe', 'pipe'> & {
  windowsHide: boolean;
};
type AnalyzerSpawner = (file: string, args: string[], options: AnalyzerSpawnOptions) => AnalyzerProcess;

export type BpmAnalyzerDependencies = {
  ffmpegPath?: string;
  spawn?: AnalyzerSpawner;
  logger?: (message: string) => void;
};

export type BpmAnalyzerResult = {
  bpm: number;
  confidence: number;
  beatOffsetMs: number;
};

export type BpmAnalyzerOptions = {
  headers?: Record<string, string>;
};

const sampleRate = 11025;
const maxAnalyzeSeconds = 90;
const minAnalyzeSeconds = 20;
const frameSize = 1024;
const hopSize = 512;
const minBpm = 60;
const maxBpm = 200;
const stableMinBpm = 80;
const stableMaxBpm = 180;

const defaultLogger = (message: string): void => {
  console.warn(message);
};

const appendTailLine = (lines: string[], line: string): void => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  lines.push(trimmed);
  if (lines.length > 8) {
    lines.shift();
  }
};

const clamp = (value: number, minimum = 0, maximum = 1): number => Math.max(minimum, Math.min(maximum, value));

const normalizeBpm = (bpm: number): number => {
  let normalized = bpm;
  while (normalized < stableMinBpm) {
    normalized *= 2;
  }
  while (normalized > stableMaxBpm) {
    normalized /= 2;
  }
  return normalized;
};

const median = (values: number[]): number => {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const percentile = (values: number[], ratio: number): number => {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
};

const readInt16Pcm = (buffer: Buffer): Float32Array => {
  const sampleCount = Math.floor(buffer.length / 2);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = buffer.readInt16LE(index * 2) / 32768;
  }
  return samples;
};

const onsetEnvelope = (samples: Float32Array): Float32Array => {
  const frameCount = Math.max(0, Math.floor((samples.length - frameSize) / hopSize));
  const energy = new Float32Array(frameCount);
  const envelope = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    let sum = 0;
    for (let offset = 0; offset < frameSize; offset += 1) {
      const sample = samples[start + offset] ?? 0;
      sum += sample * sample;
    }
    energy[frame] = Math.sqrt(sum / frameSize);
  }

  for (let frame = 1; frame < frameCount; frame += 1) {
    const historyStart = Math.max(0, frame - 8);
    const baseline = median(Array.from(energy.slice(historyStart, frame)));
    envelope[frame] = Math.max(0, energy[frame] - baseline * 1.12);
  }

  for (let frame = 1; frame < frameCount - 1; frame += 1) {
    envelope[frame] = envelope[frame - 1] * 0.2 + envelope[frame] * 0.6 + envelope[frame + 1] * 0.2;
  }

  const peak = Math.max(...envelope);
  if (peak > 0) {
    for (let frame = 0; frame < envelope.length; frame += 1) {
      envelope[frame] /= peak;
    }
  }

  return envelope;
};

type TempoCandidate = {
  bpm: number;
  lag: number;
  score: number;
  autocorrelation: number;
};

const tempoEquivalent = (left: number, right: number): boolean => {
  for (const multiplier of [0.5, 1, 2]) {
    const expected = right * multiplier;
    if (Math.abs(left - expected) / Math.max(1, expected) <= 0.035) {
      return true;
    }
  }

  return false;
};

const interpolatedScore = (scores: Float32Array, lag: number): number => {
  if (lag < 1 || lag >= scores.length - 1) {
    return 0;
  }

  const left = Math.floor(lag);
  const fraction = lag - left;
  return scores[left] * (1 - fraction) + scores[left + 1] * fraction;
};

const phaseFit = (envelope: Float32Array, bpm: number, envelopeRate: number): { offsetMs: number; fit: number } => {
  const beatPeriodFrames = Math.max(1, Math.round((60 / bpm) * envelopeRate));
  const phaseScores = new Float32Array(beatPeriodFrames);

  for (let index = 0; index < envelope.length; index += 1) {
    const value = envelope[index];
    if (value > 0.08) {
      phaseScores[index % beatPeriodFrames] += value;
    }
  }

  let bestPhase = 0;
  let bestPhaseScore = 0;
  for (let phase = 0; phase < phaseScores.length; phase += 1) {
    if (phaseScores[phase] > bestPhaseScore) {
      bestPhaseScore = phaseScores[phase];
      bestPhase = phase;
    }
  }

  let totalWeight = 0;
  let alignedWeight = 0;
  const tolerance = Math.max(1, beatPeriodFrames * 0.18);
  for (let index = 0; index < envelope.length; index += 1) {
    const value = envelope[index];
    if (value <= 0.08) {
      continue;
    }

    const phase = (index - bestPhase + beatPeriodFrames) % beatPeriodFrames;
    const distance = Math.min(phase, beatPeriodFrames - phase);
    totalWeight += value;
    alignedWeight += value * clamp(1 - distance / tolerance);
  }

  return {
    offsetMs: Math.round((bestPhase / envelopeRate) * 1000),
    fit: totalWeight > 0 ? alignedWeight / totalWeight : 0,
  };
};

const estimateTempo = (envelope: Float32Array): BpmAnalyzerResult => {
  const envelopeRate = sampleRate / hopSize;
  const minLag = Math.max(1, Math.floor((60 * envelopeRate) / maxBpm));
  const maxLag = Math.ceil((60 * envelopeRate) / minBpm);
  const lagScores = new Float32Array(maxLag + 1);
  const candidates: TempoCandidate[] = [];

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = lag; index < envelope.length; index += 1) {
      const left = envelope[index];
      const right = envelope[index - lag];
      numerator += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    lagScores[lag] = leftEnergy > 0 && rightEnergy > 0 ? numerator / Math.sqrt(leftEnergy * rightEnergy) : 0;
  }

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const rawBpm = 60 * envelopeRate / lag;
    const bpm = normalizeBpm(rawBpm);
    const autocorrelation = lagScores[lag];
    const harmonicScore =
      autocorrelation * 0.58 +
      interpolatedScore(lagScores, lag / 2) * 0.14 +
      interpolatedScore(lagScores, lag * 2) * 0.2 +
      interpolatedScore(lagScores, lag * 3) * 0.08;
    const centerPreference = bpm >= 90 && bpm <= 170 ? 1 : 0.94;
    candidates.push({
      bpm,
      lag,
      score: harmonicScore * centerPreference,
      autocorrelation,
    });
  }

  const best = candidates.reduce<TempoCandidate | null>((currentBest, candidate) => {
    if (!currentBest || candidate.score > currentBest.score) {
      return candidate;
    }
    return currentBest;
  }, null);

  if (!best) {
    return {
      bpm: 0,
      confidence: 0,
      beatOffsetMs: 0,
    };
  }

  const competingScores = candidates
    .filter((candidate) => !tempoEquivalent(candidate.bpm, best.bpm))
    .map((candidate) => candidate.score);
  const backgroundScore = percentile(competingScores, 0.82);
  const contrast = best.score > 0 ? clamp((best.score - backgroundScore) / best.score) : 0;
  const prominentOnsets = Array.from(envelope).filter((value) => value > 0.18);
  const onsetDensity = prominentOnsets.length / Math.max(1, envelope.length);
  const onsetPeak = percentile(Array.from(envelope), 0.95);
  const onsetMedian = percentile(Array.from(envelope), 0.5);
  const onsetClarity = onsetPeak > 0 ? clamp((onsetPeak - onsetMedian) / onsetPeak) : 0;
  const { fit, offsetMs } = phaseFit(envelope, best.bpm, envelopeRate);
  const densityPenalty = onsetDensity < 0.006 || onsetDensity > 0.45 ? 0.72 : 1;
  const periodicStrength = clamp(best.autocorrelation / 0.48);
  const rhythmicStability = Math.sqrt(clamp(fit * 0.52 + periodicStrength * 0.36 + onsetClarity * 0.12));
  const confidence = clamp(rhythmicStability * (0.82 + contrast * 0.18) * densityPenalty);

  return {
    bpm: Math.round(best.bpm * 100) / 100,
    confidence: Math.round(confidence * 1000) / 1000,
    beatOffsetMs: offsetMs,
  };
};

export class BpmAnalyzer {
  private readonly ffmpegPath: string;
  private readonly spawn: AnalyzerSpawner;
  private readonly logger: (message: string) => void;

  constructor(dependencies: BpmAnalyzerDependencies = {}) {
    this.ffmpegPath = dependencies.ffmpegPath ?? resolveFfmpegToolchainPath();
    this.spawn = dependencies.spawn ?? (nodeSpawn as AnalyzerSpawner);
    this.logger = dependencies.logger ?? defaultLogger;
  }

  async analyze(filePath: string, durationSeconds = maxAnalyzeSeconds, options: BpmAnalyzerOptions = {}): Promise<BpmAnalyzerResult> {
    const analyzeSeconds = Math.max(minAnalyzeSeconds, Math.min(maxAnalyzeSeconds, durationSeconds || maxAnalyzeSeconds));
    const inputHeaders = Object.entries(options.headers ?? {})
      .filter(([name, value]) => name.trim() && value.trim())
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join('');
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      ...(inputHeaders ? ['-headers', inputHeaders] : []),
      '-i',
      filePath,
      '-vn',
      '-t',
      String(analyzeSeconds),
      '-f',
      's16le',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      'pipe:1',
    ];
    const stderrLines: string[] = [];
    const proc = this.spawn(this.ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    const stderr = readline.createInterface({ input: proc.stderr });
    stderr.on('line', (line) => {
      appendTailLine(stderrLines, line);
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    await new Promise<void>((resolve, reject) => {
      proc.on('error', reject);
      proc.on('exit', (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`ffmpeg_exit_${code ?? signal ?? 'unknown'}: ${stderrLines.join(' | ')}`));
      });
    });

    const samples = readInt16Pcm(Buffer.concat(chunks));
    if (samples.length < sampleRate * 10) {
      throw new Error('audio_too_short_for_bpm_analysis');
    }

    const result = estimateTempo(onsetEnvelope(samples));
    this.logger(
      `[BpmAnalyzer] file="${filePath}" bpm=${result.bpm} confidence=${result.confidence} offsetMs=${result.beatOffsetMs}`,
    );
    return result;
  }
}
