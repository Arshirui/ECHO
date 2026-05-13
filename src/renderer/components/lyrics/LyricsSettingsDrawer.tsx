import { useCallback, useEffect, useMemo, useState } from 'react';
import { Captions, Database, Globe2, RefreshCw, RotateCcw, SlidersHorizontal, TimerReset, X } from 'lucide-react';
import type { AppSettings } from '../../../shared/types/appSettings';

type LyricsSettingsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

const drawerExitAnimationMs = 320;

const fallbackSettings: Pick<
  AppSettings,
  'lyricsNetworkEnabled' | 'lyricsAutoSearch' | 'lyricsAutoAcceptScore' | 'lyricsDefaultOffsetMs' | 'lyricsPreferredProvider'
> = {
  lyricsNetworkEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.82,
  lyricsDefaultOffsetMs: 0,
  lyricsPreferredProvider: 'lrclib',
};

export const LyricsSettingsDrawer = ({ isOpen, onClose }: LyricsSettingsDrawerProps): JSX.Element | null => {
  const [settings, setSettings] = useState<Pick<
    AppSettings,
    'lyricsNetworkEnabled' | 'lyricsAutoSearch' | 'lyricsAutoAcceptScore' | 'lyricsDefaultOffsetMs' | 'lyricsPreferredProvider'
  > | null>(null);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isMotionOpen, setIsMotionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const effectiveSettings = settings ?? fallbackSettings;
  const thresholdPercent = Math.round(effectiveSettings.lyricsAutoAcceptScore * 100);
  const offsetSeconds = useMemo(() => (effectiveSettings.lyricsDefaultOffsetMs / 1000).toFixed(1), [effectiveSettings.lyricsDefaultOffsetMs]);

  const loadSettings = useCallback(async (): Promise<void> => {
    const app = window.echo?.app;
    if (!app) {
      setError('Desktop bridge unavailable');
      setSettings(fallbackSettings);
      return;
    }

    try {
      setError(null);
      const nextSettings = await app.getSettings();
      setSettings({
        lyricsNetworkEnabled: nextSettings.lyricsNetworkEnabled,
        lyricsAutoSearch: nextSettings.lyricsAutoSearch,
        lyricsAutoAcceptScore: nextSettings.lyricsAutoAcceptScore,
        lyricsDefaultOffsetMs: nextSettings.lyricsDefaultOffsetMs,
        lyricsPreferredProvider: nextSettings.lyricsPreferredProvider,
      });
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
    }
  }, []);

  const patchSettings = useCallback(async (patch: Partial<AppSettings>): Promise<void> => {
    const app = window.echo?.app;
    if (!app) {
      setError('Desktop bridge unavailable');
      return;
    }

    setIsBusy(true);
    try {
      const nextSettings = await app.setSettings(patch);
      setSettings({
        lyricsNetworkEnabled: nextSettings.lyricsNetworkEnabled,
        lyricsAutoSearch: nextSettings.lyricsAutoSearch,
        lyricsAutoAcceptScore: nextSettings.lyricsAutoAcceptScore,
        lyricsDefaultOffsetMs: nextSettings.lyricsDefaultOffsetMs,
        lyricsPreferredProvider: nextSettings.lyricsPreferredProvider,
      });
      setError(null);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setIsMotionOpen(true));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      };
    }

    setIsMotionOpen(false);
    if (!shouldRender) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShouldRender(false), drawerExitAnimationMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (isOpen) {
      void loadSettings();
    }
  }, [isOpen, loadSettings]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="audio-drawer-root lyrics-settings-drawer-root no-drag" role="presentation" data-open={isMotionOpen}>
      <button className="audio-drawer-scrim" type="button" aria-label="关闭歌词设置" onClick={onClose} />
      <aside className="audio-drawer lyrics-settings-drawer" aria-label="歌词设置">
        <header className="audio-drawer-header">
          <div>
            <SlidersHorizontal size={18} />
            <h2>歌词设置</h2>
          </div>
          <button className="audio-drawer-close" type="button" aria-label="关闭歌词设置" title="关闭歌词设置" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <button className="audio-engine-meter lyrics-engine-meter" type="button" disabled={isBusy} onClick={() => void loadSettings()}>
          <div className="audio-engine-meter__top">
            <span className="audio-engine-meter__icon">
              <Captions size={17} />
            </span>
            <div>
              <span>Lyrics Engine</span>
              <strong>Local first / LRCLIB fallback</strong>
            </div>
            <RefreshCw size={15} />
          </div>
          <div className="audio-engine-meter__grid">
            <span>
              <em>Provider</em>
              <strong>{effectiveSettings.lyricsPreferredProvider.toUpperCase()}</strong>
            </span>
            <span>
              <em>Auto match</em>
              <strong>{effectiveSettings.lyricsAutoSearch ? 'On' : 'Off'}</strong>
            </span>
            <span>
              <em>Threshold</em>
              <strong>{thresholdPercent}%</strong>
            </span>
          </div>
          <div className="audio-engine-meter__badges">
            <em data-tone={effectiveSettings.lyricsNetworkEnabled ? 'ready' : 'neutral'}>
              {effectiveSettings.lyricsNetworkEnabled ? 'LRCLIB enabled' : 'Local only'}
            </em>
          </div>
        </button>

        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <Globe2 size={17} />
            <h3>在线匹配</h3>
          </div>

          <label className="audio-toggle-row">
            <span>
              <Globe2 size={17} />
              <strong>启用 LRCLIB 在线歌词匹配</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsNetworkEnabled}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsNetworkEnabled: event.currentTarget.checked })}
            />
          </label>
          <p>仅发送标题、艺术家、专辑和时长用于匹配。</p>

          <label className="audio-toggle-row">
            <span>
              <Database size={17} />
              <strong>自动匹配歌词</strong>
            </span>
            <input
              type="checkbox"
              checked={effectiveSettings.lyricsAutoSearch}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsAutoSearch: event.currentTarget.checked })}
            />
          </label>
          <p>本地歌词始终优先；在线结果达到阈值才会自动应用。</p>
        </section>

        <section className="audio-drawer-section audio-drawer-options audio-drawer-options--open">
          <div className="audio-drawer-section-title">
            <TimerReset size={17} />
            <h3>匹配与时间轴</h3>
          </div>

          <label className="lyrics-drawer-range">
            <span>
              <strong>自动接受阈值</strong>
              <em>{thresholdPercent}%</em>
            </span>
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={thresholdPercent}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsAutoAcceptScore: Number(event.currentTarget.value) / 100 })}
            />
          </label>

          <label className="lyrics-drawer-range">
            <span>
              <strong>默认歌词偏移</strong>
              <em>{offsetSeconds}s</em>
            </span>
            <input
              type="range"
              min={-10000}
              max={10000}
              step={500}
              value={effectiveSettings.lyricsDefaultOffsetMs}
              disabled={isBusy}
              onChange={(event) => void patchSettings({ lyricsDefaultOffsetMs: Number(event.currentTarget.value) })}
            />
          </label>

          <button
            className="audio-device-pill"
            type="button"
            disabled={isBusy}
            onClick={() => void patchSettings({ lyricsAutoAcceptScore: 0.82, lyricsDefaultOffsetMs: 0 })}
          >
            <RotateCcw size={15} />
            <span>
              <strong>恢复歌词默认值</strong>
              <small>阈值 82% / 偏移 0ms</small>
            </span>
            <em>Reset</em>
          </button>
        </section>

        {error ? <p className="audio-drawer-error">{error}</p> : null}
      </aside>
    </div>
  );
};
