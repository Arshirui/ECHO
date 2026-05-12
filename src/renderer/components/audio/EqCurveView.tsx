import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { EqBand } from '../../../shared/types/eq';
import { eqMaxFrequencyHz, eqMinFrequencyHz } from '../../../shared/types/eq';

type EqCurveViewProps = {
  bands: EqBand[];
  enabled: boolean;
  selectedBandIndex: number;
  onBandSelect: (index: number) => void;
  onBandChange: (index: number, gainDb: number) => void;
  onBandCommit: (index: number, gainDb: number) => void;
  onBandFrequencyChange: (index: number, frequencyHz: number) => void;
  onBandFrequencyCommit: (index: number, frequencyHz: number) => void;
};

const width = 980;
const height = 270;
const paddingLeft = 54;
const paddingRight = 46;
const paddingTop = 24;
const paddingBottom = 38;
const centerY = 136;
const minGainDb = -12;
const maxGainDb = 12;
const gainScale = (height - paddingTop - paddingBottom) / 24;
const minFrequency = eqMinFrequencyHz;
const maxFrequency = eqMaxFrequencyHz;
const axisFrequencies = [32, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const axisGains = [12, 6, 0, -6, -12];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const roundGain = (value: number): number => Math.round(value * 10) / 10;
const roundFrequency = (value: number): number => {
  if (value < 1000) {
    return Math.round(value);
  }

  return Math.round(value / 10) * 10;
};

const formatFrequency = (frequencyHz: number): string => {
  if (frequencyHz >= 1000) {
    const khz = frequencyHz / 1000;
    return `${Number.isInteger(khz) ? khz : khz.toFixed(1)}k`;
  }

  return `${frequencyHz}`;
};

const frequencyToX = (frequencyHz: number): number => {
  const minLog = Math.log10(minFrequency);
  const maxLog = Math.log10(maxFrequency);
  const currentLog = Math.log10(clamp(frequencyHz, minFrequency, maxFrequency));
  return paddingLeft + ((currentLog - minLog) / (maxLog - minLog)) * (width - paddingLeft - paddingRight);
};

const gainToY = (gainDb: number): number => centerY - clamp(gainDb, minGainDb, maxGainDb) * gainScale;
const yToGain = (y: number): number => roundGain(clamp((centerY - y) / gainScale, minGainDb, maxGainDb));
const xToFrequency = (x: number): number => {
  const minLog = Math.log10(minFrequency);
  const maxLog = Math.log10(maxFrequency);
  const ratio = clamp((x - paddingLeft) / (width - paddingLeft - paddingRight), 0, 1);
  return roundFrequency(10 ** (minLog + ratio * (maxLog - minLog)));
};

const pointForBand = (band: EqBand): { x: number; y: number } => ({
  x: frequencyToX(band.frequencyHz),
  y: gainToY(band.gainDb),
});

const makeSmoothPath = (points: Array<{ x: number; y: number }>): string => {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const commands = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const afterNext = points[index + 2] ?? next;
    const cp1x = current.x + (next.x - previous.x) / 6;
    const cp1y = current.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (afterNext.x - current.x) / 6;
    const cp2y = next.y - (afterNext.y - current.y) / 6;
    commands.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`);
  }

  return commands.join(' ');
};

const referencePoints = [
  { frequencyHz: 20, gainDb: 3.1 },
  { frequencyHz: 32, gainDb: 2.6 },
  { frequencyHz: 60, gainDb: 1.0 },
  { frequencyHz: 100, gainDb: 0.3 },
  { frequencyHz: 200, gainDb: 0 },
  { frequencyHz: 1000, gainDb: 0 },
  { frequencyHz: 5000, gainDb: 0 },
  { frequencyHz: 10000, gainDb: 0 },
  { frequencyHz: 20000, gainDb: 0 },
].map((point) => ({ x: frequencyToX(point.frequencyHz), y: gainToY(point.gainDb) }));

export const EqCurveView = ({
  bands,
  enabled,
  selectedBandIndex,
  onBandSelect,
  onBandChange,
  onBandCommit,
  onBandFrequencyChange,
  onBandFrequencyCommit,
}: EqCurveViewProps): JSX.Element => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeBand, setActiveBand] = useState<number | null>(null);
  const points = bands.map(pointForBand);
  const orderedPoints = bands
    .map((band, index) => ({ ...pointForBand(band), index }))
    .sort((a, b) => a.x - b.x);
  const path = makeSmoothPath(orderedPoints);
  const fillPath = `${path} L ${frequencyToX(maxFrequency).toFixed(1)} ${centerY} L ${frequencyToX(minFrequency).toFixed(1)} ${centerY} Z`;

  const pointFromEvent = (event: ReactPointerEvent<SVGElement>, bandIndex: number): { frequencyHz: number; gainDb: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    const x = rect && rect.width > 0 ? (event.clientX - rect.left) * (width / rect.width) : frequencyToX(bands[bandIndex]?.frequencyHz ?? minFrequency);
    const y = rect && rect.height > 0 ? (event.clientY - rect.top) * (height / rect.height) : centerY;
    return {
      frequencyHz: xToFrequency(x),
      gainDb: yToGain(y),
    };
  };

  const updateBandFromEvent = (event: ReactPointerEvent<SVGElement>, bandIndex: number): { frequencyHz: number; gainDb: number } => {
    const nextPoint = pointFromEvent(event, bandIndex);
    onBandChange(bandIndex, nextPoint.gainDb);
    onBandFrequencyChange(bandIndex, nextPoint.frequencyHz);
    return nextPoint;
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGGElement>, index: number): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setActiveBand(index);
    onBandSelect(index);
    updateBandFromEvent(event, index);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (activeBand === null) {
      return;
    }

    updateBandFromEvent(event, activeBand);
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement | SVGGElement>): void => {
    if (activeBand === null) {
      return;
    }

    const nextPoint = updateBandFromEvent(event, activeBand);
    onBandCommit(activeBand, nextPoint.gainDb);
    onBandFrequencyCommit(activeBand, nextPoint.frequencyHz);
    setActiveBand(null);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<SVGGElement>, index: number): void => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    onBandSelect(index);

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const delta = event.shiftKey ? 1 : 0.5;
      const gainDb = roundGain(clamp(bands[index].gainDb + (event.key === 'ArrowUp' ? delta : -delta), minGainDb, maxGainDb));
      onBandChange(index, gainDb);
      onBandCommit(index, gainDb);
      return;
    }

    const frequencyRatio = event.shiftKey ? 2 ** (1 / 3) : 2 ** (1 / 12);
    const frequencyHz = roundFrequency(clamp(
      event.key === 'ArrowRight' ? bands[index].frequencyHz * frequencyRatio : bands[index].frequencyHz / frequencyRatio,
      minFrequency,
      maxFrequency,
    ));
    onBandFrequencyChange(index, frequencyHz);
    onBandFrequencyCommit(index, frequencyHz);
  };

  return (
    <div className="eq-curve-shell" data-enabled={enabled}>
      <svg
        className="eq-curve-view"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Draggable parametric EQ curve"
        ref={svgRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <linearGradient id="eqCurveStroke" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#323a46" />
            <stop offset="48%" stopColor="#3b424d" />
            <stop offset="100%" stopColor="#323a46" />
          </linearGradient>
          <linearGradient id="eqCurveFill" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(74, 90, 108, 0.12)" />
            <stop offset="100%" stopColor="rgba(74, 90, 108, 0.02)" />
          </linearGradient>
        </defs>

        {axisGains.map((gainDb) => {
          const y = gainToY(gainDb);
          return <line className="eq-grid-line" x1={paddingLeft} x2={width - paddingRight} y1={y} y2={y} key={gainDb} />;
        })}
        {axisFrequencies.map((frequencyHz) => {
          const x = frequencyToX(frequencyHz);
          return <line className="eq-grid-line eq-grid-line--vertical" x1={x} x2={x} y1={paddingTop} y2={height - paddingBottom} key={frequencyHz} />;
        })}
        <line className="eq-zero-line" x1={paddingLeft} x2={width - paddingRight} y1={centerY} y2={centerY} />
        <line className="eq-selected-guide" x1={points[selectedBandIndex]?.x ?? paddingLeft} x2={points[selectedBandIndex]?.x ?? paddingLeft} y1={paddingTop} y2={height - paddingBottom} />

        <path className="eq-reference-curve" d={makeSmoothPath(referencePoints)} />
        <path className="eq-curve-fill" d={fillPath} />
        <path className="eq-curve-stroke" d={path} />
        <path className="eq-curve-hit-area" d={path} />

        {axisGains.map((gainDb) => (
          <text className="eq-y-label" x={width - paddingRight + 14} y={gainToY(gainDb) + 5} key={gainDb}>
            {gainDb > 0 ? `+${gainDb}` : gainDb}
          </text>
        ))}
        <text className="eq-y-label eq-y-label-zero" x={width - paddingRight + 12} y={centerY + 5}>0</text>

        {axisFrequencies.map((frequencyHz) => (
          <text className="eq-x-label" x={frequencyToX(frequencyHz)} y={height - 17} key={frequencyHz}>
            {formatFrequency(frequencyHz)}
          </text>
        ))}

        {bands.map((band, index) => {
          const point = points[index];
          const selected = index === selectedBandIndex;
          return (
            <g
              className="eq-curve-node-group"
              aria-label={`Drag band ${index + 1} ${formatFrequency(band.frequencyHz)} curve point`}
              data-active={selected}
              data-dragging={activeBand === index}
              data-testid={`eq-curve-node-${index}`}
              key={index}
              tabIndex={0}
              transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onPointerDown={(event) => handlePointerDown(event, index)}
            >
              <circle className="eq-curve-node-hit" r="15" />
              <circle className="eq-curve-node" r={selected || activeBand === index ? 10.8 : 8.6} />
              <text className="eq-curve-node-number" y="3.5">
                {index + 1}
              </text>
            </g>
          );
        })}

        {bands[selectedBandIndex] ? (
          <g className="eq-selected-readout" transform={`translate(${points[selectedBandIndex].x.toFixed(1)} ${(points[selectedBandIndex].y - 22).toFixed(1)})`}>
            <text className="eq-selected-readout-frequency" y="-4">{formatFrequency(bands[selectedBandIndex].frequencyHz)}Hz</text>
            <text className="eq-selected-readout-gain" x="36" y="16">
              {bands[selectedBandIndex].gainDb > 0 ? `+${bands[selectedBandIndex].gainDb.toFixed(1)}` : bands[selectedBandIndex].gainDb.toFixed(1)} dB
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
};
