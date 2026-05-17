import dgram from 'node:dgram';
import { setTimeout as delay } from 'node:timers/promises';
import type { ConnectDevice, ConnectDeviceCapabilities } from '../../shared/types/connect';

export type DlnaService = {
  serviceType: string;
  controlUrl: string;
};

export type DlnaDevice = ConnectDevice & {
  descriptionUrl: string;
  udn: string;
  services: {
    avTransport: DlnaService | null;
    renderingControl: DlnaService | null;
    connectionManager: DlnaService | null;
  };
};

const ssdpAddress = '239.255.255.250';
const ssdpPort = 1900;
const searchTargets = [
  'urn:schemas-upnp-org:device:MediaRenderer:1',
  'urn:schemas-upnp-org:service:AVTransport:1',
];

const defaultCapabilities: ConnectDeviceCapabilities = {
  canPlay: true,
  canPause: true,
  canStop: true,
  canSeek: true,
  canSetVolume: true,
  supportsMetadata: true,
  supportsSetNext: false,
  supportedMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/aac', 'audio/ogg'],
  requiresTranscode: false,
};

const headerValue = (raw: string, name: string): string | null => {
  const line = raw.split(/\r?\n/u).find((candidate) => candidate.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line?.slice(line.indexOf(':') + 1).trim() ?? null;
};

const xmlText = (xml: string, tag: string): string | null => {
  const match = xml.match(new RegExp(`<[^>/:]*:?${tag}\\b[^>]*>([\\s\\S]*?)<\\/[^>/:]*:?${tag}>`, 'iu'));
  return decodeXml(match?.[1]?.trim() ?? null);
};

const xmlBlocks = (xml: string, tag: string): string[] =>
  xml.match(new RegExp(`<[^>/:]*:?${tag}\\b[^>]*>[\\s\\S]*?<\\/[^>/:]*:?${tag}>`, 'giu')) ?? [];

const decodeXml = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
};

const absoluteUrl = (url: string | null, baseUrl: string): string | null => {
  if (!url) {
    return null;
  }

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
};

const parseDeviceDescription = (xml: string, descriptionUrl: string): DlnaDevice | null => {
  const deviceBlock = xmlBlocks(xml, 'device').find((block) => /MediaRenderer/iu.test(xmlText(block, 'deviceType') ?? ''));
  if (!deviceBlock) {
    return null;
  }

  const urlBase = xmlText(xml, 'URLBase') ?? descriptionUrl;
  const services = xmlBlocks(deviceBlock, 'service');
  const serviceFor = (name: 'AVTransport' | 'RenderingControl' | 'ConnectionManager'): DlnaService | null => {
    const service = services.find((block) => (xmlText(block, 'serviceType') ?? '').includes(`:${name}:`));
    if (!service) {
      return null;
    }

    const serviceType = xmlText(service, 'serviceType');
    const controlUrl = absoluteUrl(xmlText(service, 'controlURL'), urlBase);
    return serviceType && controlUrl ? { serviceType, controlUrl } : null;
  };

  const avTransport = serviceFor('AVTransport');
  if (!avTransport) {
    return null;
  }

  const udn = xmlText(deviceBlock, 'UDN') ?? descriptionUrl;
  const name = xmlText(deviceBlock, 'friendlyName') ?? 'DLNA Renderer';
  const manufacturer = xmlText(deviceBlock, 'manufacturer');
  const modelName = xmlText(deviceBlock, 'modelName');
  const host = new URL(descriptionUrl).hostname;

  return {
    id: `dlna:${udn}`,
    name,
    protocol: 'dlna',
    model: modelName,
    manufacturer,
    address: host,
    capabilities: { ...defaultCapabilities },
    state: 'available',
    lastSeenAt: new Date().toISOString(),
    unsupportedReason: null,
    descriptionUrl,
    udn,
    services: {
      avTransport,
      renderingControl: serviceFor('RenderingControl'),
      connectionManager: serviceFor('ConnectionManager'),
    },
  };
};

const requestDeviceDescription = async (location: string): Promise<DlnaDevice | null> => {
  try {
    const response = await fetch(location, { signal: AbortSignal.timeout(4500) });
    if (!response.ok) {
      return null;
    }

    return parseDeviceDescription(await response.text(), response.url || location);
  } catch {
    return null;
  }
};

const parseProtocolInfo = (value: string | null): string[] => {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.split(':')[2]?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  );
};

