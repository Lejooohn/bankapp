<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { createEventDispatcher } from 'svelte';
  import { t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';

  let { account } = $props();

  const dispatch = createEventDispatcher();
  let isLoading = $state(false);
  let formError = $state('');

  let formData = $state({
    name: account.name || '',
    bank_name: account.bank_name || '',
    description: account.description || '',
  });

  async function handleSubmit() {
    if (!formData.name.trim()) {
      formError = $t('Le nom du compte est requis');
      return;
    }

    isLoading = true;
    formError = '';

    try {
      await api.patch(`/api/accounts/${account.id}`, {
        name: formData.name,
        bank_name: formData.bank_name || null,
        description: formData.description || null,
      });

      dispatch('updated');
    } catch (e) {
      formError = e.message;
    } finally {
      isLoading = false;
    }
  }

  function close() {
    if (window.getSelection().toString() === '') {
      dispatch('close');
    }
  }
</script>

<div class="modal-overlay" onclick={self(close)} onkeydown={(e) => e.key === 'Escape' && close()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
    <h2 class="modal-title">{$t('Modifier le compte')}</h2>

    {#if formError}
      <div class="error-banner">{formError}</div>
    {/if}

    <div class="field">
      <label for="ea-name">{$t('Nom du compte')} <span class="req">*</span></label>
      <input id="ea-name" type="text" bind:value={formData.name} />
    </div>

    <div class="field">
      <label for="ea-bank">{$t('Banque')} ({$t('optionnel')})</label>
      <input id="ea-bank" type="text" bind:value={formData.bank_name} placeholder="Crédit Mutuel" />
    </div>

    <div class="field">
      <label for="ea-desc">{$t('Description')} ({$t('optionnel')})</label>
      <textarea
        id="ea-desc"
        bind:value={formData.description}
        placeholder={$t('Notes sur ce compte...')}
        rows="3"
        style="font-size: 13px; padding: 8px 10px; font-family: inherit;"
      ></textarea>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={close}>{$t('Annuler')}</button>
      <button class="btn btn-primary" onclick={handleSubmit} disabled={isLoading}>
        {isLoading ? $t('Sauvegarde…') : $t('Sauvegarder')}
      </button>
    </div>
  </div>
</div>
