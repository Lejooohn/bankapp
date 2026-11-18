<script lang="ts">
  import { t } from '../../lib/i18n.ts';
  import ConfirmModal from '../ConfirmModal.svelte';

  // Two-step deletion of every operation of one month. The user must type the month name to confirm.
  let { date, locale, ondelete, onclose }: {
    date: string;
    locale: string;
    ondelete: (date: string) => Promise<void>;
    onclose: () => void;
  } = $props();

  let step = $state(1);
  let input = $state('');
  let error = $state('');
  let isDeleting = $state(false);

  async function confirmDelete() {
    const monthName = new Date(date).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const expectedText = monthName.split(' ')[0];

    if (input.toLowerCase() !== expectedText.toLowerCase()) {
      error = $t('Tapez "{text}" pour confirmer').replace('{text}', expectedText);
      return;
    }
    error = '';

    isDeleting = true;
    try {
      await ondelete(date);
    } catch (e) { console.error(e); }
    finally { isDeleting = false; onclose(); }
  }
</script>

{#if step === 1}
  <ConfirmModal
    title={$t('Supprimer toutes les opérations du mois')}
    message={`${$t('Êtes-vous sûr de vouloir supprimer toutes les opérations de {month} ?').replace('{month}', new Date(date).toLocaleDateString(locale, { month: 'long', year: 'numeric' }))} ${$t('Cette action ne peut pas être annulée.')}`}
    confirmText={$t('Confirmer la suppression')} confirmClass="btn-danger-ghost"
    isLoading={isDeleting}
    on:confirm={() => { step = 2; error = ''; }}
    on:cancel={onclose}
  />
{:else}
  <div class="modal-overlay">
    <div class="modal-box" style="width:380px;">
      <h2 class="modal-title">{$t('⚠️ Dernière confirmation')}</h2>
      <p style="font-size:13.5px; color:var(--text-2); line-height:1.5; margin-bottom:16px;">
        {@html $t('Ceci est irréversible. Tapez <strong>"{month}"</strong> pour confirmer la suppression définitive.').replace('{month}', new Date(date).toLocaleDateString(locale, { month: 'long' }))}
      </p>
      <input
        type="text"
        placeholder={new Date(date).toLocaleDateString(locale, { month: 'long' })}
        bind:value={input}
        style="width:100%; padding:10px 12px; border:1px solid {error ? 'var(--danger-soft)' : 'var(--border)'}; border-radius:6px; background:var(--surface); color:var(--text-1); font-size:14px;"
        onkeydown={e => e.key === 'Enter' && confirmDelete()}
        oninput={() => error = ''}
      />
      {#if error}
        <div style="margin-top:8px; padding:8px 12px; border-radius:6px; background:rgba(239, 68, 68, 0.1); border-left:3px solid var(--danger); color:var(--danger); font-size:13px;">
          {error}
        </div>
      {/if}
      <div class="modal-footer" style="margin-top:16px;">
        <button class="btn btn-ghost" onclick={onclose}>
          Annuler
        </button>
        <button
          class="btn btn-danger"
          onclick={confirmDelete}
          disabled={isDeleting}
        >
          {isDeleting ? 'Suppression…' : $t('Supprimer définitivement')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
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
