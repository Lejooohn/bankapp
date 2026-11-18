#!/usr/bin/env node

import fs from 'fs';
import crypto from 'crypto';
import zlib from 'zlib';
import path from 'path';

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

function loadKey() {
  // Try env var first, then .env file in current directory
  let key = process.env.ENCRYPTION_KEY;
  if (!key) {
    try {
      const envPath = path.join(process.cwd(), '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/ENCRYPTION_KEY=([a-f0-9]{64})/i);
      if (match) key = match[1];
    } catch (err) {
      // Silently continue if .env doesn't exist
    }
  }

  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY env var or .env must contain 64 hex characters (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

function decryptBuffer(encrypted, key) {
  if (encrypted.length < NONCE_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted data: too short');
  }
  const nonce = encrypted.subarray(0, NONCE_LENGTH);
  const tag = encrypted.subarray(encrypted.length - TAG_LENGTH);
  const ciphertext = encrypted.subarray(NONCE_LENGTH, encrypted.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function main() {
  if (process.argv.length < 3) {
    console.error('Usage: node decrypt-backup.mjs <backup-file>');
    console.error('Outputs decompressed SQL to stdout, or exits with error code on failure');
    process.exit(1);
  }

  const backupFile = process.argv[2];

  try {
    // Read backup file
    const buffer = fs.readFileSync(backupFile);
    const key = loadKey();

    // Detect if already plaintext gzip or encrypted
    let plaintext;
    if (buffer.length >= 2 && buffer.subarray(0, 2).equals(GZIP_MAGIC)) {
      // Already plain gzip, use as-is
      plaintext = buffer;
    } else {
      // Encrypted, decrypt
      plaintext = decryptBuffer(buffer, key);
    }

    // Decompress
    const sql = zlib.gunzipSync(plaintext);
    process.stdout.write(sql);
    // No process.exit here: it would cut off a pending write when stdout is a pipe.
  } catch (err) {
    console.error(`[decrypt-backup] Error: ${err.message}`, {
      file: backupFile,
      code: err.code
    });
    process.exit(1);
  }
}

main();
