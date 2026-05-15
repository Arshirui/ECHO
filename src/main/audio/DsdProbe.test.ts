import { describe, expect, it } from 'vitest';
import {
  parseDsdNativeSampleRateFromBuffer,
  resolveDsdPcmOutputSampleRate,
  shouldProbeDsdNativeSampleRate,
} from './DsdProbe';

const createDsfHeader = (sampleRate: number): Buffer => {
  const buffer = Buffer.alloc(28 + 52);

  buffer.write('DSD ', 0, 'ascii');
  buffer.writeBigUInt64LE(28n, 4);
  buffer.writeBigUInt64LE(BigInt(buffer.length), 12);
  buffer.writeBigUInt64LE(0n, 20);
  buffer.write('fmt ', 28, 'ascii');
  buffer.writeBigUInt64LE(52n, 32);
  buffer.writeUInt32LE(1, 40);
  buffer.writeUInt32LE(0, 44);
  buffer.writeUInt32LE(2, 48);
  buffer.writeUInt32LE(2, 52);
  buffer.writeUInt32LE(sampleRate, 56);
  buffer.writeUInt32LE(1, 60);

  return buffer;
};

const createDffHeader = (sampleRate: number): Buffer => {
  const buffer = Buffer.alloc(32);

  buffer.write('FRM8', 0, 'ascii');
  buffer.writeBigUInt64BE(20n, 4);
  buffer.write('DSD ', 12, 'ascii');
  buffer.write('FS  ', 16, 'ascii');
  buffer.writeBigUInt64BE(4n, 20);
  buffer.writeUInt32BE(sampleRate, 28);

  return buffer;
};

describe('DSD probing helpers', () => {
  it('reads the native DSD bit clock from a DSF fmt chunk', () => {
    expect(parseDsdNativeSampleRateFromBuffer(createDsfHeader(2_822_400))).toBe(2_822_400);
  });

  it('reads the native DSD bit clock from a DFF FS chunk', () => {
    expect(parseDsdNativeSampleRateFromBuffer(createDffHeader(5_644_800))).toBe(5_644_800);
  });

  it('marks DSF metadata reported as 44.1 kHz for a native-rate refresh', () => {
    expect(shouldProbeDsdNativeSampleRate({
      filePath: 'album/track.dsf',
      codec: 'DSF',
      bitDepth: 1,
      fileSampleRate: 44_100,
    })).toBe(true);
  });

  it('maps DSD rates to the V1 high-rate PCM targets', () => {
    expect(resolveDsdPcmOutputSampleRate({ filePath: 'dsd64.dsf', codec: 'DSF', fileSampleRate: 2_822_400 })).toBe(176_400);
    expect(resolveDsdPcmOutputSampleRate({ filePath: 'dsd128.dsf', codec: 'DSF', fileSampleRate: 5_644_800 })).toBe(352_800);
    expect(resolveDsdPcmOutputSampleRate({ filePath: 'dsd256.dsf', codec: 'DSF', fileSampleRate: 11_289_600 })).toBe(352_800);
  });
});
