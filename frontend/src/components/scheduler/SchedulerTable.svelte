<script lang="ts">
  import { lang, t } from '../../lib/i18n.ts';
  import { catStyle } from '../../utils/categoryColor.js';
  import { CREDIT_TYPES, fmtAmount, parseLocalDate, remainingOccurrences } from './schedule-utils.ts';

  let { schedules, sortColumn, sortDir, freqLabels, locale, onsort, ontoggle, ongenerate, onedit, ondelete }: {
    schedules: any[];
    sortColumn: string;
    sortDir: 'asc' | 'desc';
    freqLabels: Record<string, string>;
    locale: string;
    onsort: (col: string) => void;
    ontoggle: (s: any) => void;
    ongenerate: (id: string) => void;
    onedit: (s: any) => void;
    ondelete: (id: string, name: string) => void;
  } = $props();
</script>

<table class="sched-table">
  <thead>
    <tr>
      <th class="sched-cell-status sortable" class:sorted={sortColumn === 'is_active'} onclick={() => onsort('is_active')}>
        {$t('État')}{#if sortColumn === 'is_active'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
      </th>
      <th class="sched-cell-desc sortable" class:sorted={sortColumn === 'description'} onclick={() => onsort('description')}>
        {$t('Tiers')}{#if sortColumn === 'description'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
      </th>
      <th class="sched-cell-details sortable" class:sorted={sortColumn === 'details'} onclick={() => onsort('details')}>
        {$t('Détails')}{#if sortColumn === 'details'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
      </th>
      <th class="sched-cell-freq sortable" class:sorted={sortColumn === 'frequency'} onclick={() => onsort('frequency')}>
        {$t('Fréquence')}{#if sortColumn === 'frequency'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
      </th>
      <th class="sched-cell-cat sortable" class:sorted={sortColumn === 'category'} onclick={() => onsort('category')}>
        {$t('Catégorie')}{#if sortColumn === 'category'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
      </th>
      <th class="sched-cell-day sortable" class:sorted={sortColumn === 'day_of_month'} onclick={() => onsort('day_of_month')}>
        {$t('Jour du mois')}{#if sortColumn === 'day_of_month'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
      </th>
      <th class="sched-cell-next sortable" class:sorted={sortColumn === 'next_schedule_date'} onclick={() => onsort('next_schedule_date')}>
        {$t('Prochaine échéance')}{#if sortColumn === 'next_schedule_date'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
      </th>
      <th class="sched-cell-occurrences sortable" class:sorted={sortColumn === 'occurrences'} onclick={() => onsort('occurrences')}>
        {$t('Occurrences')}{#if sortColumn === 'occurrences'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
      </th>
      <th class="sched-cell-amount sortable" class:sorted={sortColumn === 'amount'} onclick={() => onsort('amount')}>
        {$t('Montant')}{#if sortColumn === 'amount'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
      </th>
      <th class="sched-cell-actions">{$t('Actions')}</th>
    </tr>
  </thead>
  <tbody>
    {#each schedules as s (s.id)}
      {@const remaining = remainingOccurrences(s)}
      {@const isLast = remaining === 1}
      <tr class="sched-row {isLast ? 'sched-row-last' : ''} {s.is_completed ? 'sched-row-completed' : ''}">
        <td class="sched-cell-status">
          <button
            type="button"
            class="sched-status-switch"
            class:active={s.is_active}
            title={s.is_active ? $t('Actif — cliquer pour désactiver') : $t('Inactif — cliquer pour activer')}
            onclick={() => ontoggle(s)}
          >
            <span class="sched-status-track">
              <span class="sched-status-thumb"></span>
            </span>
            <span class="sched-status-label">{s.is_active ? $t('Actif') : $t('Inactif')}</span>
          </button>
        </td>
        <td class="sched-cell-desc">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>{s.description}</span>
            {#if isLast}
              <span class="sched-last-badge" title={$t('Dernière occurrence avant fin de contrat. À supprimer après insertion.')}>
                ⚠
              </span>
            {/if}
          </div>
        </td>
        <td class="sched-cell-details">
          <span>{s.details || '—'}</span>
        </td>
        <td class="sched-cell-freq">
          <span class="sched-freq-badge">{freqLabels[s.frequency]}</span>
        </td>
        <td class="sched-cell-cat">
          {#if s.category}<span class="sched-cat-badge" style={catStyle(s.category)}>{s.category}</span>{/if}
        </td>
        <td class="sched-cell-day">
          {$t('le')} {s.day_of_month} {$t('du mois')}
          {#if s.skip_weekends}<span style="font-size:11px;">· {$t('décalé si WE')}</span>{/if}
        </td>
        <td class="sched-cell-next">
          {#if s.is_completed}
            <span class="sched-completed-label">{$t('Échéance terminée')}</span>
          {:else if s.next_schedule_date}
            {parseLocalDate(s.next_schedule_date)?.toLocaleDateString(locale)}
          {:else}
            —
          {/if}
        </td>
        <td class="sched-cell-occurrences">
          {s.expected_payments !== null && s.expected_payments !== undefined ? `${s.payments_completed}/${s.expected_payments}` : '∞'}
        </td>
        <td class="sched-cell-amount">
          <span class="sched-amount {CREDIT_TYPES.has(s.transaction_type) ? 'sched-credit' : 'sched-debit'}">
            {fmtAmount(s.amount, s.transaction_type)}
          </span>
        </td>
        <td class="sched-cell-actions">
          <div class="sched-cell-actions-hover">
            <button class="btn-icon" title={s.is_active ? $t('Générer') : $t('Échéance désactivée')} disabled={!s.is_active} onclick={() => ongenerate(s.id)}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="btn-icon" title={$t('Modifier')} onclick={() => onedit(s)}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="btn-icon danger" title={$t('Supprimer')} onclick={() => ondelete(s.id, s.description)}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M5 4V2.5h4V4M4.5 4v7a.5.5 0 00.5.5h4a.5.5 0 00.5-.5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  /* ── Table ── */
  .sched-table {
    width: 100%; border-collapse: collapse;
    background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
    table-layout: auto;
  }
  .sched-table thead { background: var(--surface); }
  .sched-table th {
    padding: 14px 16px; text-align: center; font-size: 12px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--text-3); border-bottom: 1px solid var(--border);
  }
  .sched-table th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
  .sched-table th.sortable:hover { color: var(--text-1); }
  .sched-table th.sorted { color: var(--text-1); }
  .sort-arrow { display: inline-block; margin-left: 4px; font-size: 9px; }
  .sched-table tbody tr { border-bottom: 1px solid var(--border); }
  .sched-table tbody tr:hover { background: rgba(148, 163, 184, 0.04); }
  .sched-table td { padding: 14px 16px; font-size: 13px; color: var(--text-2); vertical-align: middle; }

  /* Column widths adapt to content */
  .sched-cell-status { white-space: nowrap; border-right: 1px solid var(--border); text-align: center; }
  .sched-cell-desc { border-right: 1px solid var(--border); }
  .sched-cell-details { border-right: 1px solid var(--border); }
  .sched-cell-freq { white-space: nowrap; border-right: 1px solid var(--border); text-align: center; }
  .sched-cell-cat { white-space: nowrap; border-right: 1px solid var(--border); }
  .sched-cell-day { white-space: nowrap; border-right: 1px solid var(--border); }
  .sched-cell-next { white-space: nowrap; border-right: 1px solid var(--border); }
  .sched-cell-occurrences { white-space: nowrap; border-right: 1px solid var(--border); }
  .sched-cell-amount { white-space: nowrap; position: relative; border-right: 1px solid var(--border); }

  .sched-row-last {
    background: var(--card) !important;
    border-left: 4px solid #F59E0B !important;
  }
  .sched-row-last td {
    background: rgba(245, 158, 11, 0.08) !important;
  }

  .sched-row-completed {
    background: var(--card) !important;
    border-left: 4px solid #DC2626 !important;
  }
  .sched-row-completed td {
    background: rgba(220, 38, 38, 0.12) !important;
  }

  .sched-completed-label {
    font-weight: 600;
    color: #DC2626;
    font-style: italic;
  }

  @media (prefers-color-scheme: dark) {
    .sched-row-last td {
      background: rgba(245, 158, 11, 0.15) !important;
    }
    .sched-row-completed td {
      background: rgba(220, 38, 38, 0.20) !important;
    }
    .sched-completed-label {
      color: #FCA5A5;
    }
  }

  .sched-cell-desc { color: var(--text-1); font-weight: 500; }
  .sched-table td.sched-cell-desc { text-align: center !important; }
  .sched-table td.sched-cell-desc > div { justify-content: center; }
  .sched-table td.sched-cell-details { text-align: center !important; }
  .sched-table td.sched-cell-amount { text-align: center; }
  .sched-table td.sched-cell-cat { text-align: center; }
  .sched-table td.sched-cell-day { text-align: center; }
  .sched-table td.sched-cell-next { text-align: center; color: var(--text-1); }
  .sched-table td.sched-cell-occurrences { text-align: center; }
  .sched-cell-amount { font-family: 'Fira Code', monospace; }
  .sched-cell-actions { width: 60px; text-align: center; padding: 12px 4px; }

  .sched-status-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 4px 6px;
    margin: 0;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.15s;
  }
  .sched-status-switch:hover {
    background: var(--hover-bg, rgba(128, 128, 128, 0.15));
  }
  .sched-status-track {
    position: relative;
    width: 26px;
    height: 15px;
    background: #cbd5e1;
    border-radius: 8px;
    flex-shrink: 0;
    transition: background 0.2s ease;
  }
  .sched-status-switch.active .sched-status-track {
    background: #10B981;
  }
  .sched-status-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 11px;
    height: 11px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: left 0.2s ease;
  }
  .sched-status-switch.active .sched-status-thumb {
    left: calc(100% - 13px);
  }
  .sched-status-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-2);
    white-space: nowrap;
  }
  .sched-cell-actions-hover .btn-icon:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .sched-cell-actions-hover .btn-icon:disabled:hover {
    background: none;
  }

  /* Hover actions */
  .sched-cell-actions-hover {
    opacity: 0;
    pointer-events: none;
    gap: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s ease;
  }
  .sched-row:hover .sched-cell-actions-hover {
    opacity: 1;
    pointer-events: auto;
  }

  .sched-cat-badge { background: var(--cobalt-light); color: var(--cobalt); border-radius: 4px; padding: 3px 8px; font-size: 11px; font-weight: 500; white-space: nowrap; display: inline-block; }
  .sched-freq-badge {
    font-size: 13px; padding: 5px 11px;
    background: rgba(59, 130, 246, 0.25); border: 1px solid rgba(59, 130, 246, 0.5);
    border-radius: 12px; color: #2563EB; font-weight: 700; font-family: 'Inter', sans-serif;
  }
  .sched-amount.sched-debit { color: #DC2626; font-weight: 700; font-size: 14px; }
  .sched-amount.sched-credit { color: #16A34A; font-weight: 700; font-size: 14px; }
  .sched-last-badge {
    font-size: 10.5px; font-weight: 600;
    padding: 2px 7px; border-radius: 20px;
    background: #FEF3C7; border: 1px solid #FDE68A; color: #92400E;
    font-family: 'Inter', sans-serif;
    cursor: default;
  }

  .sched-amount { font-family: 'Fira Code', monospace; font-size: 13.5px; font-weight: 600; }
  .sched-debit  { color: #DC2626; }
  .sched-credit { color: #16A34A; }
</style>
