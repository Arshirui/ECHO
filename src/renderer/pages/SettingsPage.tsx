import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check,
  Download,
  Globe2,
  Headphones,
  Info,
  Link2,
  MessageSquare,
  Palette,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AudioDeviceInfo, AudioOutputMode, AudioOutputSettings, AudioStatus } from '../../shared/types/audio';
import { EqPanel } from '../components/audio/EqPanel';
import { LibraryDiagnosticsPanel } from '../components/library/LibraryDiagnosticsPanel';
import { LibraryFoldersPanel } from '../components/library/LibraryFoldersPanel';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import {
  defaultAppearancePreferences,
  readAppearancePreferences,
  updateAppearancePreferences,
  type AppearancePreferences,
} from '../preferences/appearancePreferences';

const isDevBuild = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

type SettingsNavKey = 'general' | 'playback' | 'integrations' | 'remote' | 'eq' | 'appearance' | 'library' | 'about' | 'danger';

type SettingsNavItem = {
  key: SettingsNavKey;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
};

type FontPickerTarget = 'main' | 'chinese';

type LocalFontData = {
  family: string;
};

type NavigatorWithLocalFonts = Navigator & {
  queryLocalFonts?: () => Promise<LocalFontData[]>;
};

const fallbackFontFamilies = [
  'Outfit',
  'Inter',
  'Segoe UI',
  'Arial',
  'Helvetica Neue',
  'Microsoft YaHei',
  'Microsoft JhengHei',
  'PingFang SC',
  'PingFang TC',
  'Noto Sans SC',
  'Noto Sans TC',
  'Source Han Sans SC',
  'Source Han Sans TC',
  'SimHei',
  'SimSun',
  'Hiragino Sans',
  'Yu Gothic',
  'Meiryo',
];

type SettingSectionProps = {
  id: SettingsNavKey;
  activeKey: SettingsNavKey;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
};

type SettingRowProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

const settingsNavItems: SettingsNavItem[] = [
  { key: 'general', labelKey: 'settings.nav.general.label', descriptionKey: 'settings.nav.general.description', icon: MessageSquare },
  { key: 'playback', labelKey: 'settings.nav.playback.label', descriptionKey: 'settings.nav.playback.description', icon: Zap },
  { key: 'integrations', labelKey: 'settings.nav.integrations.label', descriptionKey: 'settings.nav.integrations.description', icon: Link2 },
  { key: 'remote', labelKey: 'settings.nav.remote.label', descriptionKey: 'settings.nav.remote.description', icon: Globe2 },
  { key: 'eq', labelKey: 'settings.nav.eq.label', descriptionKey: 'settings.nav.eq.description', icon: SlidersHorizontal },
  { key: 'appearance', labelKey: 'settings.nav.appearance.label', descriptionKey: 'settings.nav.appearance.description', icon: Palette },
  { key: 'library', labelKey: 'settings.nav.library.label', descriptionKey: 'settings.nav.library.description', icon: Download },
  { key: 'about', labelKey: 'settings.nav.about.label', descriptionKey: 'settings.nav.about.description', icon: Info },
  { key: 'danger', labelKey: 'settings.nav.danger.label', descriptionKey: 'settings.nav.danger.description', icon: Trash2 },
];

const formatRate = (value: number | null): string => {
  if (!value) {
    return 'n/a';
  }

  return `${value} Hz`;
};

const statusRows = (
  status: AudioStatus | null,
  formatBool: (value: boolean) => string,
): Array<{ label: string; value: string }> => [
  { label: 'state', value: status?.state ?? 'loading' },
  { label: 'fileSampleRate', value: formatRate(status?.fileSampleRate ?? null) },
  { label: 'decoderOutputSampleRate', value: formatRate(status?.decoderOutputSampleRate ?? null) },
  { label: 'requestedOutputSampleRate', value: formatRate(status?.requestedOutputSampleRate ?? null) },
  { label: 'actualDeviceSampleRate', value: formatRate(status?.actualDeviceSampleRate ?? null) },
  { label: 'sharedDeviceSampleRate', value: formatRate(status?.sharedDeviceSampleRate ?? null) },
  { label: 'outputMode', value: status?.outputMode ?? 'shared' },
  { label: 'outputBackend', value: status?.outputBackend ?? 'n/a' },
  { label: 'outputDeviceType', value: status?.outputDeviceType ?? 'n/a' },
  { label: 'outputDeviceName', value: status?.outputDeviceName ?? 'n/a' },
  { label: 'resampling', value: formatBool(status?.resampling ?? false) },
  { label: 'bitPerfectCandidate', value: formatBool(status?.bitPerfectCandidate ?? false) },
  { label: 'dspActive', value: formatBool(status?.dspActive ?? false) },
  { label: 'eqEnabled', value: formatBool(status?.eqEnabled ?? false) },
  { label: 'preampDb', value: `${status?.preampDb ?? 0} dB` },
  { label: 'bitPerfectDisabledReason', value: status?.bitPerfectDisabledReason ?? 'n/a' },
  { label: 'sampleRateMismatch', value: formatBool(status?.sampleRateMismatch ?? false) },
];

