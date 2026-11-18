<script lang="ts">
  import { onMount } from 'svelte';
  import { lang, t } from '../../lib/i18n.ts';
  import { api } from '../../lib/api.js';
  import ConfirmModal from '../ConfirmModal.svelte';
  import { fmtDate, fmtAmount, daysSince, daysLeft } from './tx-format.ts';

  // Deleted operations of one account: restore them or empty the trash (30-day retention).
  let { account, locale, oncount, onupdated, onclose }: {
    account: any;
    locale: string;
    oncount: (n: number) => void;
    onupdated: () => void;
    onclose: () => void;
  } = $props();

  let trashItems = $state([]);
  let loadingTrash = $state(true);
  let selectedTrashIds = $state(new Set());
  let showEmptyTrashConfirm = $state(false);
  let isDeleting = $state(false);

  let allTrashSelected = $derived(trashItems.length > 0 && trashItems.every(tx => selectedTrashIds.has(tx.id)));

  onMount(async () => {
    try {
      trashItems = await api.get(`/api/accounts/${account.id}/transactions/trash`);
      oncount(trashItems.length);
    } catch (e) { console.error(e); }
    loadingTrash = false;
  });

  function toggleTrashSelect(id: string) {
    const next = new Set(selectedTrashIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedTrashIds = next;
  }

  function toggleAllTrash() {
    selectedTrashIds = allTrashSelected ? new Set() : new Set(trashItems.map(tx => tx.id));
  }

  async function restoreOne(id: string) {
    try {
      await api.patch(`/api/transactions/${id}/restore`, {});
      trashItems = trashItems.filter(tx => tx.id !== id);
      oncount(trashItems.length);
      selectedTrashIds.delete(id);
      selectedTrashIds = selectedTrashIds;
      onupdated();
    } catch (e) { console.error(e); }
  }

  async function restoreBulk() {
    if (selectedTrashIds.size === 0) return;
    try {
      await api.post(`/api/accounts/${account.id}/transactions/restore-bulk`, { ids: [...selectedTrashIds] });
      const restored = selectedTrashIds;
      trashItems = trashItems.filter(tx => !restored.has(tx.id));
      oncount(trashItems.length);
      selectedTrashIds = new Set();
      onupdated();
    } catch (e) { console.error(e); }
  }

  async function confirmEmptyTrash() {
    try {
      isDeleting = true;
      await api.delete(`/api/accounts/${account.id}/transactions/trash`);
      trashItems = []; oncount(0); selectedTrashIds = new Set();
      showEmptyTrashConfirm = false;
      onupdated();
    } catch (e) { console.error(e); } finally { isDeleting = false; }
  }
</script>

<!-- ╔══════════════════════════════════════════════════════════╗ -->
<!-- ║  TRASH VIEW                                              ║ -->
<!-- ╚══════════════════════════════════════════════════════════╝ -->
<div class="tx-panel">
  <div class="tx-panel-header">
    <div style="display:flex; align-items:center; gap:10px;">
      <button class="btn btn-ghost" style="padding:5px 8px;" onclick={onclose} aria-label={$t('Fermer')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <span class="tx-panel-title">{$t('Corbeille')}</span>
      <span class="tx-count">{trashItems.length} {trashItems.length !== 1 ? $t('opérations') : $t('opération')}</span>
    </div>
    <div style="display:flex; gap:8px;">
      {#if selectedTrashIds.size > 0}
        <button class="btn btn-ghost" onclick={restoreBulk}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M2 7a5 5 0 1 0 5-5 5 5 0 0 0-3.5 1.4L2 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M2 2v3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {$t('Restaurer')} {selectedTrashIds.size}
        </button>
      {/if}
      {#if trashItems.length > 0}
        <button class="btn btn-danger-ghost" onclick={() => (showEmptyTrashConfirm = true)}>{$t('Vider la corbeille')}</button>
      {/if}
    </div>
  </div>

  <div class="trash-retention-banner">
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style="flex-shrink:0; color:#92400E;">
      <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.4"/>
      <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    {@html $t('Les opérations supprimées sont conservées <strong>30 jours</strong> avant d\'être définitivement effacées.')}
  </div>

  {#if loadingTrash}
    <div class="state-loading">Chargement…</div>
  {:else if trashItems.length === 0}
    <div class="state-empty">{$t('La corbeille est vide.')}</div>
  {:else}
    <div class="tx-scroll">
      <table class="tx-table">
        <thead>
          <tr>
            <th style="width:36px; padding-left:14px;">
              <input type="checkbox" checked={allTrashSelected} onchange={toggleAllTrash} style="cursor:pointer;" />
            </th>
            <th style="width:80px;">{$t('Date')}</th>
            <th>Tiers</th>
            <th class="r">{$t('Montant')}</th>
            <th>{$t('Supprimée')}</th>
            <th style="width:88px;"></th>
          </tr>
        </thead>
        <tbody>
          {#each trashItems as tx (tx.id)}
            <tr class="tx-row is-reconciled" style="opacity:0.75;">
              <td style="padding-left:14px;">
                <input type="checkbox" checked={selectedTrashIds.has(tx.id)} onchange={() => toggleTrashSelect(tx.id)} style="cursor:pointer;" />
              </td>
              <td class="tx-date">{fmtDate(tx.date, locale)}</td>
              <td class="tx-tiers-cell"><div class="tx-tiers-name">{tx.tiers || tx.description || '—'}</div></td>
              <td class="r">
                <span class="tx-amount {parseFloat(tx.amount) >= 0 ? 'pos' : 'neg'}">{fmtAmount(tx.amount)}</span>
              </td>
              <td style="font-size:12px;">
                <span style="color:var(--text-3);">{$t('il y a {n} j').replace('{n}', String(daysSince(tx.deleted_at)))}</span>
                <br/>
                <span style="
                  font-weight: 500;
                  color: {daysLeft(tx.deleted_at) <= 5 ? '#DC2626' : daysLeft(tx.deleted_at) <= 14 ? '#D97706' : '#16A34A'};
                ">
                  {daysLeft(tx.deleted_at) === 0 ? $t('Expirée') : daysLeft(tx.deleted_at) + ' ' + $t('j restants')}
                </span>
              </td>
              <td>
                <div class="tx-actions" style="opacity:1;">
                  <button class="btn btn-ghost" style="padding:4px 10px; font-size:12px;" onclick={() => restoreOne(tx.id)}>
                    {$t('Restaurer')}
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if showEmptyTrashConfirm}
  <ConfirmModal
    title={$t('Vider la corbeille')}
    message={`${$t('Êtes-vous sûr de vouloir supprimer définitivement')} ${trashItems.length} ${$t('opération(s) de la corbeille')} ? ${$t('Cette action ne peut pas être annulée.')}`}
    confirmText={$t('Vider la corbeille')} confirmClass="btn-danger-ghost"
    isLoading={isDeleting}
    on:confirm={confirmEmptyTrash}
    on:cancel={() => { showEmptyTrashConfirm = false; }}
  />
{/if}

<style>
  .trash-retention-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: var(--warn-bg);
    border-bottom: 1px solid #FDE68A;
    font-size: 12.5px;
    color: var(--warn-text);
    font-family: 'Inter', sans-serif;
  }

  /* Reconciled = done → muted text so pending rows pop */
  .tx-row.is-reconciled .tx-date,
  .tx-row.is-reconciled .tx-tiers-name {
    opacity: 0.5;
  }
  .tx-row.is-reconciled .tx-amount {
    opacity: 0.6;
  }
  :global([data-theme="dark"]) .tx-row.is-reconciled .tx-amount {
    /* On dark backgrounds, 0.6 opacity muddies --credit/--debit into low-contrast colors. */
    opacity: 0.85;
  }
</style>
