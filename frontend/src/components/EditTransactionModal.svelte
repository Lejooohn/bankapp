<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { createEventDispatcher, onMount } from 'svelte';
  import { catStyle } from '../utils/categoryColor.js';
  import { lang, t } from '../lib/i18n.ts';
  import CategorySelect from './CategorySelect.svelte';
  import ModeSelect from './ModeSelect.svelte';
  import AddToRuleModal from './AddToRuleModal.svelte';
  import DateInput from './DateInput.svelte';
  import { api } from '../lib/api.js';
  let { transaction, account, categories = [] } = $props();
  const dispatch = createEventDispatcher();
  let isLoading = $state(false);
  let showAddToRuleModal = $state(false);

  function handleOverlayClick() {
    if (window.getSelection().toString() === '') {
      dispatch('close');
    }
  }
  let localCategories = $state([...categories]);

  let formData = $state({
    date: transaction.date ? transaction.date.substring(0, 10) : '',
    tiers: transaction.tiers || '',
    details: transaction.details || '',
    amount: transaction.amount,
    category: transaction.category || '',
    transaction_type: transaction.transaction_type || 'Prélèvement'
  });

  onMount(async () => {
    try {
      const data = await api.get(`/api/accounts/${account.id}/categories`);
      if (Array.isArray(data) && data.length > 0) localCategories = data.map(c => c.name);
    } catch (e) { console.error(e); }
  });

  let formError = $state('');

  const CREDIT_TYPES = new Set(['Versement', 'Virement reçu', 'Dépôt de chèque']);

  let modeOptions = $derived([
    { value: 'Prélèvement', label: $t('Prélèvement') },
    { value: 'Versement', label: $t('Versement') },
    { value: 'Virement reçu', label: $t('Virement reçu') },
    { value: 'Virement émis', label: $t('Virement émis') },
    { value: 'Carte', label: $t('Carte') },
    { value: 'Chèque émis', label: $t('Chèque émis') },
    { value: 'Dépôt de chèque', label: $t('Dépôt de chèque') },
    { value: 'Retrait DAB', label: $t('Retrait DAB') }
  ]);

  async function handleSubmit() {
    if (!formData.date || !formData.tiers || !formData.amount || !formData.transaction_type) {
      formError = $t('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    formError = '';
    isLoading = true;
    const isCredit = CREDIT_TYPES.has(formData.transaction_type);
    const finalAmount = Math.abs(parseFloat(formData.amount)) * (isCredit ? 1 : -1);
    try {
      await api.patch(`/api/transactions/${transaction.id}`, {
        date: formData.date,
        tiers: formData.tiers,
        details: formData.details || null,
        amount: finalAmount,
        category: formData.category || null,
        transaction_type: formData.transaction_type
      });
      dispatch('updated');
      dispatch('close');
    } catch (e) {
      console.error(e);
      formError = e.message || $t('Erreur lors de la modification');
    }
    finally { isLoading = false; }
  }
</script>

<div class="modal-overlay" onclick={self(handleOverlayClick)} onkeydown={(e) => e.key === 'Escape' && handleOverlayClick()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
    <h2 class="modal-title">{$t('Modifier l\'opération')}</h2>
    {#if formError}<div class="error-banner">{formError}</div>{/if}
    <div class="field">
      <label for="et-date">{$t('Date')} <span class="req">*</span></label>
      <DateInput id="et-date" bind:value={formData.date} />
    </div>
    <div class="field-row">
      <div class="field">
        <label for="et-amount">{$t('Montant')} <span class="req">*</span></label>
        <input id="et-amount" type="number" bind:value={formData.amount} oninput={(e) => { const val = parseFloat(e.currentTarget.value); if (val < 0) e.currentTarget.value = String(Math.abs(val)); }} step="0.01" min="0" style="font-family:var(--font-mono);" />
      </div>
      <div class="field">
        <label for="et-type">{$t('Mode')} <span class="req">*</span></label>
        <ModeSelect id="et-type" bind:value={formData.transaction_type} options={modeOptions} />
      </div>
    </div>
    <div class="field">
      <label for="et-tiers">{$t('Tiers')} <span class="req">*</span></label>
      <input id="et-tiers" type="text" bind:value={formData.tiers} />
    </div>
    <div class="field">
      <label for="et-details">{$t('Détails')}</label>
      <input id="et-details" type="text" bind:value={formData.details} />
    </div>
    <div class="field">
      <label for="et-cat">{$t('Catégorie')}</label>
      <CategorySelect bind:value={formData.category} categories={localCategories} label={$t('Aucune')} />
    </div>
    {#if account.account_type !== 'savings'}
      <div class="add-to-rule-section">
        <button class="btn-link" onclick={() => (showAddToRuleModal = true)}>
          📋 {$t('Ajouter ce tiers ou ces détails à une règle')}
        </button>
      </div>
    {/if}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={() => dispatch('close')}>{$t('Annuler')}</button>
      <button class="btn btn-primary" onclick={handleSubmit} disabled={isLoading}>
        {isLoading ? $t('Sauvegarde…') : $t('Sauvegarder')}
      </button>
    </div>
  </div>
</div>

<AddToRuleModal
  isOpen={showAddToRuleModal}
  {account}
  {transaction}
  on:close={() => (showAddToRuleModal = false)}
  on:added={(e) => {
    showAddToRuleModal = false;
    const rule = e.detail;
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.textContent = $t('✓ Pattern ajouté à la règle "{category}"').replace('{category}', rule.category);
    toast.style.cssText = 'position: fixed; bottom: 1rem; right: 1rem; padding: 0.75rem 1rem; background: #4caf50; color: white; border-radius: 0.375rem; z-index: 2000; animation: slideIn 0.3s ease-out;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }}
/>

<style>
  .add-to-rule-section {
    padding: 1rem 0;
    border-top: 1px solid var(--border);
    margin: 1rem 0;
    text-align: center;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--cobalt);
    cursor: pointer;
    font-weight: 500;
    padding: 0;
    text-decoration: none;
    font-size: 13px;
    transition: color 0.2s;
  }

  .btn-link:hover {
    color: var(--text-1);
    text-decoration: underline;
  }
</style>
