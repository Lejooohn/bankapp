// export API routes (mounted from index.ts).
import express from 'express';

import PDFDocument from 'pdfkit';
import pool from '../db.js';
import { checkAccountOwnership, errMsg } from '../lib/shared.js';

const router = express.Router();

// ── Stats ─────────────────────────────────────────────────────────────────────

// ── Export ────────────────────────────────────────────────────────────────────

router.get('/api/accounts/:id/transactions/export', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { format, from, to, category, search, type } = req.query as Record<string, string>;
  try {
    if (!(await checkAccountOwnership(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const accRes = await pool.query('SELECT name FROM accounts WHERE id = $1', [req.params.id]);
    if (!accRes.rows.length) return res.status(404).json({ error: 'Account not found' });
    const accountName: string = accRes.rows[0].name;

    const conditions = ['account_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [req.params.id];
    let p = 2;
    if (from)     { conditions.push(`date >= $${p++}`); params.push(from); }
    if (to)       { conditions.push(`date <= $${p++}`); params.push(to); }
    if (category) { conditions.push(`category = $${p++}`); params.push(category); }
    if (search)   { conditions.push(`(tiers ILIKE $${p} OR details ILIKE $${p})`); params.push(`%${search}%`); p++; }
    if (type)     { conditions.push(`transaction_type = $${p++}`); params.push(type); }

    const result = await pool.query(
      `SELECT date, tiers, details, category, transaction_type, amount, is_reconciled
       FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY date DESC LIMIT 10000`,
      params
    );
    const rows = result.rows;
    const today = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bankapp-export-${today}.csv"`);
      const esc = (s: string) => {
        const v = (s || '').replace(/"/g, '""');
        return `"${/^[=+\-@\t\r]/.test(v) ? "'" + v : v}"`;
      };
      const fmtDate = (d: any) => new Date(d).toISOString().split('T')[0];
      const lines = [
        '﻿Date,Tiers,Détails,Catégorie,Type,Montant,Rapproché',
        ...rows.map((r: any) => [
          fmtDate(r.date),
          esc(r.tiers),
          esc(r.details || ''),
          esc(r.category || ''),
          esc(r.transaction_type || ''),
          parseFloat(r.amount).toFixed(2),
          r.is_reconciled ? 'Oui' : 'Non',
        ].join(',')),
      ];
      return res.send(lines.join('\r\n'));
    }

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="bankapp-export-${today}.pdf"`);
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      doc.pipe(res);

      const pageWidth = doc.page.width;
      const contentLeft = 40, contentRight = 555, contentWidth = contentRight - contentLeft;

      // ── Header banner ──────────────────────────────────────────────────────
      const bannerHeight = 92;
      doc.rect(0, 0, pageWidth, bannerHeight).fill('#2563EB');
      doc.rect(0, bannerHeight, pageWidth, 3).fill('#1E40AF');
      doc.font('Helvetica-Bold').fontSize(19).fillColor('#FFFFFF').text('BankApp', contentLeft, 26, { lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor('#DBEAFE').text('Export des transactions', contentLeft, 50, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF')
         .text(accountName, contentLeft, 26, { width: contentWidth, align: 'right', lineBreak: false });
      const period = [from && `du ${from}`, to && `au ${to}`].filter(Boolean).join(' ') || 'Toutes périodes';
      doc.font('Helvetica').fontSize(9).fillColor('#DBEAFE')
         .text(period, contentLeft, 46, { width: contentWidth, align: 'right', lineBreak: false });
      const filterParts = [category && `Catégorie: ${category}`, search && `Recherche: ${search}`, type && `Type: ${type}`].filter(Boolean);
      if (filterParts.length) {
        doc.font('Helvetica').fontSize(8).fillColor('#BFDBFE')
           .text(filterParts.join('  ·  '), contentLeft, 63, { width: contentWidth, align: 'right', lineBreak: false });
      }
      doc.y = bannerHeight + 22;

      // ── Column widths: fit to content, cap so the table stays readable ─────
      doc.font('Helvetica').fontSize(8);
      const measure = (s: string) => doc.widthOfString(s || '');
      let tiersW = measure('Tiers'), catW = measure('Catégorie'), typeW = measure('Type');
      for (const r of rows as any[]) {
        tiersW = Math.max(tiersW, measure(r.tiers || ''));
        catW = Math.max(catW, measure(r.category || ''));
        typeW = Math.max(typeW, measure(r.transaction_type || ''));
      }
      const PAD = 14;
      tiersW += PAD; catW += PAD; typeW += PAD;
      const dateW = 60, amountW = 75;
      const minTiers = 55, minCat = 55, minType = 45;
      const maxTiers = 190, maxCat = 190, maxType = 90;
      tiersW = Math.min(Math.max(tiersW, minTiers), maxTiers);
      catW = Math.min(Math.max(catW, minCat), maxCat);
      typeW = Math.min(Math.max(typeW, minType), maxType);
      const available = contentWidth - dateW - amountW;
      const sum = tiersW + catW + typeW;
      if (sum > available) {
        let excess = sum - available;
        const shrinkTiers = Math.min(excess, tiersW - minTiers);
        tiersW -= shrinkTiers; excess -= shrinkTiers;
        if (excess > 0) {
          const shrinkType = Math.min(excess, typeW - minType);
          typeW -= shrinkType; excess -= shrinkType;
        }
        if (excess > 0) catW = Math.max(minCat, catW - excess);
      } else if (sum < available) {
        // Give the extra room to Catégorie first (the column users need widest), then Tiers
        const leftover = available - sum;
        const catBoost = Math.min(leftover, maxCat - catW);
        catW += catBoost;
        tiersW = Math.min(maxTiers, tiersW + (leftover - catBoost));
      }

      const C = { date: contentLeft, tiers: 0, cat: 0, type: 0, amount: 0 };
      C.tiers = C.date + dateW;
      C.cat = C.tiers + tiersW;
      C.type = C.cat + catW;
      C.amount = C.type + typeW;
      const W = { date: dateW, tiers: tiersW, cat: catW, type: typeW, amount: amountW };

      const fitText = (text: string, maxWidth: number) => {
        let s = text || '';
        if (doc.widthOfString(s) <= maxWidth) return s;
        while (s.length > 0 && doc.widthOfString(s + '…') > maxWidth) s = s.slice(0, -1);
        return s + '…';
      };

      const drawTableHeader = () => {
        const headerY = doc.y;
        doc.rect(contentLeft, headerY - 4, contentWidth, 18).fill('#EFF6FF');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#1E3A8A');
        doc.text('Date',      C.date,   headerY, { width: W.date,   lineBreak: false });
        doc.text('Tiers',     C.tiers,  headerY, { width: W.tiers,  lineBreak: false });
        doc.text('Catégorie', C.cat,    headerY, { width: W.cat,    lineBreak: false });
        doc.text('Type',      C.type,   headerY, { width: W.type,   lineBreak: false });
        doc.text('Montant',   C.amount, headerY, { width: W.amount, align: 'right', lineBreak: false });
        doc.y = headerY + 16;
      };

      drawTableHeader();

      let totalIncome = 0, totalExpenses = 0;
      doc.font('Helvetica').fontSize(8);
      for (let ri = 0; ri < rows.length; ri++) {
        if (doc.y > 760) {
          doc.addPage();
          drawTableHeader();
          doc.font('Helvetica').fontSize(8);
        }
        const r = rows[ri] as any;
        const amount = parseFloat(r.amount);
        if (amount >= 0) totalIncome += amount; else totalExpenses += Math.abs(amount);
        const rowY = doc.y;
        if (ri % 2 === 0) doc.rect(contentLeft, rowY - 2, contentWidth, 14).fill('#F8FAFC');
        doc.fillColor('#334155');
        doc.text(new Date(r.date).toISOString().split('T')[0],       C.date,   rowY, { width: W.date,  lineBreak: false });
        doc.text(fitText(r.tiers || '', W.tiers),                    C.tiers,  rowY, { width: W.tiers, lineBreak: false });
        doc.text(fitText(r.category || '', W.cat),                   C.cat,    rowY, { width: W.cat,   lineBreak: false });
        doc.text(fitText(r.transaction_type || '', W.type),          C.type,   rowY, { width: W.type,  lineBreak: false });
        doc.fillColor(amount >= 0 ? '#166534' : '#991B1B')
           .text((amount >= 0 ? '+' : '') + amount.toFixed(2).replace('.', ',') + ' €', C.amount, rowY, { width: W.amount, align: 'right', lineBreak: false });
        doc.y = rowY + 14;
      }

      // ── Summary cards ────────────────────────────────────────────────────
      if (doc.y > 730) { doc.addPage(); }
      doc.moveDown(0.6);
      doc.moveTo(contentLeft, doc.y).lineTo(contentRight, doc.y).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
      doc.moveDown(0.6);
      doc.font('Helvetica').fontSize(9).fillColor('#64748B')
         .text(`${rows.length} opération${rows.length !== 1 ? 's' : ''}`, contentLeft, doc.y, { width: contentWidth });
      doc.moveDown(0.5);

      const net = totalIncome - totalExpenses;
      const boxY = doc.y, boxH = 42, boxGap = 12;
      const boxW = (contentWidth - boxGap * 2) / 3;
      const statBoxes = [
        { x: contentLeft,                          label: 'Revenus',  value: `+${totalIncome.toFixed(2).replace('.', ',')} €`, bg: '#F0FDF4', fg: '#166534' },
        { x: contentLeft + boxW + boxGap,           label: 'Dépenses', value: `-${totalExpenses.toFixed(2).replace('.', ',')} €`, bg: '#FEF2F2', fg: '#991B1B' },
        { x: contentLeft + (boxW + boxGap) * 2,     label: 'Net',      value: `${net >= 0 ? '+' : ''}${net.toFixed(2).replace('.', ',')} €`, bg: net >= 0 ? '#F0FDF4' : '#FEF2F2', fg: net >= 0 ? '#166534' : '#991B1B' },
      ];
      for (const b of statBoxes) {
        doc.roundedRect(b.x, boxY, boxW, boxH, 6).fill(b.bg);
        doc.font('Helvetica').fontSize(8).fillColor(b.fg).text(b.label.toUpperCase(), b.x + 10, boxY + 8, { width: boxW - 20, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(13).fillColor(b.fg).text(b.value, b.x + 10, boxY + 21, { width: boxW - 20, lineBreak: false });
      }
      doc.y = boxY + boxH;

      // ── Footer: page numbers + generation date on every page ───────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.height - 30;
        doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8');
        doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} — BankApp`, contentLeft, bottom, { width: 250, lineBreak: false });
        doc.text(`Page ${i - range.start + 1} / ${range.count}`, contentLeft, bottom, { width: contentWidth, align: 'right', lineBreak: false });
      }

      doc.end();
      return;
    }

    res.status(400).json({ error: 'format must be csv or pdf' });
  } catch (err: any) { res.status(500).json({ error: errMsg(err) }); }
});

export default router;
