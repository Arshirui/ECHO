import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { isLikelyDefaultArtistAvatarImage } from './ArtistImageDefaultAvatar';

const svgImage = (body: string): Uint8Array => Buffer.from(body, 'utf8');

describe('artist default avatar detection', () => {
  it('detects QQ Music default artist avatar artwork', async () => {
    const image = sharp(svgImage(
      '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ecf6ee"/><circle cx="256" cy="178" r="76" fill="#fde6ce"/><rect x="80" y="286" width="352" height="226" rx="176" fill="#92e4bb"/><rect x="228" y="326" width="56" height="116" rx="10" fill="#ffffff"/><rect x="216" y="354" width="80" height="12" rx="6" fill="#ffffff"/><rect x="216" y="382" width="80" height="12" rx="6" fill="#ffffff"/></svg>',
    ));

    await expect(isLikelyDefaultArtistAvatarImage(image)).resolves.toBe(true);
  });

  it('does not reject ordinary artist artwork', async () => {
    const image = sharp(svgImage(
      '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#28364f"/><circle cx="170" cy="210" r="112" fill="#ddc7b7"/><circle cx="340" cy="210" r="112" fill="#947c70"/><rect x="72" y="312" width="368" height="148" rx="26" fill="#151a24"/></svg>',
    ));

    await expect(isLikelyDefaultArtistAvatarImage(image)).resolves.toBe(false);
  });
});
