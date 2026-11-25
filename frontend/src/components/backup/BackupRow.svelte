<script lang="ts">
  import { lang, t } from '../../lib/i18n.ts';
  import Icon from '../Icon.svelte';
  import { DELETABLE, backupNote, backupRowTitle, backupStamp, backupTitle, fmtSize, type BackupFile } from './backup-format.ts';

  let { backup, canRestore, undo = false, ondownload, onrestore, ondelete }: {
    backup: BackupFile;
    canRestore: boolean;
    undo?: boolean;
    ondownload: () => void;
    onrestore: () => void;
    ondelete: () => void;
  } = $props();

  let locale = $derived($lang === 'fr' ? 'fr-FR' : 'en-US');
  let title = $derived(backupTitle(backup, locale, $t));
  let restoreLabel = $derived(undo ? $t('Revenir avant cette restauration') : $t('Restaurer'));
  let stamp = $derived(backupStamp(backup, locale, $t));
  let note = $derived(backupNote(backup, locale, $t));
</script>

<li class="row">
  <span class="stamp" aria-hidden="true"><b>{stamp.main}</b><small>{stamp.sub}</small></span>
  <div class="row-main">
    <span class="row-title">{backupRowTitle(backup, locale, $t)}</span>
    {#if note}<span class="row-note">{note}</span>{/if}
    <span class="row-note">{fmtSize(backup.sizeBytes, locale)}</span>
  </div>
  <div class="row-actions">
    {#if canRestore}
      <button class="btn-icon act" title={restoreLabel} aria-label="{restoreLabel} – {title}" onclick={onrestore}><Icon name="rotate-ccw" /></button>
    {/if}
    <button class="btn-icon act" title={$t('Télécharger')} aria-label="{$t('Télécharger')} – {title}" onclick={ondownload}><Icon name="download" /></button>
    {#if DELETABLE.includes(backup.category)}
      <button class="btn-icon danger" title={$t('Supprimer')} aria-label="{$t('Supprimer')} – {title}" onclick={ondelete}><Icon name="trash" /></button>
    {/if}
  </div>
</li>

<style>
  .row {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 8px 8px 0; border-radius: 10px;
    transition: background-color 150ms var(--ease);
  }
  .row:hover { background: color-mix(in srgb, var(--level) 6%, transparent); }

  /* A leaf of the calendar, in the color of its kind */
  .stamp {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    flex-shrink: 0; width: 48px; height: 48px; border-radius: 10px;
    background: color-mix(in srgb, var(--level) 14%, transparent);
    color: var(--level);
  }
  .stamp b { font-size: 19px; font-weight: 600; line-height: 22px; }
  .stamp small { font-size: 12px; line-height: 14px; }

  .row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .row-title { font-size: 14px; font-weight: 500; line-height: 20px; color: var(--text-1); }
  .row-note { font-size: 12px; line-height: 16px; color: var(--text-3); }

  .row-actions { display: flex; gap: 2px; flex-shrink: 0; }
  .act:hover { background: color-mix(in srgb, var(--level) 16%, transparent); color: var(--level); }
</style>
