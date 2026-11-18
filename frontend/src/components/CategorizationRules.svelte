<script lang="ts">
  
  import { createEventDispatcher, untrack } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  import ApplyRulesModal from './ApplyRulesModal.svelte';
  import ApplySingleRuleModal from './ApplySingleRuleModal.svelte';
  import RuleModal from './RuleModal.svelte';
  import { catStyle } from '../utils/categoryColor.js';

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

  async function loadRules() {
    try {
      rules = await api.get(`/api/accounts/${account.id}/rules`);
    } catch (e) { console.error(e); }
  }

  function openForm(rule = null) {
    editingRule = rule;
    showRuleModal = true;
  }

  function closeForm() {
    showRuleModal = false;
    editingRule = null;
  }

  async function deleteRule(id) {
    try {
      await api.delete(`/api/accounts/${account.id}/rules/${id}`);
      loadRules();
    } catch (e) { console.error(e); }
  }

  async function openApplyModal() {
    try {
      preview = await api.get(`/api/accounts/${account.id}/apply-rules-preview`);
      showApplyModal = true;
    } catch (e) { console.error(e); }
  }

  function closeSingleRuleModal() {
    showApplySingleModal = false;
    selectedRule = null;
    singleRulePreview = null;
  }


  async function toggleRule(ruleId: string) {
    try {
      await api.put(`/api/accounts/${account.id}/rules/${ruleId}/toggle`, {});
      loadRules();
    } catch (e) { console.error(e); }
  }

  async function applySingleRule(ruleId: string) {
    try {
      selectedRule = rules.find(r => r.id === ruleId);
      singleRulePreview = await api.get(`/api/accounts/${account.id}/rules/${ruleId}/preview`);
      showApplySingleModal = true;
    } catch (e) { console.error(e); }
  }

  $effect.pre(() => {
    if (account) untrack(() => loadRules());
  });
  let tiersPatternTitle = $derived($t('Fournisseur/Bénéficiaire'));
  let detailsPatternTitle = $derived($t('Détails de transaction'));

  function parseDetailsPatterns(p) { return p ? p.split('|').filter(Boolean) : []; }
  function parseTiersPatterns(p) { return p ? p.split('|').filter(Boolean) : []; }
</script>

<div class="tx-panel">
  <div class="tx-panel-header">
    <span class="tx-panel-title">
      {rules.length} {rules.length === 1 ? $t('règle') : $t('règles')}
    </span>
    <div style="display:flex; gap:8px;">
      {#if rules.length > 0}
        <button class="btn btn-apply-rules" onclick={openApplyModal}>{$t('Appliquer toutes les règles')}</button>
      {/if}
      <button class="btn btn-primary" onclick={() => openForm()}>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        {$t('Nouvelle règle')}
      </button>
    </div>
  </div>

  {#if rules.length > 0}
    <div class="rules-grid">
      {#each rules as rule (rule.id)}
        <div class="rule-card">
          <div class="rule-patterns">
            <div class="patterns-column">
              {#if rule.tiers_pattern}
                <div class="tiers-filter">
                  {#each parseTiersPatterns(rule.tiers_pattern) as p}
                    <span class="rule-chip rule-chip-tiers" title={tiersPatternTitle}>{p}</span>
                  {/each}
                </div>
              {/if}
              {#if rule.details_pattern}
                <div class="details-filter">
                  {#each parseDetailsPatterns(rule.details_pattern) as p}
                    <span class="rule-chip rule-chip-details" title={detailsPatternTitle}>{p}</span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <div class="rule-divider">→</div>

          <div class="rule-category">
            <span class="cat-badge" style={catStyle(rule.category)}>{rule.category}</span>
          </div>

          <div class="rule-buttons">
            <button
              class="btn-icon"
              title={rule.active ? $t('Désactiver cette règle') : $t('Activer cette règle')}
              onclick={() => toggleRule(rule.id)}
              style={rule.active ? '' : 'opacity: 0.4;'}
            >
              {#if rule.active}
                ✓
              {:else}
                ✗
              {/if}
            </button>
            <button class="btn-icon" title={$t('Appliquer cette règle')} onclick={() => applySingleRule(rule.id)}>
              ⚡
            </button>
            <button class="btn-icon" title={$t('Modifier')} onclick={() => openForm(rule)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="btn-icon danger" title={$t('Supprimer')} onclick={() => deleteRule(rule.id)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M5 4V2.5h4V4M4.5 4v7a.5.5 0 00.5.5h4a.5.5 0 00.5-.5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="state-empty">
      {$t('Aucune règle — créez-en une pour catégoriser automatiquement vos opérations.')}
    </div>
  {/if}
</div>

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
  .rules-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .rule-card {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto;
    gap: 16px;
    align-items: center;
    padding: 16px;
    border: 2px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    transition: all 0.2s;
  }

  .rule-card:hover {
    background: var(--card-hover);
    border-color: var(--text-3);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  .rule-patterns {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .patterns-column {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 8px;
    border-left: 2px solid var(--border);
  }

  .rule-chip {
    display: inline-block;
    padding: 3px 6px;
    background: var(--chip-neutral-bg);
    border: 1px solid var(--chip-neutral-border);
    border-radius: 3px;
    font-size: 11px;
    font-family: 'Fira Code', monospace;
    color: var(--text-2);
    width: fit-content;
  }

  .rule-chip-tiers {
    background: rgba(59, 130, 246, 0.12);
    border-color: rgba(59, 130, 246, 0.4);
    color: #3b82f6;
    font-weight: 500;
  }

  .tiers-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .details-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .rule-chip-details {
    background: rgba(168, 85, 247, 0.12);
    border-color: rgba(168, 85, 247, 0.4);
    color: #a855f7;
    font-weight: 500;
  }

  .rule-divider {
    text-align: center;
    font-size: 16px;
    color: var(--text-3);
    font-weight: bold;
  }

  .rule-category {
    min-width: 120px;
  }

  .rule-buttons {
    display: flex;
    gap: 8px;
    justify-self: end;
  }

  .btn-icon {
    padding: 6px 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-3);
    transition: color 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-icon:hover {
    color: var(--text-1);
  }

  .btn-icon.danger:hover {
    color: #ff4444;
  }

  .btn-apply-rules {
    background: #d97706;
    color: white;
    border: none;
  }

  .btn-apply-rules:hover:not(:disabled) {
    background: #b45309;
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3);
  }

  .btn-apply-rules:active:not(:disabled) {
    transform: scale(0.98);
  }
</style>
