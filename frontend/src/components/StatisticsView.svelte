<script lang="ts">
  
  import { onMount, onDestroy, untrack } from 'svelte';
  import ApexCharts from 'apexcharts';
  import { t, lang } from '../lib/i18n.ts';
  import { api, subscribeToEvents } from '../lib/api.js';
  import { theme } from '../lib/theme.ts';
  import { catDotStyle } from '../utils/categoryColor.js';
  import Icon from './Icon.svelte';
  import CategoryRanking from './statistics/CategoryRanking.svelte';

  let { account } = $props();

  let loading = $state(true);
  let expensesByMonth = $state([]);
  let topCategories = $state([]);
  let chartBarExpenses: ApexCharts;
  let unsubscribeEvents: () => void;
  let error = $state('');

  let selectedMonth = $state(new Date().toISOString().slice(0, 7));
  let monthCategoriesData = $state([]);

  let selectedYear = $state(parseInt(selectedMonth.split('-')[0]));
  let selectedMonthNum = $state(parseInt(selectedMonth.split('-')[1]));
  let showMonthPicker = false;

  $effect.pre(() => {
    const year = selectedYear;
    const month = String(selectedMonthNum).padStart(2, '0');
    untrack(() => {
      selectedMonth = `${year}-${month}`;
    });
  });

  async function loadStats() {
    const [exp, cat] = await Promise.all([
      api.get(`/api/accounts/${account.id}/stats/expenses-by-month`),
      api.get(`/api/accounts/${account.id}/stats/top-categories`)
    ]);

    expensesByMonth = exp;
    topCategories = cat;
  }

  async function loadMonthCategories(month: string) {
    const data = await api.get(`/api/accounts/${account.id}/stats/categories-by-month?month=${month}`);
    monthCategoriesData = data;
  }

  async function refreshStats() {
    try {
      await loadStats();
      error = '';
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des statistiques');
    }
  }

  function formatAmount(value: number) {
    return new Intl.NumberFormat(($lang === 'fr' ? 'fr-FR' : 'en-US'), {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  }

  function formatDate(dateStr: string) {
    const [year, month] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString(($lang === 'fr' ? 'fr-FR' : 'en-US'), {
      month: 'short',
      year: '2-digit'
    });
  }

  // Axis ticks: whole euros, the tooltip and the lists carry the cents.
  function formatAxis(value: number) {
    return new Intl.NumberFormat(($lang === 'fr' ? 'fr-FR' : 'en-US'), {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(value);
  }

  // Expenses are the series to follow: they take the accent, income stays neutral beside it.
  function renderCharts() {
    chartBarExpenses?.destroy();
    chartBarExpenses = undefined;

    const el = document.querySelector<HTMLElement>('#chart-expenses');
    if (!el || expensesByMonth.length === 0) return;

    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const labels = { colors: token('--text-3'), fontSize: '12px', fontFamily: token('--font-mono') };

    chartBarExpenses = new ApexCharts(el, {
      series: [
        { name: $t('Revenus'), data: expensesByMonth.map(m => m.income) },
        { name: $t('Dépenses'), data: expensesByMonth.map(m => m.expenses) }
      ],
      chart: {
        type: 'bar',
        height: 520,
        fontFamily: token('--font-ui'),
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false }
      },
      // Thin columns rounded at the data end; the transparent stroke is the gap inside a pair.
      plotOptions: { bar: { columnWidth: '44%', borderRadius: 4, borderRadiusApplication: 'end' } },
      dataLabels: { enabled: false },
      stroke: { show: true, width: 2, colors: ['transparent'] },
      colors: [token('--chart-neutral'), token('--chart-accent')],
      fill: { opacity: 1 },
      xaxis: {
        categories: expensesByMonth.map(m => formatDate(m.month)),
        labels: { style: labels, rotate: 0, hideOverlappingLabels: true },
        axisBorder: { color: token('--border') },
        axisTicks: { show: false },
        crosshairs: { show: false }
      },
      yaxis: { tickAmount: 4, forceNiceScale: true, labels: { style: labels, formatter: formatAxis } },
      grid: { borderColor: token('--border'), strokeDashArray: 0 },
      tooltip: {
        theme: $theme,
        shared: true,
        intersect: false,
        y: { formatter: (val: number) => formatAmount(val) }
      },
      legend: {
        position: 'top',
        horizontalAlign: 'left',
        fontSize: '13px',
        labels: { colors: token('--text-2') },
        markers: { size: 5, shape: 'circle', strokeWidth: 0, offsetX: -4 },
        itemMargin: { horizontal: 12 }
      },
      // 520 is for the wide layout, where the chart stands next to the rankings
      responsive: [{
        breakpoint: 1800,
        options: { chart: { height: 320 } }
      }, {
        breakpoint: 640,
        options: {
          chart: { height: 320 },
          plotOptions: { bar: { columnWidth: '76%', borderRadius: 2 } },
          xaxis: { labels: { rotate: -45, rotateAlways: true } }
        }
      }]
    });
    chartBarExpenses.render();
  }

  // Colors and labels are read when the chart is drawn, so a theme or language change redraws it.
  $effect(() => {
    $theme; $lang; expensesByMonth; loading;
    untrack(() => { if (!loading) renderCharts(); });
  });

  async function handleMonthChange() {
    try {
      await loadMonthCategories(selectedMonth);
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des catégories');
    }
  }

  onMount(async () => {
    try {
      await Promise.all([
        loadStats(),
        loadMonthCategories(selectedMonth)
      ]);
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des statistiques');
    } finally {
      loading = false;
    }

    unsubscribeEvents = subscribeToEvents((event) => {
      if (event.type === 'transactions-changed' && event.accountId === account.id) {
        refreshStats();
      }
    });
  });

  onDestroy(() => {
    unsubscribeEvents?.();
    chartBarExpenses?.destroy();
  });
</script>

<div class="page-header">
  <h1 class="page-title">{$t('Statistiques')}</h1>
</div>

{#if error}
  <div class="error-banner" role="alert">
    {error}
    <button class="error-banner-close" onclick={() => (error = '')} aria-label={$t('Fermer')}>×</button>
  </div>
{/if}

{#if loading}
  <div class="state-loading">{$t('Chargement des statistiques…')}</div>
{:else}
  <div class="stats-grid">
    <!-- Expenses & Income by Month -->
    <div class="chart-container chart-expenses-container">
      <div class="chart-header">
        <h3>{$t('Dépenses et revenus mensuels')}</h3>
        <span class="chart-period">{$t('12 derniers mois')}</span>
      </div>
      {#if expensesByMonth.length === 0}
        <div class="state-empty">{$t('Aucune opération')}</div>
      {:else}
        <div id="chart-expenses"></div>
      {/if}
    </div>

    <!-- Top Categories -->
    <div class="chart-container">
      <div class="chart-header">
        <h3>{$t('Top 10 catégories')}</h3>
        <span class="chart-period">{$t('12 derniers mois')}</span>
      </div>
      {#if topCategories.length === 0}
        <div class="state-empty">{$t('Aucune opération')}</div>
      {:else}
        <CategoryRanking items={topCategories} format={formatAmount} />
      {/if}
    </div>

    <!-- Month Categories -->
    <div class="chart-container">
      <div class="chart-header">
        <h3>{$t('Dépenses par catégorie')}</h3>
        <div class="month-selector-wrapper">
          <Icon name="calendar" />
          <select bind:value={selectedYear} onchange={handleMonthChange} class="month-select">
            {#each [2024, 2025, 2026, 2027] as year}
              <option value={year}>{year}</option>
            {/each}
          </select>
          <select bind:value={selectedMonthNum} onchange={handleMonthChange} class="month-select">
            {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as month}
              <option value={month}>
                {new Date(2000, month - 1).toLocaleString(($lang === 'fr' ? 'fr-FR' : 'en-US'), { month: 'short' })}
              </option>
            {/each}
          </select>
        </div>
      </div>
      {#if monthCategoriesData.length === 0}
        <div class="state-empty">{$t('Aucune transaction pour ce mois')}</div>
      {:else}
        <CategoryRanking items={monthCategoriesData} format={formatAmount} />
      {/if}
    </div>

    <!-- Top Categories Table -->
    <div class="table-container">
      <div class="chart-header">
        <h3>{$t('Détail des catégories')}</h3>
        <span class="chart-period">{$t('12 derniers mois')}</span>
      </div>
      <table class="categories-table">
        <thead>
          <tr>
            <th>{$t('Catégorie')}</th>
            <th class="amount-col">{$t('Total')}</th>
            <th class="count-col">{$t('Opérations')}</th>
          </tr>
        </thead>
        <tbody>
          {#each topCategories as cat}
            <tr>
              <td>
                <span class="cat-name" style={catDotStyle(cat.name)}>{cat.name}</span>
              </td>
              <td class="amount-col">{formatAmount(cat.value)}</td>
              <td class="count-col">{cat.count}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<style>
  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 16px;
  }

  .error-banner-close {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 4px;
    flex-shrink: 0;
  }

  /* One main chart across the page, the two rankings at different widths, then the figures. */
  .stats-grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 16px;
    align-items: start;
  }
  .chart-expenses-container,
  .table-container { grid-column: 1 / -1; }

  .chart-container,
  .table-container {
    min-width: 0;
    padding: 16px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 12px;
    min-height: 32px;
    margin-bottom: 12px;
  }

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-1);
  }

  .chart-period {
    font-size: 13px;
    color: var(--text-3);
    white-space: nowrap;
  }

  /* ApexCharts reserves an empty band under the axis labels */
  #chart-expenses { min-height: 320px; margin-bottom: -24px; }

  .categories-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .categories-table th {
    height: 36px;
    padding: 0 8px;
    text-align: left;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-3);
    border-bottom: 1px solid var(--border);
  }
  .categories-table td {
    height: 40px;
    padding: 0 8px;
    border-bottom: 1px solid var(--border);
    color: var(--text-1);
  }
  .categories-table tbody tr:last-child td { border-bottom: none; }

  .cat-name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .cat-name::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dot);
  }
  :global([data-theme="dark"]) .cat-name::before { background: color-mix(in oklab, var(--dot), white 25%); }

  .categories-table .amount-col,
  .categories-table .count-col { text-align: right; }
  .categories-table td.amount-col { font-family: var(--font-mono); }
  .categories-table td.count-col { font-family: var(--font-mono); color: var(--text-2); }

  .month-selector-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-3);
    transition: background-color 150ms var(--ease);
  }
  .month-selector-wrapper:hover { background: var(--card-hover); }

  .month-select {
    border: none;
    background: transparent;
    color: var(--text-1);
    font-size: 13px;
    font-family: var(--font-ui);
    cursor: pointer;
  }
  .month-select option {
    background: var(--card);
    color: var(--text-1);
  }

  /* Wide screens: chart and both rankings on one row */
  @media (min-width: 1800px) {
    .stats-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); align-items: stretch; }
    .chart-expenses-container { grid-column: auto; }
  }

  @media (max-width: 1080px) {
    .stats-grid { grid-template-columns: minmax(0, 1fr); }
  }
</style>
