<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  import { createEventDispatcher, onMount } from 'svelte';

  interface Props {
    account: any;
    editingRule?: any;
    categories?: any;
  }

  let { account, editingRule = null, categories = [] }: Props = $props();

  let tiersTitle = $derived($t('Match sur le fournisseur/bénéficiaire'));
  let detailsTitle = $derived($t('Match sur les détails de la transaction'));

  const dispatch = createEventDispatcher();

  let tiersPatterns = $state([]);
  let tiersInput = $state('');
  let detailsPatterns = $state([]);
  let detailsInput = $state('');
  let category = $state('');
  let newCategory = $state('');
  let useNewCategory = $state(false);
  let loading = $state(false);
  let error = $state('');
  let inputRef: HTMLInputElement | undefined = $state();
  let editingPatternIndex = $state(-1);
  let editingPatternValue = $state('');
  let editingType = $state(''); // 'tiers' or 'details'

  function resetForm() {
    if (editingRule) {
      tiersPatterns = editingRule.tiers_pattern ? editingRule.tiers_pattern.split('|').filter(Boolean) : [];
      detailsPatterns = editingRule.details_pattern ? editingRule.details_pattern.split('|').filter(Boolean) : [];
      category = editingRule.category || '';
    } else {
      tiersPatterns = [];
      detailsPatterns = [];
      category = '';
    }
    tiersInput = '';
    detailsInput = '';
    useNewCategory = false;
    newCategory = '';
  }

  onMount(() => {
    resetForm();
    if (inputRef) {
      setTimeout(() => inputRef?.focus(), 0);
    }
  });

  function addTiersPattern() {
    if (tiersInput && !tiersPatterns.includes(tiersInput)) {
      tiersPatterns = [...tiersPatterns, tiersInput];
    }
    tiersInput = '';
  }

  function removeTiersPattern(i) {
    tiersPatterns = tiersPatterns.filter((_, j) => j !== i);
  }

  function addDetailsPattern() {
    if (detailsInput && !detailsPatterns.includes(detailsInput)) {
      detailsPatterns = [...detailsPatterns, detailsInput];
    }
    detailsInput = '';
  }

  function removeDetailsPattern(i) {
    detailsPatterns = detailsPatterns.filter((_, j) => j !== i);
  }

  function startEditPattern(i, type = 'details') {
    editingPatternIndex = i;
    editingType = type;
    editingPatternValue = type === 'tiers' ? tiersPatterns[i] : detailsPatterns[i];
  }

  function saveEditPattern() {
    const newValue = editingPatternValue;
    if (newValue) {
      if (editingType === 'tiers') {
        if (newValue !== tiersPatterns[editingPatternIndex]) {
          tiersPatterns[editingPatternIndex] = newValue;
          tiersPatterns = tiersPatterns;
        }
      } else {
        if (newValue !== detailsPatterns[editingPatternIndex]) {
          detailsPatterns[editingPatternIndex] = newValue;
          detailsPatterns = detailsPatterns;
        }
      }
    }
    editingPatternIndex = -1;
    editingPatternValue = '';
    editingType = '';
  }

  function cancelEditPattern() {
    editingPatternIndex = -1;
    editingPatternValue = '';
    editingType = '';
  }

  function handleTiersKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTiersPattern();
    }
  }

  function handleDetailsKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDetailsPattern();
    }
  }

  async function save() {
    if (tiersInput.trim()) addTiersPattern();
    if (detailsInput.trim()) addDetailsPattern();
    const selectedCategory = useNewCategory ? newCategory : category;
    if ((tiersPatterns.length === 0 && detailsPatterns.length === 0) || !selectedCategory) return;

    loading = true;
    error = '';
    try {
      const url = editingRule
        ? `/api/accounts/${account.id}/rules/${editingRule.id}`
        : `/api/accounts/${account.id}/rules`;
      const body = {
        tiers_pattern: tiersPatterns.length > 0 ? tiersPatterns.join('|') : null,
        details_pattern: detailsPatterns.length > 0 ? detailsPatterns.join('|') : null,
        category: selectedCategory
      };
      if (editingRule) {
        await api.patch(url, body);
      } else {
        await api.post(url, body);
      }
      close();
      dispatch(editingRule ? 'updated' : 'created');
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur de connexion');
    } finally {
      loading = false;
    }
  }

  function close() {
    cancelEditPattern();
    dispatch('close');
  }
