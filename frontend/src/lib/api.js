import { get } from 'svelte/store';
import { t } from './i18n.ts';

const API_BASE = '';

export function getToken() {
  return localStorage.getItem('bankapp_token') ?? '';
}

export function setToken(token) {
  localStorage.setItem('bankapp_token', token);
}

export function clearToken() {
  localStorage.removeItem('bankapp_token');
  localStorage.removeItem('bankapp_user');
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem('bankapp_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('bankapp_user');
  }
}

export function getCurrentUser() {
  const user = localStorage.getItem('bankapp_user');
  return user ? JSON.parse(user) : null;
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : { ...extra };
}

// Format backend errors (handles Zod validation errors which are objects)
function formatError(error) {
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    // Zod field errors: { field: ["error message"] }
    if (error.fieldErrors) {
      const messages = [];
      for (const [field, errors] of Object.entries(error.fieldErrors)) {
        if (Array.isArray(errors)) {
          messages.push(...errors);
        }
      }
      return messages.join('\n');
    }
    // Generic object error
    return JSON.stringify(error);
  }
  return get(t)('Une erreur est survenue');
}

async function handleResponse(res) {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('bankapp:unauthorized'));
    throw new Error(get(t)('Non autorisé'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = formatError(body.error);
    throw new Error(message);
  }
  return res;
}

// Subscribes to the server-sent events stream (/api/events) using fetch so the
// Authorization header can be sent (native EventSource can't set custom headers).
// Auto-reconnects on disconnect/error. Returns an unsubscribe function.
export function subscribeToEvents(onMessage) {
  const controller = new AbortController();
  let stopped = false;

  async function connect() {
    while (!stopped) {
      try {
        const res = await fetch(`${API_BASE}/api/events`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error('SSE connection failed');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIndex;
          while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);

            const dataLines = rawEvent
              .split('\n')
              .filter(line => line.startsWith('data: '))
              .map(line => line.slice(6));

            if (dataLines.length > 0) {
              try {
                onMessage(JSON.parse(dataLines.join('')));
              } catch (e) {
                console.error('SSE parse error', e);
              }
            }
          }
        }
      } catch (e) {
        if (stopped) return;
        console.error('SSE connection error, retrying in 3s', e);
      }

      if (!stopped) await new Promise(r => setTimeout(r, 3000));
    }
  }

  connect();

  return function unsubscribe() {
    stopped = true;
    controller.abort();
  };
}

export const api = {
  get: (endpoint) =>
    fetch(`${API_BASE}${endpoint}`, { headers: authHeaders() })
      .then(handleResponse)
      .then(r => r.json()),

  post: (endpoint, body) =>
    fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }).then(handleResponse).then(r => r.json()),

  patch: (endpoint, body) =>
    fetch(`${API_BASE}${endpoint}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }).then(handleResponse).then(r => r.json()),

  put: (endpoint, body) =>
    fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }).then(handleResponse).then(r => r.json()),

  delete: (endpoint, body) =>
    fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: body !== undefined ? authHeaders({ 'Content-Type': 'application/json' }) : authHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }).then(handleResponse),
};

// Auth functions for multi-profile support
export async function login(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(formatError(error.error));
  }

  const body = await res.json();
  // Second factor on: no session yet. The caller asks for the code and calls verifyMfa().
  if (body.mfa_required) return { mfaRequired: true, mfaToken: body.mfa_token };
  const { user, token } = body;
  setToken(token);
  setCurrentUser(user);
  return { user, token };
}

// Second step after login (TOTP or recovery code). remember: keep this device trusted for 20 days.
export async function verifyMfa(mfaToken, code, remember) {
  const res = await fetch(`${API_BASE}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfa_token: mfaToken, code, remember }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(formatError(error.error));
  }
  const { user, token } = await res.json();
  setToken(token);
  setCurrentUser(user);
  return { user, token };
}

// Second-factor settings (signed-in user). Each call throws with the server's message on failure.
async function mfaRequest(path, method = 'GET', body = undefined) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatError(json.error));
  return json;
}

export function getMfaStatus() { return mfaRequest('/api/auth/mfa'); }
export function startMfaEnrolment(password) { return mfaRequest('/api/auth/mfa/enroll', 'POST', { password }); }
export function confirmMfaEnrolment(password, code) { return mfaRequest('/api/auth/mfa/confirm', 'POST', { password, code }); }
export function disableMfa(password, code) { return mfaRequest('/api/auth/mfa', 'DELETE', { password, code }); }

// Admin-only: create a new user account without switching the current session
export async function createUser(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(formatError(error.error));
  }

  return res.json();
}

// Admin-only: user account management
export function listUsers() {
  return api.get('/api/admin/users');
}

export function renameUser(id, username) {
  return api.patch(`/api/admin/users/${id}`, { username });
}

export function resetUserPassword(id, password) {
  return api.patch(`/api/admin/users/${id}/password`, { password });
}

export function deleteUser(id) {
  return api.delete(`/api/admin/users/${id}`);
}

export async function logout() {
  try {
    await api.post('/api/auth/logout', {});
  } catch {
    // Ignore errors on logout
  }
  clearToken();
}
