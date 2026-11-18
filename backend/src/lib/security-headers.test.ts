import { describe, it, expect } from 'vitest';
import express from 'express';
import { parseTrustProxyHops, securityHeaders } from './security-headers.js';
import { withServer } from '../../test/harness.js';

describe('parseTrustProxyHops', () => {
  it('keeps the historical single-hop default when unset or invalid', () => {
    expect(parseTrustProxyHops(undefined)).toBe(1);
    expect(parseTrustProxyHops('')).toBe(1);
    expect(parseTrustProxyHops('abc')).toBe(1);
    expect(parseTrustProxyHops('-1')).toBe(1);
    expect(parseTrustProxyHops('1.5')).toBe(1);
    expect(parseTrustProxyHops('99')).toBe(1);
  });

  it('accepts an explicit hop count', () => {
    expect(parseTrustProxyHops('2')).toBe(2);
    expect(parseTrustProxyHops(' 0 ')).toBe(0);
  });
});

describe('securityHeaders middleware', () => {
  it('sets headers on every response and calls next', async () => {
    const app = express();
    app.use(securityHeaders());
    app.get('/x', (_req, res) => res.send('ok'));
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/x`);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    });
  });
});
