<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { createEventDispatcher, onMount } from 'svelte';
  import { catStyle } from '../utils/categoryColor.js';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  import TransactionMatchRow from './TransactionMatchRow.svelte';

  let { account, rule, preview } = $props();

  const dispatch = createEventDispatcher();
  let isApplying = $state(false);
  let currentPage = $state(1);
  let matchData = $state(null);
  let isLoading = $state(false);
  let error = $state('');
  // Every matching transaction is selected by default, including on pages the
  // user never visits — we only track the ones explicitly unchecked.
  let deselectedIds = $state(new Set());

  async function loadMatches(page: number = 1) {
    isLoading = true;
    error = '';
    try {
      matchData = await api.get(`/api/accounts/${account.id}/rules/${rule.id}/matches?page=${page}&limit=40`);
      currentPage = page;
    } catch (e) {
      console.error('Error loading matches:', e);
      error = $t('Erreur de connexion');
    }
    finally { isLoading = false; }
  }

  onMount(() => {
    loadMatches(1);
  });

  function toggleDeselect(txId, checked) {
    if (checked) {
      deselectedIds.delete(txId);
    } else {
      deselectedIds.add(txId);
    }
    deselectedIds = deselectedIds;
  }

  async function apply() {
    isApplying = true;
    try {
      const excludeIds = Array.from(deselectedIds);
      const { updated } = await api.post(`/api/accounts/${account.id}/rules/${rule.id}/apply`, { excludeIds });
      dispatch('applied', { updated });
    } catch (e) {
      console.error(e);
      error = $t('Erreur de connexion');
    }
    finally { isApplying = false; }
  }

  function handleOverlayClick() {
    if (window.getSelection().toString() === '') {
      dispatch('cancel');
    }
  }

  function parseDetailsPatterns(p) {
    return p ? p.split('|').filter(Boolean) : [];
  }

  function parseTiersPatterns(p) {
    return p ? p.split('|').filter(Boolean) : [];
  }

  function formatAmount(amount: number) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  let tiersParts = $derived(parseTiersPatterns(rule.tiers_pattern));
  let detailsParts = $derived(parseDetailsPatterns(rule.details_pattern));
</script>

