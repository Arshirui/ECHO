import type { LyricsQuery } from '../../shared/types/lyrics';
import { fetchWithNetworkProxy } from '../network/networkFetch';
import { asRecord, fetchJsonWithTimeout, number, text } from '../library/network/providers/providerFetch';
import type { LyricsProvider, LyricsProviderCapability, LyricsProviderResult, LyricsProviderSearchRequest } from './LyricsProvider';
import { parseSyncedLyrics } from './lyricsParser';

const neteaseHeaders = {
  Referer: 'https://music.163.com/',
};

const amllHeaders = {
  Accept: 'application/xml,text/xml,text/plain,*/*',
  'User-Agent': 'ECHO-Next/0.1',
};

const maxSearchSongs = 5;

type NeteaseSong = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  raw: unknown;
};

type AmllMetadata = {
  title: string | null;
  artist: string | null;
  album: string | null;
  durationSeconds: number | null;
  ncmMusicId: string | null;
  qqMusicId: string | null;
  appleMusicId: string | null;
  isrc: string | null;
};

const searchQueryFor = (query: LyricsQuery): string => [query.title, query.artist].filter(Boolean).join(' ').trim();

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&amp;/giu, '&')
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const attributeValue = (attributes: string, name: string): string | null => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu');
  const match = attributes.match(pattern);
  const value = match?.[1] ?? match?.[2] ?? null;
  return value ? decodeXmlEntities(value).trim() || null : null;
};

const parseTtmlClockSeconds = (value: string | null): number | null => {
  const textValue = value?.trim();
  if (!textValue) {
    return null;
  }

  const seconds = textValue.match(/^(\d+(?:\.\d+)?)s?$/iu);
  if (seconds) {
    return Number(seconds[1]);
  }

  const minutesTime = textValue.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/u);
  if (!minutesTime) {
    return null;
  }

  const hours = Number(minutesTime[1] ?? 0);
  const minutes = Number(minutesTime[2]);
  const secs = Number(minutesTime[3]);
  const fraction = minutesTime[4] ? Number(`0.${minutesTime[4]}`) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(secs) || minutes > 59 || secs > 59) {
    return null;
  }

  return hours * 3600 + minutes * 60 + secs + fraction;
};

const parseAmllMetadata = (ttml: string): AmllMetadata => {
  const meta = new Map<string, string[]>();
  for (const match of ttml.matchAll(/<(?:[\w.-]+:)?meta\b([^>]*)>/giu)) {
    const key = attributeValue(match[1], 'key');
    const value = attributeValue(match[1], 'value');
    if (!key || !value) {
      continue;
    }

    const values = meta.get(key) ?? [];
    values.push(value);
    meta.set(key, values);
  }

  const first = (key: string): string | null => meta.get(key)?.[0] ?? null;
  const bodyMatch = ttml.match(/<(?:[\w.-]+:)?body\b([^>]*)>/iu);
  return {
    title: first('musicName'),
    artist: first('artists'),
    album: first('album'),
    durationSeconds: parseTtmlClockSeconds(attributeValue(bodyMatch?.[1] ?? '', 'dur')),
    ncmMusicId: first('ncmMusicId'),
    qqMusicId: first('qqMusicId'),
    appleMusicId: first('appleMusicId'),
    isrc: first('isrc'),
  };
};

const isValidNeteaseMusicId = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^\d{1,20}$/u.test(value.trim());

const neteaseIdFromStableValue = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const match = value.match(/(?:^|:)netease:(\d{1,20})(?:$|:)/u) ?? value.match(/^streaming:netease:(\d{1,20})$/u);
  return match?.[1] ?? null;
};

const candidateNeteaseIdsFromQuery = (query: LyricsQuery): string[] => {
  const stableNeteaseId = neteaseIdFromStableValue(query.stableKey) ?? neteaseIdFromStableValue(query.trackId);
  const candidates = [
    stableNeteaseId,
    query.mediaType === 'streaming' && stableNeteaseId ? query.sourceId : null,
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate): candidate is string => {
    if (!isValidNeteaseMusicId(candidate) || seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    return true;
  });
};