</script>

<div class="modal-overlay" onclick={self(close)} onkeydown={(e) => e.key === 'Escape' && close()} role="presentation">
  <div class="modal-container" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
    <div class="modal-header">
      <h2>{editingRule ? $t('Modifier la règle') : $t('Nouvelle règle')}</h2>
      <button class="close-btn" onclick={close}>✕</button>
    </div>

    <div class="modal-content">
      {#if error}
        <div class="error-banner">{error}</div>
      {/if}

      <!-- Tiers Pattern -->
      <div class="form-section">
        <span class="form-label">{$t('Tiers')}</span>
        <p class="form-hint">{$t('Optionnel - le fournisseur/bénéficiaire')}</p>

        <div class="patterns-list">
          {#each tiersPatterns as p, i}
            {#if editingPatternIndex === i && editingType === 'tiers'}
              <div class="pattern-edit">
                <input
                  type="text"
                  bind:value={editingPatternValue}
                  onblur={saveEditPattern}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') saveEditPattern();
                    if (e.key === 'Escape') cancelEditPattern();
                  }}
                  autoFocus
                />
              </div>
            {:else}
              <div class="pattern-badge pattern-badge-tiers" ondblclick={() => startEditPattern(i, 'tiers')} onkeydown={(e) => e.key === 'Enter' && startEditPattern(i, 'tiers')} title={tiersTitle} role="button" tabindex="0">
                <span>{p}</span>
                <button type="button" class="badge-remove" onclick={() => removeTiersPattern(i)}>×</button>
              </div>
            {/if}
          {/each}
        </div>

        <div class="input-row">
          <input
            type="text"
            bind:value={tiersInput}
            bind:this={inputRef}
            onkeydown={handleTiersKeyDown}
            onblur={() => tiersInput.trim() && addTiersPattern()}
            placeholder={$t('Crédit Mutuel, Amazon…')}
            class="pattern-field"
          />
          <button type="button" class="add-btn" onclick={addTiersPattern} disabled={!tiersInput.trim()}>
            {$t('Ajouter')}
          </button>
        </div>

        {#if tiersPatterns.length > 0}
          <p class="form-hint">{tiersPatterns.length} {tiersPatterns.length === 1 ? $t('fournisseur') : $t('fournisseurs')}</p>
        {/if}
      </div>

      <!-- Details Patterns -->
      <div class="form-section">
        <span class="form-label">{$t('Filtrer par details')}</span>
        <p class="form-hint">{$t('Optionnel - pour distinguer plusieurs catégories (au moins l\'un des deux champs est requis)')}</p>

        <div class="patterns-list">
          {#each detailsPatterns as p, i}
            {#if editingPatternIndex === i && editingType === 'details'}
              <div class="pattern-edit">
                <input
                  type="text"
                  bind:value={editingPatternValue}
                  onblur={saveEditPattern}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') saveEditPattern();
                    if (e.key === 'Escape') cancelEditPattern();
                  }}
                  autoFocus
                />
              </div>
            {:else}
              <div class="pattern-badge pattern-badge-details" ondblclick={() => startEditPattern(i, 'details')} onkeydown={(e) => e.key === 'Enter' && startEditPattern(i, 'details')} title={detailsTitle} role="button" tabindex="0">
                <span>{p}</span>
                <button type="button" class="badge-remove" onclick={() => removeDetailsPattern(i)}>×</button>
              </div>
            {/if}
          {/each}
        </div>

        <div class="input-row">
          <input
            type="text"
            bind:value={detailsInput}
            onkeydown={handleDetailsKeyDown}
            onblur={() => detailsInput.trim() && addDetailsPattern()}
            placeholder={$t('PRET, FRAIS…')}
            class="pattern-field"
          />
          <button type="button" class="add-btn" onclick={addDetailsPattern} disabled={!detailsInput.trim()}>
            {$t('Ajouter')}
          </button>
        </div>

        {#if detailsPatterns.length > 0}
          <p class="form-hint">{detailsPatterns.length} {detailsPatterns.length === 1 ? $t('filtre') : $t('filtres')}</p>
        {/if}
      </div>

      <!-- Category -->
      <div class="form-section">
        <label class="form-label" for="rule-category-field">{$t('Catégorie')}</label>

        {#if !useNewCategory}
          <select id="rule-category-field" bind:value={category} class="category-field">
            <option value="">{$t('Choisir…')}</option>
            {#each categories as cat}
              <option value={cat}>{cat}</option>
            {/each}
          </select>
        {:else}
          <input
            id="rule-category-field"
            type="text"
            bind:value={newCategory}
            placeholder={$t('Nouvelle catégorie')}
            class="category-field"
          />
        {/if}

        <label class="checkbox-label">
          <input type="checkbox" bind:checked={useNewCategory} />
          <span>{$t('Créer une nouvelle catégorie')}</span>
        </label>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn-cancel" onclick={close}>{$t('Annuler')}</button>
      <button
        class="btn-save"
        onclick={save}
        disabled={loading || (tiersPatterns.length === 0 && detailsPatterns.length === 0) || !(useNewCategory ? newCategory : category)}
      >
        {loading ? $t('Sauvegarde…') : editingRule ? $t('Mettre à jour') : $t('Créer la règle')}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9000;
    padding: 20px;
  }

  .modal-container {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    padding: 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-1);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-3);
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .close-btn:hover {
    background: var(--surface);
    color: var(--text-1);
  }

  .modal-content {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  .error-banner {
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 6px;
    padding: 12px;
    font-size: 13px;
    color: #c00;
    margin-bottom: 16px;
  }

  .form-section {
    margin-bottom: 24px;
  }

  .form-label {
    display: block;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-1);
    margin-bottom: 8px;
    letter-spacing: 0.5px;
  }

  .form-hint {
    font-size: 11px;
    color: var(--text-3);
    margin: 0 0 8px 0;
  }

  .patterns-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
    min-height: 24px;
  }

  .pattern-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--chip-bg);
    border: 1px solid var(--chip-border);
    border-radius: 4px;
    font-size: 12px;
    color: var(--chip-text);
    font-family: 'Fira Code', monospace;
    cursor: pointer;
    user-select: none;
  }

  .pattern-badge:hover {
    border-color: var(--cobalt);
  }

  .pattern-badge-tiers {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
    color: #3b82f6;
  }

  .pattern-badge-tiers:hover {
    background: rgba(59, 130, 246, 0.15);
    border-color: #3b82f6;
  }

  .pattern-badge-details {
    background: rgba(168, 85, 247, 0.1);
    border-color: rgba(168, 85, 247, 0.3);
    color: #a855f7;
  }

  .pattern-badge-details:hover {
    background: rgba(168, 85, 247, 0.15);
    border-color: #a855f7;
  }

  .badge-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    font-size: 16px;
    padding: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .badge-remove:hover {
    opacity: 1;
  }

  .pattern-edit {
    flex: 0 1 auto;
  }

  .pattern-edit input {
    padding: 4px 8px;
    border: 1px solid var(--cobalt);
    border-radius: 4px;
    background: var(--input-bg);
    color: var(--text-1);
    font-size: 12px;
    font-family: 'Fira Code', monospace;
    min-width: 120px;
  }

  .pattern-edit input:focus {
    outline: none;
  }

  .input-row {
    display: flex;
    gap: 8px;
  }

  .pattern-field {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--input-bg);
    color: var(--text-1);
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    transition: border-color 0.2s;
  }

  .pattern-field:focus {
    outline: none;
    border-color: var(--cobalt);
  }

  .add-btn {
    padding: 8px 16px;
    background: var(--cobalt);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-btn:hover:not(:disabled) {
    background: #1e40af;
  }

  .add-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .category-field {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--input-bg);
    color: var(--text-1);
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    margin-bottom: 12px;
    transition: border-color 0.2s;
  }

  .category-field:focus {
    outline: none;
    border-color: var(--cobalt);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-2);
  }

  .checkbox-label input {
    cursor: pointer;
    width: 14px;
    height: 14px;
  }

  .checkbox-label span {
    user-select: none;
  }

  .modal-actions {
    padding: 16px 20px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn-cancel {
    padding: 8px 16px;
    background: transparent;
    color: var(--text-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-cancel:hover {
    background: var(--surface);
  }

  .btn-save {
    padding: 8px 16px;
    background: var(--cobalt);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-save:hover:not(:disabled) {
    background: #1e40af;
  }

  .btn-save:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
