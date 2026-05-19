import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { app } from 'electron';
import Database from 'better-sqlite3';
import {
  checkDatabaseHealth,
  checkpointWal,
  type DatabaseHealthResult,
} from '../database/health';
import type {
  LibraryDatabaseArchiveInfo,
  LibraryDatabaseDeleteResult,
  LibraryDatabaseMaintenanceEventInfo,
  LibraryDatabaseProtectionStatus,
  LibraryDatabaseRepairResult,
  LibraryDatabaseRestoreResult,
  LibraryDatabaseSnapshotInfo,
  LibraryScanStatus,
} from '../../shared/types/library';

type DataProtectionReason = 'startup' | 'update-install' | 'manual-library-database-snapshot' | 'scan-completed-library-snapshot';
type ProtectedEntryKind = 'file' | 'directory';

type ProtectedEntry = {
  name: string;
  kind: ProtectedEntryKind;
};

type SnapshotResult = {
  snapshotPath: string;
  copied: string[];
  skipped: string[];
  libraryHealth: DatabaseHealthResult;
  libraryBackupMethod: 'none' | 'sqlite-backup' | 'file-copy';
};

type RestoreResult = {
  restored: string[];
  skipped: string[];
};

type LibraryDatabaseMaintenanceEvent = {
  createdAt: string;
  action: 'manual-repair' | 'manual-delete' | 'manual-restore' | 'startup-protected' | 'scan-health-failed' | 'scan-auto-restore';
  databasePath: string;
  archivePath?: string | null;
  removedDatabaseFiles?: string[];
  restoredSnapshotId?: string;
  health?: DatabaseHealthResult;
  scan?: {
    jobId: string;
    folderId: string;
    phase: string;
    totalFiles: number;
    processedFiles: number;
    skippedFiles: number;
    addedTracks: number;
    updatedTracks: number;
    removedTracks: number;
    errorCount: number;
  };
  error?: string;
};

type LegacyMigrationResult = {
  sourcePath: string | null;
  migrated: string[];
  skipped: string[];
};

export type LibraryDatabaseScanGuardSnapshot = {
  id: string;
  path: string;
  databasePath: string;
  createdAt: string;
  scanJobId: string;
  folderId: string;
  libraryHealth: DatabaseHealthResult;
};

export type LibraryDatabaseScanGuardRestoreResult = {
  databasePath: string;
  archivePath: string | null;
  restoredSnapshotId: string;
  restoredDatabaseFiles: string[];
  health: DatabaseHealthResult;
};

export type LibraryRecoveryResult = {
  action: 'none' | 'protected' | 'archivedOnly' | 'autoRestoredFromScanGuard' | 'failed';
  sourceSnapshotPath?: string;
  scanGuardSnapshotId?: string;
  archivePath?: string;
  health: DatabaseHealthResult;
};

export type DataProtectionResult = {
  userDataPath: string;
  migration: LegacyMigrationResult;
  snapshot: SnapshotResult;
  restore: RestoreResult;
  libraryHealth: DatabaseHealthResult;
  recovery: LibraryRecoveryResult;
};

export class LibraryDatabaseUnavailableError extends Error {
  constructor(readonly recovery: LibraryRecoveryResult | null = lastDataProtectionResult?.recovery ?? null) {
    super(
      recovery?.action === 'protected' || recovery?.action === 'archivedOnly' || recovery?.action === 'failed'
        ? '音乐库数据库未通过健康检查，ECHO Next 已进入保护模式。音乐文件不会被删除，请前往设置里的数据库恢复工具处理。'
        : '音乐库数据库暂时不可用。请稍后重试或前往设置里的数据库恢复工具处理。',
    );
    this.name = 'LibraryDatabaseUnavailableError';
  }
}

type UserDataScore = {
  path: string;
  score: number;
  protectedFiles: number;
  librarySize: number;
  hasSettings: boolean;
};

type ElectronPathName = Parameters<typeof app.getPath>[0];

type ElectronAppLike = {
  getName?: () => string;
  getPath: (name: ElectronPathName) => string;
  getVersion?: () => string;
  setPath?: (name: ElectronPathName, path: string) => void;
};

const protectedUserDataFolderName = 'ECHO NEXT';
const legacyUserDataFolderNames = ['echo-next', 'ECHO Next', 'ECHO'];
const dataProtectionDirectoryName = 'data-protection';
const snapshotDirectoryName = 'snapshots';
const scanGuardDirectoryName = 'scan-guards';
const corruptArchivesDirectoryName = 'corrupt-archives';
const manifestFileName = 'echo-data-protection.json';
const libraryMaintenanceFileName = 'library-database-maintenance.json';
const maxSnapshots = 5;
const maxLibraryMaintenanceEvents = 20;
const libraryFileName = 'echo-library.sqlite';
const libraryWalFileName = `${libraryFileName}-wal`;
const libraryShmFileName = `${libraryFileName}-shm`;
const libraryEntryNames = new Set([libraryFileName, libraryWalFileName, libraryShmFileName]);

