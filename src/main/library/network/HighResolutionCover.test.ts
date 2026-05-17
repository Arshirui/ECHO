import { describe, expect, it } from 'vitest';
import { highResolutionCoverUrl } from './HighResolutionCover';

describe('highResolutionCoverUrl', () => {
  it('requests larger NetEase cover art without changing the source image', () => {
    expect(highResolutionCoverUrl('netease-cloud-music', 'https://p.music.126.net/abc.jpg?param=300y300')).toBe(
      'https://p.music.126.net/abc.jpg?param=2000y2000',
    );
  });

  it('requests larger QQ Music album art', () => {
    expect(highResolutionCoverUrl('qq-music', 'https://y.gtimg.cn/music/photo_new/T002R300x300M000abc.jpg')).toBe(
      'https://y.gtimg.cn/music/photo_new/T002R1000x1000M000abc.jpg',
    );
  });

  it('uses the original Cover Art Archive endpoint instead of the thumbnail endpoint', () => {
    expect(highResolutionCoverUrl('musicbrainz', 'https://coverartarchive.org/release/abc/front-250')).toBe(
      'https://coverartarchive.org/release/abc/front',
    );
  });
});

