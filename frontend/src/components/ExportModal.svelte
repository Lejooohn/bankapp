<script lang="ts">
  import { self } from '../lib/events';

  import { createEventDispatcher } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  import DateInput from './DateInput.svelte';
  interface Props {
    account: any;
    activeCategory?: string;
    activeSearch?: string;
  }

  let { account, activeCategory = '', activeSearch = '' }: Props = $props();

  const dispatch = createEventDispatcher();

  // Default: current month
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString().split('T')[0];

  let fromDate = $state(firstOfMonth);
  let toDate   = $state(lastOfMonth);
  let loading  = $state('');
  let error    = $state('');

  function isoDate(d) { return d.toISOString().split('T')[0]; }

  function setRangeDays(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    fromDate = isoDate(start);
    toDate = isoDate(end);
  }

  function setRangeMonths(months) {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    fromDate = isoDate(start);
    toDate = isoDate(end);
  }

  const quickRanges = [
    { label: '30 jours', fn: () => setRangeDays(30) },
    { label: $t('3 mois'), fn: () => setRangeMonths(3) },
    { label: $t('6 mois'), fn: () => setRangeMonths(6) },
    { label: '1 an', fn: () => setRangeMonths(12) },
  ];

  function buildUrl(format) {
    const p = new URLSearchParams({ format, from: fromDate, to: toDate });
    if (activeCategory) p.set('category', activeCategory);
    if (activeSearch && !activeSearch.startsWith('>') && !activeSearch.startsWith('<')) {
      p.set('search', activeSearch);
    }
    return `/api/accounts/${account.id}/transactions/export?${p}`;
  }

  async function downloadCsv() {
    loading = 'csv';
    error = '';
    try {
      const res = await fetch(buildUrl('csv'));
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `bankapp-export-${fromDate}-${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      error = $t("Erreur lors de l'export");
    } finally { loading = ''; }
  }

  function openPdf() {
    window.open(buildUrl('pdf'), '_blank');
  }

  function close() { dispatch('close'); }
</script>

<!-- Backdrop -->
<div class="modal-backdrop" onclick={self(close)} onkeydown={(e) => e.key === 'Escape' && close()} role="presentation">
  <div class="modal-box" role="dialog" aria-modal="true">
    <!-- Header -->
    <div class="modal-header">
      <span class="modal-title">{$t('Exporter les transactions')}</span>
      <button class="modal-close" onclick={close} aria-label={$t('Fermer')}>×</button>
    </div>

    <!-- Body -->
    <div class="modal-body">
      {#if error}<div class="error-banner">{error}</div>{/if}
      <!-- Date range -->
      <div class="field-group">
        <span class="field-label">{$t('Période')}</span>
        <div style="display:flex; gap:8px; align-items:center;">
          <DateInput bind:value={fromDate} class="date-input"/>
          <span style="color:var(--text-3); font-size:13px;">→</span>
          <DateInput bind:value={toDate}   class="date-input"/>
        </div>
        <div class="quick-ranges">
          {#each quickRanges as range}
            <button type="button" class="quick-range-btn" onclick={range.fn}>{$t(range.label)}</button>
          {/each}
        </div>
      </div>

      <!-- Active filters (readonly chips) -->
      {#if activeCategory || activeSearch}
        <div class="field-group">
          <span class="field-label">{$t('Filtres actifs')}</span>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            {#if activeCategory}
              <span class="filter-chip">{$t('Catégorie')} : {activeCategory}</span>
            {/if}
            {#if activeSearch}
              <span class="filter-chip">{$t('Recherche')} : {activeSearch}</span>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Footer actions -->
    <div class="modal-footer">
      <button class="btn-export btn-csv" onclick={downloadCsv} disabled={loading === 'csv'}>
        {#if loading === 'csv'}
          <span class="spinner"></span> {$t('Génération…')}
        {:else}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;">
            <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          CSV
        {/if}
      </button>
      <button class="btn-export btn-pdf" onclick={openPdf}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;">
          <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M4 5h6M4 8h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        PDF
      </button>
      <button class="btn-cancel" onclick={close}>{$t('Annuler')}</button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0,0,0,0.40);
    display: flex; align-items: center; justify-content: center;
  }
  .modal-box {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 400px; max-width: calc(100vw - 32px);
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  }
  .error-banner {
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 13px;
    color: #c00;
    margin-bottom: 12px;
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .modal-title {
    font-size: 14px; font-weight: 600; color: var(--text-1);
    font-family: 'Inter', sans-serif;
  }
  .modal-close {
    background: none; border: none; cursor: pointer;
    font-size: 20px; color: var(--text-3); line-height: 1; padding: 0;
    display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;
  }
  .modal-close:hover { color: var(--text-1); }
  .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .modal-footer {
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    display: flex; gap: 8px; align-items: center;
  }
  .field-group { display: flex; flex-direction: column; gap: 6px; }
  .field-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--text-3);
    font-family: 'Inter', sans-serif;
  }
  :global(.date-input) {
    flex: 1; padding: 6px 10px; border: 1px solid var(--border);
    border-radius: 7px; background: var(--input-bg);
    color: var(--text-1); font-size: 13px; font-family: 'Inter', sans-serif;
    outline: none;
  }
  :global(.date-input:focus) { border-color: var(--cobalt); }
  .quick-ranges {
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .quick-range-btn {
    padding: 4px 10px; border-radius: 20px;
    background: var(--surface); border: 1px solid var(--border);
    color: var(--text-2); font-size: 12px; font-family: 'Inter', sans-serif;
    cursor: pointer; transition: all 0.1s;
  }
  .quick-range-btn:hover {
    background: var(--cobalt-light); color: var(--cobalt); border-color: #BFDBFE;
  }
  .filter-chip {
    display: inline-flex; align-items: center;
    padding: 3px 10px; border-radius: 20px;
    background: var(--cobalt-light); color: var(--cobalt);
    font-size: 11.5px; font-family: 'Inter', sans-serif;
    border: 1px solid #BFDBFE;
  }
  .btn-export {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 16px; border-radius: 7px; border: none;
    font-size: 13px; font-weight: 500; cursor: pointer;
    font-family: 'Inter', sans-serif; transition: opacity 0.1s;
  }
  .btn-export:disabled { opacity: 0.6; cursor: default; }
  .btn-csv { background: #166534; color: #DCFCE7; }
  .btn-csv:hover:not(:disabled) { background: #15803D; }
  .btn-pdf { background: #7C3AED; color: #EDE9FE; }
  .btn-pdf:hover { background: #6D28D9; }
  .btn-cancel {
    margin-left: auto; background: none; border: 1px solid var(--border);
    border-radius: 7px; padding: 7px 14px; font-size: 13px;
    color: var(--text-2); cursor: pointer; font-family: 'Inter', sans-serif;
  }
  .btn-cancel:hover { background: var(--surface); }
  .spinner {
    display: inline-block; width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
    border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
