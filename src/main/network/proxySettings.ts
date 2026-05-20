import { net, session } from 'electron';
import type { Session } from 'electron';
import type { AppSettings, NetworkProxyTestResult } from '../../shared/types/appSettings';
import { defaultNetworkProxyBypassRules } from '../app/appSettings';

const defaultProxyTestUrl = 'https://www.gstatic.com/generate_204';

const proxyRuleForUrl = (rawUrl: string | null | undefined): string | undefined => {
  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);
    const host = `${url.hostname}${url.port ? `:${url.port}` : ''}`;
    if (!host || !url.port) {
      return undefined;
    }
    if (url.protocol === 'socks:' || url.protocol === 'socks4:' || url.protocol === 'socks5:') {
      return `${url.protocol}//${host}`;
    }
    return `${url.protocol}//${host}`;
  } catch {
    return undefined;
  }
};

export const buildElectronProxyConfig = (settings: Pick<AppSettings, 'networkProxyMode' | 'networkProxyUrl' | 'networkProxyBypassRules' | 'networkProxyPacUrl'>) => {
  const mode = settings.networkProxyMode ?? 'off';
  const proxyBypassRules = settings.networkProxyBypassRules?.trim() || defaultNetworkProxyBypassRules;

  if (mode === 'system') {
    return { mode: 'system' as const };
  }

  if (mode === 'manual') {
    const proxyRules = proxyRuleForUrl(settings.networkProxyUrl);
    return proxyRules ? { mode: 'fixed_servers' as const, proxyRules, proxyBypassRules } : { mode: 'direct' as const };
  }

  if (mode === 'pac' && settings.networkProxyPacUrl) {
    return { mode: 'pac_script' as const, pacScript: settings.networkProxyPacUrl, proxyBypassRules };
  }

  return { mode: 'direct' as const };
};

export const applyNetworkProxySettings = async (
  settings: Pick<AppSettings, 'networkProxyMode' | 'networkProxyUrl' | 'networkProxyBypassRules' | 'networkProxyPacUrl'>,
  targetSession: Session = session.defaultSession,
): Promise<void> => {
  await targetSession.setProxy(buildElectronProxyConfig(settings));
};

export const testNetworkProxyConnection = async (
  settings: Pick<AppSettings, 'networkProxyMode' | 'networkProxyUrl' | 'networkProxyBypassRules' | 'networkProxyPacUrl'>,
  targetUrl = defaultProxyTestUrl,
): Promise<NetworkProxyTestResult> => {
  const startedAt = Date.now();
  const mode = settings.networkProxyMode ?? 'off';

  try {
    await applyNetworkProxySettings(settings);
    const resolvedProxy = await session.defaultSession.resolveProxy(targetUrl).catch(() => null);
    const signal = AbortSignal.timeout(8000);
    const response = await net.fetch(targetUrl, { signal });
    const elapsedMs = Date.now() - startedAt;
    return {
      ok: response.ok || response.status === 204,
      mode,
      message: response.ok || response.status === 204 ? '连接正常' : `连接返回 HTTP ${response.status}`,
      resolvedProxy,
      status: response.status,
      elapsedMs,
    };
  } catch (error) {
    return {
      ok: false,
      mode,
      message: error instanceof Error ? error.message : String(error),
      resolvedProxy: null,
      status: null,
      elapsedMs: Date.now() - startedAt,
    };
  }
};
