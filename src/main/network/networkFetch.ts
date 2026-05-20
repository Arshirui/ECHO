export const fetchWithNetworkProxy = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const requestInput = input instanceof URL ? input.toString() : input;

  if (process.env.VITEST === 'true') {
    return fetch(requestInput, init);
  }

  try {
    const electron = await import('electron');
    if (electron.app?.isReady?.() && electron.net?.fetch) {
      return electron.net.fetch(requestInput, init);
    }
  } catch {
    // Fall back to Node fetch when Electron net is unavailable, such as in unit tests.
  }

  return fetch(requestInput, init);
};