const fetchTextWithTimeout = async (
  url: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetchWithNetworkProxy(url, {
      signal: controller.signal,
      headers: amllHeaders,
    });
    if (!response.ok) {
      throw new Error(`request_failed:${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
};

const ttmlUrlsForNeteaseId = (id: string): string[] => [
  `https://amlldb.bikonoo.com/ncm-lyrics/${encodeURIComponent(id)}.ttml`,
  `https://amll-ttml-db.stevexmh.net/ncm/${encodeURIComponent(id)}`,
  `https://raw.githubusercontent.com/amll-dev/amll-ttml-db/main/ncm-lyrics/${encodeURIComponent(id)}.ttml`,
];

export class AmllTtmlLyricsProvider implements LyricsProvider {
  readonly id = 'amll-ttml' as const;
  readonly label = 'AMLL TTML';
  readonly priority = 585;
  readonly capabilities: LyricsProviderCapability = {
    synced: true,
    plain: false,
    translation: true,
    romanization: true,
    byDuration: true,
    byIsrc: false,
    byMusicBrainzId: false,
    needsAccount: false,
  };

  async search(request: LyricsProviderSearchRequest): Promise<LyricsProviderResult[]> {
    try {
      const directIds = candidateNeteaseIdsFromQuery(request.query);
      const songs = directIds.length > 0 ? [] : await this.searchSongs(request);
      const directSongs = directIds.map((id): NeteaseSong => ({
        id,
        title: request.query.title,
        artist: request.query.artist,
        album: request.query.album ?? null,
        durationSeconds: request.query.durationSeconds ?? null,
        raw: { source: 'query', id },
      }));
      const seen = new Set<string>();
      const candidates = [...directSongs, ...songs].filter((song) => {
        if (seen.has(song.id)) {
          return false;
        }
        seen.add(song.id);
        return true;
      });
      const results = await Promise.all(candidates.slice(0, maxSearchSongs).map((song) => this.fetchLyrics(song, request)));
      return results.filter((result): result is LyricsProviderResult => Boolean(result));
    } catch {
      return [];
    }
  }

  private async searchSongs(request: LyricsProviderSearchRequest): Promise<NeteaseSong[]> {
    const seen = new Set<string>();
    const songs: NeteaseSong[] = [];

    for (const variant of request.normalized.searchVariants) {
      if (request.signal?.aborted) {
        break;
      }

      const query = searchQueryFor({
        ...request.query,
        title: variant.title,
        artist: variant.artist,
        album: variant.album,
      });
      if (!query) {
        continue;
      }

      const params = new URLSearchParams({ type: '1', s: query, limit: '5', offset: '0' });
      const data = asRecord(
        await fetchJsonWithTimeout(`https://music.163.com/api/search/get/web?${params.toString()}`, request.signal, neteaseHeaders, request.timeoutMs),
      );
      const rawSongs = asRecord(data.result).songs;
      const songValues = Array.isArray(rawSongs) ? rawSongs : [];

      for (const songValue of songValues) {
        const song = asRecord(songValue);
        const id = String(song.id ?? '');
        if (!isValidNeteaseMusicId(id) || seen.has(id)) {
          continue;
        }

        const artists = Array.isArray(song.artists) ? song.artists.map(asRecord) : [];
        const artist = artists.map((artistValue) => text(artistValue.name)).filter(Boolean).join(' / ');
        const album = asRecord(song.album);
        const durationMs = number(song.duration);

        seen.add(id);
        songs.push({
          id,
          title: text(song.name) ?? request.query.title,
          artist: artist || request.query.artist,
          album: text(album.name),
          durationSeconds: durationMs ? durationMs / 1000 : null,
          raw: songValue,
        });
      }
    }

    return songs;
  }

  private async fetchLyrics(song: NeteaseSong, request: LyricsProviderSearchRequest): Promise<LyricsProviderResult | null> {
    for (const url of ttmlUrlsForNeteaseId(song.id)) {
      try {
        const ttml = await fetchTextWithTimeout(url, request.signal, request.timeoutMs);
        if (parseSyncedLyrics(ttml).length === 0) {
          continue;
        }

        const metadata = parseAmllMetadata(ttml);
        return {
          provider: 'amll-ttml',
          providerLyricsId: `amll-ttml:ncm:${metadata.ncmMusicId ?? song.id}`,
          title: metadata.title ?? song.title,
          artist: metadata.artist ?? song.artist,
          album: metadata.album ?? song.album,
          durationSeconds: metadata.durationSeconds ?? song.durationSeconds,
          instrumental: false,
          plainLyrics: null,
          syncedLyrics: ttml,
          sourceUrl: url,
          sourceLabel: 'AMLL TTML',
          matchReasons: ['amll_ttml_provider', 'netease_id'],
          raw: {
            song: song.raw,
            metadata,
            url,
          },
        };
      } catch {
        // Try the next mirror before giving up on this NetEase id.
      }
    }

    return null;
  }
}
