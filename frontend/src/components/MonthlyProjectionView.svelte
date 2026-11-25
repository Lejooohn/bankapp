<script lang="ts">
  
  import { onDestroy, tick, untrack } from 'svelte';
  import ApexCharts from 'apexcharts';
  import { t, lang } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';

  let { account } = $props();

  const CREDIT_TYPES = new Set(['Versement', 'Virement reçu', 'Dépôt de chèque']);
  const PAST_MONTHS = 6;
  const FUTURE_MONTHS = 6;
  const TODAY_INDEX = PAST_MONTHS - 1;

  let currentBalance = 0;
  let schedules = [];
  let months = $state([]);
  let hasData = $state(false);
  let loading = $state(true);
  let error = $state('');
  let lastAccountId = $state(null);
  let currentLoadId = 0;
  let chartProjection: ApexCharts;


  function monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  }

  async function loadData() {
    const thisLoadId = ++currentLoadId;

    try {
      loading = true;
      error = '';
      const [summary, schedulesData, balanceHistory, expensesByMonth] = await Promise.all([
        api.get(`/api/accounts/${account.id}/summary`),
        api.get(`/api/accounts/${account.id}/schedules`),
        api.get(`/api/accounts/${account.id}/stats/balance-history`),
        api.get(`/api/accounts/${account.id}/stats/expenses-by-month`)
      ]);

      if (thisLoadId !== currentLoadId) return;

      currentBalance = summary.total || 0;
      schedules = schedulesData;
      hasData = schedulesData.length > 0 || balanceHistory.length > 0;
      months = buildTimeline(balanceHistory, expensesByMonth);
    } catch (e) {
      console.error('Error loading projection data:', e);
      error = e.message || $t('Erreur lors du chargement de la projection');
    }
    if (thisLoadId === currentLoadId) {
      loading = false;
      await tick();
      if (hasData) {
        renderChart();
      }
    }
  }

  function buildTimeline(balanceHistory: any[], expensesByMonth: any[]) {
    const today = new Date();
    const balanceByMonth = new Map(balanceHistory.map((r: any) => [r.month, r.balance]));
    const flowByMonth = new Map(expensesByMonth.map((r: any) => [r.month, r]));

    const timeline = [];
    let lastKnownBalance = balanceHistory.length ? balanceHistory[0].balance : currentBalance;

    // i = 0 is the current month (included as "real" since it's in progress)
    for (let i = PAST_MONTHS - 1; i >= 0; i--) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = monthKey(monthDate);
      const flow = flowByMonth.get(key);
      const balance = i === 0 ? currentBalance : (balanceByMonth.has(key) ? balanceByMonth.get(key) : lastKnownBalance);
      lastKnownBalance = balance;

      timeline.push({
        month: monthDate,
        revenue: flow?.income || 0,
        expense: flow?.expenses || 0,
        balance,
        real: true
      });
    }

    let balance = currentBalance;
    for (let i = 1; i <= FUTURE_MONTHS; i++) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();

      let revenue = 0;
      let expense = 0;

      schedules.forEach(s => {
        if (scheduleOccursInMonth(s, year, month)) {
          const amount = parseFloat(s.amount?.toString().replace(',', '.') || '0') || 0;
          const isExpense = !CREDIT_TYPES.has(s.transaction_type);
          if (isExpense) expense += amount; else revenue += amount;
        }
      });

      balance = balance + revenue - expense;

      timeline.push({ month: monthDate, revenue, expense, balance, real: false });
    }

    return timeline;
  }

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

    const isActive = !schedule.end_date || new Date(schedule.end_date) >= monthStart;
    if (!isActive || startDate > monthEnd) return false;

    const monthsFromStart = (year - startDate.getFullYear()) * 12 + (month - startDate.getMonth());
    const interval = getFrequencyMonthInterval(schedule.frequency);

    return monthsFromStart >= 0 && monthsFromStart % interval === 0;
  }

  function formatMonthYear(date: Date) {
    return date.toLocaleDateString(($lang === 'fr' ? 'fr-FR' : 'en-US'), {
      month: 'long',
      year: 'numeric'
    });
  }

  function formatMonthShort(date: Date) {
    return date.toLocaleDateString(($lang === 'fr' ? 'fr-FR' : 'en-US'), {
      month: 'short',
      year: '2-digit'
    });
  }

  function renderChart() {
    try {
      if (chartProjection) {
        chartProjection.destroy();
        chartProjection = undefined;
      }

      if (!months.length) return;
      
      // Check if chart element exists in DOM
      const chartEl = document.querySelector('#chart-projection');
      if (!chartEl) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const textColor = token('--text-3');
    const gridColor = token('--border');
    const realColor = token('--chart-accent');
    const projectedColor = token('--acct-investment');

    const round = (v: number) => Math.round(v * 100) / 100;
    const realData = months.map((m, idx) => idx <= TODAY_INDEX ? round(m.balance) : null);
    const projectedData = months.map((m, idx) => idx >= TODAY_INDEX ? round(m.balance) : null);

    chartProjection = new ApexCharts(document.querySelector('#chart-projection'), {
      series: [
        { name: $t('Réel'), data: realData },
        { name: $t('Projeté'), data: projectedData }
      ],
      chart: { type: 'area', height: 280, toolbar: { show: false } },
      colors: [realColor, projectedColor],
      stroke: { curve: 'smooth', width: [2.5, 2.5], dashArray: [0, 6] },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: [0.35, 0.12], opacityTo: 0, stops: [0, 90, 100] }
      },
      markers: { size: 3, strokeWidth: 0, colors: [realColor, projectedColor] },
      dataLabels: { enabled: false },
      xaxis: {
        categories: months.map(m => formatMonthShort(m.month)),
        labels: { style: { colors: textColor, fontSize: '12px' } },
        axisBorder: { color: gridColor },
        axisTicks: { color: gridColor }
      },
      yaxis: {
        labels: {
          style: { colors: textColor, fontSize: '12px' },
          formatter: (val: number) => formatAmount(val)
        }
      },
      grid: { borderColor: gridColor, strokeDashArray: 3 },
      annotations: {
        xaxis: [{
          x: formatMonthShort(months[TODAY_INDEX].month),
          borderColor: textColor,
          strokeDashArray: 4,
          label: {
            text: $t('Aujourd\'hui'),
            style: { color: textColor, background: 'transparent', fontSize: '11px' },
            orientation: 'horizontal'
          }
        }]
      },
      legend: { show: true, fontSize: '12px', labels: { colors: textColor } },
      tooltip: {
        theme: isDark ? 'dark' : 'light',
        y: { formatter: (val: number) => formatAmount(val) }
      }
    });
    chartProjection.render();
    } catch (err) {
      console.error('Error rendering projection chart:', err);
    }
  }

  onDestroy(() => {
    chartProjection?.destroy();
  });
  $effect.pre(() => {
    const id = account?.id;
    untrack(() => {
      if (id && id !== lastAccountId) {
        lastAccountId = id;
        loadData();
      }
    });
  });
