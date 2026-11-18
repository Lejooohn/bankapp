<script lang="ts">
  import { self, stopPropagation } from '../lib/events';
  import { onMount, createEventDispatcher, untrack } from 'svelte';
  import { api, getToken, getCurrentUser } from '../lib/api.js';
  import { lang, t } from '../lib/i18n.ts';
  import RestoreBackupModal from './RestoreBackupModal.svelte';

  const isAdmin = getCurrentUser()?.role === 'admin';

  interface BackupFile {
    filename: string;
    date: string;
    time: string;
    sizeBytes: number;
    sizeMB: number;
    timestamp: string;
    category?: 'daily' | 'manual';
  }

  interface BackupCounts {
    daily: number;
    manual: number;
    total: number;
  }

  interface BackupStatus {
    status: 'success' | 'error' | 'no_backup';
    backups: BackupFile[];
    safetySnapshots?: BackupFile[];
    counts?: BackupCounts;
    message?: string;
  }

  interface Props {
    account?: { id: string; name: string } | null;
  }

  let { account = null }: Props = $props();

  const dispatch = createEventDispatcher();

  let backupStatus: BackupStatus | null = $state(null);
  let loading = $state(true);
  let error = $state(false);
  let modalOpen = $state(false);
  let restoreTarget: (BackupFile & { isSafetySnapshot: boolean }) | null = $state(null);
  let creating = $state(false);
  let createError = $state('');
  let deleteTarget: (BackupFile & { isSafetySnapshot: boolean }) | null = $state(null);
  let deleting = $state(false);
  let deleteError = $state('');
  let tokenReady = $state(false);
  let lastAccountId: string | null | undefined = $state(undefined);

  async function fetchStatus() {
    backupStatus = await api.get(`/api/backup/status${account ? `?accountId=${account.id}` : ''}`);
  }

  onMount(async () => {
    let retries = 0;
    while (!getToken() && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }

    if (!getToken()) {
      error = true;
      loading = false;
      return;
    }

    tokenReady = true;
  });

  $effect.pre(() => {
    if (tokenReady && (account?.id !== lastAccountId || (account === null && lastAccountId !== null) || (account !== null && lastAccountId === null))) {
      untrack(() => {
        lastAccountId = account?.id ?? null;
        loading = true;
        fetchStatus()
          .catch(err => {
            console.error('Error fetching backup status:', err);
            error = true;
          })
          .finally(() => {
            loading = false;
          });
      });
    }
  });

  $effect.pre(() => {
    if (!account && loading) {
      untrack(() => {
        loading = false;
      });
    }
  });

  async function createBackupNow() {
    creating = true;
    createError = '';
    try {
      if (isAdmin) {
        await api.post('/api/backup/create', {});
      } else if (account) {
        await api.post(`/api/accounts/${account.id}/backup/snapshot`, {});
      }
      await fetchStatus();
    } catch (err) {
      createError = err.message || (($lang === 'fr') ? $t('Erreur lors de la sauvegarde') : 'Backup failed');
    } finally {
      creating = false;
    }
  }

  function requestDelete(backup: BackupFile, isSafetySnapshot: boolean) {
    deleteError = '';
    deleteTarget = { ...backup, isSafetySnapshot };
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    deleteError = '';
    try {
      if (deleteTarget.isSafetySnapshot && account) {
        await api.delete(`/api/accounts/${account.id}/backup/safety-snapshot/${encodeURIComponent(deleteTarget.filename)}`);
      } else {
        await api.delete(`/api/backup/${encodeURIComponent(deleteTarget.filename)}`);
      }
      deleteTarget = null;
      await fetchStatus();
    } catch (err) {
      deleteError = err.message || (($lang === 'fr') ? $t('Erreur lors de la suppression') : 'Delete failed');
    } finally {
      deleting = false;
    }
  }

  function downloadBackup(backup: BackupFile, isSafetySnapshot: boolean) {
    const token = getToken();
    if (!token) {
      alert($t('Vous devez être connecté pour télécharger une sauvegarde'));
      return;
    }

    async function doDownload(url: string) {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          if (response.status === 401) {
            alert($t('Session expirée. Veuillez vous reconnecter.'));
          } else {
            const error = await response.json().catch(() => ({ error: $t('Erreur inconnue') }));
            alert($t('Erreur lors du téléchargement') + ': ' + (error.error || response.status));
          }
          return;
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = backup.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
      } catch (err) {
        alert($t('Erreur réseau') + ': ' + (err instanceof Error ? err.message : ''));
      }
    }

    if (isSafetySnapshot && account) {
      const url = `/api/accounts/${account.id}/backup/safety-snapshot/download/${encodeURIComponent(backup.filename)}`;
      doDownload(url);
    } else {
      const url = `/api/backup/download/${encodeURIComponent(backup.filename)}`;
      doDownload(url);
    }
  }

  function formatDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(`${y}-${m}-${d}`);
    const now = new Date();
    const locale = ($lang === 'fr' ? 'fr-FR' : 'en-US');

    const diffDays = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays === 0) return $t('Aujourd\'hui');
    if (diffDays === 1) return $t('Hier');

    return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(timeStr: string): string {
    return timeStr.slice(0, 5);
  }

  function statusColor(status: string): string {
    if (status === 'success') return '#22C55E';
    if (status === 'error') return '#EF4444';
    return '#94A3B8';
  }

  function statusDetail(): string {
    if (!backupStatus) return '';
    if (backupStatus.status === 'success' && backupStatus.backups?.length > 0) {
      const count = backupStatus.backups.length;
      return $lang === 'fr'
        ? `${count} sauvegarde${count > 1 ? 's' : ''}`
        : `${count} backup${count > 1 ? 's' : ''}`;
    }
    if (backupStatus.status === 'error') return $t('Erreur');
    return $t('Aucune');
  }

  let dailyBackups = $derived(backupStatus?.backups?.filter(b => b.category === 'daily') || []);
  let manualBackups = $derived(backupStatus?.backups?.filter(b => b.category === 'manual') || []);
