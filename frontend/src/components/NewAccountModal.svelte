<script>
  import { self, stopPropagation } from '../lib/events';
  import { createEventDispatcher } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  const dispatch = createEventDispatcher();
  let name = $state(''), bankName = $state(''), balance = $state(0), accountType = $state('checking'), loading = $state(false), error = $state('');

  function handleOverlayClick() {
    if (window.getSelection().toString() === '') {
      dispatch('close');
    }
  }

  async function handleSubmit() {
    if (!name.trim()) { error = $t('Le nom du compte est requis'); return; }
    loading = true; error = '';
    try {
      const newAccount = await api.post('/api/accounts', { name, bank_name: bankName || null, balance: balance || 0, account_type: accountType });
      dispatch('created', { accountId: newAccount.id, accountType: accountType });
    } catch (e) { error = e.message; }
    finally { loading = false; }
  }
</script>

<div class="modal-overlay" onclick={self(handleOverlayClick)} onkeydown={(e) => e.key === 'Escape' && handleOverlayClick()} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
    <h2 class="modal-title">{$t('Nouveau compte')}</h2>
    {#if error}<div class="error-banner">{error}</div>{/if}
    <div class="field">
      <label>{$t('Nom du compte')} *
      <input type="text" bind:value={name} placeholder="Compte courant" /></label>
    </div>
    <div class="field">
      <label>{$t('Banque')} ({$t('optionnel')})
      <input type="text" bind:value={bankName} placeholder="Crédit Mutuel" /></label>
    </div>
    <div class="field">
      <label>{$t('Type de compte')} *
      <select bind:value={accountType}>
        <option value="checking">{$t('Compte courant')}</option>
        <option value="savings">{$t('Livret/Épargne')}</option>
      </select></label>
    </div>
    <div class="field">
      <label>{$t('Solde initial')} ({$t('optionnel')})
      <input type="number" bind:value={balance} placeholder="0.00" step="0.01" style="font-family:'Fira Code',monospace;" /></label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={() => dispatch('close')}>{$t('Annuler')}</button>
      <button class="btn btn-primary" onclick={handleSubmit} disabled={loading}>
        {loading ? $t('Création…') : $t('Créer le compte')}
      </button>
    </div>
  </div>
</div>

