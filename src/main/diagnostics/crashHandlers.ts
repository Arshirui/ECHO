import { app, BrowserWindow } from 'electron';
import type { WebContents } from 'electron';
import { getCrashReportService } from './CrashReportService';
import { showCrashRecoveryDialog } from './CrashRecoveryDialog';
import { recordMainRuntimeIssue } from './DevConsoleService';
import { sanitizeLogPayload } from './Logger';
import { recoverClosedHelperPipe, type RuntimeSelfHealSource } from './RuntimeSelfHeal';

const errorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }

  return typeof value === 'string' ? value : JSON.stringify(sanitizeLogPayload(value));
};

const errorStack = (value: unknown): string | undefined => (value instanceof Error ? value.stack : undefined);

const safeRead = <T>(reader: () => T, fallback: T): T => {
  try {
    return reader();
  } catch {
    return fallback;
  }
};

const webContentsInfo = (webContents: WebContents): unknown => ({
  id: safeRead(() => webContents.id, -1),
  url: safeRead(() => webContents.getURL(), 'unavailable'),
  title: safeRead(() => webContents.getTitle(), 'unavailable'),
  isDestroyed: safeRead(() => webContents.isDestroyed(), true),
});

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const compactCrashDetails = (value: unknown): string => {
  try {
    return JSON.stringify(sanitizeLogPayload(value), null, 2);
  } catch {
    return 'Crash details are unavailable.';
  }
};

