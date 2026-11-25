<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  import Icon from './Icon.svelte';
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
  let menuOpen = $state(false); // small screens only

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
    menuOpen = false;
    selectedAccount = e.detail;
    currentView = 'transactions';
    localStorage.setItem('selectedAccountId', selectedAccount.id);
    localStorage.setItem('currentView', 'transactions');
  }

  function handleViewChange(e) {
    menuOpen = false;
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
  <div class="mobile-bar">
    <span class="mobile-title">{selectedAccount?.name ?? 'BankApp'}</span>
    <button class="btn btn-ghost btn-square" aria-label={$t('Menu')} title={$t('Menu')} aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
      <Icon name={menuOpen ? 'x' : 'menu'} />
    </button>
  </div>

  <aside class="sidebar" class:menu-open={menuOpen}>
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
    grid-template-columns: 264px minmax(0, 1fr);
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
    /* Fills the window up to 2400 (ultra-wide screens); padding rather than max-width, so fixed overlays keep the full window */
    padding-inline: max(32px, calc((100% - 2400px) / 2));
  }

  .mobile-bar { display: none; }

  /* Small screens: the sidebar folds into one menu button and the page scrolls as one. */
  @media (max-width: 860px) {
    .app-shell { display: block; height: auto; overflow: visible; }
    .mobile-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
      padding: 0 16px;
      background: var(--card);
      border-bottom: 1px solid var(--border);
    }
    .mobile-title { font-size: 16px; font-weight: 500; }
    .sidebar { display: none; width: auto; height: auto; border-right: none; border-bottom: 1px solid var(--border); }
    .sidebar.menu-open { display: flex; }
    .main { padding: 16px; overflow: visible; }
  }

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

  .state-loading,
  .state-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: var(--text-2);
    font-size: 14px;
  }
</style>
