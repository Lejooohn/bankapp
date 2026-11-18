<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { t, lang } from '../lib/i18n.ts';

  interface Props {
    currentBalance?: number;
    schedules?: any;
    onClose?: any;
  }

  let { currentBalance = 0, schedules = [], onClose = () => {} }: Props = $props();

  function formatAmount(amount: number) {
    return new Intl.NumberFormat(($lang === 'fr' ? 'fr-FR' : 'en-US'), {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }

  function getFrequencyMonthInterval(frequency: string): number {
    switch (frequency?.toUpperCase()) {
      case 'MONTHLY': return 1;
      case 'QUARTERLY': return 3;
      case 'BIANNUAL': return 6;
      case 'ANNUAL': return 12;
      default: return 1;
    }
  }

  function scheduleOccursInMonth(schedule: any, year: number, month: number): boolean {
    if (!schedule.start_date) return false;

    const startDate = new Date(schedule.start_date);
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    // Check if schedule is active during this month
    const isActive = !schedule.end_date || new Date(schedule.end_date) >= monthStart;
    if (!isActive || startDate > monthEnd) return false;

    // Calculate if this schedule occurs in this month based on frequency
    const monthsFromStart = (year - startDate.getFullYear()) * 12 + (month - startDate.getMonth());
    const interval = getFrequencyMonthInterval(schedule.frequency);

    return monthsFromStart >= 0 && monthsFromStart % interval === 0;
  }

  function calculateMonthlyProjection() {
    const projections = [];
    let balance = currentBalance;

    const today = new Date();

    // Find the month of the first upcoming schedule
    let startMonthOffset = 1;
    if (schedules.length > 0) {
      const activeSchedules = schedules.filter(s => {
        if (!s.start_date) return false;
        const sDate = new Date(s.start_date);
        const isActive = !s.end_date || new Date(s.end_date) >= today;
        return isActive && sDate >= today;
      });

      if (activeSchedules.length > 0) {
        // Find the earliest schedule
        const earliestSchedule = activeSchedules.reduce((prev, current) => {
          return new Date(current.start_date) < new Date(prev.start_date) ? current : prev;
        });

        const earliestDate = new Date(earliestSchedule.start_date);
        const monthDiff = (earliestDate.getFullYear() - today.getFullYear()) * 12 +
                         (earliestDate.getMonth() - today.getMonth());
        startMonthOffset = Math.max(1, monthDiff);
      }
    }

    // Project 12 months starting from the first schedule month
    for (let i = startMonthOffset; i < startMonthOffset + 12; i++) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();

      // Calculate from schedules for each month, respecting frequency
      let revenue = 0;
      let expense = 0;
      let occurrenceCount = 0;

      schedules.forEach(s => {
        if (scheduleOccursInMonth(s, year, month)) {
          const amount = parseFloat(s.amount) || 0;
          // Check transaction_type to determine if revenue or expense
          const isExpense = s.transaction_type === 'Prélèvement';

          if (isExpense) {
            expense += amount;
          } else {
            revenue += amount;
          }
          occurrenceCount++;
        }
      });

      const netChange = revenue - expense;
      const nextBalance = balance + netChange;

      projections.push({
        month: monthDate,
        balance: nextBalance
      });

      balance = nextBalance;
    }

    return projections;
  }

  function formatMonthYear(date: Date) {
    return date.toLocaleDateString(($lang === 'fr' ? 'fr-FR' : 'en-US'), {
      month: 'long',
      year: 'numeric'
    });
  }

  let projections = $derived(calculateMonthlyProjection());
</script>

<div class="modal-overlay" onclick={self(onClose)} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
    <div class="modal-header">
      <h2 class="modal-title">{$t('Projection mensuelle')}</h2>
      <button class="modal-close" onclick={onClose} aria-label={$t('Fermer')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="modal-content">
      <div class="projection-info">
        <span class="info-label">{$t('Solde actuel')}:</span>
        <span class="info-value">{formatAmount(currentBalance)}</span>
      </div>

      <table class="projection-table">
        <thead>
          <tr>
            <th>{$t('Mois')}</th>
            <th class="amount-col">{$t('Solde projeté')}</th>
          </tr>
        </thead>
        <tbody>
          {#each projections as proj}
            <tr class="projection-row" class:negative={proj.balance < 0}>
              <td class="month-col">{formatMonthYear(proj.month)}</td>
              <td class="amount-col balance" class:positive={proj.balance >= 0} class:negative={proj.balance < 0}>
                <strong>{formatAmount(proj.balance)}</strong>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="projection-note">
        💡 {$t('Basé sur les opérations prévues dans l\'échéancier')}
      </div>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    backdrop-filter: blur(2px);
  }

  .modal-box {
    background: var(--card);
    border-radius: 14px;
    box-shadow: 0 20px 60px var(--shadow-modal);
    width: min(600px, 96vw);
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    position: relative;
  }

  .modal-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-1);
    margin: 0;
    font-family: 'Inter', sans-serif;
    flex: 1;
    text-align: center;
  }

  .modal-close {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--text-3);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 0.1s, background 0.1s;
    position: absolute;
    right: 24px;
    top: 50%;
    transform: translateY(-50%);
  }

  .modal-close:hover {
    color: var(--text-1);
    background: var(--surface);
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .projection-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    background: var(--surface);
    border-radius: 8px;
  }

  .info-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-2);
  }

  .info-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-1);
    font-family: 'Fira Code', monospace;
  }

  .projection-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: 'Inter', sans-serif;
  }

  .projection-table thead {
    background: var(--surface);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .projection-table th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
  }

  .projection-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }

  .month-col {
    font-weight: 500;
    color: var(--text-1);
    border-right: 1px solid var(--border);
  }

  .projection-table .amount-col {
    text-align: right;
    font-family: 'Fira Code', monospace;
    padding-right: 24px;
    padding-left: 12px;
  }

  .balance {
    font-weight: 700;
  }

  .balance.positive {
    color: #10b981;
  }

  .balance.negative {
    color: #ef4444;
  }

  .projection-row.negative {
    background: rgba(239, 68, 68, 0.05);
  }

  .projection-note {
    font-size: 12px;
    color: var(--text-3);
    text-align: center;
    padding: 12px;
    background: var(--surface);
    border-radius: 6px;
  }
</style>
