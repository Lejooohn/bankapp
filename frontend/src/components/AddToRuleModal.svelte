<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { t } from '../lib/i18n.ts';
  import { createEventDispatcher, untrack } from 'svelte';
  import { api } from '../lib/api.js';

  interface Props {
    account: any;
    transaction: any;
    isOpen?: boolean;
  }

  let { account, transaction, isOpen = $bindable(false) }: Props = $props();

  const dispatch = createEventDispatcher();

  let rules = $state([]);
  let categories = $state([]);
  let isLoading = $state(false);
  let mode = $state('existing'); // 'existing' or 'new'
  let selectedRuleId = $state('');
  let newCategoryName = $state('');
  let newRuleCategory = $state('');
  let error = $state('');
  let addTiers = $state(true);
  let addDetails = $state(!!transaction.details);


  async function loadRulesAndCategories() {
    try {
      [rules, categories] = await Promise.all([
        api.get(`/api/accounts/${account.id}/rules`),
        api.get(`/api/accounts/${account.id}/categories`),
      ]);
      // A switched-off rule would not apply: adding a word to it would do nothing
      rules = rules.filter(rule => rule.active);
    } catch (e) {
      console.error(e);
      error = $t('Erreur lors du chargement des règles');
    }
  }

  async function addToExistingRule() {
    if (!selectedRuleId) {
      error = $t('Sélectionnez une règle');
      return;
    }
    if (!addTiers && !addDetails) {
      error = $t('Sélectionnez au moins un pattern (tiers ou détails)');
      return;
    }
    isLoading = true;
    error = '';
    try {
      const result = await api.patch(`/api/accounts/${account.id}/rules/${selectedRuleId}/add-patterns`, {
        tiers: addTiers ? transaction.tiers : null,
        details: addDetails ? (transaction.details || null) : null,
      });
      dispatch('added', result);
      close();
    } catch (e) {
      error = e.message || $t('Erreur lors de l\'ajout');
    } finally {
      isLoading = false;
    }
  }

  async function createNewRule() {
    const category = newCategoryName.trim() || newRuleCategory;
    if (!category) {
      error = $t('Sélectionnez ou créez une catégorie');
      return;
    }
    if (!addTiers && !addDetails) {
      error = $t('Sélectionnez au moins un pattern (tiers ou détails)');
      return;
    }
    isLoading = true;
    error = '';
    try {
      // Ensure category exists (best-effort — the rule creation below still
      // works if it already does, so a failure here is not fatal)
      if (newCategoryName.trim()) {
        try {
          await api.post(`/api/accounts/${account.id}/categories`, { name: newCategoryName.trim() });
        } catch (e) { console.error(e); }
      }
      // Create rule (at least tiers_pattern or details_pattern required)
      const result = await api.post(`/api/accounts/${account.id}/rules`, {
        tiers_pattern: addTiers ? transaction.tiers : null,
        details_pattern: addDetails ? (transaction.details || null) : null,
        category: category,
      });
      dispatch('added', result);
      close();
    } catch (e) {
      error = e.message || $t('Erreur lors de la création');
    } finally {
      isLoading = false;
    }
  }

  function close() {
    isOpen = false;
    selectedRuleId = '';
    newCategoryName = '';
    newRuleCategory = '';
    error = '';
    mode = 'existing';
    dispatch('close');
  }

  function handleOverlayClick() {
    if (window.getSelection().toString() === '') {
      close();
    }
  }
  $effect.pre(() => {
    if (isOpen && rules.length === 0) untrack(() => loadRulesAndCategories());
  });
</script>

{#if isOpen}
  <div class="modal-overlay" onclick={self(handleOverlayClick)} onkeydown={(e) => e.key === 'Escape' && handleOverlayClick()} role="presentation">
    <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
      <h2 class="modal-title">{$t('Ajouter à une règle')}</h2>
      {#if error}
        <div class="error-banner">{error}</div>
      {/if}

      <div class="tabs">
        <button
          class={`tab ${mode === 'existing' ? 'active' : ''}`}
          onclick={() => {
            mode = 'existing';
            error = '';
          }}
        >
          {$t('Règle existante')}
        </button>
        <button
          class={`tab ${mode === 'new' ? 'active' : ''}`}
          onclick={() => {
            mode = 'new';
            error = '';
          }}
        >
          {$t('Nouvelle règle')}
        </button>
      </div>

      {#if mode === 'existing'}
        <div class="field">
          <label>{$t('Sélectionnez une règle')}
          <select bind:value={selectedRuleId}>
            <option value="">{$t('-- Choisir une règle --')}</option>
            {#each rules as rule (rule.id)}
              <option value={rule.id}>
                {rule.tiers_pattern}
                {#if rule.details_pattern}
                  | {rule.details_pattern.substring(0, 20)}...
                {/if}
                → {rule.category}
              </option>
            {/each}
          </select></label>
        </div>

        <div class="patterns-selector">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={addTiers} />
            <span>{$t('Ajouter le tiers:')} <strong>{transaction.tiers}</strong></span>
          </label>
          {#if transaction.details}
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={addDetails} />
              <span>{$t('Ajouter les détails:')} <strong>{transaction.details}</strong></span>
            </label>
          {/if}
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" onclick={close}>{$t('Annuler')}</button>
          <button class="btn btn-primary" onclick={addToExistingRule} disabled={isLoading || !selectedRuleId || (!addTiers && !addDetails)}>
            {isLoading ? $t('Ajout…') : $t('Ajouter')}
          </button>
        </div>
      {/if}

      {#if mode === 'new'}
        <div class="field">
          <label>{$t('Catégorie existante')}
          <select bind:value={newRuleCategory}>
            <option value="">{$t('-- Ou créer une nouvelle --')}</option>
            {#each categories as cat (cat)}
              <option value={cat}>{cat}</option>
            {/each}
          </select></label>
        </div>
        <div class="field">
          <label>{$t('Ou créer une nouvelle catégorie')}
          <input type="text" bind:value={newCategoryName} placeholder={$t('Nom de la catégorie')} /></label>
        </div>

        <div class="patterns-selector">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={addTiers} />
            <span>{$t('Ajouter le tiers:')} <strong>{transaction.tiers}</strong></span>
          </label>
          {#if transaction.details}
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={addDetails} />
              <span>{$t('Ajouter les détails:')} <strong>{transaction.details}</strong></span>
            </label>
          {/if}
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" onclick={close}>{$t('Annuler')}</button>
          <button class="btn btn-primary" onclick={createNewRule} disabled={isLoading || (!newRuleCategory && !newCategoryName) || (!addTiers && !addDetails)}>
            {isLoading ? $t('Création…') : $t('Créer')}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid var(--border);
  }

  .tab {
    padding: 0.5rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-2);
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    font-weight: 500;
    transition: all 0.12s;
  }

  .tab.active {
    color: var(--cobalt);
    border-bottom-color: var(--cobalt);
  }

  .patterns-selector {
    margin: 1rem 0;
    padding: 0.75rem;
    background: var(--card-hover);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    margin-bottom: 0.5rem;
    font-size: 13px;
  }

  .checkbox-label:last-child {
    margin-bottom: 0;
  }

  .checkbox-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin-top: 2px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .checkbox-label span {
    flex: 1;
  }

  .checkbox-label strong {
    color: var(--cobalt);
    font-weight: 600;
  }

  .checkbox-label.disabled {
    opacity: 0.7;
    cursor: default;
  }

  .checkbox-label input[type="checkbox"]:disabled {
    cursor: default;
  }
</style>
