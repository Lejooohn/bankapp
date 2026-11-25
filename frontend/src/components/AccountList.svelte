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
  import Icon from './Icon.svelte';
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

  // Checking: the card. Savings: the passbook ("livret"). Investment: the curve.
  const ACCOUNT_TYPE_ICONS = { checking: 'credit-card', savings: 'book', investment: 'trending-up' };

  function accountColor(account) {
    const type = account?.account_type in ACCOUNT_TYPE_ICONS ? account.account_type : 'checking';
    return `--acct: var(--acct-${type});`;
  }

  function accountIcon(account) {
    return ACCOUNT_TYPE_ICONS[account?.account_type] || ACCOUNT_TYPE_ICONS.checking;
  }

  const navItemsBase = [
    { id: 'transactions', frLabel: 'Opérations', icon: 'arrow-left-right' },
    { id: 'budgets', frLabel: 'Budgets', icon: 'wallet' },
    { id: 'categories', frLabel: 'Catégories', icon: 'tag' },
    { id: 'rules', frLabel: 'Règles', icon: 'list-checks' },
    { id: 'scheduler', frLabel: 'Échéancier', icon: 'calendar' },
    { id: 'statistics', frLabel: 'Statistiques', icon: 'chart-column' },
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
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
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

<button class="btn btn-ghost btn-new-account" onclick={() => (showNewModal = true)}>
  <Icon name="plus" />
  {$t('Nouveau compte')}
</button>

<nav class="account-nav">
  {#each accounts as account (account.id)}
    <div class="account-group" class:active={selectedAccount?.id === account.id} style={accountColor(account)}>
    <div class="account-row {selectedAccount?.id === account.id ? 'active' : ''}">
      <button
        class="account-btn"
        onclick={() => select(account)}
      >
        <span class="account-avatar"><Icon name={accountIcon(account)} /></span>
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
        aria-label={$t('Options')}
        aria-expanded={menuOpenFor === account.id}
        data-account-menu
      >
        <Icon name="ellipsis-vertical" />
      </button>

      {#if menuOpenFor === account.id}
        <div class="account-dropdown" data-account-menu onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
          <button class="dropdown-item" onclick={() => setDefault(account)}>
            <Icon name="star" filled={account.is_default} />
            {account.is_default ? $t('Compte par défaut') : $t('Définir comme défaut')}
          </button>
          <button class="dropdown-item" onclick={() => reorderAccount(account, 'up')}>
            <Icon name="arrow-up" />
            {$t('Déplacer vers le haut')}
          </button>
          <button class="dropdown-item" onclick={() => reorderAccount(account, 'down')}>
            <Icon name="arrow-down" />
            {$t('Déplacer vers le bas')}
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" onclick={() => { closeMenu(); showEditModal = true; }}>
            <Icon name="pencil" />
            {$t('Modifier le compte')}
          </button>
          {#if account.account_type !== 'savings'}
            <button class="dropdown-item" onclick={() => { closeMenu(); showImportModal = true; }}>
              <Icon name="download" />
              {$t('Importer un CSV')}
            </button>
          {/if}
          <div class="dropdown-sep"></div>
          <button class="dropdown-item danger" onclick={() => openDeleteConfirm(account)}>
            <Icon name="trash" />
            {$t('Supprimer le compte')}
          </button>
        </div>
      {/if}
    </div>

    {#if selectedAccount?.id === account.id}
      <div class="subnav">
        {#each navItems as item}
          <button
            class="side-row subnav-btn {currentView === item.id ? 'subnav-active' : ''}"
            aria-current={currentView === item.id ? 'page' : undefined}
            onclick={() => changeView(item.id)}
          >
            <span class="side-row-icon"><Icon name={item.icon} /></span>
            <span class="side-row-label">{$t(item.label)}</span>
          </button>
        {/each}
        {#if account.account_type !== 'savings'}
          <button
            class="side-row subnav-btn {currentView === 'projection' ? 'subnav-active' : ''}"
            aria-current={currentView === 'projection' ? 'page' : undefined}
            title={$t('Voir la projection mensuelle')}
            onclick={() => changeView('projection')}
          >
            <span class="side-row-icon"><Icon name="trending-up" /></span>
            <span class="side-row-label">{$t('Solde prévisionnel')}</span>
          </button>
        {/if}
      </div>
    {/if}
    </div>
  {/each}

  {#if accounts.length === 0}
    <p style="font-size:13px; color:var(--text-3); padding:8px 8px 0;">{$t('Aucun compte')}</p>
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
        <h2 class="modal-title">{$t('Dernière confirmation')}</h2>
        <p style="font-size:13.5px; color:var(--text-2); line-height:1.5; margin-bottom:16px;">
          {$t('Ceci est irréversible. Tapez')} <strong>"{accountToDelete.name}"</strong> {$t('pour confirmer la suppression définitive.')}
        </p>
        <input
          type="text"
          placeholder={accountToDelete.name}
          bind:value={deleteAccountInput}
          style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text-1); font-size:14px;"
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
    gap: 12px;
    padding: 4px 8px 0;
    margin-bottom: 16px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 12px;
  }

  .error-banner-close {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .brand-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #2563EB;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .brand-name {
    font-weight: 500;
    font-size: 16px;
    line-height: 20px;
    color: var(--text-1);
  }
  .brand-tag {
    font-size: 12px;
    line-height: 16px;
    color: var(--text-3);
  }

  .btn-new-account {
    width: 100%;
    flex-shrink: 0;
    margin-bottom: 16px;
    background: var(--cobalt-light);
    border-color: var(--cobalt-border);
    color: var(--cobalt);
  }
  .btn-new-account:hover { background: var(--cobalt-dim); color: var(--cobalt); }

  .account-nav {
    flex: 1;
    min-height: 160px;
    overflow-y: auto;
    /* Room for the focus ring and the account menu inside the scroll box */
    margin: 0 -4px;
    padding: 0 4px 12px;
  }

  /* One block per account, in the color of its type. The open account holds its own menu. */
  .account-group {
    margin-bottom: 8px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 12px;
    transition: border-color 150ms var(--ease), background-color 150ms var(--ease);
  }
  .account-group:not(.active):hover { border-color: color-mix(in srgb, var(--acct) 40%, transparent); }
  .account-group.active {
    border-color: color-mix(in srgb, var(--acct) 32%, transparent);
    background: color-mix(in srgb, var(--acct) 6%, transparent);
  }

  .account-row {
    position: relative;
    display: flex;
    align-items: center;
    height: 48px;
    padding-right: 4px;
    border-radius: 8px;
  }

  .account-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 0;
    height: 100%;
    padding: 0 8px;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-ui);
  }

  .account-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--acct) 16%, transparent);
    color: var(--acct);
  }

  .account-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .account-btn-name {
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    color: var(--text-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .account-row.active .account-btn-name { color: var(--acct); font-weight: 600; }

  .account-btn-bank {
    font-size: 12px;
    line-height: 16px;
    color: var(--text-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-3);
    transition: background-color 150ms var(--ease), color 150ms var(--ease);
  }
  .account-menu-btn:hover { background: color-mix(in srgb, var(--text-1) 7%, transparent); color: var(--text-1); }

  /* The menu hangs from the account on a rail that starts under its icon. */
  .subnav {
    margin: 4px 0 4px 23px;
    padding-left: 8px;
    border-left: 1px solid color-mix(in srgb, var(--acct) 35%, transparent);
  }
  .subnav .side-row { padding-left: 4px; gap: 4px; }
  .subnav .side-row-icon { color: color-mix(in srgb, var(--acct) 75%, var(--text-3)); }
  .subnav-btn { position: relative; }
  .subnav-btn:hover { background: color-mix(in srgb, var(--acct) 9%, transparent); }

  .subnav-active,
  .subnav-active:hover {
    color: var(--text-1);
    background: color-mix(in srgb, var(--acct) 16%, transparent);
    font-weight: 500;
  }
  .subnav-active .side-row-icon { color: var(--acct); }
  .subnav-active::before {
    content: '';
    position: absolute;
    left: -10px;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 2px;
    background: var(--acct);
  }

  .account-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 10;
    margin-top: 4px;
    padding: 4px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 24px var(--shadow-dropdown);
    animation: menu-in 160ms var(--ease);
  }
  @keyframes menu-in {
    from { opacity: 0; transform: translateY(-4px); }
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 32px;
    padding: 0 8px;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
    color: var(--text-2);
    text-align: left;
    font-family: var(--font-ui);
    transition: background-color 150ms var(--ease), color 150ms var(--ease);
  }
  .dropdown-item:hover { background: var(--card-hover); color: var(--text-1); }
  .dropdown-item.danger:hover { background: var(--danger-bg); color: var(--danger-text); }

  .dropdown-sep {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }

  .btn-danger { background: #DC2626; color: white; }
  .btn-danger:hover { background: #B91C1C; }
</style>
