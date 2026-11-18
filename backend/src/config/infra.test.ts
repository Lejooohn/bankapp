// Non-regression guards for deployment configuration: the production stack must not
// publish the database on the LAN, mount source code, or serve the Vite dev server.
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const ROOT = '../../../';
const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('docker-compose.yml (production stack)', () => {
  const compose = read(`${ROOT}docker-compose.yml`);

  it('publishes the database on loopback only', () => {
    expect(compose).toMatch(/- '127\.0\.0\.1:\$\{DB_PORT:-5433\}:5432'/);
    expect(compose).not.toMatch(/- '\$\{DB_PORT/);
  });

  it('publishes the API on loopback only', () => {
    expect(compose).toMatch(/- '127\.0\.0\.1:\$\{API_PORT:-3000\}:3000'/);
  });

  it('builds the production images and mounts no source code', () => {
    expect(compose).toMatch(/dockerfile: backend\/Dockerfile\n\s+target: prod/);
    expect(compose).toMatch(/dockerfile: frontend\/Dockerfile\.prod\n/);
    expect(compose).not.toMatch(/dockerfile: frontend\/Dockerfile\n/);
    expect(compose).not.toMatch(/\.\/backend\/src:/);
    expect(compose).not.toMatch(/\.\/frontend\/src:/);
    expect(compose).not.toMatch(/vite\.config/);
  });

  it('passes the trusted proxy range to the web container', () => {
    expect(compose).toMatch(/TRUSTED_PROXY_CIDR: \$\{TRUSTED_PROXY_CIDR:-172\.16\.0\.0\/12\}/);
  });

  it('keeps the public web port and maps it to the nginx listener', () => {
    expect(compose).toMatch(/- '\$\{WEB_PORT:-5173\}:8080'/);
  });
});

describe('Dockerfiles', () => {
  it('backend: prod stage runs compiled output with dev dependencies pruned', () => {
    const df = read(`${ROOT}backend/Dockerfile`);
    const prod = df.slice(df.indexOf('FROM base AS prod'), df.indexOf('FROM base AS dev'));
    expect(prod).toContain('npm prune --omit=dev');
    expect(prod).toContain('CMD ["node", "dist/index.js"]');
    expect(prod).not.toContain('tsx');
  });

  it('backend: the dev stage stays last so a plain build still yields the dev image', () => {
    const froms = read(`${ROOT}backend/Dockerfile`).match(/^FROM .*$/gm) ?? [];
    expect(froms[froms.length - 1]).toBe('FROM base AS dev');
  });

  it('frontend prod image serves the static bundle with nginx, not the Vite dev server', () => {
    const df = read(`${ROOT}frontend/Dockerfile.prod`);
    expect(df).toContain('FROM nginx');
    expect(df).toContain('COPY --from=build /app/frontend/dist /usr/share/nginx/html');
    expect(df).toContain('COPY frontend/deploy/default.conf.template /etc/nginx/templates/default.conf.template');
    expect(df).toContain('NGINX_ENVSUBST_FILTER=^TRUSTED_PROXY_CIDR$');
    expect(df).toContain('COPY frontend/deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf');
    expect(df).not.toMatch(/npm run dev/);
  });
});

describe('frontend/deploy/default.conf.template', () => {
  const conf = read(`${ROOT}frontend/deploy/default.conf.template`);
  const headers = read(`${ROOT}frontend/deploy/security-headers.conf`);

  it('sends a CSP that blocks inline and eval scripts and framing', () => {
    const csp = headers.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? '';
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('includes the security headers in every location, since add_header is not inherited', () => {
    const locations = conf.match(/location [^{]+\{[\s\S]*?\n  \}/g) ?? [];
    expect(locations.length).toBe(3);
    const withHeaders = locations.filter(loc => loc.includes('include /etc/nginx/snippets/security-headers.conf;'));
    // /api/ is proxied: the backend already sends these headers, so only the SPA locations repeat them.
    expect(withHeaders.length).toBe(2);
    expect(locations.find(loc => loc.startsWith('location /api/'))).not.toContain('security-headers.conf');
  });

  it('takes the client address from X-Forwarded-For only from the trusted proxy range', () => {
    expect(conf).toContain('set_real_ip_from ${TRUSTED_PROXY_CIDR};');
    expect(conf).toContain('real_ip_header X-Forwarded-For;');
  });

  it('overwrites X-Forwarded-For with the connection address instead of appending to it', () => {
    // Appending let a client prepend a forged address; the backend trusts one hop only.
    expect(conf).toContain('proxy_set_header X-Forwarded-For $remote_addr;');
    expect(conf).not.toContain('$proxy_add_x_forwarded_for');
  });

  it('disables buffering on /api so server-sent events stream', () => {
    expect(conf).toMatch(/location \/api\/ \{[\s\S]*proxy_buffering off;/);
  });

  it('allows the CSV import body size (50 MB JSON)', () => {
    expect(conf).toContain('client_max_body_size 60m;');
  });
});

describe('frontend/index.html', () => {
  it('has no inline script, so the CSP can forbid inline scripts', () => {
    const html = read(`${ROOT}frontend/index.html`);
    const inline = html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) ?? [];
    expect(inline).toEqual([]);
    expect(html).toContain('<script src="/theme-init.js"></script>');
  });

  it('ships the theme bootstrap as a static file', () => {
    expect(fs.existsSync(new URL(`${ROOT}frontend/public/theme-init.js`, import.meta.url))).toBe(true);
  });
});

describe('database schema (additive migration)', () => {
  it('creates the second-factor tables idempotently', () => {
    const db = read(`${ROOT}backend/src/db.ts`);
    for (const table of ['user_totp', 'user_recovery_codes', 'mfa_challenges', 'trusted_devices']) {
      expect(db).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(db).not.toContain('user_known_ips');
  });
});