const SettingSection = ({ id, activeKey, icon: Icon, title, children }: SettingSectionProps): JSX.Element => (
  <section className="settings-section" id={`settings-sec-${id}`} data-visible={activeKey === id}>
    <div className="section-title">
      <Icon size={18} />
      <h2>{title}</h2>
    </div>
    {children}
  </section>
);

const SettingRow = ({ title, description, children }: SettingRowProps): JSX.Element => (
  <div className="setting-row">
    <div className="setting-info">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
    {children}
  </div>
);

const ChipButton = ({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: string;
  onClick?: () => void;
}): JSX.Element => (
  <button className={`list-filter-chip ${active ? 'active' : ''}`} type="button" aria-pressed={active} onClick={onClick}>
    {children}
    {active ? <Check size={13} /> : null}
  </button>
);

const ToggleButton = ({ active }: { active?: boolean }): JSX.Element => (
  <button className={`toggle-btn ${active ? 'active' : ''}`} type="button" aria-pressed={active}>
    <span />
  </button>
);

const NumberRangeField = ({
  max,
  min,
  onChange,
  step,
  suffix,
  value,
}: {
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix: string;
  value: number;
}): JSX.Element => (
  <label className="settings-range-field">
    <input min={min} max={max} step={step} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <span>
      {value}
      {suffix}
    </span>
  </label>
);

