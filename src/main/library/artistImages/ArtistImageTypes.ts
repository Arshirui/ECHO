import type { ArtistImageCacheEntry } from '../../../shared/types/library';

export type ArtistImageLookupInput = {
  artistId?: string;
  artistKey?: string;
  artistName?: string;
  id?: string;
  name?: string;
};

export type ArtistImageCandidate = {
  provider: string;
  providerArtistId: string | null;
  artistName: string;
  imageUrl: string;
  confidence: number;
  sourceUrl?: string | null;
  sourceRef?: string | null;
};

export type ArtistImageProvider = {
  name: string;
  minRequestIntervalMs?: number;
  searchArtistImage: (input: { artistName: string; artistKey: string }) => Promise<ArtistImageCandidate[]>;
};

export type ArtistImageUpdatedPayload = {
  artistId: string | null;
  artistKey: string;
  status: ArtistImageCacheEntry['status'];
};
