// Build and runtime information shown in the "À propos" dialog.
import fs from 'fs';
import path from 'path';

const SEMVER = /^\d+\.\d+\.\d+$/;

// The version file lives at the repository root (/app/VERSION in the image, ../VERSION in development).
export function readAppVersion(cwd = process.cwd()): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv && SEMVER.test(fromEnv)) return fromEnv;
  try {
    const v = fs.readFileSync(path.resolve(cwd, '..', 'VERSION'), 'utf8').trim();
    if (SEMVER.test(v)) return v;
  } catch {
    /* fall through */
  }
  return 'unknown';
}

// Version of an installed package, read from node_modules (works in the image and in development).
export function readPackageVersion(name: string, cwd = process.cwd()): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'node_modules', name, 'package.json'), 'utf8'));
    return String(pkg.version);
  } catch {
    return 'unknown';
  }
}

export const BACKEND_LIBRARIES = ['express', 'zod', 'pg', 'node-cron', 'pdfkit', 'typescript'] as const;
