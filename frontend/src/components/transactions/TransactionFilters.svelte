<script lang="ts">
  import { t } from '../../lib/i18n.ts';
  import CategorySelect from '../CategorySelect.svelte';
  import DateInput from '../DateInput.svelte';

  // Advanced search filters panel. The values belong to the parent, which runs the search.
  let {
    searchText = $bindable(''),
    excludeText = $bindable(false),
    amountComparison = $bindable('>'),
    amountComparisonValue = $bindable(''),
    amountRangeMin = $bindable(''),
    amountRangeMax = $bindable(''),
    dateRangeStart = $bindable(''),
    dateRangeEnd = $bindable(''),
    filterCategory = $bindable(''),
    filterReconciled = $bindable(null),
    activeFilters = $bindable({ text: false, amountComparison: false, amountRange: false, dateRange: false, category: false, reconciled: false }),
    allCategoryNames = [],
  }: {
    searchText?: string;
    excludeText?: boolean;
    amountComparison?: string;
    amountComparisonValue?: string;
    amountRangeMin?: string;
    amountRangeMax?: string;
    dateRangeStart?: string;
    dateRangeEnd?: string;
    filterCategory?: string;
    filterReconciled?: boolean | null;
    activeFilters?: Record<string, boolean>;
    allCategoryNames?: string[];
  } = $props();
</script>

<!-- Advanced filters panel -->
<div class="filters">

  <!-- Text filter (always active, no checkbox) -->
  <div class="filter">
    <div class="filter-label">{$t('Texte')}</div>
    <div class="filter">
      <input class="filter-input" type="text" bind:value={searchText} placeholder={$t('Nom, détail…')} />
      <label class="filter-option">
        <input type="checkbox" bind:checked={excludeText} />
        <span>{$t('Inverse la recherche')}</span>
      </label>
    </div>
  </div>

  <!-- Amount comparison filter -->
  <div class="filter">
    <label class="filter-label">
      <input type="checkbox" bind:checked={activeFilters.amountComparison} />
      <span>{$t('Montant spécifique')}</span>
    </label>
    {#if activeFilters.amountComparison}
      <div class="filter-values">
        <select class="filter-input" bind:value={amountComparison}>
          <option value=">">{$t('Plus de')}</option>
          <option value="<">{$t('Moins de')}</option>
          <option value=">=">&ge;</option>
          <option value="<=">&le;</option>
          <option value="=">=</option>
        </select>
        <input class="filter-input" type="number" bind:value={amountComparisonValue} placeholder="500" />
        <span class="filter-unit">{$t('EUR')}</span>
      </div>
    {/if}
  </div>

  <!-- Amount range filter -->
  <div class="filter">
    <label class="filter-label">
      <input type="checkbox" bind:checked={activeFilters.amountRange} />
      <span>{$t('Montant')} (min-max)</span>
    </label>
    {#if activeFilters.amountRange}
      <div class="filter-values">
        <input class="filter-input" type="number" bind:value={amountRangeMin} placeholder={$t('Min')} />
        <span class="filter-unit">–</span>
        <input class="filter-input" type="number" bind:value={amountRangeMax} placeholder={$t('Max')} />
      </div>
    {/if}
  </div>

  <!-- Date range filter -->
  <div class="filter" class:filter-wide={activeFilters.dateRange}>
    <label class="filter-label">
      <input type="checkbox" bind:checked={activeFilters.dateRange} />
      <span>{$t('Période')} (date)</span>
    </label>
    {#if activeFilters.dateRange}
      <div class="filter-values">
        <DateInput bind:value={dateRangeStart} style="flex:1 1 160px; width:auto; min-height:36px; padding:0 12px; font-size:14px; border:1px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1);" />
        <span class="filter-unit">–</span>
        <DateInput bind:value={dateRangeEnd} style="flex:1 1 160px; width:auto; min-height:36px; padding:0 12px; font-size:14px; border:1px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1);" />
      </div>
    {/if}
  </div>

  <!-- Category filter -->
  {#if allCategoryNames.length > 0}
    <div class="filter">
      <label class="filter-label">
        <input type="checkbox" bind:checked={activeFilters.category} />
        <span>{$t('Catégorie')}</span>
      </label>
      {#if activeFilters.category}
        <div class="filter-values filter-block">
          <CategorySelect bind:value={filterCategory} categories={allCategoryNames} label={$t('— Toutes')} />
        </div>
      {/if}
    </div>
  {/if}

  <!-- Reconciliation filter -->
  <div class="filter">
    <label class="filter-label">
      <input type="checkbox" bind:checked={activeFilters.reconciled} />
      <span>{$t('Pointage')}</span>
    </label>
    {#if activeFilters.reconciled}
      <select class="filter-input" bind:value={filterReconciled}>
        <option value={null}>{$t('— Tous états')}</option>
        <option value={false}>{$t('À pointer')}</option>
        <option value={true}>{$t('Pointées')}</option>
      </select>
    {/if}
  </div>
</div>

<style>
  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px 24px;
    padding: 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .filter {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  /* Two date fields need two columns */
  @media (min-width: 861px) { .filter-wide { grid-column: span 2; } }
  .filter-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 20px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-1);
  }
  .filter-option {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-2);
  }
  label { cursor: pointer; }
  input[type="checkbox"] { width: 16px; height: 16px; margin: 0; cursor: pointer; }
  .filter-values {
    display: flex;
    align-items: center;
    gap: 8px;
    animation: filter-in 160ms var(--ease);
  }
  .filter-block { display: block; }
  .filter-input {
    flex: 1;
    min-width: 0;
    min-height: 36px;
    padding: 0 12px;
    font-family: var(--font-ui);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--input-bg);
    color: var(--text-1);
    transition: border-color 150ms var(--ease);
  }
  .filter > .filter-input { flex: none; }
  .filter-unit {
    font-size: 13px;
    color: var(--text-3);
    white-space: nowrap;
  }
  @keyframes filter-in {
    from { opacity: 0; transform: translateY(-4px); }
  }
</style>
