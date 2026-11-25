<script lang="ts">
  import { lang, t } from '../../lib/i18n.ts';
  import { catDotStyle } from '../../utils/categoryColor.js';
  import { modeColor, modeIcon } from '../../utils/modeIcon.js';
  import Icon from '../Icon.svelte';
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
          <th class="tx-check">
            <input type="checkbox" checked={allSelected} onchange={ontoggleselectall} title={$t('Tout sélectionner')} aria-label={$t('Tout sélectionner')} />
          </th>
          <th class="tx-col-date">{$t('Date')}</th>
          <th class="c tx-col-mode">{$t('Mode')}</th>
          <th class="tx-col-tiers">{$t('Tiers / Détails')}</th>
          <th>{$t('Catégorie')}</th>
          <th class="r">{$t('Montant')}</th>
          <th class="c tx-col-tick">{$t('Pointé')}</th>
          <th class="tx-actions-cell"><span class="sr-only">{$t('Actions')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each displayed as tx, i (tx.id)}
          {#if i === 0 || !sameMonthYear(tx.date, displayed[i-1].date)}
            <tr class="month-sep-row {i === 0 ? 'month-sep-first' : ''}">
              <td colspan="8" class="month-sep-container">
                <div class="month-sep-inner">
                  <button
                    class="btn-icon month-sep-toggle"
                    title={collapsedMonths.has(getMonthKey(tx.date)) ? $t('Dépliez le mois') : $t('Pliez le mois')}
                    aria-label={collapsedMonths.has(getMonthKey(tx.date)) ? $t('Dépliez le mois') : $t('Pliez le mois')}
                    aria-expanded={!collapsedMonths.has(getMonthKey(tx.date))}
                    onclick={() => onmonthtoggle(tx.date)}
                  >
                    <span class="month-sep-chevron" class:collapsed={collapsedMonths.has(getMonthKey(tx.date))}><Icon name="chevron-down" /></span>
                  </button>
                  <span class="month-sep-label">{fmtMonthYear(tx.date, locale)}</span>
                  <span class="month-sep-count" title="{monthCounts.get(getMonthKey(tx.date)) ?? 0} {$t('opération(s)')}">{monthCounts.get(getMonthKey(tx.date)) ?? 0}</span>
                  <button
                    class="btn-icon danger month-sep-delete-btn"
                    title={$t('Supprimer toutes les opérations de ce mois')}
                    aria-label={$t('Supprimer toutes les opérations de ce mois')}
                    onclick={() => onmonthdelete(tx.date)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </td>
            </tr>
          {/if}
          {#if !collapsedMonths.has(getMonthKey(tx.date))}
          <tr class="tx-row {tx.is_reconciled ? 'is-reconciled' : 'is-pending'} {selectedIds.has(tx.id) ? 'is-selected' : ''} {flashIds.has(tx.id) ? 'flash' : ''} {tx.is_locked ? 'is-locked' : ''}">
            <td class="tx-check">
              {#if !tx.is_locked}
                <input type="checkbox" checked={selectedIds.has(tx.id)} onchange={() => ontoggleselect(tx.id)} aria-label={tx.tiers || tx.description || $t('Opérations')} />
              {/if}
            </td>
            <td class="tx-date">{fmtDate(tx.date, locale)}</td>
            <td class="c" title={getTransactionTypeLabel(tx.transaction_type)}>
              <span class="mode-badge" style="--mode:{modeColor(tx.transaction_type)}">{@html modeIcon(tx.transaction_type)}</span>
            </td>
            <td class="tx-tiers-cell">
              <div class="tx-tiers">
              <div class="tx-tiers-name">
                {tx.tiers || tx.description || '—'}
                {#if tx.is_locked}
                  <span class="tx-lock-icon" title={$t('Opération immuable')}><Icon name="lock" /></span>
                {/if}
                {#if occurrenceLabel(tx, schedulesById)}
                  <span class="tx-occurrence" title={$t('Occurrences')}>{occurrenceLabel(tx, schedulesById)}</span>
                {/if}
              </div>
              {#if tx.details}<div class="tx-tiers-sub">{tx.details}</div>{/if}
              </div>
            </td>
            <td>
              {#if tx.category}<span class="tx-cat" style={catDotStyle(tx.category)}>{tx.category}</span>{/if}
            </td>
            <td class="r">
              <span class="tx-amount {parseFloat(tx.amount) >= 0 ? 'pos' : 'neg'}">{fmtAmount(tx.amount, locale)}</span>
            </td>
            <td class="c">
              <button
                class="btn-icon tick {tx.is_reconciled ? 'reconcile-on' : 'reconcile-pending'}"
                onclick={() => onreconcile(tx)}
                title={tx.is_reconciled ? ($t('Marquer non pointé')) : ($t('Pointer'))}
                aria-label={$t('Pointer')}
                aria-pressed={!!tx.is_reconciled}
              >
                <!-- The pen tick of a checked statement: a dashed circle until it is ticked, then ink.
                     Round, so it never looks like the square selection checkbox. -->
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle class="tick-open" cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.75" stroke-dasharray="3.2 2.3" stroke-linecap="butt"/>
                  <path class="tick-ink" d="M3.8 10.4c1.5.9 2.8 2.4 3.6 4.6C9.2 9.9 12 5.9 17.2 2.4" pathLength="1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </td>
            <td class="tx-actions-cell">
              <div class="tx-actions">
                {#if !tx.is_locked}
                  <button class="btn-icon edit" title={$t('Modifier')} aria-label={$t('Modifier')} onclick={() => onedit(tx)}>
                    <Icon name="pencil" />
                  </button>
                {/if}
                <button class="btn-icon duplicate" title={$t('Dupliquer')} aria-label={$t('Dupliquer')} onclick={() => onduplicate(tx)}>
                  <Icon name="copy" />
                </button>
                {#if !tx.is_locked}
                  <button class="btn-icon danger" title={$t('Supprimer')} aria-label={$t('Supprimer')} onclick={() => ondelete(tx.id)}>
                    <Icon name="trash" />
                  </button>
                {/if}
              </div>
            </td>
          </tr>
          {/if}
        {/each}
      </tbody>
    </table>
    {#if isLoading}<div class="state-loading">{$t('Chargement…')}</div>{/if}
    {#if hasMore && !isSearchActive}
      <div style="padding:12px; text-align:center;">
        <button class="btn btn-ghost" onclick={onloadmore}>{$t('Charger plus')}</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .tx-check { width: 44px; padding-left: 16px !important; }
  /* Selection stays in the background: the tick column is the one to read */
  .tx-check input { display: block; width: 16px; height: 16px; cursor: pointer; opacity: 0.35; transition: opacity 120ms var(--ease); }
  .tx-table tr:hover .tx-check input,
  .tx-check input:checked,
  .tx-check input:focus-visible { opacity: 1; }
  @media (hover: none) { .tx-check input { opacity: 1; } }
  .tx-col-date { width: 96px; }
  .tx-col-mode { width: 56px; }
  .tx-col-tick { width: 72px; }

  .mode-badge {
    display: inline-flex;
    vertical-align: middle;
    /* Pulled towards the text color: readable in both themes, whatever the hue */
    color: color-mix(in oklab, var(--mode) var(--icon-mix), var(--text-1));
  }
  .mode-badge :global(svg) {
    width: 16px;
    height: 16px;
  }
  .mode-badge :global(svg *) { vector-effect: non-scaling-stroke; }

  /* Category: a chip in its own color, the same one as its dot in Statistics */
  .tx-cat {
    display: inline-block;
    max-width: 100%;
    padding: 0 8px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--dot) 15%, transparent);
    font-size: 13px;
    line-height: 24px;
    color: color-mix(in oklab, var(--dot) var(--label-mix), var(--text-1));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
  }

  /* The date follows the state: full strength while pending, secondary once ticked */
  .tx-row .tx-date { color: var(--text-2); }
  .tx-row.is-pending .tx-date { color: var(--text-1); }

  .tx-row .tx-tiers-sub { color: var(--text-2); }

  /* ── Reconciliation states ─────────────────────────────────────────────── */

  /* Pending: amber edge, light amber row and amber circle, the color of the "À pointer" balance.
     Ticked operations have no background; both keep readable text. */
  .tx-row.is-pending { background: color-mix(in srgb, var(--pending-fill) var(--pending-mix), transparent); }
  .tx-row.is-pending:hover { background: color-mix(in srgb, var(--pending-fill) calc(var(--pending-mix) * 1.6), transparent); }
  .tx-row.is-pending .tx-check { box-shadow: inset 3px 0 0 var(--pending-fill); }
  .tick.reconcile-pending { color: var(--pending); }

  .tx-row.is-pending .tx-tiers-name { font-weight: 600; }

  .tick.reconcile-on { color: var(--cobalt); }
  .tick svg { overflow: visible; }
  .tick-open { transition: opacity 150ms var(--ease); }
  .tick-ink {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    opacity: 0;
    transition: stroke-dashoffset 180ms var(--ease), opacity 60ms linear;
  }
  .tick.reconcile-on .tick-open { opacity: 0; }
  .tick.reconcile-on .tick-ink { stroke-dashoffset: 0; opacity: 1; }

  /* Selection is blue and comes after pending, so it wins on a pending row */
  .tx-row.is-selected,
  .tx-row.is-selected:hover { background: var(--cobalt-light); }
  .tx-row.is-selected .tx-check { box-shadow: inset 3px 0 0 var(--cobalt); }

  /* Locked = immutable initial-balance row */
  .tx-lock-icon {
    display: inline-flex;
    vertical-align: -3px;
    margin-left: 4px;
    color: var(--text-3);
  }
  .tx-row.is-locked .tx-tiers-name { color: var(--text-2); }

  /* Scheduled operation with a known end: progress "n/N" like the Échéancier column */
  /* Opaque tint of the accent, so it stays blue on pending (amber) and selected rows too */
  .tx-occurrence {
    margin-left: 8px;
    padding: 0 6px;
    border: 1px solid var(--cobalt-border);
    border-radius: 4px;
    background: color-mix(in srgb, var(--cobalt) 10%, var(--card));
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 500;
    color: var(--cobalt);
    white-space: nowrap;
  }

  /* ── New/edited row flash ──────────────────────────────────────────────── */
  @keyframes tx-flash {
    from { background: var(--cobalt-dim); }
  }
  .tx-row.flash {
    animation: tx-flash 1.6s ease-out;
  }

  /* ── Month line ────────────────────────────────────────────────────────── */
  .month-sep-row { background: var(--surface); }
  .month-sep-container {
    padding: 0;
    border-bottom: 1px solid var(--border);
  }
  .month-sep-inner {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 12px 0 10px;
    white-space: nowrap;
  }
  .month-sep-label {
    margin-left: 10px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-1);
  }
  .month-sep-count {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-3);
  }
  .month-sep-delete-btn { margin-left: auto; }

  .month-sep-chevron {
    display: flex;
    transition: transform 160ms var(--ease);
  }
  .month-sep-chevron.collapsed { transform: rotate(-90deg); }

  /* Wide screens: details sit beside the third party on their own line of sight, so every operation
     fits on one line and more of them are visible. */
  .tx-scroll { container-type: inline-size; }
  @container (min-width: 1400px) {
    .tx-col-tiers { width: 46%; }
    .tx-tiers-cell { max-width: 0; }
    .tx-tiers {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      column-gap: 24px;
      align-items: center;
    }
    .tx-row .tx-tiers-sub { font-size: 14px; line-height: 20px; }
    .tx-row td { height: 40px; padding-top: 0; padding-bottom: 0; }
  }

  /* Narrow screens: tighter cells, the table scrolls sideways in its panel */
  @media (max-width: 860px) {
    .tx-table th, .tx-table td { padding-left: 8px; padding-right: 8px; }
  }
</style>