const FontPickerModal = ({
  currentFont,
  fonts,
  onClose,
  onSelect,
  query,
  setQuery,
  title,
}: {
  currentFont: string;
  fonts: string[];
  onClose: () => void;
  onSelect: (fontFamily: string) => void;
  query: string;
  setQuery: (query: string) => void;
  title: string;
}): JSX.Element => {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFonts = normalizedQuery ? fonts.filter((font) => font.toLowerCase().includes(normalizedQuery)) : fonts;

  return (
    <div className="settings-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-font-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-font-modal-header">
          <h3>{title}</h3>
          <button className="settings-icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </header>
        <label className="settings-font-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
        </label>
        <div className="settings-font-list">
          {filteredFonts.map((font) => (
            <button
              className={`settings-font-option ${font === currentFont ? 'active' : ''}`}
              key={font}
              type="button"
              style={{ fontFamily: `"${font}", var(--echo-font-family)` }}
              onClick={() => onSelect(font)}
            >
              <span>{font}</span>
              <em>Echo font preview Aa 你好</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export const SettingsPage = (): JSX.Element => {
  const { locale, localeOptions, setLocale, t } = useI18n();
  const [activeSection, setActiveSection] = useState<SettingsNavKey>('general');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [outputMode, setOutputMode] = useState<AudioOutputMode>('shared');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [appearancePreferences, setAppearancePreferences] = useState<AppearancePreferences>(() => readAppearancePreferences());
  const [fontFamilies, setFontFamilies] = useState<string[]>(fallbackFontFamilies);
  const [fontPickerTarget, setFontPickerTarget] = useState<FontPickerTarget | null>(null);
  const [fontPickerQuery, setFontPickerQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const visibleNavItems = useMemo(() => {
    const query = settingsQuery.trim().toLowerCase();

    if (!query) {
      return settingsNavItems;
    }

    return settingsNavItems.filter((item) => `${t(item.labelKey)} ${t(item.descriptionKey)}`.toLowerCase().includes(query));
  }, [settingsQuery, t]);

  const compatibleDevices = useMemo(
    () => devices.filter((device) => (outputMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared')),
    [devices, outputMode],
  );

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await window.echo.audio.getStatus());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const nextDevices = await window.echo.audio.listDevices();
      setDevices(nextDevices);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshDevices();
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [refreshDevices, refreshStatus]);

  useEffect(() => {
    setOutputMode(status?.outputMode ?? 'shared');
  }, [status?.outputMode]);

  useEffect(() => {
    if (status?.outputDeviceId && devices.some((device) => device.id === status.outputDeviceId)) {
      setSelectedDeviceId(status.outputDeviceId);
    }
  }, [devices, status?.outputDeviceId]);

  useEffect(() => {
    if (compatibleDevices.length === 0) {
      setSelectedDeviceId('');
      return;
    }

    if (!compatibleDevices.some((device) => device.id === selectedDeviceId)) {
      setSelectedDeviceId(compatibleDevices.find((device) => device.isDefault)?.id ?? compatibleDevices[0].id);
    }
  }, [compatibleDevices, selectedDeviceId]);

  useEffect(() => {
    const queryLocalFonts = (navigator as NavigatorWithLocalFonts).queryLocalFonts;

    if (!queryLocalFonts) {
      return;
    }

    void queryLocalFonts()
      .then((fonts) => {
        const families = Array.from(new Set([...fallbackFontFamilies, ...fonts.map((font) => font.family).filter(Boolean)])).sort((a, b) =>
          a.localeCompare(b),
        );
        setFontFamilies(families);
      })
      .catch(() => {
        setFontFamilies(fallbackFontFamilies);
      });
  }, []);

  const applyOutputSettings = useCallback(
    async (nextOutputMode = outputMode, nextDeviceId = selectedDeviceId) => {
      const nextDevice =
        devices.find((device) => device.id === nextDeviceId && (nextOutputMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared')) ?? null;
      const output: AudioOutputSettings = {
        outputMode: nextOutputMode,
      };

      if (nextDevice) {
        output.deviceIndex = nextDevice.index;
        output.deviceName = nextDevice.name;
      }

      setStatus(await window.echo.audio.setOutput(output));
    },
    [devices, outputMode, selectedDeviceId],
  );

  const handleNavClick = (key: SettingsNavKey): void => {
    setActiveSection(key);
    document.getElementById(`settings-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleOutputModeChange = (nextMode: AudioOutputMode): void => {
    setOutputMode(nextMode);
    const nextDevices = devices.filter((device) => (nextMode === 'asio' ? device.outputMode === 'asio' : device.outputMode === 'shared'));
    const nextDeviceId = nextDevices.find((device) => device.isDefault)?.id ?? nextDevices[0]?.id ?? '';
    setSelectedDeviceId(nextDeviceId);
    void applyOutputSettings(nextMode, nextDeviceId);
  };

  const handleDeviceChange = (nextDeviceId: string): void => {
    setSelectedDeviceId(nextDeviceId);
    void applyOutputSettings(outputMode, nextDeviceId);
  };

  const handleAppearanceChange = (nextPreferences: AppearancePreferences): void => {
    setAppearancePreferences(updateAppearancePreferences(nextPreferences));
  };

  const handleAppearanceReset = (): void => {
    handleAppearanceChange(defaultAppearancePreferences);
  };

  const handleFontPickerOpen = (target: FontPickerTarget): void => {
    setFontPickerTarget(target);
    setFontPickerQuery('');
  };

  const handleFontSelect = (fontFamily: string): void => {
    if (fontPickerTarget === 'main') {
      handleAppearanceChange({ ...appearancePreferences, mainFontFamily: fontFamily });
    }

    if (fontPickerTarget === 'chinese') {
      handleAppearanceChange({ ...appearancePreferences, chineseFontFamily: fontFamily });
    }

    setFontPickerTarget(null);
  };

  const activeNavItems = visibleNavItems.length ? visibleNavItems : settingsNavItems;
  const formatBool = (value: boolean): string => (value ? t('common.yes') : t('common.no'));
  const activeFontValue = fontPickerTarget === 'chinese' ? appearancePreferences.chineseFontFamily : appearancePreferences.mainFontFamily;

  return (
    <div className="settings-page no-drag">
      <header className="settings-header">
        <h1>{t('route.settings.label')}</h1>
        <label className="settings-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={settingsQuery}
            onChange={(event) => setSettingsQuery(event.target.value)}
            placeholder={t('settings.header.searchPlaceholder')}
          />
        </label>
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label={t('route.settings.label')}>
          {activeNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.key;
            const isDanger = item.key === 'danger';

            return (
              <button
                className={`settings-nav-item ${isActive ? 'active' : ''} ${isDanger ? 'is-danger' : ''}`}
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item.key)}
              >
                <Icon size={17} />
                <span className="settings-nav-copy">
                  <span className="settings-nav-label">{t(item.labelKey)}</span>
                  <span className="settings-nav-desc">{t(item.descriptionKey)}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="settings-scroll-shell">
          <div className="settings-content">
            <SettingSection activeKey={activeSection} icon={MessageSquare} id="general" title={t('settings.nav.general.label')}>
              <SettingRow title={t('settings.general.language.title')} description={t('settings.general.language.description')}>
                <div className="settings-chip-row">
                  {localeOptions.map((option) => (
                    <ChipButton active={locale === option.locale} key={option.locale} onClick={() => setLocale(option.locale)}>
                      {option.label}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <SettingRow title={t('settings.general.closeToTray')}>
                <ToggleButton />
              </SettingRow>
              <SettingRow title={t('settings.general.backup.title')} description={t('settings.general.backup.description')}>
                <div className="settings-chip-row">
                  <button className="settings-action-button" type="button">
                    <Download size={15} />
                    {t('settings.general.backup.export')}
                  </button>
                  <button className="settings-action-button" type="button">
                    {t('settings.general.backup.import')}
                  </button>
                </div>
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Zap} id="playback" title={t('settings.nav.playback.label')}>
              <SettingRow title={t('settings.playback.outputMode.title')} description={t('settings.playback.outputMode.description')}>
                <div className="settings-chip-row">
                  {(['shared', 'exclusive', 'asio'] as AudioOutputMode[]).map((mode) => (
                    <ChipButton active={outputMode === mode} key={mode} onClick={() => handleOutputModeChange(mode)}>
                      {mode}
                    </ChipButton>
                  ))}
                </div>
              </SettingRow>
              <SettingRow title={t('settings.playback.outputDevice.title')} description={t('settings.playback.outputDevice.description')}>
                <label className="settings-select-field">
                  <select value={selectedDeviceId} onChange={(event) => handleDeviceChange(event.target.value)} disabled={compatibleDevices.length === 0}>
                    {compatibleDevices.length === 0 ? (
                      <option value="">{t('settings.playback.outputDevice.empty')}</option>
                    ) : (
                      compatibleDevices.map((device) => (
                        <option value={device.id} key={device.id}>
                          {device.index} - {device.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </SettingRow>
              <SettingRow title={t('settings.playback.wireless.title')} description={t('settings.playback.wireless.description')}>
                <ToggleButton />
              </SettingRow>
              <SettingRow title={t('settings.playback.followCurrent.title')} description={t('settings.playback.followCurrent.description')}>
                <ToggleButton />
              </SettingRow>
              <SettingRow title={t('settings.playback.audioStatus.title')} description={t('settings.playback.audioStatus.description')}>
                <div className="settings-status-grid">
                  {statusRows(status, formatBool).map((row) => (
                    <span key={row.label}>
                      <em>{row.label}</em>
                      <strong>{row.value}</strong>
                    </span>
                  ))}
                </div>
              </SettingRow>
              {error ? <p className="settings-inline-error">{error}</p> : null}
              {status?.warnings.length ? (
                <p className="settings-inline-error">warnings: {status.warnings.join(', ')}</p>
              ) : null}
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Link2} id="integrations" title={t('settings.nav.integrations.label')}>
              <SettingRow title={t('settings.integrations.discord.title')} description={t('settings.integrations.discord.description')}>
                <ToggleButton />
              </SettingRow>
              <SettingRow title={t('settings.integrations.mobile.title')} description={t('settings.integrations.mobile.description')}>
                <ToggleButton />
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Globe2} id="remote" title={t('settings.nav.remote.label')}>
              <SettingRow title={t('settings.remote.library.title')} description={t('settings.remote.library.description')}>
                <ChipButton active>{t('common.disabled')}</ChipButton>
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={SlidersHorizontal} id="eq" title={t('settings.nav.eq.label')}>
              <EqPanel audioStatus={status} onAudioStatusRefresh={refreshStatus} />
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Palette} id="appearance" title={t('settings.nav.appearance.label')}>
              <SettingRow title={t('settings.appearance.theme.title')} description={t('settings.appearance.theme.description')}>
                <div className="settings-chip-row">
                  <ChipButton active>{t('settings.appearance.theme.light')}</ChipButton>
                  <ChipButton>{t('settings.appearance.theme.dark')}</ChipButton>
                  <ChipButton>{t('settings.appearance.theme.followSystem')}</ChipButton>
                </div>
              </SettingRow>
              <SettingRow title={t('settings.appearance.density.title')} description={t('settings.appearance.density.description')}>
                <div className="settings-chip-row">
                  <ChipButton active>{t('settings.appearance.density.compact')}</ChipButton>
                  <ChipButton>{t('settings.appearance.density.standard')}</ChipButton>
                </div>
              </SettingRow>
              <SettingRow title={t('settings.appearance.font.main.title')} description={t('settings.appearance.font.main.description')}>
                <button className="settings-font-picker-button" type="button" onClick={() => handleFontPickerOpen('main')}>
                  <span style={{ fontFamily: `"${appearancePreferences.mainFontFamily}", var(--echo-font-family)` }}>{appearancePreferences.mainFontFamily}</span>
                  <em>{t('settings.appearance.font.choose')}</em>
                </button>
              </SettingRow>
              <SettingRow title={t('settings.appearance.font.chinese.title')} description={t('settings.appearance.font.chinese.description')}>
                <button className="settings-font-picker-button" type="button" onClick={() => handleFontPickerOpen('chinese')}>
                  <span style={{ fontFamily: `"${appearancePreferences.chineseFontFamily}", var(--echo-font-family)` }}>
                    {appearancePreferences.chineseFontFamily}
                  </span>
                  <em>{t('settings.appearance.font.choose')}</em>
                </button>
              </SettingRow>
              <SettingRow title={t('settings.appearance.fontSize.title')} description={t('settings.appearance.fontSize.description')}>
                <NumberRangeField
                  min={12}
                  max={18}
                  step={1}
                  suffix="px"
                  value={appearancePreferences.baseFontSize}
                  onChange={(baseFontSize) => handleAppearanceChange({ ...appearancePreferences, baseFontSize })}
                />
              </SettingRow>
              <SettingRow title={t('settings.appearance.lineHeight.title')} description={t('settings.appearance.lineHeight.description')}>
                <NumberRangeField
                  min={1.1}
                  max={1.8}
                  step={0.05}
                  suffix=""
                  value={appearancePreferences.lineHeight}
                  onChange={(lineHeight) => handleAppearanceChange({ ...appearancePreferences, lineHeight })}
                />
              </SettingRow>
              <SettingRow title={t('settings.appearance.reset.title')} description={t('settings.appearance.reset.description')}>
                <button className="settings-action-button" type="button" onClick={handleAppearanceReset}>
                  {t('settings.appearance.reset.action')}
                </button>
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Download} id="library" title={t('settings.nav.library.label')}>
              <LibraryFoldersPanel />
              {isDevBuild ? <LibraryDiagnosticsPanel /> : null}
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Info} id="about" title={t('settings.nav.about.label')}>
              <SettingRow title={t('settings.about.devMode.title')} description={t('settings.about.devMode.description')}>
                <ChipButton active>{isDevBuild ? t('common.dev') : t('common.build')}</ChipButton>
              </SettingRow>
              <SettingRow title={t('settings.about.nativeSqlite.title')} description={t('settings.about.nativeSqlite.description')}>
                <ChipButton active>{t('common.ready')}</ChipButton>
              </SettingRow>
              <SettingRow title={t('settings.about.audioHost.title')} description={t('settings.about.audioHost.description')}>
                <ChipButton active>{status?.host ?? t('common.checking')}</ChipButton>
              </SettingRow>
            </SettingSection>

            <SettingSection activeKey={activeSection} icon={Trash2} id="danger" title={t('settings.nav.danger.label')}>
              <SettingRow title={t('settings.danger.clearCache.title')} description={t('settings.danger.clearCache.description')}>
                <button className="settings-danger-button" type="button" disabled>
                  {t('common.unavailable')}
                </button>
              </SettingRow>
            </SettingSection>

            <section className="settings-section settings-section--devices" data-visible={activeSection === 'playback'}>
              <div className="section-title">
                <Headphones size={18} />
                <h2>{t('settings.devices.title')}</h2>
              </div>
              {devices.length === 0 ? (
                <p className="settings-inline-note">{t('settings.devices.empty')}</p>
              ) : (
                <div className="audio-device-table">
                  <div className="audio-device-row audio-device-row--head">
                    <span>name</span>
                    <span>index</span>
                    <span>sampleRate</span>
                    <span>sharedDeviceSampleRate</span>
                    <span>outputMode</span>
                  </div>
                  {devices.map((device) => (
                    <div className="audio-device-row" key={device.id}>
                      <strong>{device.name}</strong>
                      <span>{device.index}</span>
                      <span>{formatRate(device.sampleRate)}</span>
                      <span>{formatRate(device.sharedDeviceSampleRate)}</span>
                      <span>{device.outputMode}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      {fontPickerTarget ? (
        <FontPickerModal
          currentFont={activeFontValue}
          fonts={fontFamilies}
          onClose={() => setFontPickerTarget(null)}
          onSelect={handleFontSelect}
          query={fontPickerQuery}
          setQuery={setFontPickerQuery}
          title={fontPickerTarget === 'chinese' ? t('settings.appearance.font.chinese.title') : t('settings.appearance.font.main.title')}
        />
      ) : null}
    </div>
  );
};
