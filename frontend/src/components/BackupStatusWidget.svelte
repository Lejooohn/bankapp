<script lang="ts">
  import { onMount, createEventDispatcher, untrack } from 'svelte';
  import { api, getToken, getCurrentUser } from '../lib/api.js';
  import { t } from '../lib/i18n.ts';
  import Icon from './Icon.svelte';
  import BackupsDialog from './backup/BackupsDialog.svelte';
  import type { BackupStatus } from './backup/backup-format.ts';

  // Sidebar entry of the backups: their state, and the dialog that manages them.
  const isAdmin = getCurrentUser()?.role === 'admin';

  let { account = null }: { account?: { id: string; name: string } | null } = $props();

  const dispatch = createEventDispatcher();

  let backupStatus = $state<BackupStatus | null>(null);
  let loading = $state(true);
  let error = $state(false);
  let modalOpen = $state(false);
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

  let late = $derived(backupStatus?.automatic?.state === 'late');
  let detail = $derived.by(() => {
    if (!backupStatus) return '';
    if (late) return $t('En retard');
    const count = backupStatus.backups.length + (backupStatus.safetySnapshots?.length ?? 0);
    if (count === 0) return $t('Aucune');
    return $t(count > 1 ? '{n} sauvegardes' : '{n} sauvegarde').replace('{n}', String(count));
  });
</script>

<button class="side-row" onclick={() => (modalOpen = true)} disabled={loading || error || !backupStatus}>
  <span class="side-row-icon"><Icon name="database" /></span>
  <span class="side-row-label">{$t('Sauvegarde')}</span>
  <span class="side-row-meta" class:late>{detail}</span>
</button>

{#if modalOpen && backupStatus}
  <BackupsDialog
    status={backupStatus}
    {account}
    {isAdmin}
    onrefresh={fetchStatus}
    onrestored={(result) => dispatch('restored', result)}
    onclose={() => (modalOpen = false)}
  />
{/if}

<style>
  .late { color: var(--danger-text); }
</style>
