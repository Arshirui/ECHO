import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCopy, Music2, Play, RotateCw, Volume2, X } from 'lucide-react';
import type { BpmAnalysisJobStatus, LibraryTrack } from '../../../shared/types/library';
import { formatOsuTimingPoint, getBeatLengthMs } from '../../utils/osuTiming';

type OsuTimingPanelProps = {
  track: LibraryTrack | null;
  isOpen: boolean;
  onClose: () => void;
  onTrackUpdated?: (track: LibraryTrack) => void;
};

const bpmConfidenceThreshold = 0.42;
const analysisPollMs = 1000;
const offsetSteps = [-10, -5, -1, 1, 5, 10];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const isFinitePositive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const formatMs = (value: number): string => `${Math.round(value)} ms`;

const formatBpm = (value: number | null | undefined): string => (isFinitePositive(value) ? `${Math.round(value * 100) / 100} BPM` : 'Missing');

const formatConfidence = (value: number | null | undefined): string =>
  isFiniteNumber(value) ? `${Math.round(value * 100)}%` : 'Unknown';

const stopClickTimer = (timeoutRef: MutableRefObject<number | null>, intervalRef: MutableRefObject<number | null>): void => {
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  if (intervalRef.current !== null) {
    window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
};

export const OsuTimingPanel = ({ track, isOpen, onClose, onTrackUpdated }: OsuTimingPanelProps): JSX.Element | null => {
  const [activeTrack, setActiveTrack] = useState<LibraryTrack | null>(track);
  const [offsetAdjustmentMs, setOffsetAdjustmentMs] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisJob, setAnalysisJob] = useState<BpmAnalysisJobStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clickPreviewRunning, setClickPreviewRunning] = useState(false);
  const analysisRunRef = useRef(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const clickIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setActiveTrack(track);
    setOffsetAdjustmentMs(0);
    setAnalysisJob(null);
    setMessage(null);
    setError(null);
    setCopied(false);
    setClickPreviewRunning(false);
    stopClickTimer(clickTimeoutRef, clickIntervalRef);
  }, [track]);

  useEffect(() => {
    if (!isOpen) {
      stopClickTimer(clickTimeoutRef, clickIntervalRef);
      setClickPreviewRunning(false);
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(
    () => () => {
      analysisRunRef.current += 1;
      stopClickTimer(clickTimeoutRef, clickIntervalRef);
      void audioContextRef.current?.close().catch(() => undefined);
    },
    [],
  );

  const bpm = activeTrack?.bpm ?? null;
  const detectedOffsetMs = isFiniteNumber(activeTrack?.beatOffsetMs) ? activeTrack.beatOffsetMs : 0;
  const adjustedOffsetMs = detectedOffsetMs + offsetAdjustmentMs;
  const missingAnalysis = !isFinitePositive(bpm) || !isFiniteNumber(activeTrack?.beatOffsetMs);
  const lowConfidence =
    activeTrack?.analysisStatus === 'low_confidence' ||
    (isFiniteNumber(activeTrack?.bpmConfidence) && activeTrack.bpmConfidence < bpmConfidenceThreshold);

  const timingLine = useMemo(() => {
    if (!isFinitePositive(bpm)) {
      return null;
    }

    try {
      return formatOsuTimingPoint({ bpm, offsetMs: adjustedOffsetMs, meter: 4 });
    } catch {
      return null;
    }
  }, [adjustedOffsetMs, bpm]);

  const stopClickPreview = (): void => {
    stopClickTimer(clickTimeoutRef, clickIntervalRef);
    setClickPreviewRunning(false);
  };

  const playClick = (): void => {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      setError('This browser environment does not support Web Audio click preview.');
      stopClickPreview();
      return;
    }

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 1100;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.045);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.05);
  };

  const startClickPreview = (): void => {
    if (!isFinitePositive(bpm)) {
      setError('Run BPM analysis before starting the click preview.');
      return;
    }

    stopClickTimer(clickTimeoutRef, clickIntervalRef);
    setError(null);
    const beatLength = getBeatLengthMs(bpm);
    const firstDelay = ((adjustedOffsetMs % beatLength) + beatLength) % beatLength;

    clickTimeoutRef.current = window.setTimeout(() => {
      playClick();
      clickIntervalRef.current = window.setInterval(playClick, beatLength);
    }, firstDelay);
    setClickPreviewRunning(true);
  };

  const handlePlayTrack = async (): Promise<void> => {
    if (!activeTrack) {
      return;
    }

    const playback = window.echo?.playback;
    if (!playback?.playLocalFile) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to play this track.');
      return;
    }

    try {
      setError(null);
      await playback.playLocalFile({
        filePath: activeTrack.path,
        trackId: activeTrack.id,
        probe: {
          durationSeconds: activeTrack.duration,
          fileSampleRate: activeTrack.sampleRate,
          channels: 2,
          codec: activeTrack.codec,
          bitDepth: activeTrack.bitDepth,
          bitrate: activeTrack.bitrate,
        },
      });
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : String(playError));
    }
  };

  const handleAnalyze = async (): Promise<void> => {
    if (!activeTrack) {
      return;
    }

    const library = window.echo?.library;
    if (!library?.startBpmAnalysis || !library.getBpmAnalysisStatus || !library.getTrack) {
      setError('Desktop bridge unavailable. Open ECHO Next in Electron to analyze BPM.');
      return;
    }

    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
    setIsAnalyzing(true);
    setError(null);
    setMessage(null);
    setAnalysisJob(null);

    try {
      const job = await library.startBpmAnalysis({ trackIds: [activeTrack.id], force: true });
      setAnalysisJob(job);

      let latest = job;
      while (analysisRunRef.current === runId && latest.status !== 'completed' && latest.status !== 'failed') {
        await sleep(analysisPollMs);
        latest = await library.getBpmAnalysisStatus(job.id);
        setAnalysisJob(latest);
      }

      const updated = await library.getTrack(activeTrack.id);
      if (updated) {
        setActiveTrack(updated);
        onTrackUpdated?.(updated);
        setMessage(updated.bpm ? 'BPM analysis updated this timing panel.' : 'Analysis finished, but no confident BPM was found.');
      }

      if (latest.status === 'failed') {
        setError(latest.errors[0] ?? 'BPM analysis failed.');
      }
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : String(analysisError));
    } finally {
      if (analysisRunRef.current === runId) {
        setIsAnalyzing(false);
      }
    }
  };

  const handleCopy = async (): Promise<void> => {
    if (!timingLine) {
      setError('No osu! timing point is available yet.');
      return;
    }

    try {
      setError(null);
      await window.navigator.clipboard.writeText(timingLine);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    }
  };

  if (!activeTrack) {
    return null;
  }

  const panel = (
    <div className="osu-timing-root" data-open={isOpen}>
      <button className="osu-timing-scrim" type="button" aria-label="Close osu! Timing" onClick={onClose} />
      <aside className="osu-timing-panel" role="dialog" aria-modal="true" aria-label="osu! Timing">
        <div className="osu-timing-scroll">
          <header className="osu-timing-header">
            <div>
              <Music2 size={23} />
              <div>
                <h2>osu! Timing</h2>
                <p>{activeTrack.title}</p>
              </div>
            </div>
            <button className="osu-timing-close" type="button" aria-label="Close osu! Timing" onClick={onClose}>
              <X size={22} />
            </button>
          </header>

          <section className="osu-timing-track-card" aria-label="Current track">
            <strong>{activeTrack.title}</strong>
            <span>{activeTrack.artist}</span>
            <em title={activeTrack.path}>{activeTrack.path}</em>
          </section>

          <section className="osu-timing-section" aria-label="Timing analysis">
            <div className="osu-timing-section-heading">
              <h3>Timing</h3>
              <span>{activeTrack.analysisStatus ?? 'none'}</span>
            </div>
            <div className="osu-timing-metrics">
              <span>
                <em>BPM</em>
                <strong>{formatBpm(bpm)}</strong>
              </span>
              <span>
                <em>Confidence</em>
                <strong>{formatConfidence(activeTrack.bpmConfidence)}</strong>
              </span>
              <span>
                <em>Detected offset</em>
                <strong>{isFiniteNumber(activeTrack.beatOffsetMs) ? formatMs(activeTrack.beatOffsetMs) : 'Missing'}</strong>
              </span>
              <span>
                <em>Final offset</em>
                <strong>{formatMs(adjustedOffsetMs)}</strong>
              </span>
            </div>
            {missingAnalysis ? <p className="osu-timing-note">BPM or offset is missing. Run analysis for a better osu! timing point.</p> : null}
            {lowConfidence ? <p className="osu-timing-warning">Low confidence BPM. Copy is allowed, but verify timing in osu! editor.</p> : null}
            {analysisJob ? (
              <p className="osu-timing-note">
                Analysis {analysisJob.status}: {analysisJob.processedTracks}/{analysisJob.totalTracks}
              </p>
            ) : null}
          </section>

          <section className="osu-timing-section" aria-label="Offset adjustment">
            <div className="osu-timing-section-heading">
              <h3>Offset adjust</h3>
              <span>{offsetAdjustmentMs === 0 ? 'No manual change' : formatMs(offsetAdjustmentMs)}</span>
            </div>
            <div className="osu-timing-step-row">
              {offsetSteps.map((step) => (
                <button key={step} type="button" onClick={() => setOffsetAdjustmentMs((current) => current + step)}>
                  {step > 0 ? `+${step}` : step} ms
                </button>
              ))}
              <button type="button" onClick={() => setOffsetAdjustmentMs(0)}>
                Reset
              </button>
            </div>
          </section>

          <section className="osu-timing-section" aria-label="Preview controls">
            <div className="osu-timing-button-row">
              <button type="button" onClick={() => void handlePlayTrack()}>
                <Play size={17} />
                Play track
              </button>
              <button type="button" disabled={!isFinitePositive(bpm)} onClick={clickPreviewRunning ? stopClickPreview : startClickPreview}>
                <Volume2 size={17} />
                {clickPreviewRunning ? 'Stop click' : 'Start click'}
              </button>
              <button type="button" disabled={isAnalyzing} onClick={() => void handleAnalyze()}>
                <RotateCw className={isAnalyzing ? 'spinning-icon' : undefined} size={17} />
                {isAnalyzing ? 'Analyzing...' : 'Analyze this track'}
              </button>
            </div>
          </section>

          <section className="osu-timing-section" aria-label="osu timing point">
            <div className="osu-timing-section-heading">
              <h3>[TimingPoints]</h3>
              <span>{timingLine ? 'Ready' : 'Needs BPM'}</span>
            </div>
            <pre className="osu-timing-output">{timingLine ?? 'Run BPM analysis to generate a timing point.'}</pre>
            <button className="osu-timing-copy" type="button" disabled={!timingLine} onClick={() => void handleCopy()}>
              <ClipboardCopy size={18} />
              {copied ? 'Copied' : 'Copy timing line'}
            </button>
          </section>

          {message ? <p className="osu-timing-message">{message}</p> : null}
          {error ? <p className="osu-timing-error">{error}</p> : null}
        </div>
      </aside>
    </div>
  );

  return createPortal(panel, document.body);
};
