import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/outfit/900.css';
import { App } from './app/App';
import { DesktopLyricsApp } from './desktop-lyrics/DesktopLyricsApp';
import { I18nProvider } from './i18n/I18nProvider';
import { MiniPlayerApp } from './mini-player/MiniPlayerApp';
import { startPerformanceStallMonitor } from './diagnostics/performanceStallMonitor';
import {
  applyAppearancePreferences,
  loadPersistedAppearancePreferences,
  readAppearancePreferences,
  registerAppearanceFontFile,
} from './preferences/appearancePreferences';
import { applyThemeMode, loadPersistedThemeMode, readThemeMode, watchSystemThemeMode, watchThemeSettings } from './preferences/themePreferences';
import type { AppearancePreferences, AppSettings } from '../shared/types/appSettings';
import { PlaybackQueueProvider } from './stores/PlaybackQueueProvider';
import { getAppBridge } from './utils/echoBridge';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/app.css';
import './styles/songs.css';
import './styles/folders.css';
import './styles/home.css';
import './styles/eq.css';
import './styles/album-detail.css';
import './styles/artist-detail.css';
import './styles/queue.css';
import './styles/lyrics.css';
import './styles/legacy-theme-bridge.css';
import './styles/ui-polish.css';
import './styles/theme-presets.css';
import './styles/desktop-lyrics.css';
import './styles/mini-player.css';

const appearancePreferences = readAppearancePreferences();
const themeMode = readThemeMode();
const appBridge = getAppBridge();
applyThemeMode(themeMode);
applyAppearancePreferences(appearancePreferences);

const loadAppearanceFontFiles = (preferences: AppearancePreferences): void => {
  if (preferences.mainFontFilePath && appBridge) {
    void appBridge.loadFontFile(preferences.mainFontFilePath).then((fontFile) => registerAppearanceFontFile('main', fontFile)).catch(() => undefined);
  }

  if (preferences.chineseFontFilePath && appBridge) {
    void appBridge
      .loadFontFile(preferences.chineseFontFilePath)
      .then((fontFile) => registerAppearanceFontFile('chinese', fontFile))
      .catch(() => undefined);
  }

  if (preferences.fallbackFontFilePath && appBridge) {
    void appBridge
      .loadFontFile(preferences.fallbackFontFilePath)
      .then((fontFile) => registerAppearanceFontFile('fallback', fontFile))
      .catch(() => undefined);
  }
};

const loadLyricsFontFiles = (settings: Partial<AppSettings>): void => {
  if (settings.lyricsFontFilePath && appBridge) {
    void appBridge
      .loadFontFile(settings.lyricsFontFilePath)
      .then((fontFile) => registerAppearanceFontFile('lyrics', fontFile))
      .catch(() => undefined);
  }

  if (settings.desktopLyricsFontFilePath && appBridge) {
    void appBridge
      .loadFontFile(settings.desktopLyricsFontFilePath)
      .then((fontFile) => registerAppearanceFontFile('desktopLyrics', fontFile))
      .catch(() => undefined);
  }
};

const reportRendererError = (payload: Parameters<NonNullable<Window['echo']['diagnostics']>['reportRendererError']>[0]): void => {
  void window.echo?.diagnostics.reportRendererError(payload).catch(() => undefined);
};

type CrashGuardProps = {
  children: React.ReactNode;
  label: string;
};

type CrashGuardState = {
  error: Error | null;
  actionMessage: string;
};

class CrashGuard extends React.Component<CrashGuardProps, CrashGuardState> {
  state: CrashGuardState = {
    error: null,
    actionMessage: '',
  };

