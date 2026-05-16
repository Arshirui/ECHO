import type { StreamingArtist } from '../../../shared/types/streaming';
import { QQMusicStreamingProvider } from '../../streaming/providers/QQMusicStreamingProvider';
import { ARTIST_IMAGE_AUTO_MATCH_MIN_CONFIDENCE, artistImageConfidence } from './ArtistImageMatching';
import type { ArtistImageCandidate, ArtistImageProvider } from './ArtistImageTypes';

const providerName = 'qqmusic';

const unwrapStreamingImageUrl = (url: string | null | undefined): string | null => {
  if (!url) {
    return null;
  }

  if (!url.startsWith('echo-image://remote/')) {
    return url;
  }

  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/u, ''));
  } catch {
    return null;
  }
};

const artistSourceUrl = (artist: StreamingArtist): string | null =>
  artist.providerArtistId ? `https://y.qq.com/n/ryqq/singer/${encodeURIComponent(artist.providerArtistId)}` : null;

export class QQMusicArtistImageProvider implements ArtistImageProvider {
  readonly name = providerName;
  readonly minRequestIntervalMs = 650;

  constructor(private readonly streamingProvider = new QQMusicStreamingProvider()) {}

  async searchArtistImage(input: { artistName: string; artistKey: string }): Promise<ArtistImageCandidate[]> {
    const result = await this.streamingProvider.search({
      provider: providerName,
      query: input.artistName,
      mediaTypes: ['artist'],
      page: 1,
      pageSize: 8,
    });

    return result.artists
      .map((artist): ArtistImageCandidate | null => {
        const imageUrl = unwrapStreamingImageUrl(artist.avatarUrl ?? artist.coverUrl);
        if (!imageUrl) {
          return null;
        }

        return {
          provider: providerName,
          providerArtistId: artist.providerArtistId,
          artistName: artist.name,
          imageUrl,
          confidence: artistImageConfidence(input.artistName, artist.name),
          sourceUrl: artistSourceUrl(artist),
          sourceRef: artist.id,
        };
      })
      .filter((candidate): candidate is ArtistImageCandidate => Boolean(candidate))
      .sort((left, right) => {
        const scoreDelta = right.confidence - left.confidence;
        if (scoreDelta !== 0) {
          return scoreDelta;
        }

        return left.artistName.localeCompare(right.artistName);
      })
      .map((candidate) => ({
        ...candidate,
        confidence: Math.min(1, Math.max(0, candidate.confidence)),
      }))
      .filter((candidate, index) => index === 0 || candidate.confidence >= ARTIST_IMAGE_AUTO_MATCH_MIN_CONFIDENCE);
  }
}
