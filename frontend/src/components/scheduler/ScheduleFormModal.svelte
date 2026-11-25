<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '../../lib/i18n.ts';
  import CategorySelect from '../CategorySelect.svelte';
  import ModeSelect from '../ModeSelect.svelte';
  import DateInput from '../DateInput.svelte';
  import ScheduleModal from './ScheduleModal.svelte';

  // Create or edit a schedule. The form owns its fields and validation; the parent
  // performs the API call through onsave(payload, id) and the form closes when it succeeds.
  function initialValues(s: any) {
    return {
      id: s ? s.id : null,
      description: s?.description ?? '',
      details: s ? (s.details || '') : '',
      amount: s ? String(Math.abs(s.amount)) : '',
      transactionType: s ? (s.transaction_type || 'Prélèvement') : 'Prélèvement',
      category: s ? (s.category || '') : '',
      frequency: s ? s.frequency : 'MONTHLY',
      // New schedules start today; editing keeps the stored start date (day part only).
      startDate: s ? (s.start_date ? s.start_date.substring(0, 10) : '') : new Date().toISOString().split('T')[0],
      endDate: s && s.end_date ? s.end_date.substring(0, 10) : '',
      dayOfMonth: s ? s.day_of_month : 1,
      skipWeekends: s ? s.skip_weekends : true,
      targetAccountId: s?.target_account_id || '',
      isTransfer: s ? !!s.target_account_id : false,
    };
  }

  let { schedule = null, userAccounts = [], categories = [], onclose, onsave }: {
    schedule?: any;
    userAccounts?: any[];
    categories?: string[];
    onclose: () => void;
    onsave: (payload: any, id: string | null) => Promise<void>;
  } = $props();

  // Initial values are read once: each opening of the modal creates a new instance.
  const init = untrack(() => initialValues(schedule));
  const editingId: string | null = init.id;

  let description = $state(init.description);
  let details = $state(init.details);
  let amount = $state(init.amount);
  let transactionType = $state(init.transactionType);
  let category = $state(init.category);
  let frequency = $state(init.frequency);
  let startDate = $state(init.startDate);
  let endDate = $state(init.endDate);
  let dayOfMonth = $state(init.dayOfMonth);
  let skipWeekends = $state(init.skipWeekends);
  let targetAccountId = $state(init.targetAccountId);
  let isTransfer = $state(init.isTransfer);

  let error = $state('');
  let saving = $state(false);

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
  let dayOfMonthValid = $derived((() => {
    const val = parseInt(String(dayOfMonth), 10);
    return !isNaN(val) && val >= 1 && val <= 31;
  })());
  let isValid = $derived(description && amount && startDate);

  async function submit() {
    if (!description || !amount || !startDate) { error = $t('Tiers, montant et date de début sont requis'); return; }
    if (isTransfer && !targetAccountId) { error = $t('Veuillez sélectionner un compte destinataire pour le virement'); return; }
    // Validate day of month
    const domValue = parseInt(String(dayOfMonth), 10);
    if (isNaN(domValue) || domValue < 1 || domValue > 31) {
      error = $t('Le jour du mois doit être compris entre 1 et 31');
      return;
    }
    saving = true; error = '';
    try {
      // The day is taken from the start date for new schedules (not when editing)
      const dom = !editingId ? new Date(startDate).getDate() : domValue;
      const payload = {
        description, amount: parseFloat(amount), transaction_type: transactionType,
        category: category || null, frequency, details: details || null,
        start_date: startDate, end_date: endDate || null, day_of_month: dom, skip_weekends: skipWeekends,
        target_account_id: isTransfer && targetAccountId ? targetAccountId : null
      };
      await onsave(payload, editingId);
      onclose();
    } catch (e: any) { error = e.message; }
    saving = false;
  }
</script>

