// Guards for the NAS scripts: valid shell, no hard-coded old names or paths, and the containers
// they stop and start are the ones of the current stack.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { execFileSync } from 'child_process';

const SCRIPTS = new URL('../../../scripts/', import.meta.url);
const read = (name: string) => fs.readFileSync(new URL(name, SCRIPTS), 'utf8');
const SHELL = ['backup.sh', 'restore.sh'];

describe('NAS scripts', () => {
  it.each(SHELL)('%s is valid bash', (name) => {
    execFileSync('bash', ['-n', new URL(name, SCRIPTS).pathname]);
  });

  it.each(SHELL)('%s has no reference to the 2026 stack', (name) => {
    const s = read(name);
    expect(s).not.toContain('bankapp-2026');
    expect(s).not.toMatch(/bankapp-db(?!-local)/);
    expect(s).not.toMatch(/bankapp-api(?![-\w$"])/);
    expect(s).not.toContain('/path/to/backups/bankapp');
  });

  it('restore.sh stops and starts the containers of the current stack, through variables', () => {
    const s = read('restore.sh');
    expect(s).toContain('docker stop "$API_CONTAINER" "$WEB_CONTAINER"');
    expect(s).toContain('docker start "$API_CONTAINER" "$WEB_CONTAINER"');
    expect(s).toContain('CONTAINER_PREFIX="${CONTAINER_PREFIX:-bankapp}"');
  });

  it('backup.sh derives the project folder from its own location', () => {
    expect(read('backup.sh')).toContain('PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"');
  });
});

describe('NAS scripts: backups stay encrypted', () => {
  it('backup.sh encrypts the dump with the application module before it reaches disk', () => {
    const s = read('backup.sh');
    expect(s).toContain("import { encryptBuffer } from './dist/services/encryption.js'");
    expect(s).toContain('MANUAL_DIR="$BACKUP_DIR/manual"');
    // No direct gzip-to-file path without the encryption step.
    expect(s).not.toMatch(/pg_dump[^\n]*\|\s*gzip\s*>\s*"?\$DUMP/);
  });

  it('restore.sh decrypts inside the backend image, not with a host node', () => {
    const s = read('restore.sh');
    expect(s).not.toMatch(/^\s*if ! node "\$DECRYPT_SCRIPT"/m);
    expect(s).toContain('"$BACKEND_IMAGE" node /scripts/decrypt-backup.mjs');
  });

});