export const protectedDataEntries: ProtectedEntry[] = [
  { name: 'echo-settings.json', kind: 'file' },
  { name: 'echo-library.sqlite', kind: 'file' },
  { name: 'echo-library.sqlite-wal', kind: 'file' },
  { name: 'echo-library.sqlite-shm', kind: 'file' },
  { name: 'accounts.json', kind: 'file' },
  { name: 'echo-download-settings.json', kind: 'file' },
  { name: 'echo-playback-memory.json', kind: 'file' },
  { name: 'eq-presets.json', kind: 'file' },
  { name: 'app-wallpapers', kind: 'directory' },
  { name: 'lyrics-wallpapers', kind: 'directory' },
];

const timestampForPath = (date = new Date()): string => date.toISOString().replace(/[:.]/g, '-');

const safeReadJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
};

const getLibraryMaintenancePath = (userDataPath: string): string => join(getDataProtectionPath(userDataPath), libraryMaintenanceFileName);

const readLibraryDatabaseMaintenanceEvents = (userDataPath: string): LibraryDatabaseMaintenanceEvent[] => {
  const value = safeReadJson<{ events?: LibraryDatabaseMaintenanceEvent[] }>(getLibraryMaintenancePath(userDataPath));
  return Array.isArray(value?.events) ? value.events : [];
};

