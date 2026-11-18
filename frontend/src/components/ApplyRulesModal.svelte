<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { createEventDispatcher, onMount, untrack } from 'svelte';
  import { catStyle } from '../utils/categoryColor.js';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  import NoUpdatesModal from './NoUpdatesModal.svelte';
  import TransactionMatchRow from './TransactionMatchRow.svelte';

  let { account, preview = [] } = $props();

  const dispatch = createEventDispatcher();
  let isApplying = $state(false);
  let rulesWithConflicts = $state([]);
  let isLoadingConflicts = $state(false);
  let expandedRules = $state(new Set<string>());
  let selectedTransactions = $state(new Map<string, Set<string>>());
  let showNoUpdatesModal = $state(false);

  onMount(async () => {
    if (total > 0) {
      isLoadingConflicts = true;
      try {
        rulesWithConflicts = await api.get(`/api/accounts/${account.id}/apply-rules-conflicts`);
        for (const rule of rulesWithConflicts) {
          const txIds = new Set<string>();
          if (rule.matches) rule.matches.forEach((tx: any) => txIds.add(tx.id));
          if (rule.conflicts) rule.conflicts.forEach((tx: any) => txIds.add(tx.id));
          if (txIds.size > 0) {
            selectedTransactions.set(rule.id, txIds);
          }
        }
        selectedTransactions = selectedTransactions;
      } catch (e) {
        console.error('Error loading conflicts:', e);
      } finally {
        isLoadingConflicts = false;
      }
    }
  });

  function toggleTransactionSelection(ruleId: string, txId: string) {
    const txSet = selectedTransactions.get(ruleId) || new Set();
    if (txSet.has(txId)) {
      txSet.delete(txId);
    } else {
      txSet.add(txId);
    }
    if (txSet.size === 0) {
      selectedTransactions.delete(ruleId);
    } else {
      selectedTransactions.set(ruleId, txSet);
    }
    selectedTransactions = selectedTransactions;
  }

  async function apply() {
    isApplying = true;
    try {
      const excludeIds: string[] = [];
      for (const [ruleId, txSet] of selectedTransactions.entries()) {
        const ruleData = rulesWithConflicts.find(r => r.id === ruleId);
        if (ruleData) {
          const allTxIds = new Set<string>();
          if (ruleData.matches) ruleData.matches.forEach((tx: any) => allTxIds.add(tx.id));
          if (ruleData.conflicts) ruleData.conflicts.forEach((tx: any) => allTxIds.add(tx.id));
          for (const txId of allTxIds) {
            if (!txSet.has(txId)) {
              excludeIds.push(txId);
            }
          }
        }
      }

      const { updated } = await api.post(`/api/accounts/${account.id}/apply-rules`, { excludeIds: excludeIds.length > 0 ? excludeIds : undefined });

      if (updated === 0) {
        showNoUpdatesModal = true;
      } else {
        dispatch('applied', { updated });
      }
    } catch (e) { console.error(e); }
    finally { isApplying = false; }
  }

  function handleNoUpdatesClose() {
    showNoUpdatesModal = false;
    dispatch('cancel');
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

  function toggleRuleExpand(ruleId: string) {
    if (expandedRules.has(ruleId)) {
      expandedRules.delete(ruleId);
    } else {
      expandedRules.add(ruleId);
    }
    expandedRules = expandedRules;
  }

  function formatAmount(amount: number) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  let total = $derived(preview.reduce((sum, r) => sum + r.count, 0));
  let matched = $derived(preview.filter(r => r.count > 0));
  let rulesWithIssues = $derived(rulesWithConflicts.filter(r => r.conflicts && r.conflicts.length > 0));
  $effect.pre(() => {
    if (preview.length > 0 && total === 0 && !isLoadingConflicts) {
      untrack(() => {
        showNoUpdatesModal = true;
      });
    }
  });
</script>

<div class="modal-overlay" onclick={self(handleOverlayClick)} onkeydown={(e) => e.key === 'Escape' && handleOverlayClick()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">

    <div class="modal-head">
      <div>
        <h2 class="modal-title">{$t('Appliquer les règles')}</h2>
        <p class="modal-sub">
          {#if total > 0}
            {matched.length !== 1 ? $t('règles concernées') : $t('règle concernée')} ·
            <strong>{total}</strong> {total !== 1 ? $t('opérations à mettre à jour') : $t('opération à mettre à jour')}
          {:else}
            {$t('Aucune opération ne correspond aux règles actives')}
          {/if}
        </p>
      </div>
      <button class="modal-close" onclick={() => dispatch('cancel')} aria-label={$t('Fermer')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="modal-body">
      {#if preview.length === 0}
        <div class="state-empty" style="padding:32px;">{$t('Aucune règle configurée.')}</div>
      {:else if isLoadingConflicts}
        <div class="loading-conflicts">
          <div style="text-align: center; padding: 20px; color: var(--text-3); font-size: 13px;">
            Chargement des conflits…
          </div>
        </div>
      {:else}
        {#if total > 0}
          <div class="info-box warning" style="margin: 12px 24px 8px;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink:0; color:#dc2626;">
              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
              <path d="M8 4v4M8 11v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            <span>{@html $t('Cette action <strong>remplacera</strong> les catégories existantes des opérations concernées.')}</span>
          </div>
        {/if}
        {#each preview as rule}
          {@const tiersParts = parseTiersPatterns(rule.tiers_pattern)}
          {@const detailsParts = parseDetailsPatterns(rule.details_pattern)}
          {@const ruleConflictData = rulesWithConflicts.find(r => r.id === rule.id)}
          {@const hasConflicts = ruleConflictData && ruleConflictData.conflicts && ruleConflictData.conflicts.length > 0}
          {@const isExpanded = expandedRules.has(rule.id)}
          {@const selectedTxs = selectedTransactions.get(rule.id) || new Set()}
          <div class="rule-row {rule.count === 0 ? 'rule-row--zero' : ''} {hasConflicts ? 'rule-row--has-conflicts' : ''}">
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
            <div
              class="rule-main"
              class:interactive={rule.count > 0}
              role={rule.count > 0 ? "button" : undefined}
              tabindex={rule.count > 0 ? 0 : undefined}
              onclick={() => rule.count > 0 && toggleRuleExpand(rule.id)}
              onkeydown={(e) => rule.count > 0 && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleRuleExpand(rule.id))}
            >
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
              <span class="rule-count {rule.count > 0 ? 'rule-count--hit' : 'rule-count--miss'}">
                {rule.count > 0 ? `${rule.count} ${rule.count !== 1 ? $t('opérations') : $t('opération')}` : $t('aucune')}
              </span>
              {#if hasConflicts}
                <span class="conflict-badge">⚠️ {ruleConflictData.conflicts.length}</span>
              {/if}
            </div>
            {#if isExpanded && rule.count > 0}
              <div class="rule-details">
                {#if ruleConflictData?.matches && ruleConflictData.matches.length > 0}
                  <div class="matches-section">
                    <div class="matches-label">✓ {$t('Opérations à mettre à jour')} ({ruleConflictData.matches.length})</div>
                    <div class="transactions-list">
                      {#each ruleConflictData.matches as tx}
                        <TransactionMatchRow
                          {tx}
                          checked={selectedTxs.has(tx.id)}
                          onToggle={() => toggleTransactionSelection(rule.id, tx.id)}
                        >
                          <div class="tx-category">
                            <div class="tx-category-new">{rule.category}</div>
                          </div>
                        </TransactionMatchRow>
                      {/each}
                    </div>
                  </div>
                {/if}
                {#if ruleConflictData?.conflicts && ruleConflictData.conflicts.length > 0}
                  <div class="conflicts-section">
                    <div class="conflicts-label">⚠️ {$t('Conflits détectés')} ({ruleConflictData.conflicts.length})</div>
                    <div class="transactions-list conflicts">
                      {#each ruleConflictData.conflicts as tx}
                        <TransactionMatchRow
                          {tx}
                          conflict
                          checked={selectedTxs.has(tx.id)}
                          onToggle={() => toggleTransactionSelection(rule.id, tx.id)}
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
              </div>
            {/if}
          </div>
        {/each}
        {#if rulesWithIssues.length > 0}
          <div class="conflicts-summary">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink:0; color:#d97706;">
              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
              <path d="M8 4v4M8 11v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            <span>
              {#if $lang === 'en'}
                {rulesWithIssues.length} rule{rulesWithIssues.length !== 1 ? 's have' : ' has'} conflicts — click to see details
              {:else}
                {rulesWithIssues.length} règle{rulesWithIssues.length !== 1 ? 's' : ''} {rulesWithIssues.length !== 1 ? 'ont' : 'a'} des conflits — cliquez pour voir les détails
              {/if}
            </span>
          </div>
        {/if}
      {/if}
    </div>

    <div class="modal-footer">
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-ghost" onclick={() => dispatch('cancel')}>{$t('Annuler')}</button>
        <button class="btn btn-apply-rules" onclick={apply} disabled={isApplying || total === 0}>
          {isApplying ? $t('Application…') : $t('Appliquer toutes les règles')}
        </button>
      </div>
    </div>

  </div>
</div>

{#if showNoUpdatesModal}
  <NoUpdatesModal onClose={handleNoUpdatesClose} />
{/if}

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
    width: min(640px, 96vw);
    max-height: 86vh;
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
    color: var(--text-1); font-family: 'Inter', sans-serif;
    margin: 0 0 4px;
  }
  .modal-sub {
    font-size: 12.5px; color: var(--text-3);
    font-family: 'Inter', sans-serif; margin: 0;
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
    flex: 1; overflow-y: auto; padding: 8px 0;
  }

  .loading-conflicts {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100px;
  }

  .rule-row {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #F1F5F9;
    transition: background 0.08s;
  }
  .rule-row:last-child { border-bottom: none; }
  .rule-row--zero { opacity: 0.45; }
  .rule-row--has-conflicts .rule-main {
    cursor: pointer;
  }
  .rule-row--has-conflicts .rule-main:hover {
    background: rgba(217, 119, 6, 0.03);
  }

  .rule-main {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 24px;
    transition: background 0.08s;
  }
  .rule-main.interactive {
    cursor: pointer;
  }
  .rule-main.interactive:hover { background: var(--card-hover); }
  .rule-row:hover .rule-main { background: var(--card-hover); }

  .rule-details {
    padding: 0 24px 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .matches-section {
    border-top: 1px solid #d1d5db;
    padding-top: 12px;
  }

  .matches-label {
    font-size: 11px;
    font-weight: 600;
    color: #059669;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 8px;
  }

  .conflicts-section {
    border-top: 1px solid #fed7aa;
    padding-top: 12px;
    background: rgba(254, 243, 199, 0.15);
    padding-left: 12px;
    padding-right: 12px;
    margin-left: -12px;
    margin-right: -12px;
    margin-bottom: -12px;
    padding-bottom: 12px;
  }

  .conflicts-label {
    font-size: 11px;
    font-weight: 600;
    color: #d97706;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 8px;
  }

  .conflict-badge {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    background: #fed7aa;
    color: #d97706;
    padding: 2px 8px;
    border-radius: 12px;
    margin-left: auto;
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
    color: var(--text-2); font-family: 'Fira Code', monospace;
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

  .rule-count {
    flex-shrink: 0; font-size: 11.5px; font-weight: 600;
    font-family: 'Fira Code', monospace;
    padding: 2px 8px; border-radius: 20px;
  }
  .rule-count--hit { background: var(--success-bg); color: var(--success-text); }
  .rule-count--miss { background: var(--chip-neutral-bg); color: var(--text-3); }

  .info-box {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 11.5px;
    font-family: 'Inter', sans-serif;
    border-radius: 7px;
    padding: 8px 12px;
  }

  .info-box.warning {
    color: #991b1b;
    background: #fee2e2;
    border: 1px solid #fca5a5;
  }

  .modal-footer {
    padding: 14px 24px; border-top: 1px solid var(--border);
    flex-shrink: 0; display: flex; flex-direction: column;
    gap: 12px; background: var(--surface);
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

  .transactions-list.conflicts {
    border-color: #fed7aa;
    background: var(--surface);
  }

  .tx-category {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    font-size: 11px;
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

  .conflicts-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    color: #d97706;
    padding: 8px 24px;
    background: rgba(217, 119, 6, 0.05);
    border-top: 1px solid #fed7aa;
  }

  .btn {
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Inter', sans-serif;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-2);
    border: 1px solid var(--border);
  }

  .btn-ghost:hover:not(:disabled) {
    background: var(--surface);
    border-color: var(--text-2);
  }

  .btn-apply-rules {
    background: #d97706;
    color: white;
    border: none;
  }

  .btn-apply-rules:hover:not(:disabled) {
    background: #b45309;
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3);
  }

  .btn-apply-rules:active:not(:disabled) {
    transform: scale(0.98);
  }
</style>
