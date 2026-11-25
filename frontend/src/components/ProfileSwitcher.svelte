<script lang="ts">
  import Icon from './Icon.svelte';
  import AboutModal from './AboutModal.svelte';
  import MfaSettingsModal from './MfaSettingsModal.svelte';
  import { stopPropagation } from '../lib/events';
  import { onMount } from 'svelte';
  import { lang, t } from '../lib/i18n.ts';
  import * as api from '../lib/api.js';

  interface Props {
    onLock?: any;
  }

  let { onLock = null }: Props = $props();

  let showManageModal = $state(false);
  let showAboutModal = $state(false);
  let showCreateModal = $state(false);
  let showPasswordModal = $state(false);
  let showMfaModal = $state(false);
  let showUsersModal = $state(false);
  let showRenameModal = $state(false);
  let showResetPasswordModal = $state(false);
  let currentUser: any = $state(null);
  let profiles: any[] = [];
  let newUsername = $state('');
  let newPassword = $state('');
  let newPasswordConfirm = $state('');
  let currentPassword = $state('');
  let newPwd = $state('');
  let newPwdConfirm = $state('');
  let error = $state('');
  let loading = $state(false);

  let users: any[] = $state([]);
  let usersLoading = $state(false);
  let usersError = $state('');
  let selectedUser: any = null;
  let renameValue = $state('');
  let resetPasswordValue = $state('');
  let resetPasswordConfirm = $state('');

  onMount(async () => {
    const user = api.getCurrentUser();
    if (user) {
      currentUser = user;
      profiles = [user];
    }
  });

  async function logout() {
    try {
      await api.logout();
      currentUser = null;
      profiles = [];
      window.location.href = '/';
    } catch (err: any) {
      error = err.message;
    }
  }

  async function createProfile() {
    if (!newUsername || !newPassword) {
      error = $t('Username et mot de passe requis');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      error = $t('Les mots de passe ne correspondent pas');
      return;
    }

    loading = true;
    error = '';
    try {
      await api.createUser(newUsername, newPassword);
      newUsername = '';
      newPassword = '';
      newPasswordConfirm = '';
      showCreateModal = false;
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }


  async function openUsersModal() {
    showManageModal = false;
    showUsersModal = true;
    usersLoading = true;
    usersError = '';
    try {
      users = await api.listUsers();
    } catch (err: any) {
      usersError = err.message;
    } finally {
      usersLoading = false;
    }
  }

  function openRename(user: any) {
    selectedUser = user;
    renameValue = user.username;
    usersError = '';
    showRenameModal = true;
  }

  async function submitRename() {
    if (!renameValue.trim()) return;
    loading = true;
    usersError = '';
    try {
      const updated = await api.renameUser(selectedUser.id, renameValue.trim());
      users = users.map(u => (u.id === updated.id ? { ...u, username: updated.username } : u));
      showRenameModal = false;
    } catch (err: any) {
      usersError = err.message;
    } finally {
      loading = false;
    }
  }

  function openResetPassword(user: any) {
    selectedUser = user;
    resetPasswordValue = '';
    resetPasswordConfirm = '';
    usersError = '';
    showResetPasswordModal = true;
  }

  async function submitResetPassword() {
    if (!resetPasswordValue) return;
    if (resetPasswordValue !== resetPasswordConfirm) {
      usersError = $t('Les mots de passe ne correspondent pas');
      return;
    }
    loading = true;
    usersError = '';
    try {
      await api.resetUserPassword(selectedUser.id, resetPasswordValue);
      showResetPasswordModal = false;
    } catch (err: any) {
      usersError = err.message;
    } finally {
      loading = false;
    }
  }

  async function removeUser(user: any) {
    const msg = $lang === 'fr'
      ? `$t('Supprimer le compte "{name}" et toutes ses données (comptes, transactions, budgets) ?').replace('{name}', user.username)`
      : `Delete account "${user.username}" and all its data (accounts, transactions, budgets)?`;
    if (!confirm(msg)) return;

    usersError = '';
    try {
      await api.deleteUser(user.id);
      users = users.filter(u => u.id !== user.id);
    } catch (err: any) {
      usersError = err.message;
    }
  }

  async function changePassword() {
    if (!currentPassword || !newPwd) {
      error = $t('Tous les champs sont requis');
      return;
    }
    if (newPwd !== newPwdConfirm) {
      error = $t('Les mots de passe ne correspondent pas');
      return;
    }

    loading = true;
    error = '';
    try {
      const response = await api.api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPwd,
      });
      if (response.success) {
        currentPassword = '';
        newPwd = '';
        newPwdConfirm = '';
        showPasswordModal = false;
        // Show success message
        error = '';
      }
    } catch (err: any) {
      error = err.message || ($t('Erreur lors du changement de mot de passe'));
    } finally {
      loading = false;
    }
  }
