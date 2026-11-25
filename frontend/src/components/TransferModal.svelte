<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { createEventDispatcher, onMount, untrack } from 'svelte';
  import { t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  import DateInput from './DateInput.svelte';

  let { account, otherAccounts = [], categories = $bindable([]) } = $props();

  const dispatch = createEventDispatcher();
  let isLoading = $state(false);
  let formError = $state('');

  let formData = $state({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    tiers: '',
    details: '',
    category: '',
  });
  let targetAccountId = $state(otherAccounts.length === 1 ? otherAccounts[0].id : '');

  onMount(async () => {
    try {
      const data = await api.get(`/api/accounts/${account.id}/categories`);
      if (Array.isArray(data)) categories = data;
    } catch (e) { console.error(e); }
  });

  // Accent/case-insensitive match, same normalization approach as the backend's normalizeString().
  function normalizeString(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }


  let savingsEpargneCategory = $state(null);

  // Categories are scoped per account, and the savings account itself often has none yet
  // (e.g. a brand new "Livret A"), so look across both the source and target account's
  // categories — an existing "Epargne & Investissement" on the checking account should win.
  // Both are always fetched fresh here (rather than reusing the `categories` prop) because
  // targetAccountId can be auto-selected before that prop's own onMount fetch has resolved.
  async function resolveSavingsCategory() {
    let sourceCategories = [];
    let targetCategories = [];
    try {
      [sourceCategories, targetCategories] = await Promise.all([
        api.get(`/api/accounts/${account.id}/categories`),
        targetAccountId === account.id
          ? Promise.resolve([])
          : api.get(`/api/accounts/${targetAccountId}/categories`),
      ]);
    } catch (e) { console.error(e); }
    const combined = [...(sourceCategories || []), ...(targetCategories || [])];
    const existing = combined.find(c => normalizeString(c.name).includes('epargne'));
    savingsEpargneCategory = existing ? existing.name : 'Épargne';
    formData.category = savingsEpargneCategory;
  }

  async function handleSubmit() {
    if (!formData.date || !formData.amount || !formData.tiers || !targetAccountId) {
      formError = $t('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    if (targetAccountId === account.id) {
      formError = $t('Le compte destination ne peut pas être le même que le compte source.');
      return;
    }

    isLoading = true;
    formError = '';

    try {
      await api.post(`/api/accounts/${account.id}/transfers`, {
        date: formData.date,
        amount: Math.abs(parseFloat(formData.amount)),
        tiers: formData.tiers || 'Transfert',
        details: formData.details || null,
        target_account_id: targetAccountId,
        category: formData.category || null,
      });

      dispatch('transferred');
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
  // A transfer touching a savings account always uses a fixed "Épargne"-like category —
  // it's not a real spending category, so there's nothing for the user to pick.
  // targetAccountId is kept out of formData so this assignment doesn't create a
  // reactive dependency cycle (formData -> targetAccount -> formData.category).
  let targetAccount = $derived(otherAccounts.find(a => a.id === targetAccountId));
  let isSavingsTransfer = $derived(account.account_type === 'savings' || targetAccount?.account_type === 'savings');
  // Split into two statements (rather than if/else) so neither depends on formData/savingsEpargneCategory
  // while also writing them — a single combined statement would re-trigger itself indefinitely.
  $effect.pre(() => {
    if (isSavingsTransfer && targetAccountId) untrack(() => resolveSavingsCategory());
  });
  $effect.pre(() => {
    if (!isSavingsTransfer && formData.category && formData.category === savingsEpargneCategory) {
      untrack(() => {
        formData.category = '';
      });
    }
  });
</script>

<div class="modal-overlay" onclick={self(close)} onkeydown={(e) => e.key === 'Escape' && close()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
    <h2 class="modal-title">{$t('Transfert entre comptes')}</h2>

    {#if formError}
      <div class="error-banner">{formError}</div>
    {/if}

    <div class="transfer-info">
      <div class="transfer-from">
        <span class="label">{$t('De')} :</span>
        <span class="account-name">{account.name}</span>
      </div>
      <div class="transfer-arrow">→</div>
      <div class="transfer-to">
        <span class="label">{$t('À')} :</span>
        <select bind:value={targetAccountId}>
          <option value="">{$t('Sélectionner un compte')}</option>
          {#each otherAccounts as acc (acc.id)}
            <option value={acc.id}>{acc.name}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="field">
      <label for="tf-date">{$t('Date')} <span class="req">*</span></label>
      <DateInput id="tf-date" bind:value={formData.date} />
    </div>

    <div class="field-row">
      <div class="field">
        <label for="tf-amount">{$t('Montant')} <span class="req">*</span></label>
        <input
          id="tf-amount"
          type="number"
          bind:value={formData.amount}
          oninput={(e) => { const val = parseFloat(e.currentTarget.value); if (val < 0) e.currentTarget.value = String(Math.abs(val)); }}
          step="0.01"
          min="0"
          placeholder="0.00"
          style="font-family:var(--font-mono);"
        />
      </div>
    </div>

    <div class="field">
      <label for="tf-tiers">{$t('Descriptif')} <span class="req">*</span></label>
      <input
        id="tf-tiers"
        type="text"
        bind:value={formData.tiers}
        placeholder="Transfert épargne"
      />
    </div>

    <div class="field">
      <label for="tf-details">{$t('Détails')} ({$t('optionnel')})</label>
      <input
        id="tf-details"
        type="text"
        bind:value={formData.details}
        placeholder={$t('Description supplémentaire')}
      />
    </div>

    {#if !isSavingsTransfer}
      <div class="field">
        <label for="tf-cat">{$t('Catégorie')} ({$t('optionnel')})</label>
        <select id="tf-cat" bind:value={formData.category}>
          <option value="">{$t('Aucune')}</option>
          {#each categories as cat (cat.name)}
            <option value={cat.name}>{cat.name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={close}>{$t('Annuler')}</button>
      <button class="btn btn-primary" onclick={handleSubmit} disabled={isLoading}>
        {isLoading ? $t('Transfert en cours…') : $t('Effectuer le transfert')}
      </button>
    </div>
  </div>
</div>

<style>
  .transfer-info {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .transfer-from,
  .transfer-to {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }

  .label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-3);
    text-transform: uppercase;
  }

  .account-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
  }

  .transfer-to select {
    font-size: 14px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--text-1);
    font-weight: 500;
  }

  .transfer-to select:focus {
    outline: none;
    border-color: var(--cobalt);
  }

  .transfer-arrow {
    font-size: 20px;
    color: var(--text-3);
    font-weight: 600;
  }

  @media (max-width: 600px) {
    .transfer-info {
      flex-wrap: wrap;
    }

    .transfer-from,
    .transfer-to {
      flex: 1 1 calc(50% - 8px);
    }

    .transfer-arrow {
      order: 3;
      width: 100%;
      text-align: center;
    }
  }
</style>
