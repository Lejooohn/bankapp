<script lang="ts">
  
  import { onMount, untrack } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  import CategorizationRules from './CategorizationRules.svelte';
  import { api } from '../lib/api.js';

  let { account } = $props();

  let categories = $state([]);
  let error = $state('');


  async function loadCategories() {
    try {
      categories = await api.get(`/api/accounts/${account.id}/categories`);
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des catégories');
    }
  }
  $effect.pre(() => {
    if (account) untrack(() => loadCategories());
  });
</script>

{#if error}
  <div class="error-banner" role="alert">{error}</div>
{/if}

<CategorizationRules {account} {categories} />
