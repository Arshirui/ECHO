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

export type PluginPermissionRisk = 'low' | 'medium' | 'high';

export type PluginPermissionDescriptor = {
  permission: PluginPermission;
  label: string;
  description: string;
  risk: PluginPermissionRisk;
};

export const pluginPermissionDescriptors: Record<PluginPermission, PluginPermissionDescriptor> = {
  'playback:read': {
    permission: 'playback:read',
    label: '读取播放状态',
    description: '可读取当前播放状态、曲目 id、进度和音频状态快照。',
    risk: 'low',
  },
  'playback:control': {
    permission: 'playback:control',
    label: '控制播放',
    description: '可触发播放、暂停、停止和跳转位置。',
    risk: 'medium',
  },
  'library:read': {
    permission: 'library:read',
    label: '读取曲库',
    description: '可分页读取曲库摘要和公开曲目信息。',
    risk: 'medium',
  },
  'library:write': {
    permission: 'library:write',
    label: '修改曲库',
    description: '预留给曲库写入能力，启用前应确认插件来源。',
    risk: 'high',
  },
  'settings:read': {
    permission: 'settings:read',
    label: '读取设置',
    description: '可读取应用设置快照。',
    risk: 'medium',
  },
  'settings:write': {
    permission: 'settings:write',
    label: '修改设置',
    description: '可写入应用设置，属于高风险能力。',
    risk: 'high',
  },
  network: {
    permission: 'network',
    label: '访问网络',
    description: '预留给网络访问能力，插件可能连接外部服务。',
    risk: 'high',
  },
  'fs:plugin': {
    permission: 'fs:plugin',
    label: '插件目录文件',
    description: '可读写插件自身目录内的数据。',
    risk: 'medium',
  },
};

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

export type PluginActivitySummary = {
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  lastCommandAt: string | null;
  lastEventAt: string | null;
  lastStorageWriteAt: string | null;
  lastSettingsWriteAt: string | null;
  lastErrorAt: string | null;
  commandRunCount: number;
  eventDispatchCount: number;
  storageWriteCount: number;
  settingsWriteCount: number;
  errorCount: number;
};

export type PluginSecuritySummary = {
  requestedPermissionCount: number;
  trustedPermissionCount: number;
  untrustedPermissions: PluginPermission[];
  highRiskPermissions: PluginPermission[];
  hasEntry: boolean;
  hasPanel: boolean;
  sandboxedPanel: boolean;
  commandCount: number;
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
  disabledByHost: boolean;
  activity: PluginActivitySummary;
  security: PluginSecuritySummary;
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

export type PluginPackageFile = {
  path: string;
  content: string;
};

export type PluginPackage = {
  type: 'echo-next-plugin-package';
  version: 1;
  exportedAt: string;
  manifest: PluginManifest;
  files: PluginPackageFile[];
};

export type PluginImportPackageResult = {
  pluginId: string;
  directory: string;
  importedFileCount: number;
};