<ScheduleModal title={editingId ? $t('Modifier l\'échéance') : $t('Nouvelle échéance')} {onclose} boxClass="form-modal-box">
  {#if error}<div class="error-banner" style="margin-bottom:14px;">{error}</div>{/if}
  <div class="sched-form-grid">
    <!-- Tiers et Détails (pleins) -->
    <div class="field" style="margin-bottom:0; grid-column:span 2;">
      <label for="s-desc">{$t('Tiers')} *</label>
      <input id="s-desc" type="text" bind:value={description} placeholder="Netflix, Loyer, EDF…" />
    </div>
    <div class="field" style="margin-bottom:0; grid-column:span 2;">
      <label for="s-details">{$t('Détails')} ({$t('optionnel')})</label>
      <input id="s-details" type="text" bind:value={details} placeholder={$t('Description complémentaire')} />
    </div>

    <!-- Montant et Mode -->
    <div class="field" style="margin-bottom:0;">
      <label for="s-amount">{$t('Montant')} *</label>
      <input id="s-amount" type="number" bind:value={amount} step="0.01" placeholder="0.00" style="font-family:var(--font-mono);" />
    </div>
    <div class="field" style="margin-bottom:0;">
      <label for="s-type">{$t('Mode')}</label>
      <ModeSelect id="s-type" bind:value={transactionType} options={modeOptions} />
    </div>

    <!-- Dates -->
    <div class="field" style="margin-bottom:0;">
      <label for="s-sdate">{$t('Date début')} *</label>
      <DateInput id="s-sdate" bind:value={startDate} style="font-family:var(--font-mono);" />
    </div>
    <div class="field" style="margin-bottom:0;">
      <label for="s-edate">{$t('Date fin')}</label>
      <DateInput id="s-edate" bind:value={endDate} style="font-family:var(--font-mono);" />
    </div>

    <!-- Fréquence et Jour -->
    <div class="field" style="margin-bottom:0;">
      <label for="s-freq">{$t('Fréquence')}</label>
      <select id="s-freq" bind:value={frequency}>
        <option value="MONTHLY">{$t('Mensuel')}</option>
        <option value="QUARTERLY">{$t('Trimestriel')}</option>
        <option value="BIANNUAL">{$t('Semestriel')}</option>
        <option value="ANNUAL">{$t('Annuel')}</option>
      </select>
    </div>
    <div class="field" style="margin-bottom:0;">
      <label for="s-dom">{$t('Jour')}</label>
      <input id="s-dom" type="number" bind:value={dayOfMonth} min="1" max="31" class:invalid={!dayOfMonthValid} />
    </div>

    <!-- Catégorie (plein) -->
    <div class="field" style="margin-bottom:0; grid-column:span 2;">
      <label for="s-cat">{$t('Catégorie')}</label>
      <CategorySelect bind:value={category} {categories} label={$t('Sans catégorie')} />
    </div>

    <!-- Virement entre comptes -->
    <div style="grid-column:span 2; display:flex; align-items:center; padding-top:8px;">
      <label style="display:flex; align-items:center; gap:7px; cursor:pointer; font-size:12.5px; color:var(--text-2);">
        <input type="checkbox" bind:checked={isTransfer} style="width:14px;height:14px;" />
        {$t('Virement entre comptes')}
      </label>
    </div>

    <!-- Compte destinataire (affiché seulement si isTransfer) -->
    {#if isTransfer}
      <div class="field" style="margin-bottom:0; grid-column:span 2;">
        <label for="s-target">{$t('Compte destinataire')} *</label>
        <select id="s-target" bind:value={targetAccountId}>
          <option value="">{$t('Sélectionner un compte…')}</option>
          {#each userAccounts as acc (acc.id)}
            <option value={acc.id}>{acc.name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Checkbox -->
    <div style="grid-column:span 2; display:flex; align-items:center; padding-top:8px;">
      <label style="display:flex; align-items:center; gap:7px; cursor:pointer; font-size:12.5px; color:var(--text-2);">
        <input type="checkbox" bind:checked={skipWeekends} style="width:14px;height:14px;" />
        {$t('Décaler si week-end')}
      </label>
    </div>
  </div>

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>{$t('Annuler')}</button>
    <button class="btn btn-primary" onclick={submit} disabled={saving || !isValid}>
      {saving ? $t('Sauvegarde…') : editingId ? $t('Modifier') : $t('Ajouter')}
    </button>
  {/snippet}
</ScheduleModal>

<style>
  .error-banner {
    background: rgba(253, 164, 175, 0.1); border: 1px solid rgba(253, 164, 175, 0.3);
    color: #BE123C; padding: 8px 12px; border-radius: 6px; font-size: 12.5px;
  }


  .field {
    display: flex; flex-direction: column; gap: 8px;
  }
  .field label {
    font-size: 13px; font-weight: 600; color: var(--text-2);
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .field input, .field select {
    padding: 10px 12px; border: 1px solid var(--border);
    border-radius: 6px; background: var(--surface);
    color: var(--text-1); font-size: 14px;
    font-family: var(--font-ui);
  }
  .field input:focus, .field select:focus {
    outline: none; border-color: #3B82F6; background: var(--card);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  /* Form grid */
  .sched-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .sched-form-grid > div:first-child { grid-column: 1 / -1; }
  .sched-form-grid > div:nth-child(2) { grid-column: 1 / -1; }
  .sched-form-grid > div:nth-child(3) { grid-column: 1; }
  .sched-form-grid > div:nth-child(4) { grid-column: 2; }

  /* Invalid input styling */
  input.invalid {
    border-color: #ef4444 !important;
    background-color: #fee2e2;
  }
</style>
