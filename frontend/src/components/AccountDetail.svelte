<script lang="ts">
  import { untrack } from 'svelte';
  
  import TransactionListVirtual from './TransactionListVirtual.svelte';
  import { fmtAmount } from './transactions/tx-format.ts';
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


  // The list always holds the whole current year (the API completes the page down to this date)
  function yearStart() {
    return `${new Date().getFullYear()}-01-01`;
  }

  async function loadData() {
    loading = true; transactions = []; error = '';
    try {
      const [summary, txData, schedulesData] = await Promise.all([
        api.get(`/api/accounts/${account.id}/summary`),
        api.get(`/api/accounts/${account.id}/transactions?limit=100&since=${yearStart()}`),
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
      // Re-fetch down to the oldest row already loaded (infinite scroll may have gone
      // back beyond the current year) so a refresh never truncates the user's scroll position —
      // that truncation was racing with in-flight loadMore() calls and producing duplicate ids.
      const oldest = transactions[transactions.length - 1]?.date.substring(0, 10);
      const since = oldest && oldest < yearStart() ? oldest : yearStart();
      const [summary, txData, schedulesData] = await Promise.all([
        api.get(`/api/accounts/${account.id}/summary`),
        api.get(`/api/accounts/${account.id}/transactions?limit=100&since=${since}`),
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

  let locale = $derived($lang === 'fr' ? 'fr-FR' : 'en-US');
  const isOverdrawn = (n) => (parseFloat(n) || 0) < 0;
  const isPositive = (n) => (parseFloat(n) || 0) > 0;
  const hasPending = (n) => Math.abs(parseFloat(n) || 0) >= 0.005;

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

<!-- Read left to right like the foot of a statement: ticked balance, what is left to tick, final balance. -->
<dl class="balance">
  <div class="balance-cell">
    <dt>
      <svg class="mark-ticked" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3.8 10.4c1.5.9 2.8 2.4 3.6 4.6C9.2 9.9 12 5.9 17.2 2.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {$t('Solde pointé')}
    </dt>
    <dd class="ticked" class:overdrawn={isOverdrawn(reconciled)}>{fmtAmount(reconciled, locale, 'auto')}</dd>
  </div>
  <div class="balance-cell">
    <dt>
      <svg class="mark-pending" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2" stroke-dasharray="3.2 2.3"/></svg>
      {$t('À pointer')}
    </dt>
    <dd class:pending={hasPending(pending)}>{fmtAmount(pending, locale)}</dd>
  </div>
  <div class="balance-cell balance-final" class:positive={isPositive(total)} class:overdrawn={isOverdrawn(total)}>
    <dt>{$t('Solde final')}</dt>
    <dd><span class="balance-equals" aria-hidden="true">=</span>{fmtAmount(total, locale, 'auto')}</dd>
  </div>
</dl>

{#if simulatedTransactions.length > 0}
  <div class="simulation-banner">
    <div class="simulation-text">
      {(simulatedTransactions.length > 1
        ? $t('Mode simulation : {n} opérations en attente de validation')
        : $t('Mode simulation : {n} opération en attente de validation')
      ).replace('{n}', String(simulatedTransactions.length))}
    </div>
    <div class="simulation-actions">
      <button class="btn btn-ghost" onclick={cancelSimulation}>{$t('Annuler')}</button>
      <button class="btn btn-primary" onclick={validateSimulation}>{$t('Valider')}</button>
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

  .balance {
    display: grid;
    grid-template-columns: 1fr 1fr 1.4fr;
    margin-bottom: 16px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  .balance-cell {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 16px;
  }
  .balance-cell + .balance-cell { border-left: 1px solid var(--border); }

  .balance dt {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    line-height: 20px;
    color: var(--text-2);
  }

  .balance dd {
    font-size: 24px;
    font-weight: 500;
    line-height: 40px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .balance-final dd {
    font-size: 36px;
    font-weight: 500;
    color: var(--text-1);
  }

  /* Each figure wears the color of its state: the ink of the tick, what is left to tick, the result */
  .mark-ticked,
  .balance dd.ticked { color: var(--cobalt); }
  .mark-pending,
  .balance dd.pending { color: var(--pending); }
  .balance-final.positive { background: color-mix(in srgb, var(--credit) 7%, transparent); }
  .balance-final.positive dd { color: var(--credit); }
  .balance-final.overdrawn { background: color-mix(in srgb, var(--debit) 7%, transparent); }
  .balance-final.overdrawn dd,
  .balance dd.ticked.overdrawn { color: var(--debit); }

  .balance-equals {
    margin-right: 12px;
    font-weight: 400;
    color: var(--text-3);
  }

  .simulation-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px 16px;
    padding: 12px 16px;
    margin-bottom: 16px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    font-size: 14px;
    color: var(--text-1);
  }

  .simulation-actions {
    display: flex;
    gap: 8px;
  }

  @media (max-width: 860px) {
    .balance { grid-template-columns: 1fr; }
    .balance-cell + .balance-cell { border-left: none; border-top: 1px solid var(--border); }
    .balance-final dd { font-size: 32px; }
  }
</style>