</script>

<div class="page-header">
  <h1 class="page-title">{$t('Solde prévisionnel')}</h1>
  <p class="page-meta">{$t('6 derniers mois et 6 prochains mois')}</p>
</div>

{#if error}
  <div class="error-banner" role="alert">
    {error}
    <button class="error-banner-close" onclick={() => (error = '')} aria-label={$t('Fermer')}>×</button>
  </div>
{/if}

{#if loading}
  <div class="state-loading">{$t('Chargement des données financières…')}</div>
{:else if !hasData}
  <div class="state-empty">{$t('Aucune transaction ou échéance disponible pour générer une projection.')}</div>
{:else}
  <div class="chart-container">
    <div class="chart-header">
      <h3>{$t('Évolution du solde')}</h3>
    </div>
    <div id="chart-projection"></div>
  </div>

  <div class="table-container">
    <h3>{$t('Détail mensuel')}</h3>
    <table class="categories-table">
      <thead>
        <tr>
          <th>{$t('Mois')}</th>
          <th class="amount-col">{$t('Revenus')}</th>
          <th class="amount-col">{$t('Dépenses')}</th>
          <th class="amount-col">{$t('Solde')}</th>
        </tr>
      </thead>
      <tbody>
        {#each months as m, idx}
          <tr class:current-row={idx === TODAY_INDEX}>
            <td>
              {formatMonthYear(m.month)}
              <span class="type-tag" class:real={m.real}>{m.real ? $t('Réel') : $t('Projeté')}</span>
              {#if idx === TODAY_INDEX}
                <span class="current-tag">{$t('Mois en cours')}</span>
              {/if}
            </td>
            <td class="amount-col credit-text">{m.revenue > 0 ? '+' + formatAmount(m.revenue) : '—'}</td>
            <td class="amount-col debit-text">{m.expense > 0 ? '−' + formatAmount(m.expense) : '—'}</td>
            <td class="amount-col balance-cell" class:credit-text={m.balance >= 0} class:debit-text={m.balance < 0}>
              {formatAmount(m.balance)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="disclaimer">{$t('Les mois futurs sont estimés à partir des échéances actives. Les montants sont indicatifs.')}</div>
{/if}

<style>
  .page-header {
    margin-bottom: 24px;
  }

  .page-title {
    font-family: var(--font-ui);
    font-size: 22px;
    font-weight: 700;
    color: var(--text-1);
    letter-spacing: -0.4px;
  }

  .page-meta {
    font-size: 12.5px;
    color: var(--text-2);
    margin-top: 3px;
  }

  .chart-container,
  .table-container {
    background: var(--card);
    border-radius: 10px;
    padding: 16px;
    border: 1px solid var(--border);
    margin-bottom: 24px;
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 12px;
  }

  .chart-container h3,
  .table-container h3 {
    margin: 0 0 16px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chart-header h3 {
    margin: 0;
  }

  .categories-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: var(--font-ui);
  }

  .categories-table thead {
    background: var(--surface);
  }

  .categories-table th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
  }

  .categories-table th.amount-col {
    text-align: right;
  }

  .categories-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text-1);
  }

  .categories-table tr:last-child td {
    border-bottom: none;
  }

  .amount-col {
    text-align: right;
    font-family: var(--font-mono);
  }

  .categories-table td.credit-text {
    color: var(--credit);
  }

  .categories-table td.debit-text {
    color: var(--debit);
  }

  .balance-cell {
    font-weight: 600;
  }

  .type-tag {
    display: inline-block;
    margin-left: 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
  }

  .type-tag.real {
    color: var(--text-2);
  }

  .current-row {
    background: var(--cobalt-light);
  }

  .current-row td:first-child {
    border-left: 3px solid var(--cobalt);
    padding-left: 9px;
    font-weight: 600;
  }

  .current-tag {
    display: inline-block;
    margin-left: 8px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cobalt);
    background: var(--cobalt-dim);
    padding: 2px 7px;
    border-radius: 10px;
  }

  .disclaimer {
    font-size: 12.5px;
    color: var(--text-3);
    padding: 12px 16px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: var(--danger-bg);
    border: 1px solid rgba(220,38,38,0.25);
    border-radius: 7px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--debit);
    margin-bottom: 16px;
  }

  .error-banner-close {
    background: none;
    border: none;
    color: var(--debit);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 2px;
    flex-shrink: 0;
  }
</style>
