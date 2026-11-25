<script lang="ts">
  import { lang, t } from '../../lib/i18n.ts';

  let { count, countLabel, canGenerate, genStatus, alreadyGenerated, insertedLabel, countdown, ongenerate, onnew }: {
    count: number;
    countLabel: string;
    canGenerate: boolean;
    genStatus: { dueCount: number; alreadyCreatedCount: number; autoRunDate: string } | null;
    alreadyGenerated: boolean;
    insertedLabel: string;
    countdown: string;
    ongenerate: () => void;
    onnew: () => void;
  } = $props();
</script>

<!-- Toolbar -->
<div class="sched-toolbar">
  <div class="sched-toolbar-left">
    <button class="btn-sched-generate" onclick={ongenerate} disabled={!canGenerate}>
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
        <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      {$t('Générer les opérations pour le mois prochain')}
    </button>
    {#if genStatus && genStatus.dueCount > 0}
      {#if alreadyGenerated}
        <span class="sched-gen-result">
          {$t('Échéances de {label} déjà insérées').replace('{label}', insertedLabel)} ✓
        </span>
      {:else}
        <span class="sched-countdown">
          {$t('Insertion automatique dans :')} {countdown}
        </span>
      {/if}
    {/if}
  </div>
  <span class="sched-count">
    {count} {countLabel}
  </span>
  <button class="btn btn-primary" onclick={onnew}>
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    {$t('Nouvelle échéance')}
  </button>
</div>

<style>
  /* ── Toolbar ── */
  .sched-toolbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }
  .sched-toolbar-left { display: flex; align-items: center; gap: 10px; justify-self: start; }
  .sched-toolbar > .btn-primary { justify-self: end; }
  .sched-count {
    justify-self: center;
    font-size: 15px; font-weight: 600; color: var(--text-1);
    font-family: var(--font-ui);
  }
  .sched-gen-result {
    font-size: 12px; color: var(--cobalt); background: var(--cobalt-light);
    border: 1px solid var(--cobalt-border); padding: 3px 10px; border-radius: 20px;
  }
  .sched-countdown {
    font-size: 12px; color: var(--text-3); background: var(--card-hover);
    border: 1px solid var(--border, #E5E7EB); padding: 3px 10px; border-radius: 20px;
    font-family: var(--font-ui);
  }
  .btn-sched-generate {
    display: flex; align-items: center; gap: 6px; padding: 7px 14px;
    background: var(--success-bg); border: 1px solid color-mix(in srgb, var(--credit) 30%, transparent); color: var(--credit);
    border-radius: 7px; font-size: 12.5px; font-weight: 500; cursor: pointer;
    font-family: var(--font-ui); transition: all 0.15s;
  }
  .btn-sched-generate:hover:not(:disabled) { background: color-mix(in srgb, var(--credit) 18%, transparent); border-color: color-mix(in srgb, var(--credit) 45%, transparent); }
  .btn-sched-generate:disabled { opacity: 0.45; cursor: default; }
</style>
