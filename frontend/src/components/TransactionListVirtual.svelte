<script lang="ts">
  import { createEventDispatcher, untrack } from 'svelte';
  import NewTransactionModal from './NewTransactionModal.svelte';
  import EditTransactionModal from './EditTransactionModal.svelte';
  import TransferModal from './TransferModal.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import ExportModal from './ExportModal.svelte';
  import CategorySelect from './CategorySelect.svelte';
  import TransactionTrash from './transactions/TransactionTrash.svelte';
  import TransactionFilters from './transactions/TransactionFilters.svelte';
  import TransactionTable from './transactions/TransactionTable.svelte';
  import DeleteMonthModal from './transactions/DeleteMonthModal.svelte';
  import { getMonthKey, occurrenceLabel } from './transactions/tx-format.ts';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';

  interface Props {
    account: any;
    accounts?: any;
    transactions?: any;
    allTransactions?: any;
    totalTransactions?: number;
    flashIds?: any;
  }

  let {
    account,
    accounts = [],
    transactions = $bindable([]),
    allTransactions = $bindable([]),
    totalTransactions = 0,
    flashIds = new Set()
  }: Props = $props();

  const dispatch = createEventDispatcher();

  const LIMIT = 100;

  // ── View state ────────────────────────────────────────────────
  let showTrash = $state(false);
  let trashCount = $state(0);

  // ── Modals ────────────────────────────────────────────────────
  let showNewModal = $state(false);
  let showTransferModal = $state(false);
  let showEditModal = $state(false);
  let showDeleteConfirm = $state(false);
  let showExportModal = $state(false);
  let deleteConfirmId = $state(null);
  let isDeleting = $state(false);
  let editingTransaction = $state(null);
  let showDeleteMonthConfirm = $state(false);
  let deleteMonthDate = $state(null);

  // ── Search / filters ──────────────────────────────────────────
  let showOnlyPending = $state(false);
  let selectedCategory = '';
  let searchQuery = $state('');  // unified: text or amount (>100, <-50…)
  let searchResults = $state([]);
  let isSearching = $state(false);
  let isLoading = $state(false);

  // ── Advanced search filters ───────────────────────────────────
  let searchText = $state('');
  let excludeText = $state(false);  // Exclude vs. include
  let amountComparison = $state('>'); // >, <, >=, <=, =
  let amountComparisonValue = $state('');
  let amountRangeMin = $state('');
  let amountRangeMax = $state('');
  let dateRangeStart = $state('');
  let dateRangeEnd = $state('');
  let filterCategory = $state('');
  let filterReconciled = $state(null); // null | true | false
  let showAdvancedFilters = $state(false);  // Toggle panel visibility

  // Toggle which filters are active
  let activeFilters = $state({
    text: false,
    amountComparison: false,
    amountRange: false,
    dateRange: false,
    category: false,
    reconciled: false
  });

  // ── Month collapse state ─────────────────────────────────────
  let collapsedMonths = $state(new Set<string>()); // Format: "YYYY-MM"
  let knownMonths = new Set<string>(); // Months already seen at least once (for default-collapse logic)

  // ── Bulk selection ────────────────────────────────────────────
  let selectedIds = $state(new Set<string>());
  let bulkCatValue = $state('');
  let showBulkCatPicker = $state(false);

  // Debounce search — avoid a request on every keystroke (#6)
  let searchDebounce: ReturnType<typeof setTimeout> | undefined = $state();
  // Bumped on every filter change so in-flight requests started before a clear
  // can detect they're stale and avoid overwriting a since-cleared result set.
  // Kept in a plain object (not a `let` reactive var) so reading it here doesn't
  // make this block depend on its own output and re-trigger itself.
  const searchGenerationRef = { value: 0 };
  function bumpSearchGeneration() {
    return ++searchGenerationRef.value;
  }

  // Plain (non-reactive) function: reading collapsedMonths through this indirection
  // keeps it out of the dependency list of the collapse effect below, so the effect only
  // re-runs when `displayed` changes, not every time the user toggles a month.
  function getCollapsedMonths() {
    return collapsedMonths;
  }

  // Full category list (independent of pagination) — used for the filter dropdown
  let allCategoryNames = $state([]);
  async function loadAllCategoryNames() {
    try {
      const cats = await api.get(`/api/accounts/${account.id}/categories`);
      allCategoryNames = cats.map(c => c.name).sort();
    } catch (e) { console.error(e); }
  }

  // Account schedules by id — used to show "n/N" occurrences on operations linked to a schedule
  let schedulesById = $state(new Map());
  async function loadSchedules() {
    try {
      const list = await api.get(`/api/accounts/${account.id}/schedules`);
      schedulesById = new Map(list.map(s => [s.id, s]));
    } catch (e) { console.error(e); }
  }

  function toggleSelect(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedIds = next;
  }

  function toggleSelectAll() {
    selectedIds = allSelected
      ? new Set()
      : new Set(selectableDisplayed.map(t => t.id));
  }

  function clearSelection() { selectedIds = new Set(); showBulkCatPicker = false; }

  // ── Search ────────────────────────────────────────────────────
  async function performSearch(generation = searchGenerationRef.value) {
    isSearching = true;
    try {
      const params = new URLSearchParams({ limit: '500', mode: 'combined' });

      // Quick search (always active)
      if (searchText.trim()) {
        params.append('q', searchText.trim());
        if (excludeText) params.append('excludeText', 'true');
      }
      // Advanced filters (only if enabled via checkbox)
      if (activeFilters.amountComparison && String(amountComparisonValue).trim()) {
        params.append('amountOp', amountComparison);
        params.append('amountVal', String(amountComparisonValue));
      }
      if (activeFilters.amountRange && (String(amountRangeMin).trim() || String(amountRangeMax).trim())) {
        if (amountRangeMin) params.append('min', String(amountRangeMin));
        if (amountRangeMax) params.append('max', String(amountRangeMax));
      }
      if (activeFilters.dateRange && (dateRangeStart || dateRangeEnd)) {
        if (dateRangeStart) params.append('startDate', dateRangeStart);
        if (dateRangeEnd) params.append('endDate', dateRangeEnd);
      }
      if (activeFilters.category && filterCategory) {
        params.append('category', filterCategory);
      }
      if (activeFilters.reconciled && filterReconciled !== null) {
        params.append('reconciled', String(filterReconciled));
      }

      const { data } = await api.get(`/api/accounts/${account.id}/transactions/search?${params}`);
      // Ignore stale responses: the filters changed (or were cleared) while this request was in flight
      if (generation === searchGenerationRef.value) searchResults = data;
    } catch (e) { console.error(e); }
    finally { isSearching = false; }
  }

  async function loadMore() {
    if (isLoading || !hasMore) return;
    isLoading = true;
    try {
      const { data } = await api.get(`/api/accounts/${account.id}/transactions?limit=${LIMIT}&offset=${transactions.length}`);
      if (data.length) {
        // Defensive de-dup: a refresh racing with this request, or a row inserted while
        // paging (which shifts OFFSET pages), can return ids we already hold, and a keyed
        // #each throws on duplicate keys. Dedupe against both lists, since they can diverge.
        const knownIds = new Set(transactions.map(t => t.id));
        const freshForTransactions = data.filter(t => !knownIds.has(t.id));
        const knownAllIds = new Set(allTransactions.map(t => t.id));
        const freshForAll = data.filter(t => !knownAllIds.has(t.id));
        transactions = [...transactions, ...freshForTransactions];
        allTransactions = [...allTransactions, ...freshForAll];
      }
    } catch (e) { console.error(e); }
    finally { isLoading = false; }
  }

  function handleScroll(e: Event) {
    const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLElement;
    if (scrollHeight - scrollTop - clientHeight < 500 && !isLoading && hasMore) loadMore();
  }

  // ── Single operations ─────────────────────────────────────────
  async function toggleReconciled(tx) {
    try {
      await api.patch(`/api/transactions/${tx.id}`, { is_reconciled: !tx.is_reconciled });
      tx.is_reconciled = !tx.is_reconciled;
      transactions = transactions;
      allTransactions = allTransactions;
      searchResults = searchResults;
      dispatch('updated');
    } catch (e) { console.error(e); }
  }

  async function deleteTransaction() {
    isDeleting = true;
    try {
      await api.delete(`/api/transactions/${deleteConfirmId}`);
      transactions = transactions.filter(t => t.id !== deleteConfirmId);
      allTransactions = allTransactions.filter(t => t.id !== deleteConfirmId);
      searchResults = searchResults.filter(t => t.id !== deleteConfirmId);
      await fetchTrashCount();
      dispatch('updated');
    } catch (e) { console.error(e); }
    finally { isDeleting = false; showDeleteConfirm = false; deleteConfirmId = null; }
  }

  function openDeleteMonth(date) {
    deleteMonthDate = date;
    showDeleteMonthConfirm = true;
  }

  function closeDeleteMonth() {
    showDeleteMonthConfirm = false;
    deleteMonthDate = null;
  }

  // Deletes every operation of the month of `date` (the dialog has already been confirmed).
  async function removeMonth(date: string) {
    const y = new Date(date).getFullYear();
    const m = new Date(date).getMonth();
    const start = new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0];
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().split('T')[0];

    await api.delete(`/api/accounts/${account.id}/transactions/delete-range`, { start, end });

    const monthTransactions = transactions.filter(t => {
      const tx = new Date(t.date);
      return tx.getFullYear() === y && tx.getMonth() === m;
    }).map(t => t.id);

    transactions = transactions.filter(t => !monthTransactions.includes(t.id));
    allTransactions = allTransactions.filter(t => !monthTransactions.includes(t.id));
    searchResults = searchResults.filter(t => !monthTransactions.includes(t.id));
    await fetchTrashCount();
    dispatch('updated');
  }

  async function duplicateTransaction(tx) {
    try {
      const dateOnly = typeof tx.date === 'string'
        ? tx.date.split('T')[0]
        : new Date(tx.date).toISOString().split('T')[0];
      const amountNum = typeof tx.amount === 'number' ? tx.amount : parseFloat(tx.amount);

      const payload = {
        date: dateOnly,
        tiers: tx.tiers,
        details: tx.details,
        amount: amountNum,
        category: tx.category,
        transaction_type: tx.transaction_type,
        is_reconciled: false
      };
      const res = await api.post(`/api/accounts/${account.id}/transactions`, payload);

      const today = new Date().toISOString().split('T')[0];
      editingTransaction = {
        id: res.id,
        date: today,
        tiers: tx.tiers,
        details: tx.details,
        amount: amountNum,
        category: tx.category,
        transaction_type: tx.transaction_type,
        is_reconciled: false
      };
      showEditModal = true;
    } catch (e) {
      console.error(e);
      alert($t('Erreur lors de la duplication'));
    }
  }

  // ── Bulk operations ───────────────────────────────────────────
  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    try {
      await api.post(`/api/accounts/${account.id}/transactions/delete-bulk`, { ids: [...selectedIds] });
      const deleted = selectedIds;
      transactions = transactions.filter(t => !deleted.has(t.id));
      allTransactions = allTransactions.filter(t => !deleted.has(t.id));
      searchResults = searchResults.filter(t => !deleted.has(t.id));
      selectedIds = new Set();
      await fetchTrashCount();
      dispatch('updated');
    } catch (e) { console.error(e); }
  }

  async function bulkCategorize() {
    if (selectedIds.size === 0 || !bulkCatValue) return;
    try {
      await api.post(`/api/accounts/${account.id}/transactions/categorize-bulk`, { ids: [...selectedIds], category: bulkCatValue });
      const catted = selectedIds;
      allTransactions = allTransactions.map(t => catted.has(t.id) ? { ...t, category: bulkCatValue } : t);
      transactions = transactions.map(t => catted.has(t.id) ? { ...t, category: bulkCatValue } : t);
      searchResults = searchResults.map(t => catted.has(t.id) ? { ...t, category: bulkCatValue } : t);
      selectedIds = new Set(); bulkCatValue = ''; showBulkCatPicker = false;
      dispatch('updated');
    } catch (e) { console.error(e); }
  }

  async function fetchTrashCount() {
    try {
      const d = await api.get(`/api/accounts/${account.id}/transactions/trash/count`);
      trashCount = d.count;
    } catch (e) {}
  }

  // ── Trash ─────────────────────────────────────────────────────
  function openTrash() {
    showTrash = true;
  }

  export function closeTrash() { showTrash = false; }

  function toggleMonthCollapse(dateString) {
    const key = getMonthKey(dateString);
    // Svelte 5 does not track in-place mutations of a Set: assign a new Set so the UI updates.
    const next = new Set(collapsedMonths);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    collapsedMonths = next;
  }

  async function afterEdit() {
    showEditModal = false;
    if (isSearchActive) {
      // Refresh results so the edited transaction shows updated data
      await performSearch();
    }
    dispatch('updated');
  }

  function clearSearch() {
    searchQuery = '';
    searchText = '';
    excludeText = false;
    amountComparisonValue = '';
    amountRangeMin = '';
    amountRangeMax = '';
    dateRangeStart = '';
    dateRangeEnd = '';
    filterCategory = '';
    filterReconciled = null;
    activeFilters = {
      text: false,  // No longer used (text filter always active)
      amountComparison: false,
      amountRange: false,
      dateRange: false,
      category: false,
      reconciled: false
    };
    searchResults = [];
  }

  // ── Derived ───────────────────────────────────────────────────
  let hasMore = $derived(transactions.length < totalTransactions);
  $effect.pre(() => {
    const hasQuery = searchText.trim() ||
                     (activeFilters.amountComparison && String(amountComparisonValue).trim() && amountComparison) ||
                     (activeFilters.amountRange && (String(amountRangeMin).trim() || String(amountRangeMax).trim())) ||
                     (activeFilters.dateRange && (dateRangeStart || dateRangeEnd)) ||
                     (activeFilters.category && filterCategory) ||
                     (activeFilters.reconciled && filterReconciled !== null);
    untrack(() => {
      clearTimeout(searchDebounce);
      const generation = bumpSearchGeneration();
      if (hasQuery) {
        searchDebounce = setTimeout(() => performSearch(generation), 300);
      } else {
        searchResults = [];
      }
    });
  });
  let isSearchActive = $derived(searchResults.length > 0);
  // Single filter pass (#11)
  // Keyed #each in TransactionTable throws on duplicate ids, so keep the first occurrence only.
  function uniqueById<T extends { id: string }>(list: T[]): T[] {
    const seen = new Set<string>();
    return list.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }
  let displayed = $derived(uniqueById(isSearchActive ? searchResults : allTransactions)
    .filter(t =>
      (!showOnlyPending || !t.is_reconciled) &&
      (!selectedCategory || t.category === selectedCategory)
    ));
  $effect.pre(() => {
    displayed;
    untrack(() => {
      // Manage collapsed months: preserve user toggles, add new months, remove obsolete ones
      const monthsInOrder = [];
      const seenMonths = new Set<string>();
      for (const tx of displayed) {
        const monthKey = tx.date.substring(0, 7); // "YYYY-MM"
        if (!seenMonths.has(monthKey)) {
          monthsInOrder.push(monthKey);
          seenMonths.add(monthKey);
        }
      }

      // Sort months in descending order (newest first)
      monthsInOrder.sort().reverse();

      const currentCollapsed = getCollapsedMonths();
      const newCollapsed = new Set<string>(currentCollapsed);

      // Remove months that no longer exist
      for (const m of currentCollapsed) {
        if (!seenMonths.has(m)) newCollapsed.delete(m);
      }

      // Add newly visible months to collapsed (except the first one which should be expanded by default)
      for (let i = 1; i < monthsInOrder.length; i++) {
        const month = monthsInOrder[i];
        if (!knownMonths.has(month)) {
          newCollapsed.add(month);
        }
      }

      for (const m of monthsInOrder) knownMonths.add(m);

      collapsedMonths = newCollapsed;
    });
  });
  let monthCounts = $derived((() => {
    const counts = new Map();
    for (const tx of displayed) {
      const key = tx.date.substring(0, 7);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  })());
  // Categories seen in the transactions loaded so far — used for edit/bulk pickers
  let localCategories = $derived([...new Set(allTransactions.map(t => t.category))].filter(Boolean).sort());
  $effect.pre(() => {
    if (account) untrack(() => loadAllCategoryNames());
  });
  $effect.pre(() => {
    if (account) untrack(() => loadSchedules());
  });
  let selectableDisplayed = $derived(displayed.filter(t => !t.is_locked));
  let allSelected = $derived(selectableDisplayed.length > 0 && selectableDisplayed.every(t => selectedIds.has(t.id)));
  $effect.pre(() => {
    if (account) untrack(() => fetchTrashCount());
  });
  // ── Formatting ────────────────────────────────────────────────
  let currentLocale = $derived(($lang === 'fr' ? 'fr-FR' : 'en-US'));
  let pendingCount = $derived(allTransactions.filter(t => !t.is_reconciled).length);
</script>

{#if showTrash}
  <TransactionTrash
    {account}
    locale={currentLocale}
    oncount={(n) => (trashCount = n)}
    onupdated={() => dispatch('updated')}
    onclose={closeTrash}
  />
{:else}
<div class="tx-panel">
  <!-- Header -->
  <div class="tx-panel-header">
    <div style="display:flex; align-items:center; gap:8px;">
      <span class="tx-panel-title">{$t('Opérations')}</span>
      <span class="tx-count">{displayed.length} / {totalTransactions}</span>
    </div>

    <!-- Search bar + advanced filters toggle -->
    <div style="display:flex; align-items:center; gap:12px; flex:1; max-width:480px;">
      <div class="search-wrap" style="flex:1; position:relative; display:flex; align-items:center; background:var(--input-bg); border:1.5px solid var(--border); border-radius:10px; padding:0 12px; height:40px; transition:all 250ms ease;">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0; color:var(--text-3); margin-right:8px;">
          <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.6"/>
          <path d="M11 11l3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
        <input type="text" bind:value={searchText} placeholder={$t('Rechercher une transaction…')} style="flex:1; border:none; background:none; outline:none; font-size:14px; color:var(--text-1);" />
        {#if searchText || Object.values(activeFilters).some(Boolean)}
          <button onclick={clearSearch} style="background:none; border:none; cursor:pointer; font-size:18px; color:var(--text-3); padding:4px; display:flex; align-items:center; justify-content:center; transition:color 200ms;">✕</button>
        {/if}
      </div>

      <!-- Filters button with active count (excluding text filter) -->
      <button
        onclick={() => (showAdvancedFilters = !showAdvancedFilters)}
        style="padding:10px 14px; font-size:14px; font-weight:500; border:1.5px solid {showAdvancedFilters ? 'var(--accent)' : 'var(--border)'}; border-radius:10px; background:{showAdvancedFilters ? 'var(--accent)' : 'var(--bg-1)'}; color:{showAdvancedFilters ? 'white' : 'var(--text-1)'}; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:8px; transition:all 250ms ease; height:40px;"
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="flex-shrink:0;">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="17" cy="5" r="2" fill="currentColor" opacity="0.3"/>
          <circle cx="17" cy="10" r="2" fill="currentColor" opacity="0.3"/>
          <circle cx="17" cy="15" r="2" fill="currentColor" opacity="0.3"/>
        </svg>
        {$t('Filtres')}
        {#if Object.entries(activeFilters).filter(([k]) => k !== 'text').some(([,v]) => v)}
          <span style="background:{showAdvancedFilters ? 'rgba(255,255,255,0.4)' : 'var(--accent)'}; color:{showAdvancedFilters ? 'white' : 'white'}; padding:3px 8px; border-radius:5px; font-size:12px; font-weight:700; min-width:20px; text-align:center;">
            {Object.entries(activeFilters).filter(([k]) => k !== 'text').filter(([,v]) => v).length}
          </span>
        {/if}
      </button>
    </div>

    <div style="display:flex; align-items:center; gap:8px;">
      <button class="btn btn-ghost {showOnlyPending ? 'active' : ''} {pendingCount > 0 ? 'btn-pending-items' : ''}"
        onclick={() => (showOnlyPending = !showOnlyPending)}>
        {$t('À pointer')} ({pendingCount})
      </button>
      <button class="btn btn-trash {trashCount > 0 ? 'btn-trash--items' : ''}" onclick={openTrash} title={$t('Corbeille')}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M2 4h10M5 4V2.5h4V4M4.5 4v7a.5.5 0 00.5.5h4a.5.5 0 00.5-.5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {$t('Corbeille')}
        {#if trashCount > 0}
          <span class="trash-badge">{trashCount}</span>
        {/if}
      </button>
      <button class="btn btn-ghost" onclick={() => (showExportModal = true)} title={$t('Exporter')}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {$t('Exporter')}
      </button>
      <button class="btn btn-primary" onclick={() => (showTransferModal = true)}>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M2 7h10M9 5l3 2-3 2M5 9L2 7l3-2M7 1v4M7 9v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {$t('Transfert')}
      </button>
      {#if account.account_type !== 'savings'}
        <button class="btn btn-primary btn-new-transaction" onclick={() => (showNewModal = true)}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          {$t('Nouvelle opération')}
        </button>
      {/if}
    </div>
  </div>

  <!-- Bulk action bar -->
  {#if selectedIds.size > 0}
    <div class="bulk-bar">
      <span class="bulk-count">{selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>
      <div style="display:flex; gap:8px; align-items:center;">
        {#if !showBulkCatPicker}
          <button class="btn btn-ghost" style="font-size:12px; padding:5px 10px;" onclick={() => (showBulkCatPicker = true)}>
            {$t('Catégoriser…')}
          </button>
        {:else}
          <div style="width:220px;">
            <CategorySelect bind:value={bulkCatValue} categories={allCategoryNames} label={$t('Choisir…')} />
          </div>
          {#if bulkCatValue}
            <button class="btn btn-primary" style="font-size:12px; padding:5px 10px;" onclick={bulkCategorize}>{$t('Appliquer')}</button>
          {/if}
          <button class="btn btn-ghost" style="font-size:12px; padding:5px 8px;" onclick={() => (showBulkCatPicker = false)}>✕</button>
        {/if}
        <button class="btn bulk-delete-btn" onclick={bulkDelete}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M2 4h10M5 4V2.5h4V4M4.5 4v7a.5.5 0 00.5.5h4a.5.5 0 00.5-.5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {$t('Supprimer')}
        </button>
        <button class="btn btn-ghost" style="font-size:12px; padding:5px 8px;" onclick={clearSelection}>✕</button>
      </div>
    </div>
  {/if}

  {#if showAdvancedFilters}
    <TransactionFilters
      bind:searchText
      bind:excludeText
      bind:amountComparison
      bind:amountComparisonValue
      bind:amountRangeMin
      bind:amountRangeMax
      bind:dateRangeStart
      bind:dateRangeEnd
      bind:filterCategory
      bind:filterReconciled
      bind:activeFilters
      {allCategoryNames}
    />
  {/if}

  <TransactionTable
    {displayed}
    {collapsedMonths}
    {monthCounts}
    {selectedIds}
    {flashIds}
    {allSelected}
    {schedulesById}
    {isSearching}
    {isSearchActive}
    {hasMore}
    {isLoading}
    locale={currentLocale}
    onscroll={handleScroll}
    onloadmore={loadMore}
    ontoggleselect={toggleSelect}
    ontoggleselectall={toggleSelectAll}
    onmonthtoggle={toggleMonthCollapse}
    onmonthdelete={openDeleteMonth}
    onreconcile={toggleReconciled}
    onedit={(tx) => { editingTransaction = tx; showEditModal = true; }}
    onduplicate={duplicateTransaction}
    ondelete={(id) => { deleteConfirmId = id; showDeleteConfirm = true; }}
  />
</div>
{/if}

{#if showExportModal}
  <ExportModal {account}
    activeCategory={selectedCategory}
    activeSearch={searchQuery}
    on:close={() => (showExportModal = false)} />
{/if}
{#if showNewModal}
  <NewTransactionModal {account} on:created={() => { showNewModal = false; dispatch('updated'); }} on:close={() => (showNewModal = false)} />
{/if}
{#if showTransferModal && accounts.length > 0}
  <TransferModal {account} otherAccounts={accounts.filter(a => a.id !== account.id)} on:transferred={() => { showTransferModal = false; dispatch('updated'); }} on:close={() => (showTransferModal = false)} />
{/if}
{#if showEditModal && editingTransaction}
  <EditTransactionModal {account} transaction={editingTransaction} categories={localCategories}
    on:updated={afterEdit}
    on:close={() => (showEditModal = false)} />
{/if}
{#if showDeleteConfirm}
  <ConfirmModal
    title={$t('Supprimer l\'opération')}
    message={$t('L\'opération sera déplacée dans la corbeille. Vous pourrez la restaurer depuis l\'icône 🗑 en haut à droite.')}
    confirmText={$t('Supprimer')} confirmClass="btn-danger-ghost"
    isLoading={isDeleting}
    on:confirm={deleteTransaction}
    on:cancel={() => { showDeleteConfirm = false; deleteConfirmId = null; }}
  />
{/if}

{#if showDeleteMonthConfirm && deleteMonthDate}
  <DeleteMonthModal date={deleteMonthDate} locale={currentLocale} ondelete={removeMonth} onclose={closeDeleteMonth} />
{/if}

<style>
  /* Trash button — visible with amber accent when it has items */
  .btn-trash {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 11px;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: none;
    cursor: pointer;
    font-size: 12.5px;
    color: var(--text-2);
    font-family: 'Inter', sans-serif;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .btn-trash:hover { background: var(--card-hover); color: var(--text-1); }
  .btn-trash--items {
    border-color: #D97706;
    color: #D97706;
    background: rgba(217,119,6,0.07);
  }
  .btn-trash--items:hover { background: rgba(217,119,6,0.14); }
  :global([data-theme="dark"]) .btn-trash--items { background: rgba(217,119,6,0.12); }
  :global([data-theme="dark"]) .btn-trash--items:hover { background: rgba(217,119,6,0.2); }

  /* Pending button — same amber color as pending transactions */
  .btn-pending-items {
    border-color: #F59E0B !important;
    color: #F59E0B !important;
    background: rgba(245, 158, 11, 0.07) !important;
  }
  .btn-pending-items:hover { background: rgba(245, 158, 11, 0.14) !important; }
  :global([data-theme="dark"]) .btn-pending-items { background: rgba(251, 191, 36, 0.12) !important; }
  :global([data-theme="dark"]) .btn-pending-items:hover { background: rgba(251, 191, 36, 0.2) !important; }

  .trash-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    background: #D97706;
    color: white;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
  }

  .bulk-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 18px;
    background: var(--cobalt-light);
    border-bottom: 1px solid var(--cobalt-border);
    gap: 12px;
  }
  .bulk-count {
    font-size: 13px;
    font-weight: 500;
    color: var(--cobalt);
    font-family: 'Inter', sans-serif;
  }
  .bulk-delete-btn {
    background: var(--danger-bg);
    color: var(--danger-text);
    border: 1px solid #FECDD3;
    font-size: 12px;
    padding: 5px 10px;
  }
  .bulk-delete-btn:hover { background: var(--danger-bg); filter: brightness(0.9); }

  .btn-new-transaction {
    background: #10B981;
    border-color: #10B981;
  }
  .btn-new-transaction:hover {
    background: #059669;
  }
  .btn-new-transaction:active {
    background: #047857;
  }
</style>
