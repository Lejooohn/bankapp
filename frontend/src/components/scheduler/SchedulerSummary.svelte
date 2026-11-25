<script lang="ts">
  import { t } from '../../lib/i18n.ts';
  import { fmtEur } from './schedule-utils.ts';

  let { debits, credits, totalDebit, totalCredit, debitLabel, creditLabel, balance }: {
    debits: number;
    credits: number;
    totalDebit: number;
    totalCredit: number;
    debitLabel: string;
    creditLabel: string;
    balance: number;
  } = $props();
</script>

<!-- Summary stats -->
<div class="sched-summary">
  <div class="sched-stat">
    <span class="sched-stat-label">{$t('Débits')}</span>
    <span class="sched-stat-count">{debits} {debitLabel}</span>
    <span class="sched-stat-amount debit">{totalDebit.toFixed(2)} €</span>
  </div>
  <div class="sched-stat-sep"></div>
  <div class="sched-stat">
    <span class="sched-stat-label">{$t('Crédits')}</span>
    <span class="sched-stat-count">{credits} {creditLabel}</span>
    <span class="sched-stat-amount credit">{totalCredit.toFixed(2)} €</span>
  </div>
  <div class="sched-stat-sep"></div>
  <div class="sched-stat">
    <span class="sched-stat-label">{$t('Balance nette mensuelle')}</span>
    <span class="sched-stat-count" style="visibility:hidden;">—</span>
    <span class="sched-stat-amount {balance >= 0 ? 'credit' : 'debit'}" style="font-size:16px;">
      {fmtEur(balance)}
    </span>
  </div>
</div>

<style>
  /* ── Summary ── */
  .sched-summary {
    display: grid; grid-template-columns: 1fr auto 1fr auto 1fr;
    align-items: center; gap: 0;
    padding: 20px 24px; background: var(--card);
    border: 1px solid var(--border); border-radius: 10px; margin-bottom: 16px;
  }
  .sched-stat { display: flex; flex-direction: column; gap: 6px; text-align: center; }
  .sched-stat-sep { width: 1px; height: 50px; background: var(--border); }
  .sched-stat-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--text-3); font-family: var(--font-ui);
  }
  .sched-stat-count { font-size: 12px; color: var(--text-2); font-family: var(--font-ui); }
  .sched-stat-amount { font-size: 16px; font-weight: 700; font-family: var(--font-mono); }
  .sched-stat-amount.debit  { color: var(--debit); }
  .sched-stat-amount.credit { color: var(--credit); }
</style>
