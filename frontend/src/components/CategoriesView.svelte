<script lang="ts">
  import { untrack } from 'svelte';
  
  import { lang, t } from '../lib/i18n.ts';
  import { catStyle } from '../utils/categoryColor.js';
  import CategoryModal from './CategoryModal.svelte';
  import { api } from '../lib/api.js';

  let { account } = $props();

  let categories = $state([]);
  let loading = $state(true);
  let showCategoryModal = $state(false);
  let editingCategory = $state(null);
  let error = $state('');

  async function load() {
    loading = true;
    try {
      categories = await api.get(`/api/accounts/${account.id}/categories/stats`);
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des catégories');
    }
    loading = false;
  }

  function openForm(categoryName = null) {
    editingCategory = categoryName;
    showCategoryModal = true;
  }

  function closeForm() {
    showCategoryModal = false;
    editingCategory = null;
  }

  async function deleteCategory(name, count) {
    const msg = count > 0
      ? $t('Supprimer "{name}" ? Les {count} opérations associées perdront leur catégorie.').replace('{name}', name).replace('{count}', String(count))
      : $t('Supprimer la catégorie "{name}" ?').replace('{name}', name);
    if (!confirm(msg)) return;
    try {
      await api.delete(`/api/accounts/${account.id}/categories/${encodeURIComponent(name)}`);
      await load();
    } catch (e) { error = e.message; }
  }

  $effect.pre(() => {
    if (account) untrack(() => load());
  });
</script>

<div class="page-header">
  <h1 class="page-title">{$t('Catégories')}</h1>
  <p class="page-meta">{account.name}</p>
</div>

{#if error}
  <div class="error-banner" style="margin-bottom:16px;">{error}</div>
{/if}

<!-- Add category button -->
<div style="display:flex; gap:8px; margin-bottom:20px;">
  <button class="btn btn-primary" onclick={() => openForm()}>
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    {$t('Nouvelle catégorie')}
  </button>
</div>

<!-- Categories table -->
<div class="tx-panel">
  <div class="tx-panel-header">
    <span class="tx-panel-title">
      {categories.length} {categories.length === 1 ? $t('catégorie') : $t('catégories')}
    </span>
  </div>

  {#if loading}
    <div class="state-loading">{$t('Chargement…')}</div>
  {:else if categories.length === 0}
    <div class="state-empty">
      {$t('Aucune catégorie — créez-en une ci-dessus ou importez des transactions.')}
    </div>
  {:else}
    <table class="tx-table">
      <thead>
        <tr>
          <th>{$t('Nom')}</th>
          <th class="r" style="width:160px;">{$t('Opérations')}</th>
          <th style="width:96px;"></th>
        </tr>
      </thead>
      <tbody>
        {#each categories as cat (cat.name)}
          <tr class="tx-row is-reconciled">
            <td>
              <span class="cat-badge" style="font-size:12.5px; padding:3px 10px; {catStyle(cat.name)}">{cat.name}</span>
            </td>
            <td class="r">
              {#if cat.transaction_count > 0}
                <span style="font-family:'Fira Code',monospace; font-size:13px; color:var(--text-2);">
                  {cat.transaction_count}
                </span>
              {:else}
                <span style="font-size:12px; color:var(--text-3);">—</span>
              {/if}
            </td>
            <td>
              <div class="tx-actions" style="opacity:1;">
                <button class="btn-icon" title={$t('Renommer')} onclick={() => openForm(cat.name)}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="btn-icon danger" title={$t('Supprimer')} onclick={() => deleteCategory(cat.name, cat.transaction_count)}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <path d="M2 4h10M5 4V2.5h4V4M4.5 4v7a.5.5 0 00.5.5h4a.5.5 0 00.5-.5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>


{#if showCategoryModal}
  <CategoryModal
    {account}
    {editingCategory}
    on:created={() => { closeForm(); load(); }}
    on:updated={() => { closeForm(); load(); }}
    on:close={closeForm}
  />
{/if}

<div style="margin-top:12px; font-size:12px; color:var(--text-3); line-height:1.6;">
  {$t('Renommer une catégorie met à jour toutes les opérations et règles concernées. Supprimer retire la catégorie des opérations mais ne les supprime pas.')}
</div>

<style>
</style>
