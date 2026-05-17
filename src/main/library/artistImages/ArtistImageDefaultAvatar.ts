import sharp from 'sharp';

const colorDistance = (left: readonly number[], right: readonly number[]): number =>
  Math.sqrt(
    ((left[0] ?? 0) - (right[0] ?? 0)) ** 2
      + ((left[1] ?? 0) - (right[1] ?? 0)) ** 2
      + ((left[2] ?? 0) - (right[2] ?? 0)) ** 2,
  );

const pixelAt = (data: Uint8Array, width: number, x: number, y: number): [number, number, number] => {
  const offset = (y * width + x) * 3;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
};

export const isLikelyDefaultArtistAvatarImage = async (source: sharp.Sharp): Promise<boolean> => {
  const { data, info } = await source
    .clone()
    .removeAlpha()
    .resize(16, 16, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 16 || info.height !== 16 || info.channels < 3) {
    return false;
  }

  const samples = [
    colorDistance(pixelAt(data, 16, 1, 1), [236, 246, 238]),
    colorDistance(pixelAt(data, 16, 8, 4), [253, 230, 206]),
    colorDistance(pixelAt(data, 16, 5, 13), [146, 228, 187]),
    colorDistance(pixelAt(data, 16, 11, 13), [146, 228, 187]),
    colorDistance(pixelAt(data, 16, 8, 13), [243, 253, 247]),
  ];

  return samples.every((distance) => distance <= 34);
};
