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
<div style="padding:20px; border-bottom:1px solid var(--border); background:var(--bg-2); display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:20px;">

  <!-- Text filter (always active, no checkbox) -->
  <div style="display:flex; flex-direction:column; gap:10px;">
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-size:16px;">🔍</span>
      <span style="font-weight:600; font-size:14px; color:var(--text-1);">{$t('Texte')}</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:8px;">
      <input type="text" bind:value={searchText} placeholder={$t('Nom, détail…')} style="padding:8px 12px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1); transition:border-color 250ms;" />
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; color:var(--text-2); transition:color 250ms;" onmouseenter={(e) => e.currentTarget.style.color = 'var(--text-1)'} onmouseleave={(e) => e.currentTarget.style.color = 'var(--text-2)'}>
        <input type="checkbox" bind:checked={excludeText} style="margin:0; cursor:pointer; width:16px; height:16px;" />
        <span>{$t('Inverse la recherche')}</span>
      </label>
    </div>
  </div>

  <!-- Amount comparison filter -->
  <div style="display:flex; flex-direction:column; gap:10px;">
    <label style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px; cursor:pointer; color:var(--text-1);">
      <input type="checkbox" bind:checked={activeFilters.amountComparison} style="margin:0; cursor:pointer; width:16px; height:16px;" />
      <span style="font-size:16px;">💰</span>
      <span>{$t('Montant spécifique')}</span>
    </label>
    {#if activeFilters.amountComparison}
      <div style="display:flex; gap:8px; align-items:center; animation:slideDown 250ms ease;">
        <select bind:value={amountComparison} style="padding:8px 10px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1); font-weight:600; min-width:60px; transition:border-color 250ms;">
          <option value=">">{$t('Plus de')}</option>
          <option value="<">{$t('Moins de')}</option>
          <option value=">=">&ge;</option>
          <option value="<=">&le;</option>
          <option value="=">=</option>
        </select>
        <input type="number" bind:value={amountComparisonValue} placeholder="500" style="flex:1; padding:8px 12px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1); transition:border-color 250ms;" />
        <span style="color:var(--text-3); font-size:12px; white-space:nowrap;">{$t('EUR')}</span>
      </div>
    {/if}
  </div>

  <!-- Amount range filter -->
  <div style="display:flex; flex-direction:column; gap:10px;">
    <label style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px; cursor:pointer; color:var(--text-1);">
      <input type="checkbox" bind:checked={activeFilters.amountRange} style="margin:0; cursor:pointer; width:16px; height:16px;" />
      <span style="font-size:16px;">💰</span>
      <span>{$t('Montant')} (min-max)</span>
    </label>
    {#if activeFilters.amountRange}
      <div style="display:flex; gap:8px; align-items:center; animation:slideDown 250ms ease;">
        <input type="number" bind:value={amountRangeMin} placeholder={$t('Min')} style="flex:1; padding:8px 12px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1); transition:border-color 250ms;" />
        <span style="color:var(--text-3); font-weight:600;">—</span>
        <input type="number" bind:value={amountRangeMax} placeholder={$t('Max')} style="flex:1; padding:8px 12px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1); transition:border-color 250ms;" />
      </div>
    {/if}
  </div>

  <!-- Date range filter -->
  <div style="display:flex; flex-direction:column; gap:10px;">
    <label style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px; cursor:pointer; color:var(--text-1);">
      <input type="checkbox" bind:checked={activeFilters.dateRange} style="margin:0; cursor:pointer; width:16px; height:16px;" />
      <span style="font-size:16px;">📅</span>
      <span>{$t('Période')} (date)</span>
    </label>
    {#if activeFilters.dateRange}
      <div style="display:flex; gap:8px; align-items:center; animation:slideDown 250ms ease;">
        <DateInput bind:value={dateRangeStart} style="flex:1; padding:8px 12px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1); transition:border-color 250ms;" />
        <span style="color:var(--text-3); font-weight:600;">—</span>
        <DateInput bind:value={dateRangeEnd} style="flex:1; padding:8px 12px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1); transition:border-color 250ms;" />
      </div>
    {/if}
  </div>

  <!-- Category filter -->
  {#if allCategoryNames.length > 0}
    <div style="display:flex; flex-direction:column; gap:10px;">
      <label style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px; cursor:pointer; color:var(--text-1);">
        <input type="checkbox" bind:checked={activeFilters.category} style="margin:0; cursor:pointer; width:16px; height:16px;" />
        <span style="font-size:16px;">🏷️</span>
        <span>{$t('Catégorie')}</span>
      </label>
      {#if activeFilters.category}
        <div style="animation:slideDown 250ms ease;">
          <CategorySelect bind:value={filterCategory} categories={allCategoryNames} label={$t('— Toutes')} />
        </div>
      {/if}
    </div>
  {/if}

  <!-- Reconciliation filter -->
  <div style="display:flex; flex-direction:column; gap:10px;">
    <label style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px; cursor:pointer; color:var(--text-1);">
      <input type="checkbox" bind:checked={activeFilters.reconciled} style="margin:0; cursor:pointer; width:16px; height:16px;" />
      <span style="font-size:16px;">✓</span>
      <span>{$t('Pointage')}</span>
    </label>
    {#if activeFilters.reconciled}
      <select bind:value={filterReconciled} style="padding:8px 12px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; background:var(--input-bg); color:var(--text-1); transition:border-color 250ms; animation:slideDown 250ms ease;">
        <option value={null}>{$t('— Tous états')}</option>
        <option value={false}>{$t('À pointer')}</option>
        <option value={true}>{$t('Pointées')}</option>
      </select>
    {/if}
  </div>
</div>

<style>
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