export const recordLibraryDatabaseMaintenanceEvent = (
  event: Omit<LibraryDatabaseMaintenanceEvent, 'createdAt'>,
  userDataPath = app.getPath('userData'),
): void => {
  try {
    const events = [
      ...readLibraryDatabaseMaintenanceEvents(userDataPath),
      { ...event, createdAt: new Date().toISOString() },
    ].slice(-maxLibraryMaintenanceEvents);
    const filePath = getLibraryMaintenancePath(userDataPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify({ formatVersion: 1, events }, null, 2)}\n`, 'utf8');
  } catch {
    // Diagnostics breadcrumbs must never block app recovery.
  }
};

export const getLibraryDatabaseMaintenanceReport = (userDataPath = app.getPath('userData')): {
  events: LibraryDatabaseMaintenanceEvent[];
} => ({
  events: readLibraryDatabaseMaintenanceEvents(userDataPath),
});

export const getProtectedUserDataPath = (electronApp: ElectronAppLike = app): string => {
  const appDataPath = electronApp.getPath('appData');
  return join(appDataPath, protectedUserDataFolderName);
};

export const initializeProtectedUserDataPath = (electronApp: ElectronAppLike = app): string => {
  const protectedUserDataPath = getProtectedUserDataPath(electronApp);
  mkdirSync(protectedUserDataPath, { recursive: true });

  if (electronApp.setPath && electronApp.getPath('userData') !== protectedUserDataPath) {
    electronApp.setPath('userData', protectedUserDataPath);
  }

  return protectedUserDataPath;
};

const getDataProtectionPath = (userDataPath: string): string => join(userDataPath, dataProtectionDirectoryName);
const getSnapshotsPath = (userDataPath: string): string => join(getDataProtectionPath(userDataPath), snapshotDirectoryName);
const getScanGuardsPath = (userDataPath: string): string => join(getDataProtectionPath(userDataPath), scanGuardDirectoryName);
const getCorruptArchivesPath = (userDataPath: string): string => join(getDataProtectionPath(userDataPath), corruptArchivesDirectoryName);
const getLegacyUserDataPaths = (electronApp: ElectronAppLike = app): string[] => {
  const appDataPath = electronApp.getPath('appData');
  const protectedPath = getProtectedUserDataPath(electronApp).toLocaleLowerCase();

  return legacyUserDataFolderNames
    .map((folderName) => join(appDataPath, folderName))
    .filter((legacyPath, index, paths) => legacyPath.toLocaleLowerCase() !== protectedPath && paths.indexOf(legacyPath) === index);
};

const copyProtectedEntry = (sourcePath: string, targetPath: string, kind: ProtectedEntryKind): void => {
  mkdirSync(dirname(targetPath), { recursive: true });
  if (kind === 'directory') {
    cpSync(sourcePath, targetPath, { recursive: true, force: true, errorOnExist: false });
  } else {
    copyFileSync(sourcePath, targetPath);
  }
};

const listSnapshotPaths = (userDataPath: string): string[] => {
  const snapshotsPath = getSnapshotsPath(userDataPath);
  if (!existsSync(snapshotsPath)) {
    return [];
  }

  return readdirSync(snapshotsPath)
    .map((entry) => join(snapshotsPath, entry))
    .filter((entryPath) => {
      try {
        return statSync(entryPath).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .reverse();
};

const pruneOldSnapshots = (userDataPath: string): void => {
  for (const snapshotPath of listSnapshotPaths(userDataPath).slice(maxSnapshots)) {
    rmSync(snapshotPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
};

const listScanGuardPaths = (userDataPath: string): string[] => {
  const scanGuardsPath = getScanGuardsPath(userDataPath);
  if (!existsSync(scanGuardsPath)) {
    return [];
  }

  return readdirSync(scanGuardsPath)
    .map((entry) => join(scanGuardsPath, entry))
    .filter((entryPath) => {
      try {
        return statSync(entryPath).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .reverse();
};

const pruneOldScanGuards = (userDataPath: string): void => {
  for (const snapshotPath of listScanGuardPaths(userDataPath).slice(3)) {
    rmSync(snapshotPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
};

const libraryPathFor = (rootPath: string): string => join(rootPath, libraryFileName);
const libraryWalPathFor = (rootPath: string): string => join(rootPath, libraryWalFileName);
const libraryShmPathFor = (rootPath: string): string => join(rootPath, libraryShmFileName);

const skippedSnapshot = (libraryHealth: DatabaseHealthResult): SnapshotResult => ({
  snapshotPath: '',
  copied: [],
  skipped: protectedDataEntries.map((entry) => entry.name),
  libraryHealth,
  libraryBackupMethod: 'none',
});

const copyLibraryTriplet = (sourceRoot: string, targetRoot: string): string[] => {
  const copied: string[] = [];
  for (const name of [libraryFileName, libraryWalFileName, libraryShmFileName]) {
    const sourcePath = join(sourceRoot, name);
    if (!existsSync(sourcePath)) {
      continue;
    }
    try {
      copyProtectedEntry(sourcePath, join(targetRoot, name), 'file');
      copied.push(name);
    } catch {
      // A failed archive/snapshot copy should not block the rest of startup.
    }
  }
  return copied;
};

const removeLibraryTriplet = (rootPath: string): void => {
  for (const name of [libraryFileName, libraryWalFileName, libraryShmFileName]) {
    rmSync(join(rootPath, name), { force: true, maxRetries: 3, retryDelay: 50 });
  }
};

export const repairProtectedLibraryDatabase = (userDataPath = app.getPath('userData')): LibraryDatabaseRepairResult => {
  mkdirSync(userDataPath, { recursive: true });
  const removedDatabaseFiles = [libraryFileName, libraryWalFileName, libraryShmFileName].filter((name) =>
    existsSync(join(userDataPath, name)),
  );
  const archivePath = archiveLibraryTriplet(userDataPath, 'manual-library-database-repair');
  removeLibraryTriplet(userDataPath);
  const health = checkDatabaseHealth(libraryPathFor(userDataPath));
  recordLibraryDatabaseMaintenanceEvent(
    {
      action: 'manual-repair',
      databasePath: libraryPathFor(userDataPath),
      archivePath,
      removedDatabaseFiles,
      health,
    },
    userDataPath,
  );

  return {
    databasePath: libraryPathFor(userDataPath),
    archivePath,
    removedDatabaseFiles,
    readyForRescan: health.status === 'ok',
  };
};

export const deleteProtectedLibraryDatabase = (userDataPath = app.getPath('userData')): LibraryDatabaseDeleteResult => {
  mkdirSync(userDataPath, { recursive: true });
  const removedDatabaseFiles = [libraryFileName, libraryWalFileName, libraryShmFileName].filter((name) =>
    existsSync(join(userDataPath, name)),
  );
  const archivePath = archiveLibraryTriplet(userDataPath, 'manual-library-database-delete');
  removeLibraryTriplet(userDataPath);
  recordLibraryDatabaseMaintenanceEvent(
    {
      action: 'manual-delete',
      databasePath: libraryPathFor(userDataPath),
      archivePath,
      removedDatabaseFiles,
      health: checkDatabaseHealth(libraryPathFor(userDataPath)),
    },
    userDataPath,
  );

  return {
    databasePath: libraryPathFor(userDataPath),
    archivePath,
    removedDatabaseFiles,
  };
};

const sqliteBackup = async (sourcePath: string, targetPath: string): Promise<void> => {
  mkdirSync(dirname(targetPath), { recursive: true });
  rmSync(targetPath, { force: true, maxRetries: 3, retryDelay: 50 });
  const database = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await database.backup(targetPath);
  } finally {
    database.close();
  }
};

const archiveLibraryTriplet = (userDataPath: string, reason: string, date = new Date()): string | null => {
  if (!existsSync(libraryPathFor(userDataPath)) && !existsSync(libraryWalPathFor(userDataPath)) && !existsSync(libraryShmPathFor(userDataPath))) {
    return null;
  }

  const archivePath = join(getCorruptArchivesPath(userDataPath), `${timestampForPath(date)}-${reason}`);
  mkdirSync(archivePath, { recursive: true });
  const copied = copyLibraryTriplet(userDataPath, archivePath);
  writeFileSync(
    join(archivePath, 'archive.json'),
    `${JSON.stringify({ formatVersion: 1, reason, createdAt: date.toISOString(), copied }, null, 2)}\n`,
    'utf8',
  );
  return archivePath;
};

const fileSize = (path: string): number => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

const fileSizeOrNull = (path: string): number | null => (existsSync(path) ? fileSize(path) : null);

const listArchivePaths = (userDataPath: string): string[] => {
  const archivesPath = getCorruptArchivesPath(userDataPath);
  if (!existsSync(archivesPath)) {
    return [];
  }

  return readdirSync(archivesPath)
    .map((entry) => join(archivesPath, entry))
    .filter((entryPath) => {
      try {
        return statSync(entryPath).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .reverse();
};

const isLibraryBackupMethod = (value: unknown): value is LibraryDatabaseSnapshotInfo['libraryBackupMethod'] =>
  value === 'none' || value === 'sqlite-backup' || value === 'file-copy';

const getSnapshotInfo = (snapshotPath: string): LibraryDatabaseSnapshotInfo => {
  const manifest = safeReadJson<{
    reason?: string;
    createdAt?: string;
    copied?: string[];
    skipped?: string[];
    libraryHealth?: DatabaseHealthResult;
    libraryBackupMethod?: string;
  }>(join(snapshotPath, 'snapshot.json'));
  const databasePath = libraryPathFor(snapshotPath);
  const health = existsSync(databasePath) ? checkDatabaseHealth(databasePath) : manifest?.libraryHealth ?? checkDatabaseHealth(databasePath);

  return {
    id: basename(snapshotPath),
    path: snapshotPath,
    createdAt: manifest?.createdAt ?? null,
    reason: manifest?.reason ?? null,
    copied: Array.isArray(manifest?.copied) ? manifest.copied : [],
    skipped: Array.isArray(manifest?.skipped) ? manifest.skipped : [],
    libraryHealth: health,
    libraryBackupMethod: isLibraryBackupMethod(manifest?.libraryBackupMethod) ? manifest.libraryBackupMethod : 'none',
    databasePath: existsSync(databasePath) ? databasePath : null,
    databaseSizeBytes: fileSizeOrNull(databasePath),
  };
};

const getArchiveInfo = (archivePath: string): LibraryDatabaseArchiveInfo => {
  const manifest = safeReadJson<{
    reason?: string;
    createdAt?: string;
    copied?: string[];
  }>(join(archivePath, 'archive.json'));
  const databasePath = libraryPathFor(archivePath);

  return {
    id: basename(archivePath),
    path: archivePath,
    createdAt: manifest?.createdAt ?? null,
    reason: manifest?.reason ?? null,
    copied: Array.isArray(manifest?.copied) ? manifest.copied : [],
    databasePath: existsSync(databasePath) ? databasePath : null,
    databaseSizeBytes: fileSizeOrNull(databasePath),
  };
};

const getRestorableHealthySnapshot = (snapshots: LibraryDatabaseSnapshotInfo[]): LibraryDatabaseSnapshotInfo | null =>
  snapshots.find((snapshot) => snapshot.libraryHealth.status === 'ok' && snapshot.databasePath && snapshot.copied.includes(libraryFileName)) ?? null;

const getSnapshotById = (userDataPath: string, snapshotId: string): LibraryDatabaseSnapshotInfo | null =>
  listSnapshotPaths(userDataPath)
    .map(getSnapshotInfo)
    .find((snapshot) => snapshot.id === snapshotId) ?? null;

const toMaintenanceEventInfo = (event: LibraryDatabaseMaintenanceEvent): LibraryDatabaseMaintenanceEventInfo => ({
  createdAt: event.createdAt,
  action: event.action,
  databasePath: event.databasePath,
  archivePath: event.archivePath,
  removedDatabaseFiles: event.removedDatabaseFiles,
  restoredSnapshotId: event.restoredSnapshotId,
  health: event.health,
  scan: event.scan,
  error: event.error,
});

const maintenanceScanInfo = (scanStatus: LibraryScanStatus): NonNullable<LibraryDatabaseMaintenanceEvent['scan']> => ({
  jobId: scanStatus.id,
  folderId: scanStatus.folderId,
  phase: scanStatus.phase,
  totalFiles: scanStatus.totalFiles,
  processedFiles: scanStatus.processedFiles,
  skippedFiles: scanStatus.skippedFiles,
  addedTracks: scanStatus.addedTracks,
  updatedTracks: scanStatus.updatedTracks,
  removedTracks: scanStatus.removedTracks,
  errorCount: scanStatus.errorCount,
});

export const getLibraryDatabaseProtectionStatus = (
  userDataPath = app.getPath('userData'),
  hasRunningScan = false,
): LibraryDatabaseProtectionStatus => {
  const databasePath = libraryPathFor(userDataPath);
  const snapshots = listSnapshotPaths(userDataPath).map(getSnapshotInfo);
  const latestHealthySnapshot = getRestorableHealthySnapshot(snapshots);
  const health = checkDatabaseHealth(databasePath);
  const maintenanceEvents = readLibraryDatabaseMaintenanceEvents(userDataPath).slice(-maxLibraryMaintenanceEvents).reverse().map(toMaintenanceEventInfo);
  const latestRestoreEvent = maintenanceEvents.find((event) => event.action === 'manual-restore');
  const latestMaintenanceEvent = maintenanceEvents[0] ?? null;
  const latestArchive = listArchivePaths(userDataPath).map(getArchiveInfo)[0] ?? null;
  const latestRestoreFailed = latestRestoreEvent?.health ? latestRestoreEvent.health.status !== 'ok' : false;
  const protectionMode: LibraryDatabaseProtectionStatus['protectionMode'] =
    health.status === 'ok'
      ? latestMaintenanceEvent?.action === 'scan-auto-restore'
        ? 'autoRestoredFromScanGuard'
        : 'normal'
      : latestArchive
        ? 'archivedOnly'
        : 'protected';
  const recommendedAction: LibraryDatabaseProtectionStatus['recommendedAction'] =
    health.status === 'ok'
      ? 'none'
      : !latestHealthySnapshot || latestRestoreFailed
        ? 'rebuild-empty-database'
        : 'restore-snapshot';
  const unrecoverableReason =
    recommendedAction === 'rebuild-empty-database'
      ? latestRestoreFailed
        ? '最近一次健康快照恢复后仍未通过数据库检查。'
        : '当前数据库不可用，且没有可恢复的健康快照。'
      : undefined;

  return {
    dataProtectionPath: getDataProtectionPath(userDataPath),
    databasePath,
    databaseSizeBytes: fileSizeOrNull(databasePath),
    health,
    snapshots,
    latestHealthySnapshot,
    latestArchive,
    maintenanceEvents,
    canRestoreSnapshot: Boolean(latestHealthySnapshot),
    hasRunningScan,
    protectionMode,
    recommendedAction,
    unrecoverableReason,
  };
};

export const createManualLibraryDatabaseSnapshot = async (
  userDataPath = app.getPath('userData'),
): Promise<LibraryDatabaseProtectionStatus> => {
  const health = checkDatabaseHealth(libraryPathFor(userDataPath));
  if (existsSync(libraryPathFor(userDataPath)) && health.status !== 'ok') {
    throw new Error('曲库数据库当前不健康，已拒绝创建新的健康快照。');
  }

  checkpointProtectedLibrary(userDataPath);
  await createDataProtectionSnapshot('manual-library-database-snapshot', userDataPath);
  return getLibraryDatabaseProtectionStatus(userDataPath);
};

export const restoreProtectedLibraryDatabaseSnapshot = (
  snapshotId: string,
  userDataPath = app.getPath('userData'),
): LibraryDatabaseRestoreResult => {
  const snapshot = getSnapshotById(userDataPath, snapshotId);
  if (!snapshot) {
    throw new Error('找不到这个曲库数据库快照，已拒绝恢复。');
  }
  if (snapshot.libraryHealth.status !== 'ok' || !snapshot.databasePath || !snapshot.copied.includes(libraryFileName)) {
    throw new Error('这个快照不是可恢复的健康曲库数据库快照。');
  }

  mkdirSync(userDataPath, { recursive: true });
  const replacedDatabaseFiles = [libraryFileName, libraryWalFileName, libraryShmFileName].filter((name) =>
    existsSync(join(userDataPath, name)),
  );
  const archivePath = archiveLibraryTriplet(userDataPath, 'manual-library-database-restore');
  removeLibraryTriplet(userDataPath);
  const restoredDatabaseFiles = copyLibraryTriplet(snapshot.path, userDataPath);
  const health = checkDatabaseHealth(libraryPathFor(userDataPath));

  recordLibraryDatabaseMaintenanceEvent(
    {
      action: 'manual-restore',
      databasePath: libraryPathFor(userDataPath),
      archivePath,
      removedDatabaseFiles: replacedDatabaseFiles,
      restoredSnapshotId: snapshot.id,
      health,
    },
    userDataPath,
  );

  if (!restoredDatabaseFiles.includes(libraryFileName)) {
    throw new Error('快照复制失败，曲库数据库文件没有恢复。');
  }
  if (health.status !== 'ok') {
    throw new Error(`快照已复制，但恢复后的曲库数据库仍未通过检查：${health.message ?? health.status}`);
  }

  return {
    databasePath: libraryPathFor(userDataPath),
    archivePath,
    restoredSnapshot: snapshot,
    restoredDatabaseFiles,
    health,
  };
};

const directoryEntryCount = (path: string): number => {
  try {
    return statSync(path).isDirectory() ? readdirSync(path).length : 0;
  } catch {
    return 0;
  }
};

const scoreUserDataPath = (userDataPath: string): UserDataScore => {
  const librarySize = fileSize(join(userDataPath, 'echo-library.sqlite'));
  const hasSettings = existsSync(join(userDataPath, 'echo-settings.json'));
  let protectedFiles = 0;
  let score = Math.min(50, Math.floor(librarySize / (512 * 1024)));

  for (const entry of protectedDataEntries) {
    const entryPath = join(userDataPath, entry.name);
    if (!existsSync(entryPath)) {
      continue;
    }

    protectedFiles += 1;
    score += entry.kind === 'directory' ? Math.min(4, directoryEntryCount(entryPath)) : 4;
  }

  if (librarySize > 0 && librarySize < 1024 * 1024) {
    score += 3;
  }

  return { path: userDataPath, score, protectedFiles, librarySize, hasSettings };
};

const shouldMigrateLegacyUserData = (source: UserDataScore, target: UserDataScore): boolean => {
  if (source.protectedFiles === 0 || (!source.hasSettings && source.librarySize === 0)) {
    return false;
  }

  const targetLooksFresh =
    target.protectedFiles === 0 ||
    (target.librarySize > 0 && target.librarySize < 1024 * 1024 && target.score <= 16) ||
    (target.hasSettings && target.librarySize === 0 && target.score <= 8);

  if (targetLooksFresh && source.score > target.score) {
    return true;
  }

  const sourceHasMuchLargerLibrary = source.librarySize > 0 && (target.librarySize === 0 || source.librarySize > Math.max(1024 * 1024, target.librarySize * 2));
  return sourceHasMuchLargerLibrary && source.score >= target.score;
};

const findBestLegacyUserDataPath = (targetUserDataPath: string, legacyUserDataPaths = getLegacyUserDataPaths()): string | null => {
  const target = scoreUserDataPath(targetUserDataPath);
  const candidates = legacyUserDataPaths
    .filter((candidate) => existsSync(candidate))
    .map((candidate) => scoreUserDataPath(candidate))
    .filter((candidate) => candidate.protectedFiles > 0)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0] ?? null;
  if (!best || !shouldMigrateLegacyUserData(best, target)) {
    return null;
  }

  return best.path;
};

export const migrateLegacyProtectedData = async (
  targetUserDataPath = app.getPath('userData'),
  legacyUserDataPaths = getLegacyUserDataPaths(),
): Promise<LegacyMigrationResult> => {
  const sourcePath = findBestLegacyUserDataPath(targetUserDataPath, legacyUserDataPaths);
  const migrated: string[] = [];
  const skipped: string[] = [];

  if (!sourcePath) {
    return { sourcePath: null, migrated, skipped: protectedDataEntries.map((entry) => entry.name) };
  }

  await createDataProtectionSnapshot('startup', targetUserDataPath);

  for (const entry of protectedDataEntries) {
    const sourceEntryPath = join(sourcePath, entry.name);
    if (!existsSync(sourceEntryPath)) {
      skipped.push(entry.name);
      continue;
    }

    try {
      copyProtectedEntry(sourceEntryPath, join(targetUserDataPath, entry.name), entry.kind);
      migrated.push(entry.name);
    } catch {
      skipped.push(entry.name);
    }
  }

  return { sourcePath, migrated, skipped };
};

export const createDataProtectionSnapshot = async (
  reason: DataProtectionReason,
  userDataPath = app.getPath('userData'),
  date = new Date(),
): Promise<SnapshotResult> => {
  const snapshotsPath = getSnapshotsPath(userDataPath);
  const snapshotPath = join(snapshotsPath, `${timestampForPath(date)}-${reason}`);
  const copied: string[] = [];
  const skipped: string[] = [];
  let libraryBackupMethod: SnapshotResult['libraryBackupMethod'] = 'none';
  let libraryHealth = checkDatabaseHealth(libraryPathFor(userDataPath));

  mkdirSync(snapshotPath, { recursive: true });

  if (existsSync(libraryPathFor(userDataPath))) {
    const snapshotLibraryPath = libraryPathFor(snapshotPath);
    if (libraryHealth.status === 'ok') {
      try {
        await sqliteBackup(libraryPathFor(userDataPath), snapshotLibraryPath);
        const snapshotHealth = checkDatabaseHealth(snapshotLibraryPath);
        if (snapshotHealth.status === 'ok') {
          copied.push(libraryFileName);
          skipped.push(libraryWalFileName, libraryShmFileName);
          libraryBackupMethod = 'sqlite-backup';
          libraryHealth = snapshotHealth;
        } else {
          rmSync(snapshotLibraryPath, { force: true, maxRetries: 3, retryDelay: 50 });
          libraryHealth = snapshotHealth;
        }
      } catch {
        rmSync(snapshotLibraryPath, { force: true, maxRetries: 3, retryDelay: 50 });
      }

      if (libraryBackupMethod !== 'sqlite-backup') {
        const copiedLibraryEntries = copyLibraryTriplet(userDataPath, snapshotPath);
        copied.push(...copiedLibraryEntries);
        for (const name of [libraryFileName, libraryWalFileName, libraryShmFileName]) {
          if (!copiedLibraryEntries.includes(name)) {
            skipped.push(name);
          }
        }
        libraryBackupMethod = copiedLibraryEntries.length > 0 ? 'file-copy' : 'none';
        libraryHealth = checkDatabaseHealth(libraryPathFor(snapshotPath));
      }
    } else {
      skipped.push(libraryFileName, libraryWalFileName, libraryShmFileName);
    }
  } else {
    skipped.push(libraryFileName, libraryWalFileName, libraryShmFileName);
  }

  for (const entry of protectedDataEntries) {
    if (libraryEntryNames.has(entry.name)) {
      continue;
    }

    const sourcePath = join(userDataPath, entry.name);
    if (!existsSync(sourcePath)) {
      skipped.push(entry.name);
      continue;
    }

    try {
      copyProtectedEntry(sourcePath, join(snapshotPath, entry.name), entry.kind);
      copied.push(entry.name);
    } catch {
      skipped.push(entry.name);
    }
  }

  writeFileSync(
    join(snapshotPath, 'snapshot.json'),
    `${JSON.stringify(
      {
        formatVersion: 1,
        reason,
        createdAt: date.toISOString(),
        copied,
        skipped,
        libraryHealth,
        libraryBackupMethod,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  pruneOldSnapshots(userDataPath);

  return { snapshotPath, copied, skipped, libraryHealth, libraryBackupMethod };
};

export const createScanGuardLibraryDatabaseSnapshot = async (
  scanStatus: LibraryScanStatus,
  userDataPath = app.getPath('userData'),
  date = new Date(),
): Promise<LibraryDatabaseScanGuardSnapshot | null> => {
  const databasePath = libraryPathFor(userDataPath);
  if (!existsSync(databasePath)) {
    return null;
  }

  const currentHealth = checkDatabaseHealth(databasePath);
  if (currentHealth.status !== 'ok') {
    return null;
  }

  const id = `${timestampForPath(date)}-scan-${scanStatus.id}`;
  const snapshotPath = join(getScanGuardsPath(userDataPath), id);
  const snapshotDatabasePath = libraryPathFor(snapshotPath);
  mkdirSync(snapshotPath, { recursive: true });
  await sqliteBackup(databasePath, snapshotDatabasePath);

  const snapshotHealth = checkDatabaseHealth(snapshotDatabasePath);
  if (snapshotHealth.status !== 'ok') {
    rmSync(snapshotPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    throw new Error(`Scan guard snapshot failed health check: ${snapshotHealth.message ?? snapshotHealth.status}`);
  }

  const snapshot: LibraryDatabaseScanGuardSnapshot = {
    id,
    path: snapshotPath,
    databasePath: snapshotDatabasePath,
    createdAt: date.toISOString(),
    scanJobId: scanStatus.id,
    folderId: scanStatus.folderId,
    libraryHealth: snapshotHealth,
  };

  writeFileSync(
    join(snapshotPath, 'scan-guard.json'),
    `${JSON.stringify({ formatVersion: 1, ...snapshot }, null, 2)}\n`,
    'utf8',
  );
  pruneOldScanGuards(userDataPath);

  return snapshot;
};

export const restoreProtectedLibraryDatabaseFromScanGuard = (
  snapshot: LibraryDatabaseScanGuardSnapshot,
  scanStatus: LibraryScanStatus,
  cause: unknown,
  userDataPath = app.getPath('userData'),
): LibraryDatabaseScanGuardRestoreResult => {
  if (snapshot.libraryHealth.status !== 'ok' || !existsSync(snapshot.databasePath)) {
    throw new Error('Scan guard snapshot is not healthy enough to restore.');
  }

  mkdirSync(userDataPath, { recursive: true });
  const replacedDatabaseFiles = [libraryFileName, libraryWalFileName, libraryShmFileName].filter((name) =>
    existsSync(join(userDataPath, name)),
  );
  const archivePath = archiveLibraryTriplet(userDataPath, 'scan-corrupt-library');
  removeLibraryTriplet(userDataPath);
  const restoredDatabaseFiles = copyLibraryTriplet(snapshot.path, userDataPath);
  const health = checkDatabaseHealth(libraryPathFor(userDataPath));
  const error = cause instanceof Error ? cause.message : String(cause);

  recordLibraryDatabaseMaintenanceEvent(
    {
      action: 'scan-auto-restore',
      databasePath: libraryPathFor(userDataPath),
      archivePath,
      removedDatabaseFiles: replacedDatabaseFiles,
      restoredSnapshotId: snapshot.id,
      health,
      scan: maintenanceScanInfo(scanStatus),
      error,
    },
    userDataPath,
  );

  const recovery: LibraryRecoveryResult = {
    action: 'autoRestoredFromScanGuard',
    sourceSnapshotPath: snapshot.path,
    scanGuardSnapshotId: snapshot.id,
    archivePath: archivePath ?? undefined,
    health,
  };
  if (lastDataProtectionResult?.userDataPath === userDataPath) {
    lastDataProtectionResult = {
      ...lastDataProtectionResult,
      snapshot: skippedSnapshot(health),
      libraryHealth: health,
      recovery,
    };
  }

  if (!restoredDatabaseFiles.includes(libraryFileName)) {
    throw new Error('Scan guard snapshot restore failed: database file was not restored.');
  }
  if (health.status !== 'ok') {
    throw new Error(`Scan guard snapshot restore did not pass health check: ${health.message ?? health.status}`);
  }

  return {
    databasePath: libraryPathFor(userDataPath),
    archivePath,
    restoredSnapshotId: snapshot.id,
    restoredDatabaseFiles,
    health,
  };
};

export const restoreMissingProtectedData = (userDataPath = app.getPath('userData')): RestoreResult => {
  const restored: string[] = [];
  const skipped: string[] = [];
  const snapshotPaths = listSnapshotPaths(userDataPath);
  const healthyLibrarySnapshotPath = snapshotPaths
    .map(getSnapshotInfo)
    .find((snapshot) => snapshot.libraryHealth.status === 'ok' && snapshot.databasePath && snapshot.copied.includes(libraryFileName))
    ?.path ?? null;

  for (const entry of protectedDataEntries) {
    const targetPath = join(userDataPath, entry.name);
    if (existsSync(targetPath)) {
      skipped.push(entry.name);
      continue;
    }

    const snapshotPath = libraryEntryNames.has(entry.name)
      ? healthyLibrarySnapshotPath
      : snapshotPaths.find((candidate) => existsSync(join(candidate, entry.name)));
    if (!snapshotPath) {
      skipped.push(entry.name);
      continue;
    }

    try {
      copyProtectedEntry(join(snapshotPath, entry.name), targetPath, entry.kind);
      restored.push(entry.name);
    } catch {
      skipped.push(entry.name);
    }
  }

  return { restored, skipped };
};

export const writeDataProtectionManifest = (userDataPath = app.getPath('userData')): void => {
  const protectionPath = getDataProtectionPath(userDataPath);
  const existing = safeReadJson<{ firstProtectedAt?: string }>(join(protectionPath, manifestFileName));
  const now = new Date().toISOString();

  mkdirSync(protectionPath, { recursive: true });
  writeFileSync(
    join(protectionPath, manifestFileName),
    `${JSON.stringify(
      {
        formatVersion: 1,
        appName: typeof app.getName === 'function' ? app.getName() : 'ECHO NEXT',
        appVersion: typeof app.getVersion === 'function' ? app.getVersion() : null,
        protectedUserDataPath: userDataPath,
        protectedEntries: protectedDataEntries.map((entry) => ({ ...entry, path: join(userDataPath, entry.name) })),
        firstProtectedAt: existing?.firstProtectedAt ?? now,
        lastVerifiedAt: now,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
};

const protectCorruptLibraryDatabase = (userDataPath: string, currentHealth: DatabaseHealthResult): LibraryRecoveryResult => {
  if (currentHealth.status === 'ok') {
    return { action: 'none', health: currentHealth };
  }

  if (currentHealth.status !== 'corrupt') {
    return { action: 'none', health: currentHealth };
  }

  const archivePath = archiveLibraryTriplet(userDataPath, 'startup-corrupt-library') ?? undefined;
  try {
    recordLibraryDatabaseMaintenanceEvent(
      {
        action: 'startup-protected',
        databasePath: libraryPathFor(userDataPath),
        archivePath,
        removedDatabaseFiles: [],
        health: currentHealth,
      },
      userDataPath,
    );
    return { action: archivePath ? 'archivedOnly' : 'protected', archivePath, health: currentHealth };
  } catch (error) {
    return {
      action: 'failed',
      archivePath,
      health: {
        status: 'unreadable',
        databasePath: libraryPathFor(userDataPath),
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
};

let lastDataProtectionResult: DataProtectionResult | null = null;

export const getLastDataProtectionResult = (): DataProtectionResult | null => lastDataProtectionResult;

export const isProtectedLibraryAvailable = (): boolean =>
  !lastDataProtectionResult ||
  (lastDataProtectionResult.libraryHealth.status !== 'corrupt' && lastDataProtectionResult.recovery.action !== 'failed');

export const assertProtectedLibraryAvailable = (): void => {
  if (!isProtectedLibraryAvailable()) {
    throw new LibraryDatabaseUnavailableError(lastDataProtectionResult?.recovery ?? null);
  }
};

export const ensureDataProtection = async (
  reason: DataProtectionReason = 'startup',
  explicitUserDataPath?: string,
): Promise<DataProtectionResult> => {
  const userDataPath = explicitUserDataPath ?? initializeProtectedUserDataPath();
  try {
    const migration = await migrateLegacyProtectedData(userDataPath);
    const restore = restoreMissingProtectedData(userDataPath);
    writeDataProtectionManifest(userDataPath);
    const initialHealth = checkDatabaseHealth(libraryPathFor(userDataPath));
    const recovery = protectCorruptLibraryDatabase(userDataPath, initialHealth);
    const libraryHealth = recovery.health.status === 'corrupt' ? recovery.health : checkDatabaseHealth(libraryPathFor(userDataPath));
    const snapshot = libraryHealth.status === 'ok'
      ? await createDataProtectionSnapshot(reason, userDataPath)
      : skippedSnapshot(libraryHealth);

    if (migration.migrated.length > 0) {
      console.info(`[data-protection] migrated protected data from ${migration.sourcePath}: ${migration.migrated.map((entry) => basename(entry)).join(', ')}`);
    }

    if (restore.restored.length > 0) {
      console.info(`[data-protection] restored protected data: ${restore.restored.map((entry) => basename(entry)).join(', ')}`);
    }

    if (recovery.action === 'protected' || recovery.action === 'archivedOnly') {
      console.warn('[data-protection] corrupt library database was archived and left in place; app is starting in protected mode');
    } else if (recovery.action === 'failed') {
      console.warn(`[data-protection] library database recovery failed: ${recovery.health.message ?? recovery.health.status}`);
    }

    lastDataProtectionResult = { userDataPath, migration, snapshot, restore, libraryHealth, recovery };
    return lastDataProtectionResult;
  } catch (error) {
    const health: DatabaseHealthResult = {
      status: 'unreadable',
      databasePath: libraryPathFor(userDataPath),
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
    const recovery: LibraryRecoveryResult = { action: 'failed', health };
    lastDataProtectionResult = {
      userDataPath,
      migration: { sourcePath: null, migrated: [], skipped: protectedDataEntries.map((entry) => entry.name) },
      restore: { restored: [], skipped: protectedDataEntries.map((entry) => entry.name) },
      snapshot: skippedSnapshot(health),
      libraryHealth: health,
      recovery,
    };
    console.warn(`[data-protection] startup protection failed: ${health.message ?? health.status}`);
    return lastDataProtectionResult;
  }
};

export const checkpointProtectedLibrary = (userDataPath = app.getPath('userData')): DatabaseHealthResult =>
  checkpointWal(libraryPathFor(userDataPath));
