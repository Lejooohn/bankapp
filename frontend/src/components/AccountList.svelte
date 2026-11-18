<script lang="ts">
  import { stopPropagation } from '../lib/events';
  import { createEventDispatcher, onMount } from 'svelte';
  import NewAccountModal from './NewAccountModal.svelte';
  import EditAccountModal from './EditAccountModal.svelte';
  import ImportCSVModal from './ImportCSVModal.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import ProfileSwitcher from './ProfileSwitcher.svelte';
  import LanguageToggle from './LanguageToggle.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import BackupStatusWidget from './BackupStatusWidget.svelte';
  import { lang, t } from '../lib/i18n.ts';
  import { theme } from '../lib/theme.ts';
  import { api } from '../lib/api.js';

  interface Props {
    accounts?: any;
    selectedAccount?: any;
    currentView?: string;
    onLock?: any;
  }

  let {
    accounts = [],
    selectedAccount = $bindable(null),
    currentView = 'transactions',
    onLock = null
  }: Props = $props();

  const dispatch = createEventDispatcher();
  let showNewModal = $state(false);
  let showEditModal = $state(false);
  let showImportModal = $state(false);
  let showDeleteConfirm = $state(false);
  let accountToDelete = $state(null);
  let deleteAccountStep = $state(1);
  let deleteAccountInput = $state('');
  let menuOpenFor = $state(null);
  let selectedAccountForMenu = $state(null);
  let isDeleting = $state(false);
  let error = $state('');

  // Money moving in/out — clearer for a transaction ledger than a plain list.
  const ICON_TRANSACTIONS = `<path d="M2 5h8M8 5l-2-2M8 5l-2 2" stroke="#3B82F6" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9H4M6 9l2-2M6 9l2 2" stroke="#3B82F6" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const ICON_CATEGORIES = `<rect x="2" y="2" width="4" height="4" rx="0.5" stroke="#8B5CF6" stroke-width="1.4"/><rect x="8" y="2" width="4" height="4" rx="0.5" stroke="#8B5CF6" stroke-width="1.4"/><rect x="2" y="8" width="4" height="4" rx="0.5" stroke="#8B5CF6" stroke-width="1.4"/><rect x="8" y="8" width="4" height="4" rx="0.5" stroke="#8B5CF6" stroke-width="1.4"/>`;
  const ICON_RULES = `<path d="M2 4l2 2 3-3M2 9l2 2 3-3M9 5h4M9 10h4" stroke="#10B981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  const ICON_SCHEDULER = `<rect x="1" y="3" width="12" height="10" rx="1.5" stroke="#F59E0B" stroke-width="1.4"/><path d="M4 1v3M10 1v3M1 7h12" stroke="#F59E0B" stroke-width="1.4" stroke-linecap="round"/>`;
  const ICON_STATISTICS = `<path d="M2 14v-4M6 14v-6M10 14v-3M14 14v-5" stroke="#06B6D4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="3" cy="3" r="0.5" fill="#06B6D4"/><circle cx="11" cy="4" r="0.5" fill="#06B6D4"/>`;
  // Solid actuals into a dashed forecast segment — visually distinct from the Statistiques bar chart.
  const ICON_PROJECTION = `<path d="M1 10.5L4.5 7L7 9L9.5 5.5" stroke="#EC4899" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 5.5L13 2" stroke="#EC4899" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="1.6 1.6"/><circle cx="13" cy="2" r="1.15" fill="#EC4899"/>`;
  
  // Budget icon - wallet with clasp, sized for the shared 14x14 nav viewBox
  const ICON_BUDGETS = `<rect x="1" y="3.5" width="12" height="9" rx="1.5" stroke="#10B981" stroke-width="1.4"/><path d="M1 6.5h12" stroke="#10B981" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="9.5" r="1" fill="#10B981"/>`;

  // Account-type avatars, sized for a 16x16 viewBox, stroke uses currentColor so the wrapper sets the tint.
  const ACCOUNT_TYPE_META = {
    checking: {
      color: '#2563EB',
      icon: `<rect x="1.5" y="4.5" width="13" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 7.2h13" stroke="currentColor" stroke-width="1.4"/>`
    },
    savings: {
      color: '#10B981',
      icon: `<circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.8v1M8 10.2v1M10.1 6.4c-.35-.6-1.1-1-2.1-1-1.25 0-2.2.62-2.2 1.5 0 2.1 4.3 1 4.3 3.1 0 .88-.95 1.5-2.2 1.5-1 0-1.75-.4-2.1-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`
    },
    investment: {
      color: '#8B5CF6',
      icon: `<path d="M1.8 11.5l4-4.2 2.6 2.4L13 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.6 4.5h3.4v3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
    }
  };

  function accountMeta(account) {
    return ACCOUNT_TYPE_META[account?.account_type] || ACCOUNT_TYPE_META.checking;
  }

  const navItemsBase = [
    { id: 'transactions', frLabel: 'Opérations', icon: ICON_TRANSACTIONS },
    { id: 'budgets', frLabel: 'Budgets', icon: ICON_BUDGETS },
    { id: 'categories', frLabel: 'Catégories', icon: ICON_CATEGORIES },
    { id: 'rules', frLabel: 'Règles', icon: ICON_RULES },
    { id: 'scheduler', frLabel: 'Échéancier', icon: ICON_SCHEDULER },
    { id: 'statistics', frLabel: 'Statistiques', icon: ICON_STATISTICS },
  ];

  let navItems = $derived(navItemsBase
    .filter(item => {
      if (!selectedAccount) return true;
      if (selectedAccount.account_type === 'savings') return item.id === 'transactions';
      return true;
    })
    .map(item => ({
      ...item,
      label: item.frLabel
    })));

  function select(account) {
    selectedAccount = account;
    dispatch('select', account);
  }

  function changeView(view) {
    dispatch('viewChange', view);
  }

  function openMenu(account, e) {
    e.stopPropagation();
    menuOpenFor = menuOpenFor === account.id ? null : account.id;
    selectedAccountForMenu = account;
  }

  function closeMenu() {
    menuOpenFor = null;
  }

  onMount(() => {
    function handleGlobalClick(e) {
      if (menuOpenFor && !e.target.closest('[data-account-menu]')) {
        closeMenu();
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape' && menuOpenFor) {
        closeMenu();
      }
    }

    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  });

  function openDeleteConfirm(account) {
    closeMenu();
    accountToDelete = account;
    deleteAccountStep = 1;
    deleteAccountInput = '';
    showDeleteConfirm = true;
  }

  function confirmDeleteStep1() {
    deleteAccountStep = 2;
  }

  function cancelDeleteAccount() {
    showDeleteConfirm = false;
    accountToDelete = null;
    deleteAccountStep = 1;
    deleteAccountInput = '';
  }

  async function confirmDelete() {
    if (!accountToDelete) return;
    if (deleteAccountInput.trim().toLowerCase() !== accountToDelete.name.trim().toLowerCase()) return;
    isDeleting = true;
    error = '';
    try {
      await api.delete(`/api/accounts/${accountToDelete.id}`);
      cancelDeleteAccount();
      dispatch('updated');
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors de la suppression du compte');
    } finally {
      isDeleting = false;
    }
  }

  async function reorderAccount(account, direction) {
    closeMenu();
    error = '';
    try {
      await api.patch(`/api/accounts/${account.id}/reorder`, { direction });
      dispatch('updated');
    } catch (e) {
      console.error(e);
      error = e.message || $t("Erreur lors du déplacement du compte");
    }
  }

  async function setDefault(account) {
    closeMenu();
    error = '';
    try {
      await api.patch(`/api/accounts/${account.id}/set-default`, {});
      dispatch('updated');
    } catch (e) {
      console.error(e);
      error = e.message || $t('Erreur lors de la définition du compte par défaut');
    }
  }
</script>

<div class="brand">
  <div class="brand-icon">
    <!-- Pie chart: universal symbol for expense categories and financial analytics -->
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
      <path d="M10 2A8 8 0 0 1 18 10L10 10Z" fill="white" opacity="0.95"/>
      <path d="M18 10A8 8 0 0 1 10 18L10 10Z" fill="white" opacity="0.7"/>
      <path d="M10 18A8 8 0 0 1 2 10L10 10Z" fill="white" opacity="0.5"/>
    </svg>
  </div>
  <div class="brand-text">
    <span class="brand-name">BankApp</span>
    <span class="brand-tag">{$t('Banque personnelle')}</span>
  </div>
</div>

{#if error}
  <div class="error-banner" role="alert">
    {error}
    <button class="error-banner-close" onclick={() => (error = '')} aria-label={$t('Fermer')}>×</button>
  </div>
{/if}

<button class="btn-new-account" onclick={() => (showNewModal = true)}>
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
  {$t('Nouveau compte')}
</button>

<nav style="flex:1; overflow-y:auto;">
  {#each accounts as account (account.id)}
    <div class="account-row {selectedAccount?.id === account.id ? 'active' : ''}">
      <button
        class="account-btn"
        onclick={() => select(account)}
      >
        <span class="account-avatar" style="color: {accountMeta(account).color}; background: color-mix(in srgb, {accountMeta(account).color} 16%, transparent);">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            {@html accountMeta(account).icon}
          </svg>
        </span>
        <span class="account-info">
          <span class="account-btn-name">{account.name}</span>
          {#if account.bank_name}
            <span class="account-btn-bank">{account.bank_name}</span>
          {/if}
        </span>
      </button>
      <button
        class="account-menu-btn"
        onclick={(e) => openMenu(account, e)}
        title={$t('Options')}
        data-account-menu
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
          <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
          <circle cx="8" cy="13" r="1.5" fill="currentColor"/>
        </svg>
      </button>

      {#if menuOpenFor === account.id}
        <div class="account-dropdown" data-account-menu onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
          <button class="dropdown-item" onclick={() => setDefault(account)}>
            <span style="font-size: 14px;">{account.is_default ? '⭐' : '☆'}</span>
            {account.is_default ? $t('Compte par défaut') : $t('Définir comme défaut')}
          </button>
          <button class="dropdown-item" onclick={() => reorderAccount(account, 'up')}>
            <span style="font-size: 14px;">↑</span>
            {$t('Déplacer vers le haut')}
          </button>
          <button class="dropdown-item" onclick={() => reorderAccount(account, 'down')}>
            <span style="font-size: 14px;">↓</span>
            {$t('Déplacer vers le bas')}
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" onclick={() => { closeMenu(); showEditModal = true; }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5L13.5 4.5L6 12H4V10L11.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
            {$t('Modifier le compte')}
          </button>
          {#if account.account_type !== 'savings'}
            <button class="dropdown-item" onclick={() => { closeMenu(); showImportModal = true; }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v9M4 7l4 4 4-4M2 12v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {$t('Importer un CSV')}
            </button>
          {/if}
          <div class="dropdown-sep"></div>
          <button class="dropdown-item danger" onclick={() => openDeleteConfirm(account)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {$t('Supprimer le compte')}
          </button>
        </div>
      {/if}
    </div>

    {#if selectedAccount?.id === account.id}
      <div style="padding: 2px 0 6px 0;">
        {#each navItems as item}
          <button
            class="subnav-btn {currentView === item.id ? 'subnav-active' : ''}"
            onclick={() => changeView(item.id)}
          >
            <svg width="17" height="17" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;">
              {@html item.icon}
            </svg>
            {$t(item.label)}
          </button>
        {/each}
        {#if account.account_type !== 'savings'}
          <button
            class="subnav-btn {currentView === 'projection' ? 'subnav-active' : ''}"
            title={$t('Voir la projection mensuelle')}
            onclick={() => changeView('projection')}
          >
            <svg width="17" height="17" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;">
              {@html ICON_PROJECTION}
            </svg>
            {$t('Solde prévisionnel')}
          </button>
        {/if}
      </div>
    {/if}
  {/each}

  {#if accounts.length === 0}
    <p style="font-size:12px; color:#475569; padding:10px 10px 0;">{$t('Aucun compte')}</p>
  {/if}
</nav>

<div class="sidebar-new">
  <BackupStatusWidget account={selectedAccount} on:restored={() => dispatch('updated')} />
  <ProfileSwitcher {onLock} />
  <ThemeToggle />
  <LanguageToggle />
</div>

{#if showNewModal}
  <NewAccountModal
    on:created={() => {
      showNewModal = false;
      dispatch('created');
    }}
    on:close={() => (showNewModal = false)}
  />
{/if}

{#if showEditModal && selectedAccountForMenu}
  <EditAccountModal
    account={selectedAccountForMenu}
    on:updated={() => { showEditModal = false; dispatch('updated'); }}
    on:close={() => (showEditModal = false)}
  />
{/if}

{#if showImportModal && selectedAccountForMenu}
  <ImportCSVModal
    account={selectedAccountForMenu}
    on:close={() => (showImportModal = false)}
    on:created={() => { const importedAccountId = selectedAccountForMenu.id; showImportModal = false; dispatch('updated', { accountId: importedAccountId }); }}
  />
{/if}

{#if showDeleteConfirm && accountToDelete}
  {#if deleteAccountStep === 1}
    <ConfirmModal
      title={$t('Supprimer le compte')}
      message={$t('Êtes-vous sûr de vouloir supprimer "{name}" ?').replace('{name}', accountToDelete.name) + ' ' + $t('Cette action est irréversible.')}
      confirmText={$t('Supprimer')}
      confirmClass="btn-danger-ghost"
      isLoading={isDeleting}
      on:confirm={confirmDeleteStep1}
      on:cancel={cancelDeleteAccount}
    />
  {:else}
    <div class="modal-overlay">
      <div class="modal-box" style="width:380px;">
        <h2 class="modal-title">⚠️ {$t('Dernière confirmation')}</h2>
        <p style="font-size:13.5px; color:var(--text-2); line-height:1.5; margin-bottom:16px;">
          {$t('Ceci est irréversible. Tapez')} <strong>"{accountToDelete.name}"</strong> {$t('pour confirmer la suppression définitive.')}
        </p>
        <input
          type="text"
          placeholder={accountToDelete.name}
          bind:value={deleteAccountInput}
          style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--text-1); font-size:14px;"
          onkeydown={e => e.key === 'Enter' && confirmDelete()}
        />
        <div class="modal-footer" style="margin-top:16px;">
          <button class="btn btn-ghost" onclick={cancelDeleteAccount}>
            {$t('Annuler')}
          </button>
          <button
            class="btn btn-danger"
            onclick={confirmDelete}
            disabled={isDeleting || deleteAccountInput.trim().toLowerCase() !== accountToDelete.name.trim().toLowerCase()}
          >
            {isDeleting ? $t('Suppression…') : $t('Supprimer définitivement')}
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 12px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 12px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 12.5px;
    color: #c00;
    margin: 0 0 12px;
  }

  .error-banner-close {
    background: none;
    border: none;
    color: #c00;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 2px;
    flex-shrink: 0;
  }

  .btn-new-account {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    margin: 0 0 14px;
    background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    transition: all 0.12s;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
  }

  .btn-new-account:hover {
    background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
    transform: translateY(-1px);
  }

  .btn-new-account:active {
    transform: translateY(0);
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
  }
  .brand-icon {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(37,99,235,0.30);
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .brand-name {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 15px;
    color: var(--text-1);
    letter-spacing: -0.3px;
    line-height: 1.2;
  }
  .brand-tag {
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-3);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .subnav-btn {
    display: flex; align-items: center; gap: 7px;
    width: 100%; padding: 6px 10px 6px 22px;
    background: none; border: none; cursor: pointer;
    font-size: 12.5px; color: #94A3B8; text-align: left;
    border-radius: 6px; transition: all 0.12s;
    font-family: 'Inter', sans-serif;
  }
  .subnav-btn:hover { background: var(--card-hover); color: var(--text-2); }
  .subnav-active { color: var(--cobalt) !important; background: var(--cobalt-light) !important; }

  .account-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
    padding: 5px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
  }

  .account-row:hover {
    border-color: var(--cobalt-border);
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.07);
  }

  .account-row.active {
    background: var(--cobalt-light);
    border-color: var(--cobalt-border);
    box-shadow: 0 3px 10px rgba(37, 99, 235, 0.12);
  }

  .account-row::before {
    content: '';
    position: absolute;
    left: 0;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: transparent;
    transition: background-color 0.15s;
  }

  .account-row.active::before {
    background: var(--cobalt);
  }

  .account-btn {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 9px;
    width: 0;
    padding: 6px 8px;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12.5px;
    color: var(--text-2);
    text-align: left;
    font-family: 'Inter', sans-serif;
    transition: background-color 0.12s, color 0.12s;
  }

  .account-row:not(.active) .account-btn:hover { background: var(--card-hover); }

  .account-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: 9px;
  }

  .account-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .account-btn-name {
    font-weight: 600;
    color: var(--text-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  .account-row.active .account-btn-name { color: var(--cobalt); }

  .account-btn-bank {
    font-size: 11px;
    color: var(--text-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  :global([data-theme="dark"]) .account-btn-bank {
    color: var(--text-2);
  }

  .account-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-3);
    transition: all 0.12s;
  }

  .account-menu-btn:hover { background: var(--card-hover); color: var(--text-2); }

  .account-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 10;
    margin-top: 4px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-2);
    text-align: left;
    font-family: 'Inter', sans-serif;
    transition: all 0.12s;
  }

  .dropdown-item:hover {
    background: var(--card-hover);
    color: var(--text-1);
  }

  .dropdown-item.danger:hover {
    background: var(--danger-bg);
    color: var(--debit);
  }

  .dropdown-sep {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }

  .btn-danger {
    background: #DC2626;
    color: white;
    border: none;
  }

  .btn-danger:hover {
    background: #B91C1C;
  }

  .btn-danger:active {
    background: #991B1B;
  }

</style>
