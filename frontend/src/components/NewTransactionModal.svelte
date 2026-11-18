<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { createEventDispatcher, onMount } from 'svelte';
  import { catStyle } from '../utils/categoryColor.js';
  import { lang, t } from '../lib/i18n.ts';
  import CategorySelect from './CategorySelect.svelte';
  import ModeSelect from './ModeSelect.svelte';
  import DateInput from './DateInput.svelte';
  import { api } from '../lib/api.js';
  let { account } = $props();
  const dispatch = createEventDispatcher();

  function handleOverlayClick() {
    if (window.getSelection().toString() === '') {
      dispatch('close');
    }
  }

  let date = $state(new Date().toISOString().split('T')[0]);
  let amount = $state(''), tiers = $state(''), details = $state(''), category = $state('');
  let transactionType = $state('');
  let loading = $state(false), error = $state('');
  let localCategories = $state([]);

  // Validation states
  let dateValid = $derived(date && date.match(/^\d{4}-\d{2}-\d{2}$/));
  let amountValid = $derived(amount !== '' && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0);
  let tiersValid = $derived(tiers && tiers.trim() !== '');
  let transactionTypeValid = $derived(transactionType && transactionType.trim() !== '');

  onMount(async () => {
    try {
      const data = await api.get(`/api/accounts/${account.id}/categories`);
      if (Array.isArray(data)) localCategories = data.map(c => c.name);
    } catch (e) { console.error(e); }
  });

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
    if (!date || !amount || !tiers || !transactionType) {
      error = $t('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    loading = true; error = '';
    const isCredit = CREDIT_TYPES.has(transactionType);
    const finalAmount = Math.abs(parseFloat(amount)) * (isCredit ? 1 : -1);
    try {
      await api.post(`/api/accounts/${account.id}/transactions`, {
        date, tiers, details: details || null,
        amount: finalAmount,
        category: category || null, transaction_type: transactionType
      });
      dispatch('created');
    } catch (e) { error = e.message; }
    finally { loading = false; }
  }
</script>

<div class="modal-overlay" onclick={self(handleOverlayClick)} onkeydown={(e) => e.key === 'Escape' && handleOverlayClick()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
    <h2 class="modal-title">{$t('Nouvelle opération')}</h2>
    {#if error}<div class="error-banner">{error}</div>{/if}
    <div class="field">
      <label>{$t('Date')} <span class="req">*</span>
      <DateInput bind:value={date} class={!dateValid ? 'invalid' : ''} /></label>
    </div>
    <div class="field-row">
      <div class="field">
        <label>{$t('Montant')} <span class="req">*</span>
        <input type="number" bind:value={amount} 
          oninput={(e) => { const val = parseFloat(e.currentTarget.value); if (val < 0) e.currentTarget.value = String(Math.abs(val)); }}
          step="0.01" placeholder="0.00" min="0" 
          style="font-family:'Fira Code',monospace;" 
          class:invalid={!amountValid} 
        /></label>
      </div>
      <div class="field">
        <label for="new-tx-mode">{$t('Mode')} <span class="req">*</span></label>
        <ModeSelect id="new-tx-mode" bind:value={transactionType} options={modeOptions} placeholder={$t('Choisir…')} className={!transactionTypeValid ? 'invalid' : ''} />
      </div>
    </div>
    <div class="field">
      <label>{$t('Tiers')} <span class="req">*</span>
      <input type="text" bind:value={tiers} placeholder="Netflix, Carrefour…" class:invalid={!tiersValid} /></label>
    </div>
    <div class="field">
      <label>{$t('Détails')} ({$t('optionnel')})
      <input type="text" bind:value={details} placeholder={$t('Description complémentaire')} /></label>
    </div>
    <div class="field">
      <label for="new-tx-category">{$t('Catégorie')} ({$t('optionnel')})</label>
      <CategorySelect id="new-tx-category" bind:value={category} categories={localCategories} label={$t('Aucune')} />
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={() => dispatch('close')}>{$t('Annuler')}</button>
      <button class="btn btn-primary" onclick={handleSubmit} disabled={loading}>
        {loading ? $t('Création…') : $t('Créer l\'opération')}
      </button>
    </div>
  </div>
</div>
