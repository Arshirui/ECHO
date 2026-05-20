import type { ArtistConcertEvent, ArtistConcertInfo } from '../../../shared/types/library';
import { fetchWithNetworkProxy } from '../../network/networkFetch';

type FetchLike = (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type BandsintownEventsRequest = {
  artistName: string;
  appId: string | null | undefined;
  region?: string | null;
  timeoutMs?: number;
  fetcher?: FetchLike;
  now?: Date;
};

type BandsintownVenue = {
  name?: unknown;
  city?: unknown;
  region?: unknown;
  country?: unknown;
};

type BandsintownEvent = {
  id?: unknown;
  title?: unknown;
  datetime?: unknown;
  url?: unknown;
  venue?: unknown;
};

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const normalizeFilterText = (value: string): string => value.trim().toLocaleLowerCase();

const matchesRegion = (event: ArtistConcertEvent, region: string | null | undefined): boolean => {
  const filter = normalizeFilterText(region ?? '');
  if (!filter) {
    return true;
  }

  return [event.city, event.region, event.country]
    .filter((part): part is string => Boolean(part))
    .some((part) => normalizeFilterText(part).includes(filter));
};

const buildBandsintownEventsUrl = (artistName: string, appId: string): string => {
  const encodedArtist = encodeURIComponent(artistName.trim());
  const params = new URLSearchParams({
    app_id: appId.trim(),
    date: 'upcoming',
  });
  return `https://rest.bandsintown.com/artists/${encodedArtist}/events?${params.toString()}`;
};

const parseBandsintownEvent = (value: unknown): ArtistConcertEvent | null => {
  const event = asRecord(value) as BandsintownEvent;
  const id = text(event.id);
  const startsAt = text(event.datetime);
  if (!id || !startsAt) {
    return null;
  }

  const venue = asRecord(event.venue) as BandsintownVenue;
  const venueName = text(venue.name);
  const city = text(venue.city);
  const region = text(venue.region);
  const country = text(venue.country);
  const fallbackTitle = [venueName, city].filter(Boolean).join(' - ') || 'Bandsintown event';
  const title = text(event.title) ?? fallbackTitle;

  return {
    id: `bandsintown:${id}`,
    source: 'bandsintown',
    title,
    startsAt,
    venueName,
    city,
    region,
    country,
    url: text(event.url),
  };
};

const fetchJsonWithTimeout = async (url: string, fetcher: FetchLike, timeoutMs: number): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ECHO-Next/26.5.19',
      },
    });
    if (!response.ok) {
      throw new Error(`bandsintown_request_failed:${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
};

export class ArtistEventsService {
  constructor(private readonly fetcher: FetchLike = fetchWithNetworkProxy as FetchLike) {}

  async getBandsintownEvents(request: BandsintownEventsRequest): Promise<ArtistConcertInfo> {
    const artistName = request.artistName.trim();
    const appId = request.appId?.trim() ?? '';
    const region = request.region?.trim() || null;
    const fetchedAt = (request.now ?? new Date()).toISOString();

    if (!artistName || !appId) {
      return {
        status: 'not_configured',
        region,
        sources: [],
        events: [],
        fetchedAt: null,
        message: 'Configure Bandsintown app_id in Settings to load upcoming concerts.',
      };
    }

    try {
      const payload = await fetchJsonWithTimeout(
        buildBandsintownEventsUrl(artistName, appId),
        request.fetcher ?? this.fetcher,
        request.timeoutMs ?? 7000,
      );
      const events = (Array.isArray(payload) ? payload : [])
        .map(parseBandsintownEvent)
        .filter((event): event is ArtistConcertEvent => Boolean(event))
        .filter((event) => matchesRegion(event, region))
        .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));

      return {
        status: 'ready',
        region,
        sources: ['bandsintown'],
        events,
        fetchedAt,
        message: events.length ? undefined : 'No upcoming Bandsintown events matched this artist and region.',
      };
    } catch (error) {
      return {
        status: 'unavailable',
        region,
        sources: ['bandsintown'],
        events: [],
        fetchedAt,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
