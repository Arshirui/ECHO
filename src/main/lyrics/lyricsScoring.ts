import type { LyricsQuery, LyricsSearchCandidate } from '../../shared/types/lyrics';

const descriptorPattern =
  /\s*(?:\((?:tv size|short ver\.?|live|cover|instrumental|karaoke|remaster(?:ed)?|from .*?)\)|\[(?:tv size|short ver\.?|live|cover|instrumental|karaoke|remaster(?:ed)?)\])\s*/giu;

const trailingDescriptorPattern = /\s+-\s+(?:live|cover|instrumental|karaoke|remaster(?:ed)?|tv size|short ver\.?)\s*$/iu;

export const normalizeText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKC')
    .replace(descriptorPattern, ' ')
    .replace(trailingDescriptorPattern, ' ')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (value: string): Set<string> => new Set(normalizeText(value).split(' ').filter(Boolean));

export const similarity = (left: string | null | undefined, right: string | null | undefined): number => {
  const a = normalizeText(left);
  const b = normalizeText(right);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  if (a.includes(b) || b.includes(a)) {
    return 0.88;
  }

  const leftTokens = tokens(a);
  const rightTokens = tokens(b);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (!union.size) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / union.size;
};

const durationScore = (queryDuration?: number | null, candidateDuration?: number | null): number => {
  const query = Number(queryDuration);
  const candidate = Number(candidateDuration);

  if (!Number.isFinite(query) || !Number.isFinite(candidate) || query <= 0 || candidate <= 0) {
    return 0.5;
  }

  const delta = Math.abs(query - candidate);
  if (delta <= 2) {
    return 1;
  }

  if (delta <= 8) {
    return 0.82;
  }

  if (delta <= 20) {
    return 0.45;
  }

  return 0.12;
};

export const scoreLyricsCandidate = (query: LyricsQuery, candidate: Omit<LyricsSearchCandidate, 'id' | 'score'>): number => {
  const title = similarity(query.title, candidate.title);
  const artist = similarity(query.artist, candidate.artist);
  const album = query.album && candidate.album ? similarity(query.album, candidate.album) : 0.5;
  const duration = durationScore(query.durationSeconds, candidate.durationSeconds);
  const score = title * 0.45 + artist * 0.3 + album * 0.1 + duration * 0.15;

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
};

export const canAutoAcceptLyricsCandidate = (
  query: LyricsQuery,
  candidate: LyricsSearchCandidate,
  threshold = 0.82,
): boolean => Boolean(normalizeText(query.title) && normalizeText(query.artist) && candidate.score >= threshold);
