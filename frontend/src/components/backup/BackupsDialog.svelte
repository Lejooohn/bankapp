<script lang="ts">
  import { self } from '../../lib/events';
  import { api, getToken } from '../../lib/api.js';
  import { lang, t } from '../../lib/i18n.ts';
  import ConfirmModal from '../ConfirmModal.svelte';
  import DeleteAllBackupsModal from '../DeleteAllBackupsModal.svelte';
  import Icon from '../Icon.svelte';
  import RestoreBackupModal from '../RestoreBackupModal.svelte';
  import BackupHelp from './BackupHelp.svelte';
  import BackupRow from './BackupRow.svelte';
  import BackupTiles from './BackupTiles.svelte';
  import { LEVEL_COLOR, backupTitle, fmtDay, fmtSize, fmtTime, type BackupFile, type BackupStatus, type BackupTab } from './backup-format.ts';

  let { status, account, isAdmin, onrefresh, onrestored, onclose }: {
    status: BackupStatus;
    account: { id: string; name: string } | null;
    isAdmin: boolean;
    onrefresh: () => Promise<void>;
    onrestored: (result: unknown) => void;
    onclose: () => void;
  } = $props();

  let creating = $state(false);
  let error = $state('');
  let restoreTarget = $state<BackupFile | null>(null);
  let deleteTarget = $state<BackupFile | null>(null);
  let deleting = $state(false);
  let deleteError = $state('');
  let deleteAllFilenames = $state<string[] | null>(null); // names listed when the dialog opened
  let selectedTab = $state<BackupTab | null>(null);

  let locale = $derived($lang === 'fr' ? 'fr-FR' : 'en-US');
  let snapshots = $derived(status.safetySnapshots ?? []);
  const ofCategory = (category: BackupTab) => status.backups.filter(b => b.category === category);

  // "Kept 7 days", or that the setting could not be read
  function kept(n: number | null | undefined, one: string, many: string): string {
    return n == null ? $t('Réglage inconnu') : $t(n > 1 ? many : one).replace('{n}', String(n));
  }

  let dailyWhen = $derived.by(() => {
    const schedule = status.policy?.schedule;
    if (!schedule) return $t('Réglage inconnu');
    return $t('Chaque jour à {time}').replace('{time}', fmtTime(new Date(2000, 0, 1, schedule.hour, schedule.minute), locale));
  });

  let tiles = $derived.by(() => {
    const policy = status.policy;
    const all: { id: BackupTab; name: string; when: string; keep: string; files: BackupFile[]; slots?: number | null; wide?: boolean }[] = [];
    if (isAdmin) {
      all.push(
        { id: 'daily', name: $t('Quotidiennes'), when: dailyWhen, keep: kept(policy?.keepDays, 'Gardées {n} jour', 'Gardées {n} jours'), files: ofCategory('daily'), slots: policy?.keepDays },
        { id: 'weekly', name: $t('Hebdomadaires'), when: $t('La dernière de la semaine'), keep: kept(policy?.keepWeeks, 'Gardées {n} semaine', 'Gardées {n} semaines'), files: ofCategory('weekly'), slots: policy?.keepWeeks },
        { id: 'monthly', name: $t('Mensuelles'), when: $t('La dernière du mois'), keep: kept(policy?.keepMonths, 'Gardées {n} mois', 'Gardées {n} mois'), files: ofCategory('monthly'), slots: policy?.keepMonths },
        { id: 'manual', name: $t('Manuelles'), when: $t('À la demande, ou avant une mise à jour'), keep: kept(policy?.manualDays, 'Gardées {n} jour', 'Gardées {n} jours'), files: ofCategory('manual') },
      );
      // Copies made by a restore: shown only when there is one.
      if (snapshots.length > 0) {
        all.push({ id: 'snapshot', name: $t('Revenir avant une restauration'), when: $t('Avant chaque remplacement'), keep: kept(policy?.snapshotsPerAccount, 'La dernière du compte', 'Les {n} dernières du compte'), files: snapshots, wide: true });
      }
      if (ofCategory('pre-restore').length > 0) {
        all.push({ id: 'pre-restore', name: $t('Avant restore.sh'), when: $t('Par le script du serveur'), keep: $t('Gardées sans limite'), files: ofCategory('pre-restore'), wide: true });
      }
    } else if (account) {
      all.push({ id: 'snapshot', name: $t('Mes sauvegardes'), when: $t('Quand vous en créez une'), keep: kept(policy?.snapshotsPerAccount, 'La dernière du compte', 'Les {n} dernières du compte'), files: snapshots, wide: true });
    }
    return all;
  });
  let current = $derived(tiles.find(tile => tile.id === selectedTab) ?? tiles[0]);
  let files = $derived(current?.files ?? []);

  // Only for the lists whose name does not say it all
  let explanation = $derived.by(() => {
    if (current?.id === 'pre-restore') return $t('Copies de toute la base, faites par le script restore.sh avant de restaurer le serveur entier.');
    if (current?.id !== 'snapshot') return '';
    return (isAdmin
      ? $t('Données du compte « {account} » juste avant une restauration. Les remettre en place efface l\'effet de cette restauration.')
      : $t('Copies du compte « {account} » : celles que vous créez, et celles faites avant une restauration.')
    ).replace('{account}', account?.name ?? '');
  });
  let totalSize = $derived([...status.backups, ...snapshots].reduce((sum, b) => sum + b.sizeBytes, 0));

  let childOpen = $derived(!!(restoreTarget || deleteTarget || deleteAllFilenames));

  const dayAndTime = (iso: string) => `${fmtDay(new Date(iso), locale, $t)} ${fmtTime(new Date(iso), locale)}`;

  async function create() {
    creating = true;
    error = '';
    try {
      if (isAdmin) await api.post('/api/backup/create', {});
      else if (account) await api.post(`/api/accounts/${account.id}/backup/snapshot`, {});
      await onrefresh();
      selectedTab = isAdmin ? 'manual' : 'snapshot';
    } catch (err) {
      error = err.message || $t('Erreur lors de la sauvegarde');
    } finally {
      creating = false;
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    deleteError = '';
    const name = encodeURIComponent(deleteTarget.filename);
    try {
      if (deleteTarget.category) await api.delete(`/api/backup/${name}?category=${deleteTarget.category}`);
      else await api.delete(`/api/accounts/${account.id}/backup/safety-snapshot/${name}`);
      deleteTarget = null;
      await onrefresh();
    } catch (err) {
      deleteError = err.message || $t('Erreur lors de la suppression');
    } finally {
      deleting = false;
    }
  }

  async function download(backup: BackupFile) {
    error = '';
    const name = encodeURIComponent(backup.filename);
    const url = backup.category
      ? `/api/backup/download/${name}?category=${backup.category}`
      : `/api/accounts/${account.id}/backup/safety-snapshot/download/${name}`;
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(response.status === 401 ? $t('Session expirée. Veuillez vous reconnecter.') : body.error || String(response.status));
      }
      const href = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = href;
      link.download = backup.filename;
      link.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      error = `${$t('Erreur lors du téléchargement')} : ${err.message}`;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !childOpen && onclose()} />

