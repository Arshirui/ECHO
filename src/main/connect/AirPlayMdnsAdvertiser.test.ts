import { describe, expect, it } from 'vitest';
import { AirPlayMdnsAdvertiser } from './AirPlayMdnsAdvertiser';

type PacketFactory = {
  createPacket: (advertisement: {
    name: string;
    address: string;
    mac: string;
    port: number;
    airPlayPort?: number | null;
    airPlayPublicKey?: string | null;
    model: string;
    airPlay2Experimental?: boolean;
  }, ttl: number) => Buffer;
};

describe('AirPlayMdnsAdvertiser', () => {
  it('advertises a classic RAOP audio service without a misleading AirPlay control service', () => {
    const advertiser = new AirPlayMdnsAdvertiser() as unknown as PacketFactory;
    const packet = advertiser.createPacket({
      name: 'ECHO Next (AirPlay)',
      address: '192.168.31.214',
      mac: '60:CF:84:CB:1E:D1',
      port: 6000,
      model: 'ECHO-Next-AirPlay-Spike',
    }, 120);
    const payload = packet.toString('utf8');

    expect(packet.readUInt16BE(6)).toBe(5);
    expect(payload).toContain('_raop');
    expect(payload).toContain('cn=0,1');
    expect(payload).toContain('pw=false');
    expect(payload).toContain('sf=0x4');
    expect(payload).toContain('vs=130.14');
    expect(payload).not.toContain('_airplay');
    expect(payload).not.toContain('features=');
    expect(payload).not.toContain('0x527FFFF7');
    expect(payload).not.toContain('cn=0,1,2,3');
  });

  it('can advertise an opt-in experimental AirPlay 2 discovery service', () => {
    const advertiser = new AirPlayMdnsAdvertiser() as unknown as PacketFactory;
    const packet = advertiser.createPacket({
      name: 'ECHO Next (AirPlay)',
      address: '192.168.31.214',
      mac: '60:CF:84:CB:1E:D1',
      port: 6000,
      airPlayPort: 7000,
      airPlayPublicKey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      model: 'ECHO-Next-AirPlay-Spike',
      airPlay2Experimental: true,
    }, 120);
    const payload = packet.toString('utf8');

    expect(packet.readUInt16BE(6)).toBe(9);
    expect(payload).toContain('_raop');
    expect(payload).toContain('_airplay');
    expect(payload).toContain('deviceid=60:CF:84:CB:1E:D1');
    expect(payload).toContain('features=0x40000a00,0x80300');
    expect(payload).toContain('srcvers=366.0');
    expect(payload).toContain('pi=60cf84cb-1ed1-4169-8270-6c6179000000');
    expect(payload).toContain('pk=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
  });
});
