import type { LibraryPage, LibraryPageQuery, LibraryTrack } from './library';

export const pluginApiVersion = 1;

export const pluginPermissions = [
  'playback:read',
  'playback:control',
  'library:read',
  'library:write',
  'settings:read',
  'settings:write',
  'network',
  'fs:plugin',
] as const;

export type PluginPermission = (typeof pluginPermissions)[number];

export type PluginPanelContribution = {
  id: string;
  title: string;
  path: string;
};

export type PluginCommandContribution = {
  id: string;
  title: string;
  description?: string;
};

export type PluginManifestContributes = {
  commands?: PluginCommandContribution[];
  panels?: PluginPanelContribution[];
  settings?: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  entry?: string;
  panel?: string;
  permissions?: PluginPermission[];
  contributes?: PluginManifestContributes;
};

export const pluginEventNames = [
  'playback:status',
  'library:changed',
] as const;

export type PluginEventName = (typeof pluginEventNames)[number];

export const pluginLibraryTrackFields = [
  'id',
  'mediaType',
  'path',
  'sourceId',
  'provider',
  'remotePath',
  'stableKey',
  'title',
  'artist',
  'album',
  'albumArtist',
  'trackNo',
  'discNo',
  'year',
  'genre',
  'duration',
  'codec',
  'sampleRate',
  'bitDepth',
  'bitrate',
  'bpm',
  'coverId',
  'coverThumb',
  'metadataStatus',
  'embeddedMetadataStatus',
  'embeddedCoverStatus',
  'networkMetadataStatus',
  'fieldSources',
  'unavailable',
] as const satisfies ReadonlyArray<keyof LibraryTrack>;

export type PluginLibraryTrackField = (typeof pluginLibraryTrackFields)[number];

export type PluginLibraryTracksQuery = Pick<LibraryPageQuery, 'page' | 'pageSize' | 'search' | 'sort' | 'sourceProvider'> & {
  fields?: PluginLibraryTrackField[];
};

export type PluginLibraryTrack = Partial<Pick<LibraryTrack, PluginLibraryTrackField>>;

export type PluginLibraryTrackPage = Omit<LibraryPage<PluginLibraryTrack>, 'items'> & {
  items: PluginLibraryTrack[];
};

export const pluginPanelBridgeChannel = 'echo:plugin-panel';
export const pluginPanelBridgeVersion = 1;

export const pluginPanelBridgeActions = [
  'plugin:getSummary',
  'plugin:getLogs',
  'plugin:runCommand',
] as const;

export type PluginPanelBridgeAction = (typeof pluginPanelBridgeActions)[number];

export type PluginPanelBridgeRequest = {
  channel: typeof pluginPanelBridgeChannel;
  version?: number;
  type: 'request';
  requestId: string;
  pluginId: string;
  action: PluginPanelBridgeAction;
  payload?: unknown;
};

export type PluginPanelBridgeResponse = {
  channel: typeof pluginPanelBridgeChannel;
  version: typeof pluginPanelBridgeVersion;
  type: 'response';
  requestId: string;
  pluginId: string;
} & (
  | {
      ok: true;
      result: unknown;
    }
  | {
      ok: false;
      error: string;
    }
);

export type PluginRuntimeStatus = 'disabled' | 'enabled' | 'running' | 'error';

export type PluginLogLevel = 'info' | 'warn' | 'error';

export type PluginLogEntry = {
  id: string;
  pluginId: string;
  level: PluginLogLevel;
  message: string;
  createdAt: string;
};

export type PluginCommand = PluginCommandContribution & {
  pluginId: string;
};

export type PluginSummary = {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  directory: string;
  entry: string | null;
  panel: string | null;
  permissions: PluginPermission[];
  trustedPermissions: PluginPermission[];
  enabled: boolean;
  status: PluginRuntimeStatus;
  error: string | null;
  contributes: PluginManifestContributes;
  commands: PluginCommand[];
};

export type PluginListResult = {
  plugins: PluginSummary[];
  directory: string;
};

export type PluginEnableRequest = {
  pluginId: string;
  trustedPermissions?: PluginPermission[];
};

export type PluginRunCommandRequest = {
  pluginId: string;
  commandId: string;
  args?: unknown[];
};

export type PluginCreateExampleKind = 'playback-panel' | 'command-tool' | 'library-script';

export type PluginCreateExampleResult = {
  pluginId: string;
  directory: string;
};
