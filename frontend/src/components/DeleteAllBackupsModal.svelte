<script lang="ts">
  import { self } from '../lib/events';
  import { api } from '../lib/api.js';
  import { t } from '../lib/i18n.ts';

  // Deletes the manual backups listed when the dialog opened. The user must type a word to confirm.
  let { filenames, ondeleted, onclose }: {
    filenames: string[];
    ondeleted: () => Promise<void>;
    onclose: () => void;
  } = $props();

  let input = $state('');
  let error = $state('');
  let isDeleting = $state(false);

  let word = $derived($t('SUPPRIMER'));
  let confirmed = $derived(input.trim().toUpperCase() === word);

  function close() {
    if (!isDeleting) onclose();
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!confirmed || isDeleting) return;
    isDeleting = true;
    error = '';
    try {
      const { failed } = await api.post('/api/backup/manual/delete-bulk', { filenames });
      // The list follows what is left on disk, even when some files could not be deleted.
      await ondeleted();
      if (failed.length === 0) onclose();
      else error = $t('{n} sauvegarde(s) non supprimée(s)').replace('{n}', String(failed.length));
    } catch (err) {
      error = err.message || $t('Erreur lors de la suppression');
    } finally {
      isDeleting = false;
    }
  }

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="modal-overlay" onclick={self(close)} role="presentation">
  <div class="modal-box delete-all" role="dialog" aria-modal="true" aria-labelledby="delete-all-title">
  <form onsubmit={submit}>
    <h2 class="modal-title" id="delete-all-title">{$t('Supprimer toutes les sauvegardes manuelles ?')}</h2>
    <p>
      {(filenames.length > 1
        ? $t('{n} sauvegardes manuelles seront supprimées. Les sauvegardes automatiques sont conservées.')
        : $t('{n} sauvegarde manuelle sera supprimée. Les sauvegardes automatiques sont conservées.')
      ).replace('{n}', String(filenames.length))}
    </p>
    <p class="delete-all-warning">{$t('Cette action est définitive.')}</p>
    <label for="delete-all-confirm">{$t('Tapez {word} pour confirmer').replace('{word}', word)}</label>
    <input id="delete-all-confirm" type="text" bind:value={input} autocomplete="off" spellcheck="false" disabled={isDeleting} use:focusOnMount />
    {#if error}<p class="delete-all-warning" role="alert">{error}</p>{/if}
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick={close} disabled={isDeleting}>{$t('Annuler')}</button>
      <button type="submit" class="btn btn-danger-ghost" disabled={!confirmed || isDeleting}>
        {isDeleting ? $t('Suppression…') : $t('Tout supprimer')}
      </button>
    </div>
  </form>
  </div>
</div>

<style>
  .delete-all { width: 400px; max-width: calc(100vw - 32px); }
  .delete-all p { font-size: 14px; line-height: 1.5; color: var(--text-2); }
  .delete-all .delete-all-warning { margin-top: 8px; color: var(--danger-text); }
  .delete-all label { display: block; margin: 16px 0 8px; font-size: 13px; color: var(--text-2); }
  .delete-all input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-1);
    font-size: 14px;
  }
</style>
