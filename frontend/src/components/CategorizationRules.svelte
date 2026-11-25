<script lang="ts">
  
  import { createEventDispatcher, untrack } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  import ApplyRulesModal from './ApplyRulesModal.svelte';
  import ApplySingleRuleModal from './ApplySingleRuleModal.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import Icon from './Icon.svelte';
  import RuleModal from './RuleModal.svelte';
  import { catDotStyle } from '../utils/categoryColor.js';

  let { account, categories = [] } = $props();

  const dispatch = createEventDispatcher();
  let rules = $state([]);
  let showRuleModal = $state(false);
  let showApplyModal = $state(false);
  let showApplySingleModal = $state(false);
  let preview = $state([]);
  let singleRulePreview = $state(null);
  let selectedRule = $state(null);
  let editingRule = $state(null);
  let loading = $state(true);
  let error = $state('');
  let filter = $state('');
  let toDelete = $state(null);
  let busy = $state(false);

  let locale = $derived($lang === 'fr' ? 'fr-FR' : 'en-US');

  async function loadRules() {
    try {
      rules = await api.get(`/api/accounts/${account.id}/rules`);
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement des règles');
    }
    loading = false;
  }

  function openForm(rule = null) {
    editingRule = rule;
    showRuleModal = true;
  }

  function closeForm() {
    showRuleModal = false;
    editingRule = null;
  }

  // Runs an action, shows its error on the page, then reloads the list.
  async function run(action) {
    busy = true;
    error = '';
    try {
      await action();
      await loadRules();
    } catch (e) {
      console.error(e);
      error = e.message || $t('Une erreur est survenue');
    } finally {
      busy = false;
      toDelete = null;
    }
  }

  const deleteRule = () => run(() => api.delete(`/api/accounts/${account.id}/rules/${toDelete.id}`));
  const toggleRule = (rule) => run(() => api.put(`/api/accounts/${account.id}/rules/${rule.id}/toggle`, {}));

  async function openApplyModal() {
    try {
      preview = await api.get(`/api/accounts/${account.id}/apply-rules-preview`);
      showApplyModal = true;
    } catch (e) {
      console.error(e);
      error = e.message || $t('Une erreur est survenue');
    }
  }

  function closeSingleRuleModal() {
    showApplySingleModal = false;
    selectedRule = null;
    singleRulePreview = null;
  }

  async function applySingleRule(ruleId: string) {
    try {
      selectedRule = rules.find(r => r.id === ruleId);
      singleRulePreview = await api.get(`/api/accounts/${account.id}/rules/${ruleId}/preview`);
      showApplySingleModal = true;
    } catch (e) {
      console.error(e);
      error = e.message || $t('Une erreur est survenue');
    }
  }

  $effect.pre(() => {
    if (account) untrack(() => loadRules());
  });
  const patterns = (p) => (p ? p.split('|').filter(Boolean) : []);

  // Accent- and case-insensitive, like the matching of the rules themselves
  const fold = (text) => (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // One group per category, in alphabetical order
  let groups = $derived.by(() => {
    const needle = fold(filter.trim());
    const byCategory = new Map();
    for (const rule of rules) {
      const haystack = fold([rule.category, rule.tiers_pattern, rule.details_pattern].join(' '));
      if (needle && !haystack.includes(needle)) continue;
      if (!byCategory.has(rule.category)) byCategory.set(rule.category, []);
      byCategory.get(rule.category).push(rule);
    }
    // Switched-off rules go last in their group
    for (const list of byCategory.values()) list.sort((a, b) => Number(b.active) - Number(a.active));
    return [...byCategory].sort(([a], [b]) => a.localeCompare(b, locale));
  });
  let offCount = $derived(rules.filter(rule => !rule.active).length);
  let categoryCount = $derived(new Set(rules.map(rule => rule.category)).size);
</script>

{#snippet chips(list)}
  <span class="chips">
    {#each list as word, i}
      {#if i > 0}<span class="word-or">{$t('ou')}</span>{/if}
      <span class="chip">{word}</span>
    {/each}
  </span>
{/snippet}

<div class="page-header rules-head">
  <div>
    <h1 class="page-title">{$t('Règles de catégorisation')}</h1>
    <p class="page-meta">
      {account.name} · {rules.length} {rules.length === 1 ? $t('règle') : $t('règles')} · {categoryCount} {categoryCount === 1 ? $t('catégorie') : $t('catégories')}{#if offCount > 0}{' · '}{offCount} {offCount === 1 ? $t('désactivée') : $t('désactivées')}{/if}
    </p>
  </div>
  <div class="rules-tools">
    {#if rules.length > 0}
      <div class="search-wrap rules-search">
        <Icon name="search" />
        <input type="text" bind:value={filter} placeholder={$t('Rechercher')} aria-label={$t('Rechercher')} />
        {#if filter}
          <button class="btn-icon rules-clear" onclick={() => (filter = '')} title={$t('Effacer')} aria-label={$t('Effacer')}><Icon name="x" /></button>
        {/if}
      </div>
      <button class="btn btn-ghost" onclick={openApplyModal}>
        <Icon name="zap" />
        {$t('Appliquer toutes les règles')}
      </button>
    {/if}
    <button class="btn btn-primary" onclick={() => openForm()}>
      <Icon name="plus" />
      {$t('Nouvelle règle')}
    </button>
  </div>
</div>

{#if error}
  <div class="error-banner" role="alert">{error}</div>
{/if}

{#if loading}
  <div class="state-loading">{$t('Chargement…')}</div>
{:else if rules.length === 0}
  <div class="state-empty">
    {$t('Aucune règle — créez-en une pour catégoriser automatiquement vos opérations.')}
  </div>
{:else if groups.length === 0}
  <div class="state-empty">{$t('Aucune règle ne correspond à la recherche')}</div>
{:else}
  <div class="rules-columns">
    {#each groups as [category, list] (category)}
      <section class="rule-group" style={catDotStyle(category)}>
        <header class="group-head">
          <span class="group-mark"><Icon name="tag" size={18} /></span>
          <h2 class="group-name" title={category}>{category}</h2>
          <span class="group-count">{list.length} {list.length === 1 ? $t('règle') : $t('règles')}</span>
        </header>
        <ul class="rule-list">
          {#each list as rule (rule.id)}
            {@const tiers = patterns(rule.tiers_pattern)}
            {@const details = patterns(rule.details_pattern)}
            <li class="rule" class:off={!rule.active}>
              <dl class="conditions">
                {#if tiers.length > 0}
                  <dt title={$t('Fournisseur/Bénéficiaire')}>{$t('Tiers')}</dt>
                  <dd>{@render chips(tiers)}</dd>
                {/if}
                {#if details.length > 0}
                  <dt title={$t('Détails de transaction')}>{#if tiers.length > 0}<span class="word-and">{$t('et')}</span>{/if}{$t('Détails')}</dt>
                  <dd>{@render chips(details)}</dd>
                {/if}
                {#if !rule.active}
                  <dt>{$t('État')}</dt>
                  <dd class="off-label">{$t('désactivée')}</dd>
                {/if}
              </dl>
              <div class="rule-actions">
                {#if rule.active}
                  <button class="btn-icon" title={$t('Appliquer cette règle')} aria-label={$t('Appliquer cette règle')} onclick={() => applySingleRule(rule.id)}><Icon name="zap" /></button>
                {/if}
                <button class="btn-icon" title={$t('Modifier')} aria-label={$t('Modifier')} onclick={() => openForm(rule)}><Icon name="pencil" /></button>
                <button
                  class="btn-icon"
                  title={rule.active ? $t('Désactiver cette règle') : $t('Activer cette règle')}
                  aria-label={rule.active ? $t('Désactiver cette règle') : $t('Activer cette règle')}
                  disabled={busy}
                  onclick={() => toggleRule(rule)}
                ><Icon name="power" /></button>
                <button class="btn-icon danger" title={$t('Supprimer')} aria-label={$t('Supprimer')} onclick={() => (toDelete = rule)}><Icon name="trash" /></button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>

  <p class="rules-note">
    {$t('Une règle s\'applique si le tiers contient l\'un des mots indiqués et, quand des détails sont précisés, si les détails contiennent l\'un des leurs. Accents et majuscules ne comptent pas.')}
  </p>
{/if}

{#if toDelete}
  <ConfirmModal
    title={$t('Supprimer la règle')}
    message={$t('Supprimer cette règle de la catégorie "{name}" ? Les opérations déjà catégorisées ne changent pas.').replace('{name}', toDelete.category)}
    confirmText={$t('Supprimer')}
    confirmClass="btn-danger-ghost"
    isLoading={busy}
    on:confirm={deleteRule}
    on:cancel={() => (toDelete = null)}
  />
{/if}

{#if showRuleModal}
  <RuleModal
    {account}
    editingRule={editingRule}
    {categories}
    on:created={() => { closeForm(); loadRules(); }}
    on:updated={() => { closeForm(); loadRules(); }}
    on:close={closeForm}
  />
{/if}

{#if showApplyModal}
  <ApplyRulesModal
    {account}
    {preview}
    on:applied={() => { showApplyModal = false; dispatch('updated'); loadRules(); }}
    on:cancel={() => (showApplyModal = false)}
  />
{/if}

{#if showApplySingleModal && selectedRule && singleRulePreview}
  <ApplySingleRuleModal
    {account}
    rule={selectedRule}
    preview={singleRulePreview}
    on:applied={() => { closeSingleRuleModal(); dispatch('updated'); loadRules(); }}
    on:cancel={closeSingleRuleModal}
  />
{/if}

<style>
  .rules-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }
  .rules-tools {
    display: flex;
    flex: 1 1 560px;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .rules-search { flex: 0 1 280px; min-width: 120px; }
  .rules-clear { margin-right: -8px; }

  /* Cards of different heights: columns, filled from top to bottom in alphabetical order */
  .rules-columns {
    columns: 440px;
    column-gap: 12px;
  }

  .rule-group {
    --cat: color-mix(in oklab, var(--dot) 80%, var(--chart-neutral));
    break-inside: avoid;
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    overflow: hidden;
  }
  :global([data-theme="dark"]) .rule-group { --cat: color-mix(in oklab, var(--dot), white 25%); }

  .group-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: color-mix(in srgb, var(--cat) 8%, transparent);
  }
  .group-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--cat) 20%, transparent);
    color: color-mix(in oklab, var(--cat) 80%, var(--text-1));
  }
  .group-name {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    font-weight: 500;
    line-height: 20px;
    color: var(--text-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .group-count {
    font-size: 13px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .rule-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rule {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 8px;
    align-items: start;
    padding: 12px 8px 12px 16px;
    border-top: 1px solid var(--border);
    transition: background-color 120ms var(--ease);
  }
  .rule:hover,
  .rule:focus-within { background: var(--card-hover); }

  .conditions {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 8px;
  }
  .conditions dt {
    font-size: 13px;
    line-height: 24px;
    color: var(--text-3);
    white-space: nowrap;
  }
  .word-and { margin-right: 4px; color: var(--text-2); }

  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .chip {
    max-width: 100%;
    padding: 0 8px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--text-1) 8%, transparent);
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 24px;
    color: var(--text-1);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .word-or {
    padding: 0 2px;
    font-size: 12px;
    color: var(--text-3);
  }

  /* Their place is reserved, so they never cover a word */
  .rule-actions {
    display: flex;
    margin: -2px 0;
    opacity: 0;
    transition: opacity 120ms var(--ease);
  }
  .rule:hover .rule-actions,
  .rule:focus-within .rule-actions { opacity: 1; }
  @media (hover: none) { .rule-actions { opacity: 1; } }

  /* Switched off: still readable, clearly set aside */
  .rule.off .chip { background: none; box-shadow: inset 0 0 0 1px var(--border); color: var(--text-3); }
  .off-label { font-size: 13px; line-height: 24px; color: var(--text-2); }
  .rule.off .rule-actions { opacity: 1; }

  .rules-note {
    margin-top: 4px;
    font-size: 13px;
    line-height: 20px;
    color: var(--text-3);
  }

  @media (max-width: 860px) {
    .rules-tools { flex-basis: 100%; justify-content: flex-start; }
    .rules-columns { columns: auto; }
    /* Not enough width for both: the actions go under the conditions */
    .rule { grid-template-columns: minmax(0, 1fr); row-gap: 8px; padding-right: 16px; }
    .rule-actions { justify-self: end; margin-right: -8px; opacity: 1; }
    .rules-search { flex: 1 1 100%; }
  }
</style>
