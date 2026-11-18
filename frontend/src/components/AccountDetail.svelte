<script lang="ts">
  import { untrack } from 'svelte';
  
  import TransactionListVirtual from './TransactionListVirtual.svelte';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';

  let { account, accounts = [], simulatedTransactions = $bindable([]) } = $props();

  let transactions = $state([]), allCategories = [];
  let schedules = [];
  let loading = $state(true);
  let totalTransactions = $state(0);
  let reconciled = $state(0), pending = $state(0), total = $state(0);
  let flashIds = $state(new Set());
  let currentAccountId = $state(null);
  let dataReady = $state(Promise.resolve());
  let txListRef: ReturnType<typeof TransactionListVirtual> | undefined = $state();
  let error = $state('');

  const FLASH_DURATION_MS = 1800;

  function flashTransactionIds(ids) {
    if (ids.size === 0) return;
    flashIds = new Set([...flashIds, ...ids]);
    setTimeout(() => {
      const next = new Set(flashIds);
      for (const id of ids) next.delete(id);
      flashIds = next;
    }, FLASH_DURATION_MS);
  }

  // is_reconciled is excluded: toggling it already has its own visual affordance
  // (pointed/pending icon + border color) and is a frequent, deliberate click on
  // the row the user is already looking at — flashing it would just be noise.
  function flashSignature(tx) {
    const { is_reconciled, ...rest } = tx;
    return JSON.stringify(rest);
  }

  function diffChangedIds(prevList, nextList) {
    const prevSignatures = new Map(prevList.map(tx => [tx.id, flashSignature(tx)]));
    const changed = new Set();
    for (const tx of nextList) {
      const prevSig = prevSignatures.get(tx.id);
      if (prevSig === undefined || prevSig !== flashSignature(tx)) changed.add(tx.id);
    }
    return changed;
  }

  async function validateSimulation() {
    try {
      await api.post(`/api/accounts/${account.id}/schedules/generate-next-month`, {});
      simulatedTransactions = [];
      await silentRefresh({ refreshSchedules: true });
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors de la validation de la simulation');
    }
  }

  function cancelSimulation() {
    simulatedTransactions = [];
  }


  async function loadData() {
    loading = true; transactions = []; error = '';
    try {
      const [summary, txData, schedulesData] = await Promise.all([
        api.get(`/api/accounts/${account.id}/summary`),
        api.get(`/api/accounts/${account.id}/transactions?limit=100&offset=0`),
        api.get(`/api/accounts/${account.id}/schedules`)
      ]);
      reconciled = summary.reconciled; pending = summary.pending;
      total = summary.total; totalTransactions = summary.transaction_count;
      transactions = txData.data || [];
      schedules = schedulesData || [];
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des opérations');
    }
    finally { loading = false; }
  }

  // Refresh without setting loading=true so TransactionListVirtual is not destroyed
  // (destroying it loses local state: search text, search results, etc.)
  export async function silentRefresh({ refreshSchedules = false } = {}) {
    try {
      // Re-fetch as many rows as were already loaded (infinite scroll may have loaded
      // well beyond the first page) so a refresh never truncates the user's scroll position —
      // that truncation was racing with in-flight loadMore() calls and producing duplicate ids.
      const refreshLimit = Math.max(100, transactions.length);
      const [summary, txData, schedulesData] = await Promise.all([
        api.get(`/api/accounts/${account.id}/summary`),
        api.get(`/api/accounts/${account.id}/transactions?limit=${refreshLimit}&offset=0`),
        refreshSchedules ? api.get(`/api/accounts/${account.id}/schedules`) : Promise.resolve(null)
      ]);
      reconciled = summary.reconciled; pending = summary.pending;
      total = summary.total; totalTransactions = summary.transaction_count;
      const newTransactions = txData.data || [];
      const changed = diffChangedIds(transactions, newTransactions);
      transactions = newTransactions;
      if (refreshSchedules) {
        schedules = schedulesData || [];
      }
      flashTransactionIds(changed);
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du rafraîchissement des opérations');
    }
  }

  async function loadCategories() {
    try {
      allCategories = await api.get(`/api/accounts/${account.id}/categories`);
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des catégories');
    }
  }

  function fmt(n) { const v = parseFloat(n)||0; return (v>=0?'+':'')+v.toFixed(2)+' €'; }
  function kpiClass(n) { const v=parseFloat(n)||0; return v>0?'credit':v<0?'debit':'neutral'; }

  export function closeTrash() {
    txListRef?.closeTrash();
  }
  $effect.pre(() => {
    const acc = account;
    untrack(() => {
      if (acc && acc.id !== currentAccountId) {
        currentAccountId = acc.id;
        flashIds = new Set();
        dataReady = loadData();
      }
    });
  });
  $effect.pre(() => {
    if (account) untrack(() => loadCategories());
  });
</script>

{#if error}
  <div class="error-banner" role="alert">
    {error}
    <button class="error-banner-close" onclick={() => (error = '')} aria-label={$t('Fermer')}>×</button>
  </div>
{/if}

<div class="kpi-grid" style="margin-top: 4px;">
  <div class="kpi-card">
    <div class="kpi-label">{$t('Solde pointé')}</div>
    <div class="kpi-value {kpiClass(reconciled)}">{fmt(reconciled)}</div>
  </div>
  <div class="kpi-card">
    <div class="kpi-label">{$t('À pointer')}</div>
    <div class="kpi-value {kpiClass(pending)}">{fmt(pending)}</div>
  </div>
  <div class="kpi-card">
    <div class="kpi-label">{$t('Solde final')}</div>
    <div class="kpi-value {kpiClass(total)}">{fmt(total)}</div>
  </div>
</div>

{#if simulatedTransactions.length > 0}
  <div class="simulation-banner">
    <div class="simulation-text">
      📋 Mode simulation : {simulatedTransactions.length} opération(s) en attente de validation
    </div>
    <div class="simulation-actions">
      <button class="btn btn-primary" onclick={validateSimulation}>✓ Valider</button>
      <button class="btn btn-ghost" onclick={cancelSimulation}>✗ Annuler</button>
    </div>
  </div>
{/if}

{#if !loading}
  <TransactionListVirtual
    bind:this={txListRef}
    {account} {accounts} {totalTransactions} {flashIds}
    allTransactions={simulatedTransactions.length > 0 ? [...transactions, ...simulatedTransactions.map(t => ({ ...t, is_simulated: true }))].sort((a, b) => b.date.localeCompare(a.date)) : transactions}
    bind:transactions on:updated={() => silentRefresh()}
  />
{:else}
  <div class="state-loading">{$t('Chargement des opérations…')}</div>
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

  .simulation-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    margin-bottom: 16px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid #3B82F6;
    border-radius: 8px;
    color: #3B82F6;
    font-size: 13px;
    font-weight: 500;
  }

  .simulation-text {
    flex: 1;
  }

  .simulation-actions {
    display: flex;
    gap: 8px;
  }

</style>
