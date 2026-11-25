<script lang="ts">
  import { self } from '../lib/events';

  import { createEventDispatcher } from 'svelte';
  import { t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';

  interface Props {
    account: any;
    editingCategory?: any;
  }

  let { account, editingCategory = null }: Props = $props();

  const dispatch = createEventDispatcher();
  let categoryName = $derived(editingCategory ? editingCategory : '');
  let loading = $state(false);
  let error = $state('');


  async function save() {
    if (!categoryName.trim()) return;

    loading = true;
    error = '';
    try {
      if (editingCategory) {
        await api.patch(`/api/accounts/${account.id}/categories/${encodeURIComponent(editingCategory)}`, { newName: categoryName.trim() });
        close();
        dispatch('updated');
      } else {
        await api.post(`/api/accounts/${account.id}/categories`, { name: categoryName.trim() });
        close();
        dispatch('created');
      }
    } catch (e) {
      console.error(e);
      error = e.message || 'Error';
    } finally {
      loading = false;
    }
  }

  function close() {
    dispatch('close');
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') close();
  }
</script>

<div class="modal-backdrop" onclick={self(close)} onkeydown={(e) => e.key === 'Escape' && close()} role="presentation">
  <div class="modal-box" role="dialog" aria-modal="true">
    <!-- Header -->
    <div class="modal-header">
      <span class="modal-title">
        {editingCategory ? $t('Renommer la catégorie') : $t('Nouvelle catégorie')}
      </span>
      <button class="modal-close" onclick={close} aria-label={$t('Fermer')}>×</button>
    </div>

    <!-- Body -->
    <div class="modal-body">
      {#if error}<div class="error-banner">{error}</div>{/if}
      <div class="field-group">
        <label class="field-label" for="category-input">
          {editingCategory ? $t('Nouveau nom') : $t('Nom de la catégorie')}
        </label>
        <input
          id="category-input"
          type="text"
          bind:value={categoryName}
          placeholder={editingCategory || $t('Ex: Alimentation')}
          class="category-input"
          onkeydown={handleKeydown}

        />
      </div>
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={close}>{$t('Annuler')}</button>
      <button class="btn btn-primary" onclick={save} disabled={loading || !categoryName.trim()}>
        {loading ? $t('Sauvegarde…') : editingCategory ? $t('Renommer') : $t('Ajouter')}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9000;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }

  .modal-box {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 360px;
    max-width: calc(100vw - 32px);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }

  .error-banner {
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 13px;
    color: #c00;
    margin-bottom: 12px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
    font-family: var(--font-ui);
  }

  .modal-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 20px;
    color: var(--text-3);
    line-height: 1;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    transition: color 0.1s;
  }

  .modal-close:hover {
    color: var(--text-1);
  }

  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .modal-footer {
    padding: 12px 20px 16px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-3);
    font-family: var(--font-ui);
  }

  .category-input {
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--input-bg);
    color: var(--text-1);
    font-size: 14px;
    font-family: var(--font-ui);
    outline: none;
    transition: border-color 0.15s;
  }

  .category-input:focus {
    border-color: var(--cobalt);
  }

  .btn {
    padding: 8px 16px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    font-family: var(--font-ui);
    transition: opacity 0.1s, background 0.1s;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .btn-primary {
    background: var(--cobalt);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1e40af;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-2);
    border: 1px solid var(--border);
  }

  .btn-ghost:hover:not(:disabled) {
    background: var(--surface);
  }
</style>