</script>

<div class="backup-widget">
  <button class="backup-row" onclick={() => (modalOpen = true)} disabled={loading || error || !backupStatus}>
    <svg
      class="backup-icon"
      style="color:{loading ? '#94A3B8' : statusColor(backupStatus?.status ?? 'no_backup')}"
      width="15" height="15" viewBox="0 0 14 14" fill="none"
    >
      <ellipse cx="7" cy="3" rx="5" ry="1.8" stroke="currentColor" stroke-width="1.3"/>
      <path d="M2 3v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V3" stroke="currentColor" stroke-width="1.3"/>
      <path d="M2 7c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" stroke="currentColor" stroke-width="1.3"/>
    </svg>
    <span class="backup-text">
      <span class="backup-title">{$t('Sauvegarde')}</span>
      <span class="backup-sub">{statusDetail()}</span>
    </span>
  </button>

  {#if modalOpen && backupStatus}
    <div class="modal-overlay" onclick={self(() => (modalOpen = false))} onkeydown={(e) => e.key === 'Escape' && (modalOpen = false)} role="presentation">
      <div class="modal-box" onclick={stopPropagation()} onkeydown={stopPropagation()} role="presentation">

        <div class="modal-header">
          <h2 class="modal-title">{$t('Sauvegardes')}</h2>
          <button class="modal-close" onclick={() => (modalOpen = false)} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        {#if isAdmin || account}
          <button class="btn-create" onclick={stopPropagation(createBackupNow)} disabled={creating}>
            {#if creating}
              <svg class="spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12.5 7A5.5 5.5 0 1 1 7 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            {/if}
            <span>{creating ? $t('Création…') : (isAdmin ? $t('Créer maintenant') : $t('Créer'))}</span>
          </button>
          {#if createError}
            <div class="error-text">{createError}</div>
          {/if}
        {/if}

        <div class="backups-container">
          {#if backupStatus.status === 'no_backup'}
            <div class="empty-state">{backupStatus.message || $t('Aucune sauvegarde')}</div>
          {:else if dailyBackups.length > 0 || manualBackups.length > 0}

            {#if dailyBackups.length > 0}
              <div class="section">
                <h3 class="section-title">{$t('Automatiques')} <span class="count">({dailyBackups.length})</span></h3>
                {#each dailyBackups as backup}
                      <div class="backup-item">
                        <div class="backup-main">
                          <span class="backup-datetime"><span class="backup-date">{formatDate(backup.date)}</span> <span class="backup-sep">·</span> <span class="backup-time">{formatTime(backup.time)}</span></span>
                        </div>
                        <div class="backup-actions">
                          <button class="action-btn action-download" title={$t('Télécharger')} onclick={stopPropagation(() => downloadBackup(backup, false))}>
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                              <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                          {#if account}
                            <button class="action-btn action-restore" title={$t('Restaurer')} onclick={stopPropagation(() => (restoreTarget = { ...backup, isSafetySnapshot: false }))}>
                              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                                <path d="M2.5 7A4.5 4.5 0 1 1 4 10.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                                <path d="M2.5 4v3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                              </svg>
                            </button>
                          {/if}
                          <button class="action-btn action-delete" title={$t('Supprimer')} onclick={stopPropagation(() => requestDelete(backup, false))}>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                              <path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                {/each}
              </div>
            {/if}

            {#if manualBackups.length > 0}
              <div class="section">
                <h3 class="section-title">{$t('Manuelles')} <span class="count">({manualBackups.length})</span></h3>
                {#each manualBackups as backup}
                      <div class="backup-item">
                        <div class="backup-main">
                          <span class="backup-datetime"><span class="backup-date">{formatDate(backup.date)}</span> <span class="backup-sep">·</span> <span class="backup-time">{formatTime(backup.time)}</span></span>
                        </div>
                        <div class="backup-actions">
                          <button class="action-btn action-download" title={$t('Télécharger')} onclick={stopPropagation(() => downloadBackup(backup, false))}>
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                              <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                          {#if account}
                            <button class="action-btn action-restore" title={$t('Restaurer')} onclick={stopPropagation(() => (restoreTarget = { ...backup, isSafetySnapshot: false }))}>
                              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                                <path d="M2.5 7A4.5 4.5 0 1 1 4 10.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                                <path d="M2.5 4v3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                              </svg>
                            </button>
                          {/if}
                          <button class="action-btn action-delete" title={$t('Supprimer')} onclick={stopPropagation(() => requestDelete(backup, false))}>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                              <path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                {/each}
              </div>
            {/if}

          {/if}

          {#if backupStatus.safetySnapshots && backupStatus.safetySnapshots.length > 0}
            <div class="section section-safety">
              <h3 class="section-title">{$t('Avant restauration')} <span class="count">({backupStatus.safetySnapshots.length})</span></h3>
              {#each backupStatus.safetySnapshots as snap}
                    <div class="backup-item">
                      <div class="backup-main">
                        <span class="backup-datetime"><span class="backup-date">{formatDate(snap.date)}</span> <span class="backup-sep">·</span> <span class="backup-time">{formatTime(snap.time)}</span></span>
                      </div>
                      <div class="backup-actions">
                        <button class="action-btn action-download" title={$t('Télécharger')} onclick={stopPropagation(() => downloadBackup(snap, true))}>
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                            <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </button>
                        {#if account}
                          <button class="action-btn action-restore" title={$t('Restaurer')} onclick={stopPropagation(() => (restoreTarget = { ...snap, isSafetySnapshot: true }))}>
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                              <path d="M2.5 7A4.5 4.5 0 1 1 4 10.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                              <path d="M2.5 4v3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                        {/if}
                        <button class="action-btn action-delete" title={$t('Supprimer')} onclick={stopPropagation(() => requestDelete(snap, true))}>
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
              {/each}
            </div>
          {/if}
        </div>

      </div>
    </div>
  {/if}

  {#if restoreTarget && account}
    <RestoreBackupModal
      {account}
      backup={restoreTarget}
      on:close={() => (restoreTarget = null)}
      on:restored={(e) => { restoreTarget = null; dispatch('restored', e.detail); }}
    />
  {/if}

  {#if deleteTarget}
    <div class="modal-overlay" onclick={self(() => (deleteTarget = null))} onkeydown={(e) => e.key === 'Escape' && (deleteTarget = null)} role="presentation">
      <div class="confirm-box" role="dialog" aria-modal="true">
        <h3 class="confirm-title">{$t('Supprimer cette sauvegarde ?')}</h3>
        <p class="confirm-text">{formatDate(deleteTarget.date)} · {formatTime(deleteTarget.time)} · {deleteTarget.sizeMB} MB</p>
        <p class="confirm-warning">{$t('Cette action est définitive.')}</p>
        {#if deleteError}
          <p class="confirm-error">{deleteError}</p>
        {/if}
        <div class="confirm-actions">
          <button class="confirm-cancel" onclick={() => (deleteTarget = null)} disabled={deleting}>
            {$t('Annuler')}
          </button>
          <button class="confirm-delete" onclick={confirmDelete} disabled={deleting}>
            {deleting ? $t('Suppression…') : $t('Supprimer')}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .backup-widget {
    position: relative;
  }

  .backup-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 7px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    transition: all 0.12s;
  }

  .backup-row:hover:not(:disabled) {
    background: var(--card-hover);
  }

  .backup-row:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .backup-icon {
    flex-shrink: 0;
  }

  .backup-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: center;
  }

  .backup-title {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--text-1);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .backup-sub {
    font-size: 11.5px;
    color: var(--text-3);
  }

  /* MODAL */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-box {
    width: 100%;
    max-width: 580px;
    max-height: 90vh;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 32px var(--shadow-modal);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .modal-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-1);
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-2);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.12s;
  }

  .modal-close:hover {
    background: var(--card-hover);
    color: var(--text-1);
  }

  .btn-create {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 16px 24px 0;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 600;
    border: 1px solid var(--cobalt-border);
    border-radius: 6px;
    background: var(--cobalt-light);
    color: var(--cobalt);
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-create:hover:not(:disabled) {
    background: var(--cobalt);
    color: white;
  }

  .btn-create:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .spin {
    animation: spin-keyframe 0.8s linear infinite;
  }

  @keyframes spin-keyframe {
    to { transform: rotate(360deg); }
  }

  .error-text {
    font-size: 12px;
    color: var(--danger-text);
    margin: 8px 24px 0;
  }

  .backups-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px;
  }

  .empty-state {
    padding: 40px 20px;
    text-align: center;
    font-size: 13px;
    color: var(--text-3);
  }

  .section {
    margin-bottom: 32px;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section-safety {
    opacity: 0.7;
  }

  .section-title {
    margin: 0 0 12px 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-2);
  }

  .count {
    font-weight: 500;
    color: var(--text-3);
  }

  .backup-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 6px;
    transition: all 0.12s;
  }

  .backup-item:hover {
    background: var(--card-hover);
  }

  .backup-main {
    flex: 1;
    min-width: 0;
  }

  .backup-datetime {
    font-size: 13px;
    color: var(--text-1);
    font-variant-numeric: tabular-nums;
  }

  .backup-date {
    color: var(--text-1);
  }

  .backup-sep {
    color: var(--text-3);
    margin: 0 4px;
  }

  .backup-time {
    color: var(--text-1);
  }

  .backup-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--text-2);
    cursor: pointer;
    transition: all 0.12s;
  }

  .action-download:hover {
    border-color: #16a34a;
    background: rgba(22, 163, 74, 0.1);
    color: #16a34a;
  }

  .action-restore:hover {
    border-color: var(--cobalt-border);
    background: var(--cobalt-light);
    color: var(--cobalt);
  }

  .action-delete:hover {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .confirm-box {
    width: 280px;
    max-width: calc(100vw - 32px);
    padding: 16px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 32px var(--shadow-modal);
  }

  .confirm-title {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-1);
  }

  .confirm-text {
    margin: 0 0 4px;
    font-size: 12px;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .confirm-warning {
    margin: 0 0 12px;
    font-size: 11px;
    color: var(--danger-text);
  }

  .confirm-error {
    margin: 0 0 12px;
    font-size: 11px;
    color: var(--danger-text);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .confirm-cancel,
  .confirm-delete {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .confirm-cancel {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text-2);
  }

  .confirm-cancel:hover:not(:disabled) {
    background: var(--card-hover);
  }

  .confirm-delete {
    border: 1px solid var(--danger-text);
    background: var(--danger-text);
    color: white;
  }

  .confirm-delete:hover:not(:disabled) {
    opacity: 0.9;
  }

  .confirm-cancel:disabled,
  .confirm-delete:disabled {
    cursor: default;
    opacity: 0.6;
  }
</style>
