import express from 'express';
import { parse } from 'csv-parse/sync';
import pool from '../db.js';
import { broadcastTransactionsChanged } from './events.js';

function errMsg(err: any): string {
  return process.env.NODE_ENV === 'production' ? 'Erreur interne' : err.message;
}

const router = express.Router();

router.post('/accounts/:id/import', express.json({ limit: '50mb' }), async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'CSV requis' });
  try {
    const ownership = await pool.query('SELECT id, account_type FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (ownership.rows.length === 0) return res.status(403).json({ error: 'Forbidden' });
    if (ownership.rows[0].account_type === 'savings') {
      return res.status(403).json({ error: 'Un compte Livret/Épargne ne peut recevoir des opérations que via un virement' });
    }

    const csvNormalized = (csv as string).normalize('NFC');
    const records = parse(csvNormalized, {
      columns: ['date', 'mode', 'tiers', 'details', 'category', 'subcategory', 'amount', 'pointage'],
      skip_empty_lines: true,
      from_line: 2,
      delimiter: ';',
      quote: false,
      escape: false,
      relax_quotes: true
    });

    const CREDIT_TYPES = new Set(['Versement', 'Virement reçu', 'Dépôt de chèque']);

    const transactions = (records as any[])
      .filter((r) => r.date && r.amount)
      .map((r) => {
        const parsedAmount = parseFloat(r.amount.replace(',', '.'));
        const transactionType = r.mode || 'Autre';
        const isCredit = CREDIT_TYPES.has(transactionType);
        const amount = Math.abs(parsedAmount) * (isCredit ? 1 : -1);
        const [day, month, year] = r.date.split('/');
        const date = `${year}-${month}-${day}`;
        const is_reconciled = r.pointage?.trim() === 'P';
        return {
          account_id: req.params.id,
          date,
          tiers: r.tiers || 'Autre',
          details: r.details || null,
          category: r.category || 'Autre',
          amount,
          transaction_type: transactionType,
          is_reconciled,
        };
      });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Bulk INSERT via unnest — one round-trip regardless of row count
      await client.query(
        `INSERT INTO transactions (account_id, user_id, date, tiers, details, category, amount, transaction_type, is_reconciled)
         SELECT $1, $2, d, t, det, cat, amt, typ, rec
         FROM unnest($3::date[], $4::text[], $5::text[], $6::text[], $7::numeric[], $8::text[], $9::boolean[])
              AS u(d, t, det, cat, amt, typ, rec)`,
        [
          req.params.id,
          req.user.id,
          transactions.map((t: any) => t.date),
          transactions.map((t: any) => t.tiers),
          transactions.map((t: any) => t.details),
          transactions.map((t: any) => t.category),
          transactions.map((t: any) => t.amount),
          transactions.map((t: any) => t.transaction_type),
          transactions.map((t: any) => t.is_reconciled),
        ]
      );
      await client.query('COMMIT');
      if (req.user && transactions.length > 0) broadcastTransactionsChanged(req.user.id, req.params.id);
      res.json({ imported: transactions.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ error: errMsg(err) });
  }
});

export default router;