<div class="modal-overlay" onclick={self(handleOverlayClick)} onkeydown={(e) => e.key === 'Escape' && handleOverlayClick()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">

    <div class="modal-head">
      <div>
        <h2 class="modal-title">{$t('Appliquer la règle')}</h2>
        {#if matchData && (matchData.conflicts?.length > 0 || matchData.matches?.length > 0)}
          {@const total = (matchData.conflicts?.length || 0) + (matchData.matches?.length || 0)}
          <p class="modal-sub">
            <strong>{total}</strong> opération{total !== 1 ? 's' : ''} à mettre à jour
          </p>
        {/if}
      </div>
      <button class="modal-close" onclick={() => dispatch('cancel')} aria-label={$t('Fermer')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="modal-body">
      <div class="rule-preview">
        <div class="rule-patterns">
          <div class="tiers-filter">
            {#each tiersParts as p}
              <span class="rule-chip rule-chip-tiers">{p}</span>
            {/each}
          </div>
          {#if detailsParts.length > 0}
            <div class="details-filter">
              {#each detailsParts as p}
                <span class="rule-chip rule-chip-details">{p}</span>
              {/each}
            </div>
          {/if}
        </div>
        <span class="rule-arrow">→</span>
        <span class="cat-badge" style={catStyle(rule.category)}>{rule.category}</span>
      </div>

      {#if preview.count > 0}
        <div class="info-box">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 4v3.5M8 10v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          {$t('Cette action remplace les catégories existantes.')}
        </div>

        {#if matchData && matchData.conflicts && matchData.conflicts.length > 0}
          <div class="conflicts-section">
            <h3 class="conflicts-title">⚠️ {$t('Conflits détectés')} ({matchData.conflicts.length})</h3>
            <p class="conflicts-info">{$t('Ces opérations correspondent au pattern mais ont déjà une catégorie différente')}</p>
            <div class="transactions-list conflicts">
              {#each matchData.conflicts as tx}
                <TransactionMatchRow
                  {tx}
                  conflict
                  checked={!deselectedIds.has(tx.id)}
                  onToggle={(checked) => toggleDeselect(tx.id, checked)}
                >
                  <div class="tx-conflict-info">
                    <div class="tx-category-current">{tx.category}</div>
                    <div class="tx-arrow">→</div>
                    <div class="tx-category-new">{rule.category}</div>
                  </div>
                </TransactionMatchRow>
              {/each}
            </div>
          </div>
        {/if}

        <div class="matches-section">
          <h3 class="matches-title">{$t('À mettre à jour')} ({matchData?.matches?.length || 0})</h3>
          {#if isLoading}
            <div class="loading">{$t('Chargement…')}</div>
          {:else if error}
            <div class="error-box">{error}</div>
          {:else if matchData && matchData.matches && matchData.matches.length > 0}
            <div class="transactions-list">
              {#each matchData.matches as tx}
                <TransactionMatchRow
                  {tx}
                  checked={!deselectedIds.has(tx.id)}
                  onToggle={(checked) => toggleDeselect(tx.id, checked)}
                >
                  <div class="tx-amount" class:negative={tx.amount < 0}>
                    {formatAmount(tx.amount)}
                  </div>
                </TransactionMatchRow>
              {/each}
            </div>

            {#if matchData.totalPages && matchData.totalPages > 1}
              <div class="pagination">
                <button
                  class="btn-page"
                  disabled={currentPage === 1 || isLoading}
                  onclick={() => loadMatches(currentPage - 1)}
                >
                  ← {$t('Précédent')}
                </button>
                <div class="page-info">
                  Page {currentPage} / {matchData.totalPages}
                </div>
                <button
                  class="btn-page"
                  disabled={currentPage === matchData.totalPages || isLoading}
                  onclick={() => loadMatches(currentPage + 1)}
                >
                  {$t('Suivant')} →
                </button>
              </div>
            {/if}
          {:else}
            <div class="empty-state">{$t('Aucune opération à afficher')}</div>
          {/if}
        </div>
      {:else if preview.matched > 0}
        <div class="no-update-needed">
          <div class="success-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="2"/>
              <path d="M16 24l6 6 12-12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h3 class="no-update-title">{$t('Aucune mise à jour nécessaire')}</h3>
          <p class="no-update-text">
            {@html $t(preview.matched !== 1 ? 'Toutes les {n} opérations correspondant à cette règle sont déjà correctement catégorisées.' : 'Toutes les {n} opération correspondant à cette règle est déjà correctement catégorisée.').replace('{n}', `<strong>${preview.matched}</strong>`)}
          </p>
        </div>
      {:else}
        <div class="no-matches">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="2"/>
              <path d="M24 16v16M16 24h16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="no-matches-text">{$t('Aucune opération ne correspond à cette règle')}</p>
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        {#if preview.count > 0 || (matchData && matchData.conflicts && matchData.conflicts.length > 0)}
          <button class="btn btn-ghost" onclick={() => dispatch('cancel')}>{$t('Annuler')}</button>
          <button class="btn btn-primary" onclick={apply} disabled={isApplying || deselectedIds.size >= preview.count}>
            {isApplying ? $t('Application…') : `${$t('Appliquer')} (${Math.max(preview.count - deselectedIds.size, 0)})`}
          </button>
        {:else}
          <button class="btn btn-primary" onclick={() => dispatch('cancel')}>{$t('Fermer')}</button>
        {/if}
      </div>
    </div>

  </div>
</div>

<style>
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(15,23,42,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 200;
    backdrop-filter: blur(2px);
  }
  .modal-box {
    background: var(--card);
    border-radius: 14px;
    box-shadow: 0 20px 60px var(--shadow-modal);
    width: min(580px, 96vw);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .modal-title {
    font-size: 16px; font-weight: 700;
    color: var(--text-1); font-family: var(--font-ui);
    margin: 0 0 4px;
  }
  .modal-sub {
    font-size: 12.5px; color: var(--text-3);
    font-family: var(--font-ui); margin: 0;
  }
  .modal-sub strong { color: var(--text-1); font-weight: 600; }
  .modal-close {
    background: none; border: none; cursor: pointer;
    padding: 4px; color: var(--text-3); border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-left: 12px;
    transition: color 0.1s, background 0.1s;
  }
  .modal-close:hover { color: var(--text-1); background: var(--surface); }

  .modal-body {
    padding: 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 50vh;
    overflow-y: auto;
  }

  .rule-preview {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px;
    background: var(--surface);
    border-radius: 8px;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .matches-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .matches-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .transactions-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface);
  }

  .tx-amount {
    flex-shrink: 0;
    margin-left: 12px;
    font-weight: 600;
    font-family: var(--font-mono);
    color: var(--text-1);
  }
  .tx-amount.negative {
    color: #ef4444;
  }

  .loading {
    text-align: center;
    padding: 24px;
    color: var(--text-3);
    font-size: 12px;
  }

  .error-box {
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 6px;
    padding: 12px;
    font-size: 12px;
    color: #c00;
    text-align: center;
  }

  .empty-state {
    text-align: center;
    padding: 24px;
    color: var(--text-3);
    font-size: 12px;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 0;
    margin-top: 8px;
  }

  .btn-page {
    padding: 4px 10px;
    font-size: 11px;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.1s;
    color: var(--text-2);
  }
  .btn-page:hover:not(:disabled) {
    background: var(--card-hover);
    color: var(--text-1);
  }
  .btn-page:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    font-size: 11px;
    color: var(--text-3);
    min-width: 100px;
    text-align: center;
  }

  .rule-patterns {
    flex: 1; display: flex; flex-direction: column;
    gap: 4px; min-width: 0;
  }
  .rule-chip {
    display: inline-block;
    padding: 2px 9px;
    background: var(--chip-neutral-bg); border: 1px solid var(--chip-neutral-border);
    border-radius: 5px; font-size: 12px;
    color: var(--text-2); font-family: var(--font-mono);
    white-space: nowrap;
    width: fit-content;
  }
  .rule-chip-tiers {
    font-weight: 600;
    background: var(--cobalt);
    border-color: var(--cobalt);
    color: white;
  }
  .tiers-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .details-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .rule-chip-details {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text-3);
    font-size: 10px;
  }

  .rule-arrow { color: var(--text-3); font-size: 14px; flex-shrink: 0; }

  .info-box {
    display: flex; align-items: flex-start; gap: 8px;
    font-size: 11.5px; color: var(--info-text);
    font-family: var(--font-ui);
    background: var(--info-bg); border: 1px solid var(--info-border);
    border-radius: 7px; padding: 8px 12px;
  }

  .modal-footer {
    padding: 14px 24px; border-top: 1px solid var(--border);
    flex-shrink: 0; display: flex; flex-direction: column;
    gap: 12px; background: var(--surface);
  }

  /* Empty states */
  .no-update-needed {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    text-align: center;
    gap: 12px;
  }

  .success-icon {
    color: #10b981;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .no-update-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-1);
    margin: 0;
  }

  .no-update-text {
    font-size: 13px;
    color: var(--text-2);
    margin: 0;
    max-width: 400px;
  }

  .no-update-text :global(strong) {
    color: var(--text-1);
    font-weight: 600;
  }

  .no-matches {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    text-align: center;
    gap: 12px;
  }

  .empty-icon {
    color: var(--text-3);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .no-matches-text {
    font-size: 13px;
    color: var(--text-2);
    margin: 0;
  }

  /* Conflicts section */
  .conflicts-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .conflicts-title {
    font-size: 12px;
    font-weight: 600;
    color: #d97706;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .conflicts-info {
    font-size: 11px;
    color: var(--text-3);
    margin: 0;
  }

  .transactions-list.conflicts {
    border-color: #fed7aa;
    background: var(--surface);
  }

  .tx-conflict-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    font-size: 11px;
  }

  .tx-category-current {
    background: #fef3c7;
    color: #92400e;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
    white-space: nowrap;
  }

  .tx-arrow {
    color: #d97706;
    font-weight: 600;
  }

  .tx-category-new {
    background: var(--chip-neutral-bg);
    color: var(--text-2);
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
    white-space: nowrap;
  }
</style>
