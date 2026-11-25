<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { createEventDispatcher } from 'svelte';
  import { api } from '../lib/api.js';
  import { lang, t } from '../lib/i18n.ts';
  import { backupTitle, backupNote } from './backup/backup-format.ts';

  // undo: the copy was made before a restore, and puts back the data that restore replaced.
  let { account, backup, undo = false } = $props();

  const dispatch = createEventDispatcher();

  const TABLE_OPTIONS = [
    { key: 'transactions', label: 'Opérations' },
    { key: 'categories', label: 'Catégories' },
    { key: 'categorization_rules', label: 'Règles' },
    { key: 'schedules', label: 'Échéancier' },
  ];

  let selectedTables = $state([]);
  let destination = $state('current');
  let newAccountName = $state(`${account.name} (restauré ${new Date().toLocaleDateString(($lang === 'fr' ? 'fr-FR' : 'en-US'))})`);
  let confirmInput = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state('');
  let resultMessage = $state('');

  function toggleTable(key) {
    selectedTables = selectedTables.includes(key)
      ? selectedTables.filter(k => k !== key)
      : [...selectedTables, key];
  }

  let locale = $derived($lang === 'fr' ? 'fr-FR' : 'en-US');
  let title = $derived(backupTitle(backup, locale, $t));
  // The word to type follows the interface language
  let confirmWord = $derived($t('RESTAURER'));
  // A snapshot is put back whole: there is nothing to choose.
  let isSnapshot = $derived(!backup.category);
  let canSubmit =
    $derived((isSnapshot || selectedTables.length > 0) &&
    (destination === 'new'
      ? newAccountName.trim().length > 0
      : confirmInput.trim().toUpperCase() === confirmWord));

  let warning = $derived((undo
    ? $t('Les données actuelles du compte « {account} » seront remplacées par celles d\'avant la restauration. Ce retour en arrière est définitif.')
    : isSnapshot
      ? $t('Les données actuelles du compte « {account} » seront remplacées par celles de cette copie. Cette action ne peut pas être annulée.')
      : $t('Les données choisies du compte « {account} » seront remplacées. BankApp en garde une copie : vous pourrez revenir en arrière.')
  ).replace('{account}', account.name));

  async function submit() {
    isSubmitting = true;
    errorMessage = '';
    try {
      const body = {
        filename: backup.filename,
        ...(backup.category ? { category: backup.category } : {}),
        tables: isSnapshot ? TABLE_OPTIONS.map(o => o.key) : selectedTables,
        destination,
        ...(destination === 'new' ? { newAccountName: newAccountName.trim() } : {}),
      };
      const result = await api.post(`/api/accounts/${account.id}/backup/restore`, body);
      resultMessage = result.results
        .map(r => `${$t(TABLE_OPTIONS.find(o => o.key === r.table)?.label ?? r.table)} : ${r.inserted}`)
        .join(', ');
      dispatch('restored', result);
    } catch (err) {
      errorMessage = err.message || $t('Erreur lors de la restauration');
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="modal-overlay" onclick={self(() => dispatch('close'))} onkeydown={(e) => e.key === 'Escape' && dispatch('close')} role="presentation">
  <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation" style="width:420px;">
    <h2 class="modal-title">{undo ? $t('Revenir avant cette restauration') : $t('Restaurer une sauvegarde')}</h2>
    <p style="font-size:12.5px; color:var(--text-3); margin-bottom:12px;">
      {[title, backupNote(backup, locale, $t)].filter(Boolean).join(', ')}
    </p>

    {#if resultMessage}
      <p style="font-size:13.5px; color:var(--text-1);">{$t('Restauration réussie')} — {resultMessage}</p>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick={() => dispatch('close')}>{$t('Fermer')}</button>
      </div>
    {:else}
      {#if !isSnapshot}
      <p style="font-size:12.5px; font-weight:600; color:var(--text-2); margin-bottom:6px;">
        {$t('Type de données à restaurer')}
      </p>
      {#each TABLE_OPTIONS as opt}
        <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; padding:4px 0;">
          <input type="checkbox" checked={selectedTables.includes(opt.key)} onchange={() => toggleTable(opt.key)} />
          {$t(opt.label)}
        </label>
      {/each}
      {/if}

      {#if backup.category}
        <p style="font-size:12.5px; font-weight:600; color:var(--text-2); margin:14px 0 6px;">
          {$t('Destination')}
        </p>
        <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; padding:4px 0;">
          <input type="radio" bind:group={destination} value="current" />
          {$t('Compte actuel')}
        </label>
        <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; padding:4px 0;">
          <input type="radio" bind:group={destination} value="new" />
          {$t('Nouveau compte (sans risque)')}
        </label>
      {/if}

      {#if destination === 'new'}
        <input
          type="text"
          bind:value={newAccountName}
          placeholder={$t('Nom du nouveau compte')}
          style="width:100%; margin-top:8px; padding:10px 12px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--text-1); font-size:14px;"
        />
      {:else}
        <p style="font-size:12.5px; color:var(--danger-text); line-height:1.5; margin:12px 0 8px;">
          {warning}
        </p>
        <input
          type="text"
          bind:value={confirmInput}
          placeholder={confirmWord}
          style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--text-1); font-size:14px;"
        />
        <p style="font-size:11px; color:var(--text-3); margin-top:4px;">{$t('Tapez {word} pour confirmer').replace('{word}', confirmWord)}</p>
      {/if}

      {#if errorMessage}
        <p style="font-size:12.5px; color:var(--danger-text); margin-top:10px;">{errorMessage}</p>
      {/if}

      <div class="modal-footer" style="margin-top:16px;">
        <button class="btn btn-ghost" onclick={() => dispatch('close')} disabled={isSubmitting}>{$t('Annuler')}</button>
        <button class="btn btn-danger-ghost" onclick={submit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting
            ? $t('Restauration en cours…')
            : destination === 'new' ? $t('Créer et restaurer') : undo ? $t('Revenir en arrière') : $t('Restaurer')}
        </button>
      </div>
    {/if}
  </div>
</div>
