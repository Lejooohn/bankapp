<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';

  let { account } = $props();

  const dispatch = createEventDispatcher();

  let file: File | undefined = $state();
  let importing = $state(false);
  let result = $state('');
  let error = $state('');

  async function handleImport() {
    if (!file) return;

    importing = true;
    error = '';
    result = '';

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      let csv;
      try {
        csv = new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
      } catch {
        csv = new TextDecoder('iso-8859-1').decode(arrayBuffer);
      }

      csv = csv.normalize('NFC');

      const data = await api.post(`/api/accounts/${account.id}/import`, { csv });

      result = `✅ ${data.imported} ${$t('transactions importées')}`;
      setTimeout(() => {
        dispatch('created');
        dispatch('close');
      }, 1500);
    } catch (err) {
      error = err.message || $t('Erreur lors de l\'import');
    } finally {
      importing = false;
    }
  }
</script>

<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
  <div class="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
    <h2 class="text-2xl font-bold mb-2">{$t('Importer BankPerfect')}</h2>
    <p class="text-gray-600 text-sm mb-6">{$t('Fichier CSV avec séparateur')} <code class="bg-gray-100 px-2 py-1 rounded">;</code></p>

    <div class="mb-6">
      <label class="block text-sm font-medium text-gray-700 mb-2">{$t('Sélectionner fichier CSV')}
      <input
        type="file"
        accept=".csv"
        onchange={(e) => (file = e.currentTarget.files?.[0])}
        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      /></label>
    </div>

    {#if error}
      <p class="text-red-600 text-sm mb-4">❌ {error}</p>
    {/if}

    {#if result}
      <p class="text-green-600 text-sm mb-4">{result}</p>
    {/if}

    <div class="flex gap-3">
      <button
        onclick={() => dispatch('close')}
        disabled={importing}
        class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
      >
        {$t('Annuler')}
      </button>
      <button
        onclick={handleImport}
        disabled={!file || importing}
        class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
      >
        {importing ? $t('Importation...') : $t('Importer')}
      </button>
    </div>
  </div>
</div>