const createRendererCrashRecoveryHtml = (message: string, details: unknown): string => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ECHO 崩溃保护</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
      background: #0f172a;
      color: #e5eefb;
    }
    * {
      box-sizing: border-box;
    }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.22), transparent 34rem),
        radial-gradient(circle at 82% 18%, rgba(251, 191, 36, 0.2), transparent 30rem),
        linear-gradient(135deg, #020617, #111827 52%, #172554);
    }
    main {
      width: min(860px, calc(100vw - 40px));
      padding: 34px;
      border: 1px solid rgba(226, 232, 240, 0.22);
      border-radius: 28px;
      background: rgba(15, 23, 42, 0.78);
      box-shadow: 0 26px 80px rgba(0, 0, 0, 0.34);
      backdrop-filter: blur(20px);
    }
    .eyebrow {
      margin: 0 0 12px;
      color: #93c5fd;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: clamp(32px, 5vw, 54px);
      line-height: 0.98;
      letter-spacing: -0.05em;
    }
    .lead {
      max-width: 680px;
      margin: 18px 0 0;
      color: #bfdbfe;
      font-size: 16px;
      line-height: 1.75;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }
    button {
      min-height: 44px;
      border: 0;
      border-radius: 999px;
      padding: 0 18px;
      color: #07111f;
      background: #f8fafc;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      transition: transform 140ms ease, opacity 140ms ease;
    }
    button:hover {
      transform: translateY(-1px);
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
      transform: none;
    }
    button.primary {
      color: #082f49;
      background: linear-gradient(135deg, #7dd3fc, #facc15);
    }
    .status {
      min-height: 24px;
      margin-top: 18px;
      color: #fde68a;
      font-size: 14px;
      word-break: break-word;
    }
    details {
      margin-top: 24px;
      color: #cbd5e1;
    }
    summary {
      cursor: pointer;
      font-weight: 700;
    }
    pre {
      max-height: 220px;
      overflow: auto;
      margin: 14px 0 0;
      padding: 14px;
      border-radius: 16px;
      background: rgba(2, 6, 23, 0.62);
      color: #dbeafe;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">ECHO Crash Guard</p>
    <h1>渲染界面崩溃了，但 ECHO 已进入保护页。</h1>
    <p class="lead">不是直接白屏了。崩溃信息已经写入本机诊断记录，你可以先导出日志，再重启 ECHO。导出的诊断包会尽量避开音乐文件、歌词内容、账号令牌等隐私数据。</p>
    <div class="actions">
      <button class="primary" data-action="export">导出崩溃日志</button>
      <button data-action="report">打开崩溃报告</button>
      <button data-action="folder">打开诊断目录</button>
      <button data-action="restart">重启 ECHO</button>
    </div>
    <div class="status" role="status"></div>
    <details>
      <summary>崩溃摘要</summary>
      <pre>${escapeHtml(message)}</pre>
      <pre>${escapeHtml(compactCrashDetails(details))}</pre>
    </details>
  </main>
  <script>
    const status = document.querySelector('.status');
    const setStatus = (message) => {
      status.textContent = message;
    };
    const run = async (button, action) => {
      if (!window.echo || !window.echo.diagnostics) {
        setStatus('诊断桥不可用，请手动重启 ECHO。');
        return;
      }
      button.disabled = true;
      try {
        const result = await action(window.echo.diagnostics);
        if (result) {
          setStatus(result);
        }
      } catch (error) {
        setStatus(error && error.message ? error.message : String(error));
      } finally {
        button.disabled = false;
      }
    };
    document.querySelector('[data-action="export"]').addEventListener('click', (event) => {
      run(event.currentTarget, async (diagnostics) => {
        const outputPath = await diagnostics.exportDiagnosticsZip();
        return outputPath ? '已导出: ' + outputPath : '已取消导出。';
      });
    });
    document.querySelector('[data-action="report"]').addEventListener('click', (event) => {
      run(event.currentTarget, async (diagnostics) => {
        const outputPath = await diagnostics.openCrashReport();
        return outputPath ? '已打开: ' + outputPath : '未找到崩溃报告。';
      });
    });
    document.querySelector('[data-action="folder"]').addEventListener('click', (event) => {
      run(event.currentTarget, async (diagnostics) => {
        const outputPath = await diagnostics.openDiagnosticsFolder();
        return outputPath ? '已打开诊断目录: ' + outputPath : '未找到诊断目录。';
      });
    });
    document.querySelector('[data-action="restart"]').addEventListener('click', (event) => {
      run(event.currentTarget, async (diagnostics) => {
        await diagnostics.relaunchApp();
        return '正在重启 ECHO...';
      });
    });
  </script>
</body>
</html>`;

export const isClosedPipeWriteError = (error: Error): boolean => {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EPIPE' || code === 'EOF' || code === 'ERR_STREAM_DESTROYED' || code === 'ERR_STREAM_WRITE_AFTER_END') {
    return true;
  }

  return /^(?:write\s+)?(?:EOF|EPIPE)$/iu.test(error.message.trim()) ||
    /write after end|stream (?:has been|was) destroyed|cannot call write after a stream was destroyed/iu.test(error.message);
};

export const isCleanProcessGoneReason = (reason: string | undefined): boolean => reason === 'clean-exit';

const logHandlerFailure = (phase: string, error: unknown): void => {
  try {
    getCrashReportService().getLogger()?.error('crash', 'crash handler failed', {
      phase,
      error: error instanceof Error ? error.message : String(error),
    });
  } catch {
    console.error('[crash] crash handler failed', phase, error);
  }
};

const logRecoverableMainIssue = (message: string, payload?: unknown): void => {
  try {
    getCrashReportService().getLogger()?.warn('main', message, payload);
  } catch {
    console.warn(message, payload ?? '');
  }
};

const reportCrashSafely = (record: Parameters<ReturnType<typeof getCrashReportService>['reportCrash']>[0]): void => {
  try {
    getCrashReportService().reportCrash(record);
  } catch (error) {
    logHandlerFailure('reportCrash', error);
  }
};

const showCrashRecoveryDialogSafely = (reason: 'main' | 'renderer', message: string): void => {
  try {
    void showCrashRecoveryDialog(reason, message);
  } catch (error) {
    logHandlerFailure('showCrashRecoveryDialog', error);
  }
};

const recoverClosedPipeWriteSafely = (source: RuntimeSelfHealSource, error: Error): void => {
  try {
    void recoverClosedHelperPipe(source, error).catch((recoveryError) => {
      logHandlerFailure('recoverClosedHelperPipe', recoveryError);
    });
  } catch (recoveryError) {
    logHandlerFailure('recoverClosedHelperPipe', recoveryError);
  }
};

const showRendererCrashRecoveryPageSafely = (
  webContents: WebContents,
  message: string,
  details: unknown,
): boolean => {
  const window = BrowserWindow.fromWebContents(webContents);

  if (!window || window.isDestroyed()) {
    return false;
  }

  try {
    if (!window.isVisible()) {
      window.show();
    }

    const html = createRendererCrashRecoveryHtml(message, details);
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error) => {
      logHandlerFailure('loadRendererCrashRecoveryPage', error);
      showCrashRecoveryDialogSafely('renderer', message);
    });
    return true;
  } catch (error) {
    logHandlerFailure('showRendererCrashRecoveryPage', error);
    return false;
  }
};

export const registerCrashHandlers = (): void => {
  process.on('uncaughtException', (error) => {
    if (isClosedPipeWriteError(error)) {
      logRecoverableMainIssue('ignored closed helper pipe write', {
        message: error.message,
        code: (error as NodeJS.ErrnoException).code ?? null,
      });
      recoverClosedPipeWriteSafely('uncaughtException', error);
      return;
    }

    reportCrashSafely({
      type: 'uncaughtException',
      message: error.message,
      stack: error.stack,
    });
    recordMainRuntimeIssue('uncaughtException', error.message, {
      stack: error.stack,
    });
    showCrashRecoveryDialogSafely('main', error.message);
  });

  process.on('unhandledRejection', (reason) => {
    if (reason instanceof Error && isClosedPipeWriteError(reason)) {
      logRecoverableMainIssue('ignored closed helper pipe rejection', {
        message: reason.message,
        code: (reason as NodeJS.ErrnoException).code ?? null,
      });
      recoverClosedPipeWriteSafely('unhandledRejection', reason);
      return;
    }

    reportCrashSafely({
      type: 'unhandledRejection',
      message: errorMessage(reason),
      stack: errorStack(reason),
      reason: errorMessage(reason),
    });
    recordMainRuntimeIssue('unhandledRejection', errorMessage(reason), {
      stack: errorStack(reason),
    });
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    if (isCleanProcessGoneReason(details.reason)) {
      logRecoverableMainIssue('ignored clean renderer process exit', {
        details,
      });
      return;
    }

    const message = `Renderer process gone: ${details.reason}`;
    reportCrashSafely({
      type: 'render-process-gone',
      message,
      reason: details.reason,
      exitCode: details.exitCode,
      details: {
        webContents: webContentsInfo(webContents),
        details,
      },
    });
    recordMainRuntimeIssue('render-process-gone', message, {
      reason: details.reason,
      exitCode: details.exitCode,
    });
    if (!showRendererCrashRecoveryPageSafely(webContents, message, details)) {
      showCrashRecoveryDialogSafely('renderer', message);
    }
  });

  app.on('child-process-gone', (_event, details) => {
    if (isCleanProcessGoneReason(details.reason)) {
      logRecoverableMainIssue('ignored clean child process exit', {
        details,
      });
      return;
    }

    reportCrashSafely({
      type: 'child-process-gone',
      message: `Child process gone: ${details.type}`,
      reason: details.reason,
      exitCode: details.exitCode,
      details,
    });
    recordMainRuntimeIssue('child-process-gone', `Child process gone: ${details.type}`, {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
};
