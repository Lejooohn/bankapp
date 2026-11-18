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

<div class="page-header">
  <h1 class="page-title">{$t('Règles de catégorisation')}</h1>
  <p class="page-meta">{account.name}</p>
</div>

{#if error}
  <div class="error-banner">{error}</div>
{/if}

<CategorizationRules {account} {categories} />

<style>
  .error-banner {
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 13px;
    color: #c00;
    margin-bottom: 16px;
  }
</style>
