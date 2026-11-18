<script lang="ts">
  
  import { onMount, untrack } from 'svelte';
  import { api, getToken } from '../lib/api.js';
  import { lang, t } from '../lib/i18n.ts';
  import { catStyle } from '../utils/categoryColor.js';
  import CategorySelect from './CategorySelect.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import type { BudgetWithProgress } from '@bankapp/shared';
  import { createBudgetSchema, updateBudgetSchema } from '@bankapp/shared';

  interface Props {
    account: { id: string; name: string };
  }

  let { account }: Props = $props();

  // Formats a Date using its local calendar fields (avoids the UTC shift
  // that toISOString() introduces for timezones ahead of UTC, e.g. local
  // midnight July 1st becomes "2026-06-30" once converted to UTC).
  function toLocalISODate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  let budgets: BudgetWithProgress[] = $state([]);
  let summary: {
    total_budgeted: number;
    total_spent: number;
    total_remaining: number;
    budgets_count: number;
  } | null = $state(null);
  let loading = $state(true);
  let error = $state('');
  let showCreateModal = $state(false);
  let showEditModal = $state(false);
  let editingBudget: BudgetWithProgress | null = null;
  let budgetToDelete: BudgetWithProgress | null = $state(null);
  let isDeleting = $state(false);

  // Form state
  let newBudget = $state({
    name: '',
    amount: 0,
    category_id: null,
    period: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
    start_date: toLocalISODate(new Date()),
    end_date: null,
    description: ''
  });

  let categories: { id: string; name: string }[] = $state([]);
  let categoryMap = $state(new Map<string, string>());
  let selectedCategoryName = $state('');

  $effect.pre(() => {
    newBudget.category_id = categories.find(c => c.name === selectedCategoryName)?.id ?? null;
  });

  async function loadData() {
    if (!account) return;
    
    loading = true;
    error = '';
    
    try {
      // Load categories
      const categoriesRes = await api.get(`/api/accounts/${account.id}/categories`);
      categories = categoriesRes || [];
      categoryMap = new Map(categories.map(c => [c.id, c.name]));
      
      // Load budgets with progress
      const budgetsRes = await api.get(`/api/accounts/${account.id}/budgets/with-progress`);
      budgets = budgetsRes || [];
      
      // Load summary
      const summaryRes = await api.get(`/api/accounts/${account.id}/budgets/summary`);
      summary = summaryRes || null;
      
    } catch (err: any) {
      error = err.message || $t('Erreur lors du chargement des budgets');
    } finally {
      loading = false;
    }
  }

  onMount(loadData);

  function openCreateModal() {
    newBudget = {
      name: '',
      amount: 0,
      category_id: null,
      period: 'monthly',
      start_date: null,
      end_date: null,
      description: ''
    };
    selectedCategoryName = '';
    updateDatesFromPeriod();
    showCreateModal = true;
  }

  // Auto-update start_date based on period
  function updateDatesFromPeriod() {
    const now = new Date();
    let startDate = null;
    
    if (newBudget.period === 'monthly') {
      startDate = toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
    } else if (newBudget.period === 'yearly') {
      startDate = toLocalISODate(new Date(now.getFullYear(), 0, 1));
    } else if (newBudget.period === 'weekly') {
      // Monday of current week
      const dayOfWeek = now.getDay(); // 0=Sunday
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(monday.getDate() + mondayOffset);
      startDate = toLocalISODate(monday);
    } else if (newBudget.period === 'daily') {
      startDate = toLocalISODate(now);
    }
    
    newBudget.start_date = startDate;
    newBudget.end_date = null; // Will be calculated by backend based on period
  }

  $effect.pre(() => {
    if (showCreateModal || showEditModal) untrack(() => updateDatesFromPeriod());
  });

  function openEditModal(budget: BudgetWithProgress) {
    editingBudget = budget;
    newBudget = {
      name: budget.name,
      amount: budget.amount,
      category_id: budget.category_id || null,
      period: budget.period,
      start_date: budget.start_date,
      end_date: budget.end_date || null,
      description: budget.description || ''
    };
    selectedCategoryName = budget.category_id ? categoryMap.get(budget.category_id) || '' : '';
    showEditModal = true;
  }

  async function createBudget() {
    if (!account) return;
    
    try {
      const budgetData = {
        ...newBudget,
        category_id: newBudget.category_id || undefined,
        amount: parseFloat(String(newBudget.amount)),
        start_date: newBudget.start_date,
        end_date: newBudget.end_date || undefined,
        description: newBudget.description || undefined
      };
      const check = createBudgetSchema.safeParse(budgetData);
      if (!check.success) {
        error = check.error.issues[0]?.message ?? $t('Erreur lors de la création du budget');
        return;
      }

      const budget = await api.post(`/api/accounts/${account.id}/budgets`, budgetData);
      
      budgets = [...budgets, budget];
      showCreateModal = false;
      await loadData();
    } catch (err: any) {
      error = err.message || $t('Erreur lors de la création du budget');
    }
  }

  async function updateBudget() {
    if (!editingBudget || !account) return;
    
    try {
      const budgetData = {
        ...newBudget,
        category_id: newBudget.category_id || undefined,
        amount: parseFloat(String(newBudget.amount)),
        start_date: newBudget.start_date,
        end_date: newBudget.end_date || undefined,
        description: newBudget.description || undefined
      };
      const check = updateBudgetSchema.safeParse(budgetData);
      if (!check.success) {
        error = check.error.issues[0]?.message ?? $t('Erreur lors de la mise à jour du budget');
        return;
      }

      const updated = await api.put(
        `/api/accounts/${account.id}/budgets/${editingBudget.id}`,
        budgetData
      );
      
      budgets = budgets.map(b => b.id === editingBudget.id ? updated : b);
      showEditModal = false;
      editingBudget = null;
      await loadData();
    } catch (err: any) {
      error = err.message || $t('Erreur lors de la mise à jour du budget');
    }
  }

  function askDeleteBudget(budget: BudgetWithProgress) {
    budgetToDelete = budget;
  }

  function cancelDeleteBudget() {
    budgetToDelete = null;
  }

  async function confirmDeleteBudget() {
    if (!account || !budgetToDelete) return;

    isDeleting = true;
    try {
      await api.delete(`/api/accounts/${account.id}/budgets/${budgetToDelete.id}`);
      budgets = budgets.filter(b => b.id !== budgetToDelete.id);
      budgetToDelete = null;
      await loadData();
    } catch (err: any) {
      error = err.message || $t('Erreur lors de la suppression du budget');
    } finally {
      isDeleting = false;
    }
  }

  function cancelModal() {
    showCreateModal = false;
    showEditModal = false;
    editingBudget = null;
  }

  function getProgressColor(progress: number): string {
    if (progress >= 100) return 'bg-red-500 dark:bg-red-400';
    if (progress >= 80) return 'bg-orange-500 dark:bg-orange-400';
    if (progress >= 60) return 'bg-yellow-500 dark:bg-yellow-400';
    return 'bg-green-500 dark:bg-green-400';
  }

  function formatAmount(amount: number): string {
    return new Intl.NumberFormat(($lang === 'fr' ? 'fr-FR' : 'en-US'), {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }
</script>

<svelte:head>
  <title>{$t('Budgets')} - BankApp</title>
</svelte:head>

<div class="budget-manager">
  <!-- Header -->
  <div class="page-header budget-page-header">
    <div class="budget-page-header-text">
      <h1 class="page-title">{$t('Budgets')}</h1>
      <p class="page-meta">{$t('Gérez vos limites de dépenses par catégorie')}</p>
    </div>
    <button
      onclick={openCreateModal}
      class="btn btn-primary"
    >
      + {$t('Nouveau budget')}
    </button>
  </div>

  <!-- Error -->
  {#if error}
    <div class="error-banner" style="margin-bottom:16px;">{error}</div>
  {/if}

  <!-- Summary -->
  {#if summary && !loading}
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">{$t('Total budgetisé')}</div>
        <div class="kpi-value credit">{formatAmount(summary.total_budgeted)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{$t('Total dépensé')}</div>
        <div class="kpi-value debit">{formatAmount(summary.total_spent)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{$t('Reste à dépenser')}</div>
        <div class="kpi-value neutral">{formatAmount(summary.total_remaining)}</div>
      </div>
    </div>
  {/if}

  <!-- Loading -->
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>{$t('Chargement...')}</p>
    </div>
  {:else if budgets.length === 0}
    <div class="empty-state">
      <p>{$t('Aucun budget créé.')}</p>
      <p class="empty-hint">{$t('Créez un budget pour commencer à suivre vos dépenses.')}</p>
    </div>
  {:else}
    <!-- Budgets List -->
    <div class="budget-list">
      {#each budgets as budget}
        <div class="budget-item">
          <!-- Header with name, category, period and actions -->
          <div class="budget-header">
            <div class="budget-main-info">
              <div class="budget-indicator-name">
                <span
                  class="budget-color-indicator"
                  style="background-color: {budget.color};"
                ></span>
                <span class="budget-name">{budget.name}</span>
                {#if budget.category_id}
                  <span class="budget-category-chip chip" style={catStyle(categoryMap.get(budget.category_id) || '')}>
                    {categoryMap.get(budget.category_id) || ''}
                  </span>
                {/if}
              </div>
              <span class="budget-period-badge">{budget.period}</span>
            </div>
            <div class="budget-actions">
              <button 
                onclick={() => openEditModal(budget)}
                class="btn-icon edit"
                title={$t('Modifier')}
              >
                ✏️
              </button>
              <button
                onclick={() => askDeleteBudget(budget)}
                class="btn-icon danger"
                title={$t('Supprimer')}
              >
                🗑️
              </button>
            </div>
          </div>
          
          <!-- Amounts row -->
          <div class="budget-financial-summary">
            <div class="budget-amount">
              <span class="budget-amount-label">{$t('Budget')}</span>
              <span class="budget-amount-value">{formatAmount(budget.amount)}</span>
            </div>
            <div class="budget-amount">
              <span class="budget-amount-label">{$t('Dépensé')}</span>
              <span class="budget-amount-value spent">{formatAmount(budget.current_spent)}</span>
            </div>
            <div class="budget-amount">
              <span class="budget-amount-label">{$t('Restant')}</span>
              <span class="budget-amount-value remaining">{formatAmount(budget.remaining)}</span>
            </div>
          </div>
          
          <!-- Progress Bar -->
          <div class="budget-progress-container">
            <span class="budget-progress-label">{$t('Progression')}: {Math.round(budget.progress_percent)}%</span>
            <div class="progress-bar">
              <div 
                class="progress-fill {getProgressColor(budget.progress_percent)}"
                style="width: {budget.progress_percent}%"
              ></div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create/Edit Modal -->
{#if showCreateModal || showEditModal}
  <div class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <h2 class="modal-title">
          {showCreateModal ? $t('Nouveau budget') : $t('Modifier le budget')}
        </h2>
        <button onclick={cancelModal} class="modal-close">×</button>
      </div>
      
      <div class="modal-body">
        <div class="field">
          <label>{$t('Nom')}*</label>
          <input 
            type="text" 
            bind:value={newBudget.name}
            class="input"
            placeholder={$t('Ex: Nourriture, Transport...')}
          />
        </div>
        
        <div class="field">
          <label>{$t('Montant')}*</label>
          <input 
            type="number" 
            bind:value={newBudget.amount}
            step="0.01"
            min="0"
            class="input"
            placeholder="1000"
          />
        </div>
        
        <div class="field">
          <label>{$t('Catégorie')}</label>
          <CategorySelect
            bind:value={selectedCategoryName}
            categories={categories.map(c => c.name)}
            label={$t('Toutes les catégories')}
          />
        </div>
        
        <div class="field">
          <label>{$t('Période')}</label>
          <select bind:value={newBudget.period} class="input" onchange={updateDatesFromPeriod}>
            <option value="daily">{$t('Quotidien')}</option>
            <option value="weekly">{$t('Hebdomadaire')}</option>
            <option value="monthly" selected>{$t('Mensuel')}</option>
            <option value="yearly">{$t('Annuel')}</option>
          </select>
        </div>
        
        <!-- Date fields are auto-calculated from period -->
        <input type="hidden" bind:value={newBudget.start_date} />
        <input type="hidden" bind:value={newBudget.end_date} />
        
        <div class="field">
          <label>{$t('Description')}</label>
          <textarea 
            bind:value={newBudget.description}
            rows="2"
            class="input textarea"
            placeholder={$t('Description du budget (optionnel)')}
          ></textarea>
        </div>
      </div>
      
      <div class="modal-footer">
        <button onclick={cancelModal} class="btn btn-ghost">
          {$t('Annuler')}
        </button>
        <button 
          onclick={showCreateModal ? createBudget : updateBudget}
          disabled={!newBudget.name || newBudget.amount <= 0}
          class="btn btn-primary"
        >
          {showCreateModal ? $t('Créer') : $t('Mettre à jour')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if budgetToDelete}
  <ConfirmModal
    title={$t('Supprimer le budget')}
    message={$t('Êtes-vous sûr de vouloir supprimer ce budget ?') + ' (' + budgetToDelete.name + ')'}
    confirmText={$t('Supprimer')}
    confirmClass="btn-danger-ghost"
    isLoading={isDeleting}
    on:confirm={confirmDeleteBudget}
    on:cancel={cancelDeleteBudget}
  />
{/if}

<style>
  .budget-manager {
    width: 100%;
  }

  .budget-page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: 20px;
    margin-bottom: 28px;
    border-bottom: 1px solid var(--border);
  }

  .budget-page-header-text .page-title {
    margin-bottom: 6px;
  }

  .budget-page-header-text .page-meta {
    margin-top: 0;
  }

  .budget-page-header .btn {
    flex-shrink: 0;
  }

  .bg-cobalt {
    background-color: var(--cobalt);
  }
  
  .hover\:bg-cobalt-700:hover {
    background-color: var(--cobalt-dim);
  }
  
  .text-cobalt {
    color: var(--cobalt);
  }
  
  /* Budget list styles */
  .budget-list {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  
  .budget-item {
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }
  
  .budget-item:last-child {
    border-bottom: none;
  }
  
  .budget-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  
  .budget-info {
    flex: 1;
  }
  
  .budget-color-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  .budget-name {
    font-weight: 500;
    color: var(--text-1);
    font-size: 14px;
    margin-left: 8px;
  }
  
  .budget-meta {
    font-size: 12px;
    color: var(--text-2);
    margin-left: 20px;
  }
  
  .budget-actions {
    display: flex;
    gap: 4px;
  }
  
  .budget-amounts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }
  
  .budget-amount {
    font-size: 12px;
  }
  
  .budget-amount-label {
    color: var(--text-2);
    margin-right: 4px;
  }
  
  .budget-amount-value {
    color: var(--text-1);
    font-weight: 500;
  }
  
  .budget-amount-value.credit {
    color: var(--credit);
  }
  
  .budget-amount-value.debit {
    color: var(--debit);
  }
  
  .budget-progress {
    margin-bottom: 8px;
  }
  
  .budget-progress-label {
    font-size: 11px;
    color: var(--text-2);
    margin-bottom: 4px;
  }
  
  .progress-bar {
    width: 100%;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  
  .progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  
  /* Empty state */
  .empty-state {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 32px;
    text-align: center;
  }
  
  .empty-state p {
    color: var(--text-2);
    margin: 0;
  }
  
  .empty-hint {
    font-size: 12px;
    margin-top: 4px;
    color: var(--text-3);
  }
  
  /* Loading state */
  .loading-state {
    text-align: center;
    padding: 32px;
  }
  
  .loading-state p {
    color: var(--text-2);
    margin-top: 8px;
  }
  
  .spinner {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid var(--border);
    border-bottom-color: var(--cobalt);
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Modal styles */
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .modal-close {
    background: none;
    border: none;
    color: var(--text-2);
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    margin-left: 8px;
  }
  
  .modal-close:hover {
    color: var(--text-1);
  }
  
  .modal-body {
    margin-bottom: 16px;
  }
  
  .input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--card);
    color: var(--text-1);
    font-size: 13px;
    font-family: 'Inter', sans-serif;
  }
  
  .input:focus {
    outline: none;
    border-color: var(--cobalt);
    box-shadow: 0 0 0 2px var(--cobalt-dim);
  }
  
  .input::placeholder {
    color: var(--text-3);
  }
  
  .textarea {
    resize: vertical;
    min-height: 80px;
  }
  

  .chip {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid var(--chip-border);
  }

  /* New pro styles for budget cards */
  .budget-main-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .budget-indicator-name {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .budget-name {
    font-weight: 600;
    color: var(--text-1);
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .budget-category-chip {
    font-size: 11px;
    padding: 2px 6px;
  }

  .budget-period-badge {
    display: inline-block;
    padding: 2px 8px;
    background: var(--surface);
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-2);
    border: 1px solid var(--border);
    text-transform: lowercase;
  }

  .budget-info {
    display: none;
  }

  .budget-meta {
    display: none;
  }

  .budget-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    padding-left: 8px;
  }

  .budget-amounts {
    display: none;
  }

  .budget-financial-summary {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .budget-amount {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 13px;
  }

  .budget-amount-label {
    color: var(--text-2);
    font-size: 12px;
  }

  .budget-amount-value {
    color: var(--text-1);
    font-weight: 600;
    font-size: 14px;
  }

  .budget-amount-value.spent {
    color: var(--debit);
  }

  .budget-amount-value.remaining {
    color: var(--credit);
  }

  .budget-progress {
    display: none;
  }

  .budget-progress-container {
    margin-bottom: 4px;
  }

  .budget-progress-label {
    font-size: 11px;
    color: var(--text-2);
    margin-bottom: 4px;
    display: block;
  }
</style>
