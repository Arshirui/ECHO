export type Rgb = {
  r: number;
  g: number;
  b: number;
};

export type ReadableColorSample = {
  averageRgb: Rgb;
  luminance: number;
  luminanceDeviation: number;
  saturation: number;
  edgeContrast: number;
  complexity: number;
  pixelCount: number;
};

export const readableLyricsCssVarNames = [
  '--lyrics-smart-primary-color',
  '--lyrics-smart-secondary-color',
  '--lyrics-smart-shadow',
  '--lyrics-smart-stroke',
  '--lyrics-smart-scrim-color',
  '--lyrics-smart-scrim-opacity',
] as const;

export type ReadableLyricsCssVarName = (typeof readableLyricsCssVarNames)[number];
export type ReadableLyricsCssVars = Partial<Record<ReadableLyricsCssVarName, string>>;

type ReadableColorOptions = {
  sample?: ReadableColorSample | null;
  userColor?: string | null;
  themeMode?: 'light' | 'dark';
};

type AnalyzePixelsOptions = {
  width?: number;
  maxSamples?: number;
};

const sampleCanvasSize = 32;
const minReadableContrast = 4.5;
const strongReadableContrast = 7;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundChannel = (value: number): number => Math.round(clamp(value, 0, 255));

const toCssRgb = (rgb: Rgb): string => `rgb(${roundChannel(rgb.r)} ${roundChannel(rgb.g)} ${roundChannel(rgb.b)})`;

const rgba = (rgb: Rgb, alpha: number): string =>
  `rgba(${roundChannel(rgb.r)}, ${roundChannel(rgb.g)}, ${roundChannel(rgb.b)}, ${clamp(alpha, 0, 1).toFixed(2)})`;

export const parseHexColor = (value: string | null | undefined): Rgb | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const short = /^#([0-9a-f]{3})$/iu.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1].split('').map((channel) => parseInt(`${channel}${channel}`, 16));
    return { r, g, b };
  }

  const full = /^#([0-9a-f]{6})$/iu.exec(trimmed);
  if (!full) {
    return null;
  }

  const raw = full[1];
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
};

const srgbToLinear = (value: number): number => {
  const normalized = clamp(value, 0, 255) / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (rgb: Rgb): number =>
  0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);

