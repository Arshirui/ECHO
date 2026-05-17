import type { NetworkProviderName } from './networkTypes';

const clampImageSize = (size: number): number => Math.max(300, Math.min(3000, Math.round(size)));

const setUrlParam = (url: URL, key: string, value: string): string => {
  url.searchParams.set(key, value);
  return url.toString();
};

export const highResolutionCoverUrl = (
  provider: NetworkProviderName,
  coverUrl: string | null | undefined,
  targetSize = 2000,
): string | null => {
  if (!coverUrl?.trim()) {
    return null;
  }

  const size = clampImageSize(targetSize);
  const trimmed = coverUrl.trim();

  try {
    const url = new URL(trimmed);

    if (provider === 'netease-cloud-music' || url.hostname.endsWith('music.126.net')) {
      return setUrlParam(url, 'param', `${size}y${size}`);
    }

    if (provider === 'qq-music' || url.hostname.endsWith('gtimg.cn')) {
      return trimmed.replace(/T002R\d+x\d+M000/u, `T002R${Math.min(size, 1000)}x${Math.min(size, 1000)}M000`);
    }

    if (provider === 'musicbrainz' || url.hostname.endsWith('coverartarchive.org')) {
      return trimmed.replace(/\/front-\d+(?=$|[?#])/u, '/front');
    }

    return trimmed;
  } catch {
    return trimmed;
  }
};

