// Baseline response headers for the API (JSON only, so no CSP here: the frontend's
// nginx sends the CSP for the SPA).
import express from 'express';

export function securityHeaders(): express.RequestHandler {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  };
}

// How many reverse proxies sit in front of the API (TRUST_PROXY_HOPS). Only the hops
// actually present may be trusted, otherwise a client can forge X-Forwarded-For and
// pick its own rate-limit bucket. Defaults to 1 (the single DSM hop), as before.
export function parseTrustProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 1;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0 || n > 5) return 1;
  return n;
}