const createSoapEnvelope = (serviceType: string, action: string, args: Record<string, string | number>): string =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    '<s:Body>',
    `<u:${action} xmlns:u="${escapeXml(serviceType)}">`,
    ...Object.entries(args).map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`),
    `</u:${action}>`,
    '</s:Body>',
    '</s:Envelope>',
  ].join('');

export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const callDlnaAction = async (
  service: DlnaService,
  action: string,
  args: Record<string, string | number>,
): Promise<string> => {
  const body = createSoapEnvelope(service.serviceType, action, args);
  const response = await fetch(service.controlUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(Buffer.byteLength(body)),
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPAction: `"${service.serviceType}#${action}"`,
    },
    body,
    signal: AbortSignal.timeout(6000),
  });
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`DLNA ${action} failed: HTTP ${response.status}${text ? ` ${text.slice(0, 240)}` : ''}`);
  }

  return text;
};

const requireDlnaService = (service: DlnaService | null, label: string): DlnaService => {
  if (!service) {
    throw new Error(`DLNA device does not expose ${label}.`);
  }

  return service;
};

const enrichCapabilities = async (device: DlnaDevice): Promise<DlnaDevice> => {
  if (!device.services.connectionManager) {
    return device;
  }

  try {
    const response = await callDlnaAction(device.services.connectionManager, 'GetProtocolInfo', {});
    const supportedMimeTypes = parseProtocolInfo(xmlText(response, 'Sink'));
    if (supportedMimeTypes.length === 0) {
      return device;
    }

    return {
      ...device,
      capabilities: {
        ...device.capabilities,
        supportedMimeTypes,
      },
    };
  } catch {
    return device;
  }
};

export const discoverDlnaDevices = async (timeoutMs = 2400): Promise<DlnaDevice[]> => {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const locations = new Set<string>();

  socket.on('message', (message) => {
    const location = headerValue(message.toString('utf8'), 'location');
    if (location) {
      locations.add(location);
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, () => {
      socket.off('error', reject);
      resolve();
    });
  });

  for (const target of searchTargets) {
    const payload = [
      'M-SEARCH * HTTP/1.1',
      `HOST: ${ssdpAddress}:${ssdpPort}`,
      'MAN: "ssdp:discover"',
      'MX: 2',
      `ST: ${target}`,
      '',
      '',
    ].join('\r\n');
    socket.send(Buffer.from(payload), ssdpPort, ssdpAddress);
  }

  await delay(timeoutMs);
  socket.close();

  const devices = (await Promise.all([...locations].map(requestDeviceDescription))).filter(
    (device): device is DlnaDevice => Boolean(device),
  );
  const unique = new Map<string, DlnaDevice>();
  for (const device of devices) {
    unique.set(device.id, device);
  }

  return Promise.all([...unique.values()].map(enrichCapabilities));
};

export const setDlnaTransportUri = (device: DlnaDevice, streamUrl: string, metadataXml: string): Promise<string> =>
  callDlnaAction(requireDlnaService(device.services.avTransport, 'AVTransport'), 'SetAVTransportURI', {
    InstanceID: 0,
    CurrentURI: streamUrl,
    CurrentURIMetaData: metadataXml,
  });

export const setDlnaNextTransportUri = (device: DlnaDevice, streamUrl: string, metadataXml: string): Promise<string> =>
  callDlnaAction(requireDlnaService(device.services.avTransport, 'AVTransport'), 'SetNextAVTransportURI', {
    InstanceID: 0,
    NextURI: streamUrl,
    NextURIMetaData: metadataXml,
  });

export const playDlna = (device: DlnaDevice): Promise<string> =>
  callDlnaAction(requireDlnaService(device.services.avTransport, 'AVTransport'), 'Play', { InstanceID: 0, Speed: 1 });

export const pauseDlna = (device: DlnaDevice): Promise<string> =>
  callDlnaAction(requireDlnaService(device.services.avTransport, 'AVTransport'), 'Pause', { InstanceID: 0 });

export const stopDlna = (device: DlnaDevice): Promise<string> =>
  callDlnaAction(requireDlnaService(device.services.avTransport, 'AVTransport'), 'Stop', { InstanceID: 0 });

export const seekDlna = (device: DlnaDevice, target: string): Promise<string> =>
  callDlnaAction(requireDlnaService(device.services.avTransport, 'AVTransport'), 'Seek', { InstanceID: 0, Unit: 'REL_TIME', Target: target });

export const setDlnaVolume = (device: DlnaDevice, volumePercent: number): Promise<string> => {
  if (!device.services.renderingControl) {
    throw new Error('该 DLNA 设备没有暴露音量控制。');
  }

  return callDlnaAction(device.services.renderingControl, 'SetVolume', {
    InstanceID: 0,
    Channel: 'Master',
    DesiredVolume: Math.max(0, Math.min(100, Math.round(volumePercent))),
  });
};
