<script lang="ts">
  
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import ApexCharts from 'apexcharts';
  import { t, lang } from '../lib/i18n.ts';
  import { api, subscribeToEvents } from '../lib/api.js';
  import { catStyle } from '../utils/categoryColor.js';

  let { account } = $props();

  let loading = $state(true);
  let expensesByMonth = [];
  let topCategories = $state([]);
  let chartBarExpenses: ApexCharts;
  let chartPieCategories: ApexCharts;
  let chartMonthCategories: ApexCharts;
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
      await tick();
      renderCharts();
      error = '';
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des statistiques');
    }
  }

  function formatAmount(value: number) {
    return new Intl.NumberFormat(($lang === 'fr' ? 'fr-FR' : 'en-US'), {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0
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

  function formatCategoryTooltip(total: number, avgPerMonth: number): string {
    const avgLabel = $t('Moy.');
    return `${formatAmount(total)} — ${avgLabel} ${formatAmount(avgPerMonth)}${$t('/mois')}`;
  }

  function renderCharts() {
    if (chartBarExpenses) {
      chartBarExpenses.destroy();
      chartBarExpenses = undefined;
    }
    if (chartPieCategories) {
      chartPieCategories.destroy();
      chartPieCategories = undefined;
    }
    if (chartMonthCategories) {
      chartMonthCategories.destroy();
      chartMonthCategories = undefined;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    // Bar Chart - Expenses & Income
    if (expensesByMonth.length > 0) {
      chartBarExpenses = new ApexCharts(document.querySelector('#chart-expenses'), {
        series: [
          { name: $t('Revenus'), data: expensesByMonth.map(m => m.income) },
          { name: $t('Dépenses'), data: expensesByMonth.map(m => m.expenses) }
        ],
        chart: { type: 'bar', height: 300, toolbar: { show: false }, sparkline: { enabled: false } },
        plotOptions: { bar: { horizontal: false, columnWidth: '55%', dataLabels: { position: 'top' } } },
        dataLabels: { enabled: false },
        stroke: { show: true, width: 2, colors: ['transparent'] },
        xaxis: {
          categories: expensesByMonth.map(m => formatDate(m.month)),
          labels: { style: { colors: textColor, fontSize: '12px' } }
        },
        yaxis: { labels: { style: { colors: textColor, fontSize: '12px' } } },
        fill: { opacity: 0.85 },
        grid: { borderColor: gridColor },
        colors: ['#10b981', '#ef4444'],
        tooltip: {
          theme: isDark ? 'dark' : 'light',
          y: {
            formatter: (val: number) => formatAmount(val)
          }
        },
        legend: {
          position: 'bottom',
          fontSize: '12px',
          labels: {
            colors: textColor
          }
        }
      });
      chartBarExpenses.render();
    }

// Pie Chart - Top Categories
    if (topCategories.length > 0) {
      chartPieCategories = new ApexCharts(document.querySelector('#chart-categories'), {
        series: topCategories.map(c => c.value),
        chart: { type: 'pie', height: 450, toolbar: { show: false } },
        labels: topCategories.map(c => c.name),
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'],
        plotOptions: {
          pie: {
            dataLabels: {
              offset: 0
            },
            donut: {
              size: '65%'
            }
          }
        },
        dataLabels: {
          formatter: (val: number, { seriesIndex }) => {
            const total = topCategories.reduce((sum, c) => sum + c.value, 0);
            const percentage = Math.round((topCategories[seriesIndex].value / total) * 100);
            return percentage + '%';
          },
          style: {
            colors: ['#ffffff'],
            fontSize: '16px',
            fontWeight: 600
          },
          dropShadow: {
            enabled: true,
            top: 2,
            left: 2,
            blur: 6,
            opacity: 0.8,
            color: '#000000'
          }
        },
        tooltip: {
          theme: isDark ? 'dark' : 'light',
          y: {
            formatter: (val: number, { seriesIndex }) => {
              const cat = topCategories[seriesIndex];
              return formatCategoryTooltip(val, cat.avgPerMonth);
            }
          }
        },
        legend: {
          position: 'bottom',
          fontSize: '12px',
          labels: {
            colors: textColor
          }
        }
      });
      chartPieCategories.render();
    }

    // Pie Chart - Month Categories
    if (monthCategoriesData.length > 0) {
      chartMonthCategories = new ApexCharts(document.querySelector('#chart-month-categories'), {
        series: monthCategoriesData.map(c => c.value),
        chart: { type: 'pie', height: 450, toolbar: { show: false } },
        labels: monthCategoriesData.map(c => c.name),
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'],
        plotOptions: {
          pie: {
            dataLabels: {
              offset: 0
            },
            donut: {
              size: '65%'
            }
          }
        },
        dataLabels: {
          formatter: (val: number, { seriesIndex }) => {
            const total = monthCategoriesData.reduce((sum, c) => sum + c.value, 0);
            const percentage = Math.round((monthCategoriesData[seriesIndex].value / total) * 100);
            return percentage + '%';
          },
          style: {
            colors: ['#ffffff'],
            fontSize: '16px',
            fontWeight: 600
          },
          dropShadow: {
            enabled: true,
            top: 2,
            left: 2,
            blur: 6,
            opacity: 0.8,
            color: '#000000'
          }
        },
        tooltip: {
          theme: isDark ? 'dark' : 'light',
          y: {
            formatter: (val: number) => formatAmount(val)
          }
        },
        legend: {
          position: 'bottom',
          fontSize: '12px',
          labels: {
            colors: textColor
          }
        }
      });
      chartMonthCategories.render();
    }
  }

  async function handleMonthChange() {
    try {
      await loadMonthCategories(selectedMonth);
      await tick();
      renderCharts();
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
    await tick();
    renderCharts();

    unsubscribeEvents = subscribeToEvents((event) => {
      if (event.type === 'transactions-changed' && event.accountId === account.id) {
        refreshStats();
      }
    });
  });

  onDestroy(() => {
    unsubscribeEvents?.();
    chartBarExpenses?.destroy();
    chartPieCategories?.destroy();
    chartMonthCategories?.destroy();
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
      <div id="chart-expenses"></div>
    </div>

    <!-- Top Categories -->
    <div class="chart-container pie-chart-container">
      <div class="chart-header">
        <h3>{$t('Top 10 catégories')}</h3>
        <span class="chart-period">{$t('12 derniers mois')}</span>
      </div>
      <div id="chart-categories"></div>
    </div>

    <!-- Month Categories -->
    <div class="chart-container pie-chart-container">
      <div class="chart-header">
        <h3>{$t('Dépenses par catégorie')}</h3>
        <div class="month-selector-wrapper">
          <svg class="month-selector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
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
        <div style="padding: 40px; text-align: center; color: var(--text-3);">
          {$t('Aucune transaction pour ce mois')}
        </div>
      {:else}
        <div id="chart-month-categories"></div>
      {/if}
    </div>

    <!-- Top Categories Table -->
    <div class="table-container">
      <div style="display: flex; align-items: baseline; gap: 8px;">
        <h3>{$t('Détail des catégories')}</h3>
        <span style="font-size: 12px; color: var(--text-3);">{$t('12 derniers mois')}</span>
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
                <span class="cat-badge" style="font-size: 12.5px; padding: 3px 10px; {catStyle(cat.name)}">{cat.name}</span>
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
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 13px;
    color: #c00;
    margin-bottom: 16px;
  }

  .error-banner-close {
    background: none;
    border: none;
    color: #c00;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 2px;
    flex-shrink: 0;
  }

  .page-header {
    margin-bottom: 24px;
  }

  .page-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-1);
    margin: 0;
    font-family: 'Inter', sans-serif;
  }

  .stats-grid {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .chart-expenses-container {
    width: 100%;
  }

  .chart-container {
    background: var(--surface);
    border-radius: 10px;
    padding: 16px;
    border: 1px solid var(--border);
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 12px;
  }

  .chart-container h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chart-period {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-3);
    white-space: nowrap;
  }

  .pie-chart-container {
    width: 100%;
  }


  .table-container {
    width: 100%;
    background: var(--surface);
    border-radius: 10px;
    padding: 16px;
    border: 1px solid var(--border);
  }

  .table-container h3 {
    margin: 0 0 16px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .categories-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: 'Inter', sans-serif;
  }

  .categories-table thead {
    background: var(--card);
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

  .categories-table th.count-col {
    text-align: center;
  }

  .categories-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text-1);
  }

  .amount-col {
    text-align: right;
    font-family: 'Fira Code', monospace;
    color: var(--text-2);
  }

  .count-col {
    text-align: center;
    color: var(--text-3);
  }

  .state-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: var(--text-3);
    font-size: 14px;
  }

  .month-selector-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    transition: all 0.2s ease;
  }

  .month-selector-wrapper:hover {
    background: var(--surface);
    border-color: #3b82f6;
  }

  .month-selector-icon {
    width: 18px;
    height: 18px;
    color: var(--text-2);
    flex-shrink: 0;
    stroke-width: 1.5;
  }

  .month-select {
    border: none;
    background: transparent;
    color: var(--text-1);
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 0;
    flex: 1;
  }

  .month-select:focus {
    outline: none;
  }

  .month-select option {
    background: var(--surface);
    color: var(--text-1);
  }

</style>
