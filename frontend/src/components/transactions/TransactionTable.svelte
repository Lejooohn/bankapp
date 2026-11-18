<script lang="ts">
  import { lang, t } from '../../lib/i18n.ts';
  import { catStyle } from '../../utils/categoryColor.js';
  import { modeIcon, modeBadgeStyle } from '../../utils/modeIcon.js';
  import { fmtDate, fmtAmount, fmtMonthYear, getMonthKey, occurrenceLabel, sameMonthYear } from './tx-format.ts';

  // Operations grouped by month (collapsible, with a delete-month action).
  // State (selection, collapsed months, data) belongs to the parent; this renders and reports actions.
  let {
    displayed,
    collapsedMonths,
    monthCounts,
    selectedIds,
    flashIds = new Set(),
    allSelected,
    schedulesById,
    isSearching,
    isSearchActive,
    hasMore,
    isLoading,
    locale,
    onscroll,
    onloadmore,
    ontoggleselect,
    ontoggleselectall,
    onmonthtoggle,
    onmonthdelete,
    onreconcile,
    onedit,
    onduplicate,
    ondelete,
  }: {
    displayed: any[];
    collapsedMonths: Set<string>;
    monthCounts: Map<string, number>;
    selectedIds: Set<string>;
    flashIds?: Set<string>;
    allSelected: boolean;
    schedulesById: Map<string, any>;
    isSearching: boolean;
    isSearchActive: boolean;
    hasMore: boolean;
    isLoading: boolean;
    locale: string;
    onscroll: (e: Event) => void;
    onloadmore: () => void;
    ontoggleselect: (id: string) => void;
    ontoggleselectall: () => void;
    onmonthtoggle: (date: string) => void;
    onmonthdelete: (date: string) => void;
    onreconcile: (tx: any) => void;
    onedit: (tx: any) => void;
    onduplicate: (tx: any) => void;
    ondelete: (id: string) => void;
  } = $props();

  function getTransactionTypeLabel(type: string): string {
    if (!type) return '';
    return $t(type);
  }
</script>

