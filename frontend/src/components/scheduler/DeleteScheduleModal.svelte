<script lang="ts">
  import { t } from '../../lib/i18n.ts';
  import ScheduleModal from './ScheduleModal.svelte';

  let { name, onconfirm, onclose }: { name: string; onconfirm: () => void; onclose: () => void } = $props();
</script>

<ScheduleModal title={$t('Supprimer l\'échéance')} {onclose} boxClass="delete-modal-box">
  <p class="delete-warning">
    {$t('Êtes-vous sûr de vouloir supprimer l\'échéance')} <strong>{name}</strong> ?
  </p>
  <p class="delete-warning-sub">
    {$t('Cette action est irréversible.')}
  </p>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>{$t('Annuler')}</button>
    <button class="btn btn-danger" onclick={onconfirm}>{$t('Supprimer')}</button>
  {/snippet}
</ScheduleModal>

<style>
  .delete-warning {
    font-size: 15px;
    color: var(--text-1);
    margin-bottom: 12px;
    line-height: 1.5;
  }

  .delete-warning strong {
    font-weight: 600;
    color: var(--text-1);
  }

  .delete-warning-sub {
    font-size: 13px;
    color: var(--text-3);
    margin-bottom: 0;
  }

  .btn-danger {
    background: #DC2626;
    color: white;
    border: none;
  }

  .btn-danger:hover {
    background: #B91C1C;
  }

  .btn-danger:active {
    background: #991B1B;
  }
</style>
