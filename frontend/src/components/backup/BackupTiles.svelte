<script lang="ts">
  import { lang, t } from '../../lib/i18n.ts';
  import { LEVEL_COLOR, fmtSize, type BackupFile, type BackupTab } from './backup-format.ts';

  const MAX_PIPS = 14;

  // One tile per kind of backup (a wide one, on its own line, for the copies made by a restore): its policy, what is on the server, and the choice of the list below.
  let { tiles, current, onselect }: {
    tiles: { id: BackupTab; name: string; when: string; keep: string; files: BackupFile[]; slots?: number | null; wide?: boolean }[];
    current: BackupTab;
    onselect: (id: BackupTab) => void;
  } = $props();

  let locale = $derived($lang === 'fr' ? 'fr-FR' : 'en-US');
  let buttons: HTMLButtonElement[] = $state([]);

  // Pips: one per backup present, and one empty per place the retention still leaves (none past MAX_PIPS).
  function pips(tile: { files: BackupFile[]; slots?: number | null }): boolean[] {
    const total = Math.max(tile.files.length, tile.slots ?? 0);
    return total > MAX_PIPS ? [] : Array.from({ length: total }, (_, i) => i < tile.files.length);
  }

  function onkeydown(e: KeyboardEvent, i: number) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (i + step + tiles.length) % tiles.length;
    onselect(tiles[next].id);
    buttons[next]?.focus();
  }

  function onServer(files: BackupFile[]): string {
    if (files.length === 0) return $t('Aucune pour l\'instant');
    const size = fmtSize(files.reduce((sum, f) => sum + f.sizeBytes, 0), locale);
    return `${$t(files.length > 1 ? '{n} disponibles' : '{n} disponible').replace('{n}', String(files.length))}, ${size}`;
  }
</script>

<div class="tiles" role="tablist" aria-label={$t('Sauvegardes')}>
  {#each tiles as tile, i (tile.id)}
    <button
      bind:this={buttons[i]}
      class="tile"
      class:wide={tile.wide}
      style="--level: {LEVEL_COLOR[tile.id]}"
      role="tab"
      id="tab-{tile.id}"
      aria-selected={tile.id === current}
      aria-controls="backups-panel"
      tabindex={tile.id === current ? 0 : -1}
      onclick={() => onselect(tile.id)}
      onkeydown={(e) => onkeydown(e, i)}
    >
      <span class="name">{tile.name}</span>
      <span class="line">{tile.when}</span>
      <span class="line">{tile.keep}</span>
      {#if !tile.wide}
        <span class="pips" aria-hidden="true">
          {#each pips(tile) as present}<i class:present></i>{/each}
        </span>
      {/if}
      <span class="server">{onServer(tile.files)}</span>
    </button>
  {/each}
</div>

<style>
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .tile {
    display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    padding: 12px; border: 1px solid var(--border); border-radius: 12px;
    background: color-mix(in srgb, var(--level) 4%, transparent); font-family: var(--font-ui); text-align: left; cursor: pointer;
    transition: background-color 150ms var(--ease), border-color 150ms var(--ease);
  }
  .tile:hover { border-color: color-mix(in srgb, var(--level) 45%, transparent); }
  .tile[aria-selected='true'] { background: color-mix(in srgb, var(--level) 10%, transparent); border-color: var(--level); }
  .name { margin-bottom: 4px; font-size: 15px; font-weight: 600; color: var(--level); }
  .line { font-size: 13px; line-height: 18px; color: var(--text-2); }
  .pips { display: flex; flex-wrap: wrap; gap: 4px; min-height: 10px; margin-top: auto; padding-top: 12px; }
  .pips i { width: 10px; height: 10px; border-radius: 3px; border: 1px solid color-mix(in srgb, var(--level) 45%, transparent); }
  .pips i.present { background: var(--level); border-color: var(--level); }
  .server { padding-top: 4px; font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }

  .tile.wide { grid-column: 1 / -1; flex-flow: row wrap; align-items: baseline; gap: 0 16px; padding: 8px 12px; }
  .wide .name { margin: 0; }
  .wide .server { margin: 0 0 0 auto; padding: 0; }

  @media (max-width: 760px) { .tiles { grid-template-columns: 1fr 1fr; } }
</style>