<div class="tx-scroll" {onscroll}>
  {#if displayed.length === 0}
    <div class="state-empty">{isSearching ? $t('Recherche…') : $t('Aucune opération')}</div>
  {:else}
    <table class="tx-table">
      <thead>
        <tr>
          <th style="width:36px; padding-left:14px;">
            <input type="checkbox" checked={allSelected} onchange={ontoggleselectall} style="cursor:pointer;" title={$t('Tout sélectionner')} />
          </th>
          <th style="width:80px;">Date</th>
          <th style="width:36px;" title={$t('Mode')}>{$t('Mode')}</th>
          <th>{$t('Tiers / Détails')}</th>
          <th>{$t('Catégorie')}</th>
          <th class="r">{$t('Montant')}</th>
          <th class="c" style="width:48px;">{$t('Pointé')}</th>
          <th class="tx-actions-cell">{$t('Actions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each displayed as tx, i (tx.id)}
          {#if i === 0 || !sameMonthYear(tx.date, displayed[i-1].date)}
            <tr class="month-sep-row {i === 0 ? 'month-sep-first' : ''}">
              <td colspan="8" class="month-sep-container">
                <div class="month-sep-inner">
                  <button
                    class="month-sep-toggle"
                    title={collapsedMonths.has(getMonthKey(tx.date)) ? $t('Dépliez le mois') : $t('Pliez le mois')}
                    onclick={() => onmonthtoggle(tx.date)}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" class:collapsed={collapsedMonths.has(getMonthKey(tx.date))}>
                      <path d="M6 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <span class="month-sep-label">{fmtMonthYear(tx.date, locale)}</span>
                  <span class="month-sep-count" title="{monthCounts.get(getMonthKey(tx.date)) ?? 0} {$t('opération(s)')}">{monthCounts.get(getMonthKey(tx.date)) ?? 0}</span>
                  <button
                    class="month-sep-delete-btn"
                    title={$t('Supprimer toutes les opérations de ce mois')}
                    onclick={() => onmonthdelete(tx.date)}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 4h10M5 4V2.5h4V4M4.5 4v7a.5.5 0 00.5.5h4a.5.5 0 00.5-.5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          {/if}
          {#if !collapsedMonths.has(getMonthKey(tx.date))}
          <tr class="tx-row {tx.is_reconciled ? 'is-reconciled' : 'is-pending'} {selectedIds.has(tx.id) ? 'is-selected' : ''} {flashIds.has(tx.id) ? 'flash' : ''} {tx.is_locked ? 'is-locked' : ''}">
            <td style="padding-left:14px;">
              {#if !tx.is_locked}
                <input type="checkbox" checked={selectedIds.has(tx.id)} onchange={() => ontoggleselect(tx.id)} style="cursor:pointer;" />
              {/if}
            </td>
            <td class="tx-date">{fmtDate(tx.date, locale)}</td>
            <td class="c" title={getTransactionTypeLabel(tx.transaction_type)}>
              <span class="mode-badge" style={modeBadgeStyle(tx.transaction_type)}>{@html modeIcon(tx.transaction_type)}</span>
            </td>
            <td class="tx-tiers-cell">
              <div class="tx-tiers-name">
                {tx.tiers || tx.description || '—'}
                {#if tx.is_locked}
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" class="tx-lock-icon">
                    <title>{$t('Opération immuable')}</title>
                    <rect x="3" y="6.5" width="8" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/>
                    <path d="M4.5 6.5V4.5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  </svg>
                {/if}
                {#if occurrenceLabel(tx, schedulesById)}
                  <span class="tx-occurrence" title={$t('Occurrences')}>{occurrenceLabel(tx, schedulesById)}</span>
                {/if}
              </div>
              {#if tx.details}<div class="tx-tiers-sub">{tx.details}</div>{/if}
            </td>
            <td>
              {#if tx.category}<span class="cat-badge" style={catStyle(tx.category)}>{tx.category}</span>{/if}
            </td>
            <td class="r">
              <span class="tx-amount {parseFloat(tx.amount) >= 0 ? 'pos' : 'neg'}">{fmtAmount(tx.amount)}</span>
            </td>
            <td class="c">
              <button
                class="btn-icon {tx.is_reconciled ? 'reconcile-on' : 'reconcile-pending'}"
                onclick={() => onreconcile(tx)}
                title={tx.is_reconciled ? ($t('Marquer non pointé')) : ($t('Pointer'))}
              >
                {#if tx.is_reconciled}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="#EFF6FF"/>
                    <path d="M5 8l2.5 2.5 3.5-3.5" stroke="#2563EB" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="rgba(245,158,11,0.12)"/>
                    <circle cx="8" cy="8" r="6.5" stroke="#F59E0B" stroke-width="1.6" stroke-dasharray="3 2"/>
                  </svg>
                {/if}
              </button>
            </td>
            <td class="tx-actions-cell">
              <div class="tx-actions">
                {#if !tx.is_locked}
                  <button class="btn-icon edit" title={$t('Modifier')} onclick={() => onedit(tx)}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                    </svg>
                  </button>
                {/if}
                <button class="btn-icon duplicate" title={$t('Dupliquer')} onclick={() => onduplicate(tx)}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.4"/>
                    <path d="M2 10V3a1 1 0 011-1h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                  </svg>
                </button>
                {#if !tx.is_locked}
                  <button class="btn-icon danger" title={$t('Supprimer')} onclick={() => ondelete(tx.id)}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path d="M2 4h10M5 4V2.5h4V4M4.5 4v7a.5.5 0 00.5.5h4a.5.5 0 00.5-.5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                {/if}
              </div>
            </td>
          </tr>
          {/if}
        {/each}
      </tbody>
    </table>
    {#if isLoading}<div class="state-loading">Chargement…</div>{/if}
    {#if hasMore && !isSearchActive}
      <div style="padding:12px; text-align:center;">
        <button class="btn btn-ghost" onclick={onloadmore}>{$t('Charger plus')}</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .mode-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    font-size: 13px;
    line-height: 1;
  }
  .mode-badge :global(svg) {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  /* ── Reconciliation states ─────────────────────────────────────────────── */

  /* Pending = needs attention → amber left accent + very light tint */
  .tx-row.is-pending td:first-child {
    box-shadow: inset 3px 0 0 #F59E0B;
  }
  .tx-row.is-pending {
    background: rgba(245, 158, 11, 0.13);
  }
  .tx-row.is-pending:hover {
    background: rgba(245, 158, 11, 0.21) !important;
  }
  :global([data-theme="dark"]) .tx-row.is-pending {
    background: rgba(251, 191, 36, 0.17);
  }
  :global([data-theme="dark"]) .tx-row.is-pending:hover {
    background: rgba(251, 191, 36, 0.27) !important;
  }

  /* Reconciled = done → muted text so pending rows pop */
  .tx-row.is-reconciled .tx-date,
  .tx-row.is-reconciled .tx-tiers-name,
  .tx-row.is-reconciled .tx-tiers-sub {
    opacity: 0.5;
  }
  .tx-row.is-reconciled .tx-amount {
    opacity: 0.6;
  }
  :global([data-theme="dark"]) .tx-row.is-reconciled .tx-amount {
    /* On dark backgrounds, 0.6 opacity muddies --credit/--debit into low-contrast colors. */
    opacity: 0.85;
  }
  .tx-row.is-reconciled .cat-badge {
    opacity: 0.9;
  }

  .tx-row.is-selected { background: var(--cobalt-light) !important; }
  .tx-row.is-selected td { border-bottom-color: var(--cobalt-border); }

  /* Locked = immutable initial-balance row */
  .tx-lock-icon {
    vertical-align: -1px;
    margin-left: 4px;
    opacity: 0.55;
  }
  .tx-row.is-locked .tx-tiers-name {
    font-style: italic;
  }

  /* Scheduled operation with a known end: progress "n/N" like the Échéancier column */
  /* Solid cobalt chip: readable on pending (amber) and selected rows, in both themes */
  .tx-occurrence {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 7px;
    border: 1px solid var(--cobalt-border);
    border-radius: 999px;
    background: var(--cobalt-light);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--cobalt);
    vertical-align: 1px;
    white-space: nowrap;
  }

  /* ── New/edited row flash ──────────────────────────────────────────────── */
  @keyframes tx-flash {
    from { background: rgba(102, 126, 234, 0.35); }
    to { background: transparent; }
  }
  .tx-row.flash {
    animation: tx-flash 1.6s ease-out;
  }

  .month-sep-row {
    background: var(--bg);
    height: 60px;
    position: relative;
  }
  .month-sep-row td {
    padding: 0;
    border: none;
  }
  .month-sep-container {
    padding: 0;
    background: transparent;
    border: none;
  }
  .month-sep-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 60px;
    white-space: nowrap;
  }
  .month-sep-label {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #7EC8FF;
    font-family: 'Inter', sans-serif;
    white-space: nowrap;
    flex-shrink: 0;
    background: var(--card);
    padding: 8px 20px;
    border-radius: 20px;
    border: 1px solid #7EC8FF;
  }
  .month-sep-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    font-family: 'Inter', sans-serif;
    white-space: nowrap;
    flex-shrink: 0;
    background: var(--bg-2);
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid var(--border);
  }
  .month-sep-delete-btn {
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: auto;
    transition: color 0.2s ease;
  }
  .month-sep-delete-btn:hover {
    color: #EF4444;
  }

  .month-sep-toggle {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-2);
    flex-shrink: 0;
    transition: color 0.2s ease, transform 0.2s ease;
  }

  .month-sep-toggle:hover {
    color: var(--text-1);
  }

  .month-sep-toggle svg {
    transition: transform 0.2s ease;
  }

  .month-sep-toggle svg.collapsed {
    transform: rotate(-90deg);
  }
</style>