</script>

<div class="profile-section">
  <button class="side-row" onclick={() => (showManageModal = true)}>
    <span class="side-row-icon"><Icon name="user" /></span>
    <span class="side-row-label">{currentUser?.username || $t('Profil')}</span>
  </button>
</div>

{#if showManageModal}
  <div class="modal-overlay" onclick={() => (showManageModal = false)} onkeydown={(e) => e.key === 'Escape' && (showManageModal = false)} role="presentation">
    <div class="modal-card" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
      <div class="modal-header">
        <h2>{$t('Profil')}</h2>
        <button
          class="close-btn"
          onclick={() => (showManageModal = false)}
          title={$t('Fermer')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="profile-card">
          <div class="profile-avatar"><Icon name="user" size={18} /></div>
          <div class="profile-username-display">{currentUser?.username || 'Not logged in'}</div>
        </div>

        {#if error}
          <div class="error-message">{error}</div>
        {/if}

        <div class="actions-list">
          {#if currentUser?.role === 'admin'}
            <button class="action-item add-profile" onclick={() => { showManageModal = false; showCreateModal = true; }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              {$t('Créer un utilisateur')}
            </button>
            <button class="action-item add-profile" onclick={openUsersModal}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 13v-1a3 3 0 013-3h2a3 3 0 013 3v1M6.5 6.5a2 2 0 100-4 2 2 0 000 4zM11 5.5a1.8 1.8 0 110-3.6M10.5 9c1.5.2 2.5 1.1 2.5 2.5V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {$t('Gérer les utilisateurs')}
            </button>
          {/if}
          <button class="action-item password-change" onclick={() => { showManageModal = false; showPasswordModal = true; }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8v4a1 1 0 001 1h8a1 1 0 001-1V8M5 8V6a3 3 0 116 0v2M8 10v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {$t('Changer le mot de passe')}
          </button>
          <button class="action-item mfa-settings" onclick={() => { showManageModal = false; showMfaModal = true; }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5l5 2v4c0 3-2.2 5.2-5 6.5-2.8-1.3-5-3.5-5-6.5v-4l5-2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
            {$t('Double authentification')}
          </button>
          <button class="action-item lock-session" onclick={() => { showManageModal = false; if (onLock) onLock(); }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8v5a1 1 0 001 1h10a1 1 0 001-1V8M4 8V6a4 4 0 118 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {$t('Verrouiller la session')}
          </button>
          <button class="action-item about" onclick={() => { showManageModal = false; showAboutModal = true; }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
              <path d="M8 7.5v4M8 5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            {$t('À propos')}
          </button>
          <div class="action-divider"></div>
          <button class="action-item logout" onclick={() => { showManageModal = false; logout(); }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h5M11 11l3-3m0 0l-3-3m3 3H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {$t('Se déconnecter')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

  {#if showAboutModal}
    <AboutModal onclose={() => (showAboutModal = false)} />
  {/if}

  {#if showCreateModal}
    <div class="modal-overlay" onclick={() => (showCreateModal = false)} onkeydown={(e) => e.key === 'Escape' && (showCreateModal = false)} role="presentation">
      <div class="modal-card" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
        <div class="modal-header">
          <h2>{$t('Créer un utilisateur')}</h2>
          <button
            class="close-btn"
            onclick={() => (showCreateModal = false)}
            title={$t('Fermer')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          {#if error}
            <div class="error-message">{error}</div>
          {/if}

          <label>
            <span>{$t('Nom d\'utilisateur')}</span>
            <input
              type="text"
              bind:value={newUsername}
              placeholder={$t('Nom du nouvel utilisateur')}
              disabled={loading}
            />
          </label>

          <label>
            <span>{$t('Mot de passe')}</span>
            <input
              type="password"
              bind:value={newPassword}
              placeholder={$t('Min 12 caractères')}
              disabled={loading}
            />
          </label>

          <label>
            <span>{$t('Confirmer mot de passe')}</span>
            <input
              type="password"
              bind:value={newPasswordConfirm}
              placeholder={$t('Répétez le mot de passe')}
              disabled={loading}
            />
          </label>
        </div>

        <div class="modal-footer">
          <button
            class="btn-cancel"
            onclick={() => (showCreateModal = false)}
            disabled={loading}
          >
            {$t('Annuler')}
          </button>
          <button
            class="btn-create"
            onclick={createProfile}
            disabled={loading}
          >
            {loading ? '...' : $t('Créer')}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showMfaModal}
    <MfaSettingsModal onClose={() => (showMfaModal = false)} />
  {/if}

  {#if showPasswordModal}
    <div class="modal-overlay" onclick={() => (showPasswordModal = false)} onkeydown={(e) => e.key === 'Escape' && (showPasswordModal = false)} role="presentation">
      <div class="modal-card" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
        <div class="modal-header">
          <h2>{$t('Changer le mot de passe')}</h2>
          <button
            class="close-btn"
            onclick={() => (showPasswordModal = false)}
            title={$t('Fermer')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          {#if error}
            <div class="error-message">{error}</div>
          {/if}

          <label>
            <span>{$t('Mot de passe actuel')}</span>
            <input
              type="password"
              bind:value={currentPassword}
              placeholder={$t('Entrez votre mot de passe')}
              disabled={loading}
            />
          </label>

          <label>
            <span>{$t('Nouveau mot de passe')}</span>
            <input
              type="password"
              bind:value={newPwd}
              placeholder={$t('Min 12 caractères')}
              disabled={loading}
            />
          </label>

          <label>
            <span>{$t('Confirmer le nouveau mot de passe')}</span>
            <input
              type="password"
              bind:value={newPwdConfirm}
              placeholder={$t('Répétez le mot de passe')}
              disabled={loading}
            />
          </label>
        </div>

        <div class="modal-footer">
          <button
            class="btn-cancel"
            onclick={() => (showPasswordModal = false)}
            disabled={loading}
          >
            {$t('Annuler')}
          </button>
          <button
            class="btn-create"
            onclick={changePassword}
            disabled={loading}
          >
            {loading ? '...' : $t('Changer')}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showUsersModal}
    <div class="modal-overlay" onclick={() => (showUsersModal = false)} onkeydown={(e) => e.key === 'Escape' && (showUsersModal = false)} role="presentation">
      <div class="modal-card" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
        <div class="modal-header">
          <h2>{$t('Gérer les utilisateurs')}</h2>
          <button
            class="close-btn"
            onclick={() => (showUsersModal = false)}
            title={$t('Fermer')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          {#if usersError}
            <div class="error-message">{usersError}</div>
          {/if}

          {#if usersLoading}
            <p class="users-status">{$t('Chargement...')}</p>
          {:else if users.length === 0}
            <p class="users-status">{$t('Aucun utilisateur')}</p>
          {:else}
            <ul class="users-list">
              {#each users as user (user.id)}
                <li class="user-row">
                  <div class="user-info">
                    <span class="user-name">{user.username}</span>
                    {#if user.role === 'admin'}
                      <span class="user-role-badge">{$t('Admin')}</span>
                    {/if}
                  </div>
                  {#if user.role !== 'admin'}
                    <div class="user-actions">
                      <button class="btn-icon-small" title={$t('Renommer')} onclick={() => openRename(user)}>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <path d="M11 2l3 3-7.5 7.5H3v-3L11 2z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                      <button class="btn-icon-small" title={$t('Réinitialiser le mot de passe')} onclick={() => openResetPassword(user)}>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <circle cx="5" cy="11" r="2.5" stroke="currentColor" stroke-width="1.4"/>
                          <path d="M6.8 9.2L13 3M11 5l1.5 1.5M13 3l1.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                      <button class="btn-icon-small danger" title={$t('Supprimer')} onclick={() => removeUser(user)}>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <path d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.5 9a1 1 0 001 1h4a1 1 0 001-1l.5-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" onclick={() => (showUsersModal = false)}>
            {$t('Fermer')}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showRenameModal}
    <div class="modal-overlay" onclick={() => (showRenameModal = false)} onkeydown={(e) => e.key === 'Escape' && (showRenameModal = false)} role="presentation">
      <div class="modal-card" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
        <div class="modal-header">
          <h2>{$t('Renommer l\'utilisateur')}</h2>
          <button
            class="close-btn"
            onclick={() => (showRenameModal = false)}
            title={$t('Fermer')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          {#if usersError}
            <div class="error-message">{usersError}</div>
          {/if}

          <label>
            <span>{$t('Nom d\'utilisateur')}</span>
            <input type="text" bind:value={renameValue} disabled={loading} />
          </label>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" onclick={() => (showRenameModal = false)} disabled={loading}>
            {$t('Annuler')}
          </button>
          <button class="btn-create" onclick={submitRename} disabled={loading}>
            {loading ? '...' : $t('Enregistrer')}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showResetPasswordModal}
    <div class="modal-overlay" onclick={() => (showResetPasswordModal = false)} onkeydown={(e) => e.key === 'Escape' && (showResetPasswordModal = false)} role="presentation">
      <div class="modal-card" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">
        <div class="modal-header">
          <h2>{$t('Réinitialiser le mot de passe')}</h2>
          <button
            class="close-btn"
            onclick={() => (showResetPasswordModal = false)}
            title={$t('Fermer')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          {#if usersError}
            <div class="error-message">{usersError}</div>
          {/if}

          <label>
            <span>{$t('Nouveau mot de passe')}</span>
            <input type="password" bind:value={resetPasswordValue} placeholder={$t('Min 12 caractères')} disabled={loading} />
          </label>

          <label>
            <span>{$t('Confirmer le mot de passe')}</span>
            <input type="password" bind:value={resetPasswordConfirm} disabled={loading} />
          </label>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" onclick={() => (showResetPasswordModal = false)} disabled={loading}>
            {$t('Annuler')}
          </button>
          <button class="btn-create" onclick={submitResetPassword} disabled={loading}>
            {loading ? '...' : $t('Enregistrer')}
          </button>
        </div>
      </div>
    </div>
  {/if}

<style>
  .profile-section { margin: 2px 0; }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    animation: fadeIn 0.2s ease-out;
  }

  .modal-card {
    background: var(--card);
    border-radius: 12px;
    box-shadow: 0 20px 60px var(--shadow-modal);
    width: 90%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease-out;
  }

  .modal-header {
    padding: 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-1);
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--text-2);
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: var(--text-1);
  }

  .modal-body {
    padding: 20px;
  }

  .profile-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(99, 102, 241, 0.05));
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-bottom: 20px;
  }

  .profile-avatar {
    display: flex;
    color: var(--text-2);
  }

  .profile-username-display {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-1);
    text-align: center;
  }

  .error-message {
    padding: 12px;
    margin-bottom: 16px;
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.3);
    border-radius: 8px;
    color: #dc2626;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .actions-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .action-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }

  .action-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    color: var(--text-1);
    font-family: var(--font-ui);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease-out;
    text-align: left;
  }

  .action-item svg {
    flex-shrink: 0;
  }

  .action-item:hover {
    transform: translateX(2px);
  }

  .action-item.add-profile {
    color: #3b82f6;
    border-color: rgba(59, 130, 246, 0.3);
    background: rgba(59, 130, 246, 0.05);
  }

  .action-item.add-profile:hover {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.5);
  }

  .action-item.password-change {
    color: #8b5cf6;
    border-color: rgba(139, 92, 246, 0.3);
    background: rgba(139, 92, 246, 0.05);
  }

  .action-item.password-change:hover {
    background: rgba(139, 92, 246, 0.1);
    border-color: rgba(139, 92, 246, 0.5);
  }

  .action-item.lock-session {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.3);
    background: rgba(245, 158, 11, 0.05);
  }

  .action-item.lock-session:hover {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.5);
  }

  .action-item.logout {
    color: #dc2626;
    border-color: rgba(220, 38, 38, 0.3);
    background: rgba(220, 38, 38, 0.05);
  }

  .action-item.logout:hover {
    background: rgba(220, 38, 38, 0.1);
    border-color: rgba(220, 38, 38, 0.5);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    animation: fadeIn 0.2s ease-out;
  }

  .modal-card {
    background: var(--card);
    border-radius: 12px;
    box-shadow: 0 20px 60px var(--shadow-modal);
    width: 90%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease-out;
  }

  .modal-header {
    padding: 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-1);
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--text-2);
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: var(--text-1);
  }

  .modal-body {
    padding: 20px;
    flex: 1;
    overflow-y: auto;
  }

  .error-message {
    padding: 10px;
    margin-bottom: 12px;
    background: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #991b1b;
    font-size: 0.9rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  label span {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-1);
  }

  input {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--input-bg);
    color: var(--text-1);
    font-family: var(--font-ui);
    font-size: 0.95rem;
    transition: border-color 0.2s;
  }

  input:focus {
    outline: none;
    border-color: var(--cobalt);
  }

  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .modal-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .btn-cancel,
  .btn-create {
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--font-ui);
  }

  .btn-cancel {
    background: var(--card-hover);
    color: var(--text-1);
  }

  .btn-cancel:hover {
    background: var(--border);
  }

  .btn-create {
    background: var(--cobalt);
    color: white;
  }

  .btn-create:hover {
    background: #1d4ed8;
  }

  .btn-cancel:disabled,
  .btn-create:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .users-status {
    color: var(--text-2);
    font-size: 0.9rem;
    text-align: center;
    padding: 12px 0;
  }

  .users-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .user-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .user-name {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-role-badge {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
    flex-shrink: 0;
  }

  .user-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .btn-icon-small {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card-hover);
    color: var(--text-2);
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-icon-small:hover {
    background: var(--border);
    color: var(--text-1);
  }

  .btn-icon-small.danger:hover {
    background: rgba(220, 38, 38, 0.1);
    border-color: rgba(220, 38, 38, 0.4);
    color: #dc2626;
  }
</style>
