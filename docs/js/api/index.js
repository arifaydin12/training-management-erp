// Picks the data-layer implementation: the real HTTP API, or the in-browser mock (demo mode).
export async function createApi(config = {}) {
  if (config.demo) {
    const { createMockApi } = await import('./mock.js');
    return createMockApi();
  }
  const { createHttpApi } = await import('./http.js');
  return createHttpApi({ apiBase: config.apiBase || 'api' });
}
