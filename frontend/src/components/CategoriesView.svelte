<script lang="ts">
  import { untrack } from 'svelte';
  
  import { lang, t } from '../lib/i18n.ts';
  import { catDotStyle } from '../utils/categoryColor.js';
  import ConfirmModal from './ConfirmModal.svelte';
  import Icon from './Icon.svelte';
  import CategoryModal from './CategoryModal.svelte';
  import { api } from '../lib/api.js';

  let { account } = $props();

  let categories = $state([]);
  let loading = $state(true);
  let showCategoryModal = $state(false);
  let editingCategory = $state(null);
  let error = $state('');
  let sortBy: 'name' | 'usage' = $state('name');
  let toDelete = $state(null);
  let isDeleting = $state(false);

  let locale = $derived($lang === 'fr' ? 'fr-FR' : 'en-US');
  let maxCount = $derived(Math.max(1, ...categories.map(c => c.transaction_count)));
  let sorted = $derived([...categories].sort((a, b) =>
    (sortBy === 'usage' ? b.transaction_count - a.transaction_count : 0) || a.name.localeCompare(b.name, locale)
  ));

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

  function deleteMessage(cat) {
    return cat.transaction_count > 0
      ? $t('Supprimer "{name}" ? Les {count} opérations associées perdront leur catégorie.').replace('{name}', cat.name).replace('{count}', String(cat.transaction_count))
      : $t('Supprimer la catégorie "{name}" ?').replace('{name}', cat.name);
  }

  async function deleteCategory() {
    if (!toDelete) return;
    isDeleting = true;
    error = '';
    try {
      await api.delete(`/api/accounts/${account.id}/categories/${encodeURIComponent(toDelete.name)}`);
      await load();
    } catch (e) {
      error = e.message;
    } finally {
      isDeleting = false;
      toDelete = null;
    }
  }

  $effect.pre(() => {
    if (account) untrack(() => load());
  });
</script>

<div class="page-header cat-header">
  <div>
    <h1 class="page-title">{$t('Catégories')}</h1>
    <p class="page-meta">
      {account.name} · {categories.length} {categories.length === 1 ? $t('catégorie') : $t('catégories')}
    </p>
  </div>
  <div class="cat-tools">
    <div class="segmented" role="group" aria-label={$t('Trier par')}>
      <button class:on={sortBy === 'name'} aria-pressed={sortBy === 'name'} onclick={() => (sortBy = 'name')}>{$t('Nom')}</button>
      <button class:on={sortBy === 'usage'} aria-pressed={sortBy === 'usage'} onclick={() => (sortBy = 'usage')}>{$t('Les plus utilisées')}</button>
    </div>
    <button class="btn btn-primary" onclick={() => openForm()}>
      <Icon name="plus" />
      {$t('Nouvelle catégorie')}
    </button>
  </div>
</div>

{#if error}
  <div class="error-banner" role="alert">{error}</div>
{/if}

{#if loading}
  <div class="state-loading">{$t('Chargement…')}</div>
{:else if categories.length === 0}
  <div class="state-empty">
    {$t('Aucune catégorie — créez-en une ci-dessus ou importez des transactions.')}
  </div>
{:else}
  <ul class="cat-grid">
    {#each sorted as cat (cat.name)}
      <li class="cat-card" style={catDotStyle(cat.name)}>
        <span class="cat-mark"><Icon name="tag" size={18} /></span>
        <div class="cat-body">
          <span class="cat-title" title={cat.name}>{cat.name}</span>
          <span class="cat-count">
            {#if cat.transaction_count > 0}
              {cat.transaction_count.toLocaleString(locale)} {cat.transaction_count === 1 ? $t('opération') : $t('opérations')}
            {:else}
              {$t('Aucune opération')}
            {/if}
          </span>
        </div>
        <div class="cat-actions">
          <button class="btn-icon" title={$t('Renommer')} aria-label={`${$t('Renommer')} ${cat.name}`} onclick={() => openForm(cat.name)}>
            <Icon name="pencil" />
          </button>
          <button class="btn-icon danger" title={$t('Supprimer')} aria-label={`${$t('Supprimer')} ${cat.name}`} onclick={() => (toDelete = cat)}>
            <Icon name="trash" />
          </button>
        </div>
        <!-- Length: operations compared with the most used category -->
        <span class="cat-track" aria-hidden="true"><span class="cat-bar" style="width:{(cat.transaction_count / maxCount) * 100}%"></span></span>
      </li>
    {/each}
  </ul>

  <p class="cat-note">
    {$t('Renommer une catégorie met à jour toutes les opérations et règles concernées. Supprimer retire la catégorie des opérations mais ne les supprime pas.')}
  </p>
{/if}

{#if toDelete}
  <ConfirmModal
    title={$t('Supprimer la catégorie')}
    message={deleteMessage(toDelete)}
    confirmText={$t('Supprimer')}
    confirmClass="btn-danger-ghost"
    isLoading={isDeleting}
    on:confirm={deleteCategory}
    on:cancel={() => (toDelete = null)}
  />
{/if}

{#if showCategoryModal}
  <CategoryModal
    {account}
    {editingCategory}
    on:created={() => { closeForm(); load(); }}
    on:updated={() => { closeForm(); load(); }}
    on:close={closeForm}
  />
{/if}

<style>
  .cat-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }
  .cat-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .segmented {
    display: flex;
    height: 36px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
  }
  .segmented button {
    padding: 0 12px;
    border: none;
    border-radius: 5px;
    background: none;
    font-family: var(--font-ui);
    font-size: 13px;
    color: var(--text-2);
    cursor: pointer;
    transition: background-color 150ms var(--ease), color 150ms var(--ease);
  }
  .segmented button:hover { color: var(--text-1); }
  .segmented button.on {
    background: var(--card-hover);
    color: var(--text-1);
    font-weight: 500;
  }

  .cat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cat-card {
    /* The category color, calmed on the light theme and lifted on the dark one */
    --cat: color-mix(in oklab, var(--dot) 80%, var(--chart-neutral));
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: 12px;
    row-gap: 12px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    transition: border-color 150ms var(--ease), background-color 150ms var(--ease);
  }
  :global([data-theme="dark"]) .cat-card { --cat: color-mix(in oklab, var(--dot), white 25%); }
  .cat-card:hover,
  .cat-card:focus-within {
    border-color: color-mix(in srgb, var(--cat) 45%, transparent);
    background: color-mix(in srgb, var(--cat) 5%, var(--card));
  }

  .cat-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--cat) 18%, transparent);
    color: color-mix(in oklab, var(--cat) 80%, var(--text-1));
  }

  .cat-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .cat-title {
    font-size: 15px;
    font-weight: 500;
    line-height: 20px;
    color: var(--text-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat-count {
    font-size: 13px;
    line-height: 20px;
    color: var(--text-2);
  }

  /* Over the card, so a hidden action never shortens a name */
  .cat-actions {
    position: absolute;
    top: 22px;
    right: 12px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 120ms var(--ease);
  }
  .cat-card:hover .cat-actions,
  .cat-card:focus-within .cat-actions { opacity: 1; }
  .cat-card:hover .cat-body,
  .cat-card:focus-within .cat-body { padding-right: 60px; }
  @media (hover: none) {
    .cat-actions { opacity: 1; }
    .cat-body { padding-right: 60px; }
  }

  .cat-track {
    grid-column: 1 / -1;
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--text-1) 6%, transparent);
  }
  .cat-bar {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--cat);
  }

  .cat-note {
    margin-top: 16px;
    font-size: 13px;
    line-height: 20px;
    color: var(--text-3);
  }
</style>