export const contrastRatio = (left: Rgb | number, right: Rgb | number): number => {
  const leftLuminance = typeof left === 'number' ? left : relativeLuminance(left);
  const rightLuminance = typeof right === 'number' ? right : relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

const rgbToHsl = (rgb: Rgb): { h: number; s: number; l: number } => {
  const r = clamp(rgb.r, 0, 255) / 255;
  const g = clamp(rgb.g, 0, 255) / 255;
  const b = clamp(rgb.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }

  return { h: h * 60, s, l };
};

const hueToRgb = (p: number, q: number, t: number): number => {
  let next = t;
  if (next < 0) next += 1;
  if (next > 1) next -= 1;
  if (next < 1 / 6) return p + (q - p) * 6 * next;
  if (next < 1 / 2) return q;
  if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
  return p;
};

const hslToRgb = (h: number, s: number, l: number): Rgb => {
  const hue = ((h % 360) + 360) % 360 / 360;
  const saturation = clamp(s, 0, 1);
  const lightness = clamp(l, 0, 1);

  if (saturation === 0) {
    const channel = lightness * 255;
    return { r: channel, g: channel, b: channel };
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
  };
};

const mixRgb = (from: Rgb, to: Rgb, amount: number): Rgb => {
  const weight = clamp(amount, 0, 1);
  return {
    r: from.r + (to.r - from.r) * weight,
    g: from.g + (to.g - from.g) * weight,
    b: from.b + (to.b - from.b) * weight,
  };
};

const fallbackSampleForTheme = (themeMode: 'light' | 'dark'): ReadableColorSample => ({
  averageRgb: themeMode === 'dark' ? { r: 16, g: 21, b: 31 } : { r: 244, g: 247, b: 251 },
  luminance: themeMode === 'dark' ? 0.008 : 0.925,
  luminanceDeviation: 0.08,
  saturation: 0.12,
  edgeContrast: 0.04,
  complexity: 0.14,
  pixelCount: 1,
});

const ensureContrast = (rgb: Rgb, backgroundLuminance: number, targetContrast: number, preferLight: boolean): Rgb => {
  const anchor = preferLight ? { r: 255, g: 255, b: 255 } : { r: 8, g: 12, b: 18 };
  let candidate = rgb;

  for (let index = 0; index < 16; index += 1) {
    if (contrastRatio(candidate, backgroundLuminance) >= targetContrast) {
      return candidate;
    }
    candidate = mixRgb(candidate, anchor, 0.18);
  }

  return contrastRatio(anchor, backgroundLuminance) > contrastRatio(candidate, backgroundLuminance)
    ? anchor
    : candidate;
};

const choosePrimaryColor = (
  sample: ReadableColorSample,
  userColor: string | null | undefined,
): Rgb => {
  const userRgb = parseHexColor(userColor) ?? { r: 49, g: 64, b: 84 };
  const userHsl = rgbToHsl(userRgb);
  const tintSaturation = clamp(Math.max(userHsl.s, 0.2), 0.2, 0.62);
  const darkTint = hslToRgb(userHsl.h, tintSaturation, 0.15);
  const lightTint = hslToRgb(userHsl.h, Math.min(tintSaturation, 0.44), 0.94);
  const backgroundLuminance = sample.luminance;
  const preferLight = backgroundLuminance < 0.42;
  const targetContrast = sample.complexity > 0.44 ? strongReadableContrast : minReadableContrast;
  const candidates = [
    darkTint,
    { r: 17, g: 24, b: 39 },
    { r: 36, g: 49, b: 68 },
    lightTint,
    { r: 247, g: 250, b: 252 },
    { r: 255, g: 255, b: 255 },
  ];

  const ranked = candidates
    .map((rgb) => {
      const luminance = relativeLuminance(rgb);
      const candidateIsLight = luminance > backgroundLuminance;
      const directionBonus = candidateIsLight === preferLight ? 0.28 : 0;
      const hueBonus = rgb === darkTint || rgb === lightTint ? 0.12 : 0;
      return {
        rgb,
        score: contrastRatio(luminance, backgroundLuminance) + directionBonus + hueBonus,
        preferLight: candidateIsLight,
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  return ensureContrast(best.rgb, backgroundLuminance, targetContrast, best.preferLight);
};

export const createReadableLyricsColorVars = (options: ReadableColorOptions = {}): ReadableLyricsCssVars => {
  const themeMode = options.themeMode ?? 'light';
  const sample = options.sample ?? fallbackSampleForTheme(themeMode);
  const primary = choosePrimaryColor(sample, options.userColor);
  const primaryLuminance = relativeLuminance(primary);
  const primaryIsLight = primaryLuminance > sample.luminance;
  const secondarySeed = mixRgb(primary, sample.averageRgb, sample.complexity > 0.5 ? 0.08 : 0.18);
  const secondary = ensureContrast(secondarySeed, sample.luminance, minReadableContrast, primaryIsLight);
  const primaryContrast = contrastRatio(primaryLuminance, sample.luminance);
  const needsAssist = sample.complexity > 0.32 || primaryContrast < strongReadableContrast;
  const scrimOpacity = needsAssist
    ? clamp(0.03 + sample.complexity * 0.2 + (primaryContrast < strongReadableContrast ? 0.04 : 0), 0.04, 0.28)
    : 0;
  const shadowStrength = clamp(0.12 + sample.complexity * 0.58 + (primaryContrast < strongReadableContrast ? 0.12 : 0), 0.12, 0.78);
  const strokeStrength = clamp(0.18 + sample.complexity * 0.5, 0.18, 0.58);
  const contrastColor = primaryIsLight ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  const secondaryGlow = primaryIsLight
    ? `0 2px 18px ${rgba(contrastColor, shadowStrength)}, 0 0 2px ${rgba(contrastColor, Math.min(0.9, shadowStrength + 0.18))}`
    : `0 1px 2px ${rgba(contrastColor, Math.min(0.72, shadowStrength + 0.16))}, 0 2px 16px ${rgba({ r: 0, g: 0, b: 0 }, Math.max(0.12, shadowStrength * 0.32))}`;

  return {
    '--lyrics-smart-primary-color': toCssRgb(primary),
    '--lyrics-smart-secondary-color': toCssRgb(secondary),
    '--lyrics-smart-shadow': secondaryGlow,
    '--lyrics-smart-stroke': needsAssist ? `0.014em ${rgba(contrastColor, strokeStrength)}` : '0px transparent',
    '--lyrics-smart-scrim-color': primaryIsLight ? 'rgb(0 0 0)' : 'rgb(255 255 255)',
    '--lyrics-smart-scrim-opacity': scrimOpacity.toFixed(2),
  };
};

export const analyzePixelBuffer = (
  pixels: Uint8ClampedArray,
  options: AnalyzePixelsOptions = {},
): ReadableColorSample | null => {
  if (pixels.length < 4) {
    return null;
  }

  const pixelTotal = Math.floor(pixels.length / 4);
  const step = Math.max(1, Math.floor(pixelTotal / (options.maxSamples ?? 4096)));
  const width = options.width && options.width > 0 ? Math.round(options.width) : 0;
  let count = 0;
  let meanLuminance = 0;
  let m2 = 0;
  let saturationSum = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let weightSum = 0;
  let edgeSum = 0;
  let edgeCount = 0;

  for (let pixelIndex = 0; pixelIndex < pixelTotal; pixelIndex += step) {
    const offset = pixelIndex * 4;
    const alpha = pixels[offset + 3] / 255;
    if (alpha < 0.08) {
      continue;
    }

    const rgb = {
      r: pixels[offset],
      g: pixels[offset + 1],
      b: pixels[offset + 2],
    };
    const luminance = relativeLuminance(rgb);
    count += 1;
    const delta = luminance - meanLuminance;
    meanLuminance += delta / count;
    m2 += delta * (luminance - meanLuminance);
    saturationSum += rgbToHsl(rgb).s;
    rSum += rgb.r * alpha;
    gSum += rgb.g * alpha;
    bSum += rgb.b * alpha;
    weightSum += alpha;

    if (width > 0) {
      const x = pixelIndex % width;
      const previousPixelIndex = pixelIndex - 1;
      const upperPixelIndex = pixelIndex - width;
      if (x > 0 && previousPixelIndex >= 0 && pixels[previousPixelIndex * 4 + 3] > 24) {
        edgeSum += Math.abs(luminance - relativeLuminance({
          r: pixels[previousPixelIndex * 4],
          g: pixels[previousPixelIndex * 4 + 1],
          b: pixels[previousPixelIndex * 4 + 2],
        }));
        edgeCount += 1;
      }
      if (upperPixelIndex >= 0 && pixels[upperPixelIndex * 4 + 3] > 24) {
        edgeSum += Math.abs(luminance - relativeLuminance({
          r: pixels[upperPixelIndex * 4],
          g: pixels[upperPixelIndex * 4 + 1],
          b: pixels[upperPixelIndex * 4 + 2],
        }));
        edgeCount += 1;
      }
    }
  }

  if (count === 0) {
    return null;
  }

  const luminanceDeviation = Math.sqrt(m2 / Math.max(1, count - 1));
  const saturation = saturationSum / count;
  const edgeContrast = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const complexity = clamp(luminanceDeviation * 2.2 + edgeContrast * 1.45 + saturation * 0.24, 0, 1);

  return {
    averageRgb: {
      r: rSum / Math.max(weightSum, 1),
      g: gSum / Math.max(weightSum, 1),
      b: bSum / Math.max(weightSum, 1),
    },
    luminance: meanLuminance,
    luminanceDeviation,
    saturation,
    edgeContrast,
    complexity,
    pixelCount: count,
  };
};

const drawToSampleCanvas = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): ReadableColorSample | null => {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }

  canvas.width = sampleCanvasSize;
  canvas.height = sampleCanvasSize;
  context.clearRect(0, 0, sampleCanvasSize, sampleCanvasSize);
  context.drawImage(source, 0, 0, sampleCanvasSize, sampleCanvasSize);
  const imageData = context.getImageData(0, 0, sampleCanvasSize, sampleCanvasSize);
  return analyzePixelBuffer(imageData.data, { width: sampleCanvasSize });
};

export const sampleImageUrl = async (url: string): Promise<ReadableColorSample | null> =>
  new Promise((resolve) => {
    if (!url || typeof Image === 'undefined' || typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const image = new Image();
    let settled = false;
    const finish = (sample: ReadableColorSample | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(sample);
    };

    if (/^https?:\/\//iu.test(url)) {
      image.crossOrigin = 'anonymous';
    }

    image.onload = () => {
      try {
        finish(drawToSampleCanvas(image, image.naturalWidth, image.naturalHeight));
      } catch {
        finish(null);
      }
    };
    image.onerror = () => finish(null);
    image.src = url;

    if (image.complete && image.naturalWidth > 0) {
      queueMicrotask(() => {
        try {
          finish(drawToSampleCanvas(image, image.naturalWidth, image.naturalHeight));
        } catch {
          finish(null);
        }
      });
    }
  });

export const sampleVideoElement = async (video: HTMLVideoElement): Promise<ReadableColorSample | null> => {
  if (typeof document === 'undefined' || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return null;
  }

  try {
    return drawToSampleCanvas(video, video.videoWidth, video.videoHeight);
  } catch {
    return null;
  }
};
