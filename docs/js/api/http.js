// Data layer implementation that talks to the real REST API.
import { ApiError } from './errors.js';

export function createHttpApi({ apiBase = 'api' } = {}) {
  let token = null;
  const api = { mode: 'http', demo: false, onUnauthorized: null, setToken: (t) => { token = t; } };

  function buildUrl(path, query) {
    // Resolved against the page URL so the app also works when served from a sub-path.
    const url = new URL(`${apiBase}/${path}`, document.baseURI);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
    return url;
  }

  async function request(method, path, { query, body, raw = false, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(buildUrl(path, query), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (_err) {
      throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
    }

    if (!res.ok) {
      let payload = null;
      try { payload = await res.json(); } catch (_e) { /* non-JSON error body */ }
      const e = payload?.error;
      const err = new ApiError(res.status, e?.code || 'ERROR', e?.message || `Request failed (${res.status})`, e?.details);
      if (res.status === 401 && auth && api.onUnauthorized) api.onUnauthorized(err);
      throw err;
    }
    if (res.status === 204) return null;
    if (raw) {
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="?([^";]+)"?/.exec(disposition);
      return { blob: await res.blob(), filename: match ? match[1] : 'export.csv' };
    }
    return res.json();
  }

  api.auth = {
    login: (username, password) => request('POST', 'auth/login', { body: { username, password }, auth: false }),
    me: () => request('GET', 'auth/me'),
  };
  api.meta = () => request('GET', 'meta');
  api.dashboard = () => request('GET', 'dashboard');

  api.employees = {
    list: (query) => request('GET', 'employees', { query }),
    get: (id) => request('GET', `employees/${id}`),
    create: (body) => request('POST', 'employees', { body }),
    update: (id, body) => request('PUT', `employees/${id}`, { body }),
    remove: (id) => request('DELETE', `employees/${id}`),
    exportCsv: (query) => request('GET', 'employees/export.csv', { query, raw: true }),
  };

  api.trainings = {
    list: (query) => request('GET', 'trainings', { query }),
    get: (id) => request('GET', `trainings/${id}`),
    create: (body) => request('POST', 'trainings', { body }),
    update: (id, body) => request('PUT', `trainings/${id}`, { body }),
    remove: (id) => request('DELETE', `trainings/${id}`),
    setStatus: (id, status) => request('POST', `trainings/${id}/status`, { body: { status } }),
    addParticipant: (id, employeeId) => request('POST', `trainings/${id}/participants`, { body: { employeeId } }),
    setParticipantStatus: (id, employeeId, status) => request('PATCH', `trainings/${id}/participants/${employeeId}`, { body: { status } }),
    removeParticipant: (id, employeeId) => request('DELETE', `trainings/${id}/participants/${employeeId}`),
  };

  api.audit = { list: (query) => request('GET', 'audit-log', { query }) };

  return api;
}