  static getDerivedStateFromError(error: Error): CrashGuardState {
    return {
      error,
      actionMessage: '',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportRendererError({
      message: `React render crashed in ${this.props.label}: ${error.message}`,
      stack: `${error.stack ?? ''}\n\nComponent stack:\n${info.componentStack}`.trim(),
      source: 'error',
      timestamp: new Date().toISOString(),
    });
  }

  private setActionMessage = (message: string): void => {
    this.setState({ actionMessage: message });
  };

  private exportDiagnostics = (): void => {
    void window.echo?.diagnostics.exportDiagnosticsZip()
      .then((outputPath) => {
        this.setActionMessage(outputPath ? `已导出: ${outputPath}` : '已取消导出。');
      })
      .catch((error) => {
        this.setActionMessage(error instanceof Error ? error.message : String(error));
      });
  };

  private openCrashReport = (): void => {
    void window.echo?.diagnostics.openCrashReport()
      .then((outputPath) => {
        this.setActionMessage(outputPath ? `已打开: ${outputPath}` : '未找到崩溃报告。');
      })
      .catch((error) => {
        this.setActionMessage(error instanceof Error ? error.message : String(error));
      });
  };

  private restartApp = (): void => {
    void window.echo?.diagnostics.relaunchApp().catch((error) => {
      this.setActionMessage(error instanceof Error ? error.message : String(error));
    });
  };

  private reloadRenderer = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    const diagnosticsAvailable = Boolean(window.echo?.diagnostics);

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'radial-gradient(circle at 20% 18%, rgba(14, 165, 233, 0.2), transparent 34rem), linear-gradient(135deg, #020617, #172554)',
          color: '#e5eefb',
          fontFamily: '"Microsoft YaHei", "Segoe UI", sans-serif',
        }}
      >
        <section
          style={{
            width: 'min(820px, 100%)',
            border: '1px solid rgba(226, 232, 240, 0.2)',
            borderRadius: 28,
            padding: 34,
            background: 'rgba(15, 23, 42, 0.82)',
            boxShadow: '0 26px 80px rgba(0, 0, 0, 0.34)',
          }}
        >
          <p style={{ margin: '0 0 12px', color: '#93c5fd', fontWeight: 800, letterSpacing: '0.18em' }}>ECHO Crash Guard</p>
          <h1 style={{ margin: 0, fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1, letterSpacing: '-0.05em' }}>
            界面出错了，但没有直接白屏。
          </h1>
          <p style={{ margin: '18px 0 0', maxWidth: 680, color: '#bfdbfe', lineHeight: 1.75 }}>
            当前窗口已进入崩溃保护页。你可以导出诊断包、打开崩溃报告，或者重启 ECHO。这个保护层只在 UI 崩溃后接管，不会常驻占用播放链路。
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
            <button type="button" onClick={this.exportDiagnostics} disabled={!diagnosticsAvailable} style={crashGuardPrimaryButtonStyle}>
              导出崩溃日志
            </button>
            <button type="button" onClick={this.openCrashReport} disabled={!diagnosticsAvailable} style={crashGuardButtonStyle}>
              打开崩溃报告
            </button>
            <button type="button" onClick={this.reloadRenderer} style={crashGuardButtonStyle}>
              重新载入界面
            </button>
            <button type="button" onClick={this.restartApp} disabled={!diagnosticsAvailable} style={crashGuardButtonStyle}>
              重启 ECHO
            </button>
          </div>
          <p style={{ minHeight: 24, margin: '18px 0 0', color: '#fde68a', wordBreak: 'break-word' }}>
            {this.state.actionMessage || (diagnosticsAvailable ? '' : '诊断桥不可用，请手动重启 ECHO。')}
          </p>
          <details style={{ marginTop: 20, color: '#cbd5e1' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800 }}>错误摘要</summary>
            <pre style={crashGuardPreStyle}>{this.state.error.message}</pre>
            <pre style={crashGuardPreStyle}>{this.state.error.stack ?? 'No stack available.'}</pre>
          </details>
        </section>
      </main>
    );
  }
}

const crashGuardButtonStyle: React.CSSProperties = {
  minHeight: 44,
  border: 0,
  borderRadius: 999,
  padding: '0 18px',
  color: '#07111f',
  background: '#f8fafc',
  font: 'inherit',
  fontWeight: 800,
  cursor: 'pointer',
};

const crashGuardPrimaryButtonStyle: React.CSSProperties = {
  ...crashGuardButtonStyle,
  color: '#082f49',
  background: 'linear-gradient(135deg, #7dd3fc, #facc15)',
};

const crashGuardPreStyle: React.CSSProperties = {
  maxHeight: 180,
  overflow: 'auto',
  margin: '14px 0 0',
  padding: 14,
  borderRadius: 16,
  background: 'rgba(2, 6, 23, 0.62)',
  color: '#dbeafe',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

window.addEventListener('error', (event) => {
  reportRendererError({
    message: event.message || 'Renderer error',
    stack: event.error instanceof Error ? event.error.stack : undefined,
    filename: event.filename || undefined,
    lineno: event.lineno,
    colno: event.colno,
    source: 'error',
    timestamp: new Date().toISOString(),
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  reportRendererError({
    message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled renderer rejection'),
    stack: reason instanceof Error ? reason.stack : undefined,
    source: 'unhandledrejection',
    timestamp: new Date().toISOString(),
  });
});

startPerformanceStallMonitor();
loadAppearanceFontFiles(appearancePreferences);
if (appBridge) {
  watchThemeSettings(() => appBridge.getSettings());
} else {
  watchSystemThemeMode(readThemeMode);
}
void loadPersistedThemeMode().catch(() => undefined);
void loadPersistedAppearancePreferences()
  .then((preferences) => {
    applyAppearancePreferences(preferences);
    loadAppearanceFontFiles(preferences);
  })
  .catch(() => undefined);
void appBridge?.getSettings().then(loadLyricsFontFiles).catch(() => undefined);

const isDesktopLyricsWindow = new URLSearchParams(window.location.search).get('desktopLyrics') === '1';
const isMiniPlayerWindow = new URLSearchParams(window.location.search).get('miniPlayer') === '1';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CrashGuard label={isMiniPlayerWindow ? 'mini-player' : isDesktopLyricsWindow ? 'desktop-lyrics' : 'main-window'}>
      {isMiniPlayerWindow ? (
        <I18nProvider>
          <PlaybackQueueProvider>
            <MiniPlayerApp />
          </PlaybackQueueProvider>
        </I18nProvider>
      ) : isDesktopLyricsWindow ? (
        <I18nProvider>
          <DesktopLyricsApp />
        </I18nProvider>
      ) : <App />}
    </CrashGuard>
  </React.StrictMode>,
);
