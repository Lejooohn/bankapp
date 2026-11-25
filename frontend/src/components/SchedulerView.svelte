<script lang="ts">
  import { createEventDispatcher, onDestroy, untrack } from 'svelte';
  import { nextMonthScheduleTotals } from '@bankapp/shared';
  import { lang, t } from '../lib/i18n.ts';
  import { api } from '../lib/api.js';
  import SchedulerToolbar from './scheduler/SchedulerToolbar.svelte';
  import SchedulerSummary from './scheduler/SchedulerSummary.svelte';
  import SchedulerTable from './scheduler/SchedulerTable.svelte';
  import ScheduleFormModal from './scheduler/ScheduleFormModal.svelte';
  import GenerateChoiceModal from './scheduler/GenerateChoiceModal.svelte';
  import DeleteScheduleModal from './scheduler/DeleteScheduleModal.svelte';
  import {
    formatCountdown, insertedMonthLabel, nextMonthLabel, sortValue,
  } from './scheduler/schedule-utils.ts';

  let { account, simulatedTransactions = $bindable([]) } = $props();

  const dispatch = createEventDispatcher();

  let schedules = $state([]);
  let categories = $state([]);
  let userAccounts = $state([]);
  let loading = $state(true);
  // Page-level error (load, toggle, delete, generate). The form shows its own errors.
  let error = $state('');

  // ── Form (new + edit) ─────────────────────────────────────────
  let showForm = $state(false);
  let editingSchedule = $state(null);

  // ── Delete modal ──────────────────────────────────────────────
  let showDeleteModal = $state(false);
  let deleteTargetId: string | null = null;
  let deleteTargetName = $state('');

  // ── Generate choice modal ────────────────────────────────────
  let showModeChoice = $state(false);

  // ── Auto-generation countdown ────────────────────────────────
  let genStatus = $state(null); // { dueCount, alreadyCreatedCount, autoRunDate }
  let countdownNow = $state(Date.now());

  // ── Notification toast ───────────────────────────────────────
  let showNotification = $state(false);
  let notificationMessage = $state('');

  // ── Sorting ───────────────────────────────────────────────────
  let sortColumn = $state('next_schedule_date');
  let sortDir: 'asc' | 'desc' = $state('asc');

  const countdownInterval = setInterval(() => {
    countdownNow = Date.now();
    loadGenStatus();
  }, 60000);
  onDestroy(() => { clearInterval(countdownInterval); });

  async function loadGenStatus() {
    try {
      genStatus = await api.get(`/api/accounts/${account.id}/schedules/generate-next-month/status`);
    } catch (e) { console.error(e); }
  }

  function notify(message: string) {
    notificationMessage = message;
    showNotification = true;
    setTimeout(() => { showNotification = false; }, 3000);
  }

  async function load() {
    try {
      [schedules, categories, userAccounts] = await Promise.all([
        api.get(`/api/accounts/${account.id}/schedules`),
        api.get(`/api/accounts/${account.id}/categories`).then(d => d.map(c => c.name)),
        api.get(`/api/accounts`).then(accs => accs.filter(a => a.id !== account.id))
      ]);
    } catch (e: any) {
      console.error(e);
      error = e.message || $t('Erreur lors du chargement de l\'échéancier');
    }
    loading = false;
  }

  // Called by the form: creates or updates, then reloads the list.
  async function saveSchedule(payload: any, id: string | null) {
    if (id) {
      await api.patch(`/api/schedules/${id}`, payload);
    } else {
      await api.post(`/api/accounts/${account.id}/schedules`, payload);
    }
    await load();
    notify(id ? $t('Échéance modifiée') : $t('Échéance créée'));
  }

  function openNew() {
    error = '';
    editingSchedule = null;
    showForm = true;
  }

  function editSchedule(s: any) {
    error = '';
    editingSchedule = s;
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    editingSchedule = null;
  }

  function openDeleteModal(id: string, name: string) {
    deleteTargetId = id;
    deleteTargetName = name;
    showDeleteModal = true;
  }

  function closeDeleteModal() {
    showDeleteModal = false;
    deleteTargetId = null;
    deleteTargetName = '';
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    try {
      await api.delete(`/api/schedules/${deleteTargetId}`);
      closeDeleteModal();
      await load();
    } catch (e: any) {
      console.error(e);
      error = e.message || $t('Erreur lors de la suppression');
    }
  }

  async function toggleActive(s: any) {
    try {
      await api.patch(`/api/schedules/${s.id}`, { is_active: !s.is_active });
      await load();
    } catch (e: any) {
      console.error(e);
      error = e.message || $t('Erreur lors de la mise à jour du statut');
    }
  }

  // ── Generate ──────────────────────────────────────────────────
  // True dry run: uses the read-only /simulate-next-month endpoint so
  // nothing is written to the database until the user validates from the
  // simulation banner (AccountDetail.svelte validateSimulation()).
  async function openGenerateChoice() {
    error = '';
    try {
      simulatedTransactions = await api.get(`/api/accounts/${account.id}/schedules/simulate-next-month`);
      dispatch('switchView', 'transactions');
    } catch (e: any) {
      console.error(e);
      error = e.message || $t('Erreur lors de la simulation');
    }
  }

  async function generateSingle(scheduleId: string) {
    try {
      const data = await api.post(`/api/accounts/${account.id}/schedules/${scheduleId}/generate-single`, {});
      if (data.created > 0) notify($t('Généré avec succès'));
      await load();
    } catch (e: any) {
      console.error(e);
      error = e.message || $t('Erreur lors de la génération');
    }
  }

  async function chooseRealInsert() {
    try {
      const data = await api.post(`/api/accounts/${account.id}/schedules/generate-next-month`, {});
      simulatedTransactions = [];
      if (data.created > 0) notify($t('Généré avec succès'));
      await load();
      await loadGenStatus();
      await new Promise(r => setTimeout(r, 100));
      dispatch('updated');
      dispatch('switchView', 'transactions');
    } catch (e: any) {
      console.error(e);
      error = e.message || $t('Erreur lors de la génération');
    }
  }

  function toggleSort(col: string) {
    if (sortColumn === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = col;
      sortDir = 'asc';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showModeChoice) showModeChoice = false;
      if (showForm) closeForm();
      if (showDeleteModal) closeDeleteModal();
    }
  }

  // ── Derived ───────────────────────────────────────────────────
  let freqLabels = $derived({ MONTHLY: $t('Mensuel'), QUARTERLY: $t('Trimestriel'), BIANNUAL: $t('Semestriel'), ANNUAL: $t('Annuel') });
  let currentLocale = $derived(($lang === 'fr' ? 'fr-FR' : 'en-US'));
  let alreadyGenerated = $derived(genStatus && genStatus.dueCount > 0 && genStatus.alreadyCreatedCount >= genStatus.dueCount);
  let countdown = $derived(genStatus ? formatCountdown(genStatus.autoRunDate, $lang, countdownNow) : '');
  let echeanceLabel = $derived($t(schedules.length !== 1 ? 'échéances' : 'échéance'));
  // ── Stats ─────────────────────────────────────────────────────
  let stats = $derived(nextMonthScheduleTotals(schedules, new Date()));
  let debitLabel = $derived($t(stats.debits !== 1 ? 'échéances' : 'échéance'));
  let creditLabel = $derived($t(stats.credits !== 1 ? 'échéances' : 'échéance'));
  let balance = $derived(stats.totalCredit - stats.totalDebit);
  let sortedSchedules = $derived([...schedules].sort((a, b) => {
    const va = sortValue(a, sortColumn, freqLabels);
    const vb = sortValue(b, sortColumn, freqLabels);
    // nulls (e.g. no next occurrence) always sort last regardless of direction
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    let cmp;
    if (typeof va === 'string') cmp = va.localeCompare(String(vb));
    else cmp = (va as number) < (vb as number) ? -1 : (va as number) > (vb as number) ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  }));

  $effect.pre(() => {
    if (account) untrack(() => load());
  });
  $effect.pre(() => {
    if (account) untrack(() => loadGenStatus());
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="page-header">
  <h1 class="page-title">{$t('Échéancier')}</h1>
  <p class="page-meta">{account.name}</p>
</div>

<SchedulerToolbar
  count={schedules.length}
  countLabel={echeanceLabel}
  canGenerate={schedules.length > 0}
  {genStatus}
  {alreadyGenerated}
  insertedLabel={insertedMonthLabel(currentLocale)}
  {countdown}
  ongenerate={() => (showModeChoice = true)}
  onnew={openNew}
/>

{#if error && !showForm}
  <div class="error-banner" style="margin-bottom:14px;">{error}</div>
{/if}

{#if schedules.length > 0 && !loading}
  <SchedulerSummary
    debits={stats.debits}
    credits={stats.credits}
    totalDebit={stats.totalDebit}
    totalCredit={stats.totalCredit}
    {debitLabel}
    {creditLabel}
    {balance}
  />
{/if}

{#if loading}
  <div class="state-loading">{$t('Chargement…')}</div>
{:else if schedules.length === 0}
  <div class="state-empty">{$t('Aucune échéance — créez-en une pour suivre vos dépenses récurrentes.')}</div>
{:else}
  <SchedulerTable
    schedules={sortedSchedules}
    {sortColumn}
    {sortDir}
    {freqLabels}
    locale={currentLocale}
    onsort={toggleSort}
    ontoggle={toggleActive}
    ongenerate={generateSingle}
    onedit={editSchedule}
    ondelete={openDeleteModal}
  />
{/if}

<!-- ── Notification toast ──────────────────────────────────────── -->
{#if showNotification}
  <div class="notification-toast">
    {notificationMessage}
  </div>
{/if}

{#if showForm}
  <ScheduleFormModal schedule={editingSchedule} {userAccounts} {categories} onclose={closeForm} onsave={saveSchedule} />
{/if}

{#if showModeChoice}
  <GenerateChoiceModal
    title={`${$t('Générer les opérations pour')} ${nextMonthLabel(schedules, currentLocale)}`}
    onsimulate={() => { showModeChoice = false; openGenerateChoice(); }}
    onreal={() => { showModeChoice = false; chooseRealInsert(); }}
    onclose={() => (showModeChoice = false)}
  />
{/if}

{#if showDeleteModal}
  <DeleteScheduleModal name={deleteTargetName} onconfirm={confirmDelete} onclose={closeDeleteModal} />
{/if}

<style>
  /* Notification toast */
  .notification-toast {
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10B981;
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .error-banner {
    background: rgba(253, 164, 175, 0.1); border: 1px solid rgba(253, 164, 175, 0.3);
    color: #BE123C; padding: 8px 12px; border-radius: 6px; font-size: 12.5px;
  }

</style>