<div class="modal-overlay" onclick={self(onclose)} role="presentation">
  <div class="modal-box backups" role="dialog" aria-modal="true" aria-labelledby="backups-title">
    <header>
      <div class="head-text">
        <h2 id="backups-title">{$t('Sauvegardes')}</h2>
        {#if isAdmin}
          <p class="summary">
            {#if status.automatic?.state === 'ok'}
              <span class="ok"><Icon name="check" />{$t('À jour')}</span>
            {/if}
            {#if status.automatic?.lastRun}
              <span>{$t('Dernière automatique : {date}').replace('{date}', fmtDay(new Date(status.automatic.lastRun), locale, $t))}</span>
            {/if}
            {#if status.nextRun}
              <span>{$t('Prochaine : {date}').replace('{date}', dayAndTime(status.nextRun))}</span>
            {/if}
            <span>{fmtSize(totalSize, locale)} {$t('au total')}</span>
          </p>
        {/if}
      </div>
      {#if isAdmin || account}
        <button class="btn btn-primary" onclick={create} disabled={creating}>
          <Icon name="plus" />
          {creating ? $t('Création…') : $t('Créer maintenant')}
        </button>
      {/if}
      <button class="btn-icon" onclick={onclose} title={$t('Fermer')} aria-label={$t('Fermer')}><Icon name="x" /></button>
    </header>

    <div class="body">
      {#if isAdmin && status.automatic && status.automatic.state !== 'ok'}
        <div class="error-banner" role="alert">
          {status.automatic.state === 'none'
            ? $t('Aucune sauvegarde automatique sur le serveur. Vérifiez le service de sauvegarde.')
            : $t('La dernière sauvegarde automatique a plus de 26 heures. Vérifiez le service de sauvegarde.')}
        </div>
      {/if}
      {#if error}<div class="error-banner" role="alert">{error}</div>{/if}

      {#if current}
        <BackupTiles {tiles} current={current.id} onselect={(id) => (selectedTab = id)} />
        <BackupHelp {isAdmin} kept={status.policy?.snapshotsPerAccount ?? 0} />

        <div id="backups-panel" role="tabpanel" aria-labelledby="tab-{current.id}" style="--level: {LEVEL_COLOR[current.id]}">
            {#if current.id === 'manual' && files.length > 0}
          <div class="panel-tools">
              <button class="btn btn-danger-ghost" onclick={() => (deleteAllFilenames = files.map(b => b.filename))}>
                <Icon name="trash" />
                {$t('Tout supprimer')}
              </button>
          </div>
            {/if}
          {#if explanation}<p class="explanation">{explanation}</p>{/if}
          {#if files.length === 0}
            <div class="state-empty">{$t('Aucune sauvegarde')}</div>
          {:else}
            <ul>
              {#each files as backup (backup.filename)}
                <BackupRow
                  {backup}
                  canRestore={!!account}
                  undo={isAdmin && !backup.category}
                  ondownload={() => download(backup)}
                  onrestore={() => (restoreTarget = backup)}
                  ondelete={() => { deleteError = ''; deleteTarget = backup; }}
                />
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

{#if restoreTarget && account}
  <RestoreBackupModal
    {account}
    backup={restoreTarget}
    undo={isAdmin && !restoreTarget.category}
    on:close={() => (restoreTarget = null)}
    on:restored={(e) => { onrestored(e.detail); onrefresh(); }}
  />
{/if}

{#if deleteAllFilenames}
  <DeleteAllBackupsModal filenames={deleteAllFilenames} ondeleted={onrefresh} onclose={() => (deleteAllFilenames = null)} />
{/if}

{#if deleteTarget}
  <ConfirmModal title={$t('Supprimer cette sauvegarde ?')} isLoading={deleting} on:confirm={confirmDelete} on:cancel={() => (deleteTarget = null)}>
    <p class="confirm-text">{backupTitle(deleteTarget, locale, $t)}, {fmtSize(deleteTarget.sizeBytes, locale)}</p>
    <p class="confirm-text warning">{$t('Cette action est définitive.')}</p>
    {#if deleteError}<p class="confirm-text warning" role="alert">{deleteError}</p>{/if}
  </ConfirmModal>
{/if}

<style>
  .backups { display: flex; flex-direction: column; width: 820px; padding: 0; overflow: hidden; }

  header { display: flex; align-items: center; gap: 12px; padding: 16px 24px; border-bottom: 1px solid var(--border); }
  .head-text { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 18px; font-weight: 500; color: var(--text-1); }
  .summary { display: flex; flex-wrap: wrap; gap: 0 16px; margin: 4px 0 0; font-size: 13px; color: var(--text-2); }

  .body { overflow-y: auto; padding: 20px 24px 24px; }

  .ok { display: inline-flex; align-items: center; gap: 4px; color: var(--credit); font-weight: 500; }
  .ok :global(svg) { width: 16px; height: 16px; }

  #backups-panel { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
  .panel-tools { display: flex; justify-content: flex-end; margin-bottom: 8px; }
  .explanation { max-width: 68ch; margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: var(--text-2); }
  ul { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 0; padding: 0; list-style: none; }

  .confirm-text { font-size: 14px; line-height: 1.5; color: var(--text-2); }
  .confirm-text.warning { color: var(--danger-text); }

  @media (max-width: 640px) {
    header { flex-wrap: wrap; padding: 16px; }
    header .btn-primary { order: 3; flex-basis: 100%; }
    .body { padding: 16px; }
    ul { grid-template-columns: 1fr; }
  }
</style>
