// Shared test harness: a fake pg pool (records every query, lets a test script the
// answers) and a helper that serves the real Express app on an ephemeral port.
// Used only by vitest files under src/, which mock '../db.js' with `fakeDb.pool`.
import { vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import type express from 'express';

export interface QueryResult { rows: any[] }
export type Handler = (sql: string, params: any[]) => QueryResult | undefined;

export const TEST_USER_ID = 'u-1';

export function createFakeDb() {
  const calls: Array<{ sql: string; params: any[] }> = [];
  let handler: Handler = () => undefined;
  let role = 'user';

  // Default answers: a valid session for TEST_USER_ID, so the auth middleware passes.
  const defaults: Handler = (sql) => {
    if (sql.includes('FROM sessions')) return { rows: [{ user_id: TEST_USER_ID }] };
    if (sql.includes('FROM users WHERE id')) {
      return { rows: [{ id: TEST_USER_ID, username: 'alice', role, email: null }] };
    }
    return undefined;
  };

  const query = vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    const r = handler(sql, params) ?? defaults(sql, params) ?? { rows: [] };
    return { rows: r.rows, rowCount: r.rows.length };
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => client), on: vi.fn() };

  return {
    pool,
    client,
    calls,
    query,
    setHandler(h: Handler) { handler = h; },
    setRole(r: string) { role = r; },
    reset() {
      calls.length = 0;
      handler = () => undefined;
      role = 'user';
      query.mockClear();
    },
  };
}

export const fakeDb = createFakeDb();
export const AUTH = { Authorization: 'Bearer test-session-token' };

// Serves the app on 127.0.0.1 for the duration of fn.
export async function withServer<T>(app: express.Express, fn: (base: string) => Promise<T>): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

export function jsonRequest(base: string, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return fetch(base + path, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
