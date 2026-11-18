<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  import AccountList from './AccountList.svelte';
  import AccountDetail from './AccountDetail.svelte';
  import CategoriesView from './CategoriesView.svelte';
  import RulesView from './RulesView.svelte';
  import SchedulerView from './SchedulerView.svelte';
  import StatisticsView from './StatisticsView.svelte';
  import MonthlyProjectionView from './MonthlyProjectionView.svelte';
  import BudgetManager from './BudgetManager.svelte';

  let { onLock } = $props();

  let accounts = $state([]);
  let selectedAccount = $state(null);
  let currentView = $state('transactions');
  let loading = $state(true);
  let simulatedTransactions = $state([]);
  let accountDetailRef: ReturnType<typeof AccountDetail> | undefined = $state();
  let error = $state('');

  onMount(loadAccounts);

  async function handleAccountListUpdated(e) {
    await loadAccounts();
    const accountId = e.detail?.accountId;
    if (accountId && selectedAccount?.id === accountId && currentView === 'transactions' && accountDetailRef) {
      accountDetailRef.silentRefresh();
    }
  }

  async function loadAccounts() {
    error = '';
    try {
      accounts = await api.get('/api/accounts');

      // Restore saved state
      const savedAccountId = localStorage.getItem('selectedAccountId');
      const savedView = localStorage.getItem('currentView');

      if (accounts.length > 0) {
        if (savedAccountId) {
          selectedAccount = accounts.find(a => a.id === savedAccountId);
        }
        if (!selectedAccount) {
          selectedAccount = accounts.find(a => a.is_default) || accounts[0];
        }
        if (savedView) currentView = savedView;
      }
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des comptes');
    }
    loading = false;
  }

  function handleAccountSelect(e) {
    selectedAccount = e.detail;
    currentView = 'transactions';
    localStorage.setItem('selectedAccountId', selectedAccount.id);
    localStorage.setItem('currentView', 'transactions');
  }

  function handleViewChange(e) {
    if (e.detail === 'transactions' && currentView === 'transactions') {
      accountDetailRef?.closeTrash();
      return;
    }
    currentView = e.detail;
    if (selectedAccount) {
      localStorage.setItem('currentView', currentView);
    }
  }
</script>

<div class="app-shell">
  <aside class="sidebar">
    <AccountList
      {accounts}
      {selectedAccount}
      {currentView}
      {onLock}
      on:select={handleAccountSelect}
      on:viewChange={handleViewChange}
      on:created={loadAccounts}
      on:updated={handleAccountListUpdated}
    />
  </aside>

  <main class="main">
    {#if error}
      <div class="error-banner" role="alert">
        {error}
        <button class="error-banner-close" onclick={() => (error = '')} aria-label={$t('Fermer')}>×</button>
      </div>
    {/if}
    {#if loading}
      <div class="state-loading">{$t('Chargement…')}</div>
    {:else if selectedAccount}
      {#if currentView === 'transactions'}
        <AccountDetail bind:this={accountDetailRef} {accounts} account={selectedAccount} bind:simulatedTransactions />
      {:else if currentView === 'budgets'}
        <BudgetManager account={selectedAccount} />
      {:else if currentView === 'categories'}
        <CategoriesView account={selectedAccount} />
      {:else if currentView === 'rules'}
        <RulesView account={selectedAccount} />
      {:else if currentView === 'scheduler'}
        <SchedulerView account={selectedAccount} bind:simulatedTransactions on:switchView={(e) => (currentView = e.detail)} on:updated={loadAccounts} />
      {:else if currentView === 'statistics'}
        <StatisticsView account={selectedAccount} />
      {:else if currentView === 'projection'}
        <MonthlyProjectionView account={selectedAccount} />
      {/if}
    {:else}
      <div class="state-empty">{$t('Sélectionnez un compte dans le menu')}</div>
    {/if}
  </main>
</div>

<style>
  .app-shell {
    display: grid;
    grid-template-columns: 228px 1fr;
    grid-template-rows: 1fr;
    min-height: 100vh;
  }

  .sidebar {
    grid-column: 1;
    grid-row: 1;
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }

  .main {
    grid-column: 2;
    grid-row: 1;
    overflow-y: auto;
  }

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
    margin: 16px 24px 0;
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

  .state-loading,
  .state-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: var(--text-2);
    font-size: 1rem;
  }
</style>
