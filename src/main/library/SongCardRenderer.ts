import sharp from 'sharp';
import type { LibraryTrack } from './libraryTypes';
import { defaultCoverSvg } from './workers/TsCoverExtractor';

export type SongCardRenderInput = {
  track: Pick<LibraryTrack, 'title' | 'artist' | 'album' | 'coverId'>;
  coverPath: string | null;
  coverMimeType: string | null;
};

export type SongCardRenderResult = {
  pngBuffer: Buffer;
  suggestedFileName: string;
};

const width = 1920;
const height = 1080;
const outerRadius = 70;
const coverSize = 600;
const coverX = 86;
const coverY = 86;
const textX = 746;
const textMaxWidth = 1050;
const textAverageWidthRatio = 0.62;
const defaultCoverBuffer = Buffer.from(defaultCoverSvg);

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const cleanText = (value: string | null | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

const safeFileName = (value: string): string => {
  const cleaned = Array.from(value)
    .filter((character) => character.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'ECHO Song Card').slice(0, 120);
};

const fitText = (value: string, fontSize: number, maxWidth: number): string => {
  const chars = Array.from(value);
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * textAverageWidthRatio)));

  if (chars.length <= maxChars) {
    return value;
  }

  return `${chars.slice(0, Math.max(1, maxChars - 1)).join('')}…`;
};

const titleSizeFor = (value: string): number => {
  const length = Array.from(value).length;

  if (length > 32) {
    return 74;
  }

  if (length > 22) {
    return 88;
  }

  return 118;
};

const textSvg = (track: SongCardRenderInput['track']): Buffer => {
  const title = cleanText(track.title, 'Untitled');
  const artist = cleanText(track.artist, 'Unknown Artist');
  const album = cleanText(track.album, 'Unknown Album');
  const titleSize = titleSizeFor(title);
  const fittedTitle = fitText(title, titleSize, textMaxWidth);
  const fittedArtist = fitText(artist, 84, textMaxWidth);
  const fittedAlbum = fitText(album, 56, textMaxWidth);
  const titleY = titleSize >= 100 ? 445 : 430;
  const artistY = titleY + 134;
  const albumY = artistY + 126;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#020711" flood-opacity="0.34"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="${outerRadius}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>
  <text x="${textX}" y="265" fill="rgba(246,248,255,0.92)" font-family="Inter, Microsoft YaHei, Segoe UI, Arial, sans-serif" font-size="56" font-weight="800" letter-spacing="12">ECHO</text>
  <text x="${textX}" y="${titleY}" fill="#f7f8ff" font-family="Inter, Microsoft YaHei, Segoe UI, Arial, sans-serif" font-size="${titleSize}" font-weight="900" filter="url(#soft-shadow)">${escapeXml(fittedTitle)}</text>
  <text x="${textX}" y="${artistY}" fill="rgba(246,248,255,0.94)" font-family="Inter, Microsoft YaHei, Segoe UI, Arial, sans-serif" font-size="84" font-weight="850">${escapeXml(fittedArtist)}</text>
  <text x="${textX}" y="${albumY}" fill="rgba(246,248,255,0.72)" font-family="Inter, Microsoft YaHei, Segoe UI, Arial, sans-serif" font-size="56" font-weight="760">${escapeXml(fittedAlbum)}</text>
  <line x1="${textX}" y1="770" x2="1834" y2="770" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
  <g font-family="Inter, Microsoft YaHei, Segoe UI, Arial, sans-serif" font-size="36" font-weight="850" fill="#f6f8ff">
    <rect x="${textX}" y="808" width="267" height="68" rx="34" fill="rgba(255,255,255,0.11)" stroke="rgba(255,255,255,0.24)" stroke-width="1.5"/>
    <text x="${textX + 34}" y="856">Hi-Fi Player</text>
    <rect x="${textX + 288}" y="808" width="276" height="68" rx="34" fill="rgba(255,255,255,0.11)" stroke="rgba(255,255,255,0.24)" stroke-width="1.5"/>
    <text x="${textX + 322}" y="856">Now Playing</text>
  </g>
</svg>`);
};

const roundedRectMask = (maskWidth: number, maskHeight: number, radius: number): Buffer =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${maskWidth}" height="${maskHeight}">
    <rect width="${maskWidth}" height="${maskHeight}" rx="${radius}" ry="${radius}" fill="#fff"/>
  </svg>`);

const coverShadowSvg = (): Buffer =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="cover-shadow" x="-35%" y="-35%" width="170%" height="170%">
      <feDropShadow dx="0" dy="28" stdDeviation="26" flood-color="#020814" flood-opacity="0.42"/>
    </filter>
  </defs>
  <rect x="${coverX}" y="${coverY}" width="${coverSize}" height="${coverSize}" rx="46" fill="rgba(10,18,34,0.58)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" filter="url(#cover-shadow)"/>
</svg>`);

const overlaySvg = (): Buffer =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="blue" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#09111f" stop-opacity="0.46"/>
      <stop offset="0.58" stop-color="#171226" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#1f5c9f" stop-opacity="0.44"/>
    </linearGradient>
    <radialGradient id="violet" cx="0.12" cy="0.88" r="0.62">
      <stop offset="0" stop-color="#6b4cff" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#6b4cff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="rgba(2,7,18,0.56)"/>
  <rect width="${width}" height="${height}" fill="url(#blue)"/>
  <rect width="${width}" height="${height}" fill="url(#violet)"/>
</svg>`);

export class SongCardRenderer {
  async render(input: SongCardRenderInput): Promise<SongCardRenderResult> {
    const coverInput = input.coverPath ?? defaultCoverBuffer;
    const background = await sharp(coverInput, { animated: false })
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .blur(26)
      .modulate({ brightness: 0.62, saturation: 1.16 })
      .png()
      .toBuffer();
    const foregroundCover = await sharp(coverInput, { animated: false })
      .rotate()
      .resize(coverSize, coverSize, { fit: 'cover', position: 'centre' })
      .composite([{ input: roundedRectMask(coverSize, coverSize, 46), blend: 'dest-in' }])
      .png()
      .toBuffer();
    const card = await sharp(background)
      .composite([
        { input: overlaySvg(), left: 0, top: 0 },
        { input: coverShadowSvg(), left: 0, top: 0 },
        { input: foregroundCover, left: coverX, top: coverY },
        { input: textSvg(input.track), left: 0, top: 0 },
      ])
      .composite([{ input: roundedRectMask(width, height, outerRadius), blend: 'dest-in' }])
      .png()
      .toBuffer();

    return {
      pngBuffer: card,
      suggestedFileName: `${safeFileName(`${cleanText(input.track.title, 'Untitled')} - ${cleanText(input.track.artist, 'Unknown Artist')}`)}.png`,
    };
  }
}
