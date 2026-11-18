import express from 'express';
import pool from '../db.js';
import { readAppVersion, readPackageVersion, BACKEND_LIBRARIES } from '../lib/about.js';

const router = express.Router();

// GET /api/about - application version, build commit and the main tools in use (authenticated)
router.get('/api/about', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  let postgres = 'unknown';
  try {
    const r = await pool.query('SHOW server_version');
    postgres = r.rows[0].server_version;
  } catch {
    /* database unreachable: keep "unknown" */
  }
  const libraries: Record<string, string> = {};
  for (const name of BACKEND_LIBRARIES) libraries[name] = readPackageVersion(name);
  res.json({
    app: { name: 'BankApp', version: readAppVersion(), commit: process.env.APP_COMMIT || 'dev' },
    runtime: { node: process.version, postgres },
    backend: { libraries },
  });
});

export default router;
